-- Stage 8: Guesteria AI assistant.
-- Clients only READ their own threads, messages and drafts. Writes come from the server (secret key),
-- so a client can never forge chat history (e.g. fake tool results). Drafted actions are executed
-- only by confirm_assistant_action, called with the user's own session.

create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  context jsonb not null default '{}' check (jsonb_typeof(context) = 'object'),
  turn_count integer not null default 0 check (turn_count between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_threads_user_idx on public.assistant_threads (user_id, updated_at desc);

create table public.assistant_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.assistant_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seq integer not null check (seq > 0),
  role text not null check (role in ('user', 'assistant')),
  -- Anthropic content blocks exactly as sent/returned (replayed append-only).
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  -- UI blocks shown with this message (for reopening the chat).
  ui jsonb not null default '[]' check (jsonb_typeof(ui) = 'array'),
  created_at timestamptz not null default now(),
  unique (thread_id, seq)
);

create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  thread_id uuid references public.assistant_threads (id) on delete set null,
  type text not null check (type in ('check_in', 'guest_request')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'failed')),
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index assistant_actions_user_idx on public.assistant_actions (user_id, booking_id, status);

-- Fixed-window counters. Keys never contain raw IPs (HMAC on the server).
create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_actions enable row level security;
alter table public.rate_limits enable row level security;

create policy "assistant_threads: owner can read" on public.assistant_threads for select to authenticated using ((select auth.uid()) = user_id);
create policy "assistant_messages: owner can read" on public.assistant_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "assistant_actions: owner can read" on public.assistant_actions for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.assistant_threads, public.assistant_messages, public.assistant_actions from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------- rate limits
create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into n;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return jsonb_build_object(
    'allowed', n <= p_limit,
    'retry_after', ceil(extract(epoch from (w + make_interval(secs => p_window_seconds) - now())))::integer
  );
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------- confirm / cancel drafts
create function public.confirm_assistant_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assistant_actions;
  b public.bookings;
  today date := (now() at time zone 'Europe/Kyiv')::date;
  r jsonb;
  fail text;
  v_type text;
  v_details text;
  v_time text;
  v_notes text;
begin
  select * into a from public.assistant_actions where id = p_action_id and user_id = (select auth.uid()) for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if a.status <> 'pending' then
    return jsonb_build_object('status', a.status) || coalesce(a.result, '{}');
  end if;
  if a.expires_at < now() then
    update public.assistant_actions set status = 'expired', decided_at = now() where id = a.id;
    return jsonb_build_object('status', 'expired');
  end if;

  select * into b from public.bookings where id = a.booking_id and user_id = (select auth.uid());
  if not found or b.status <> 'confirmed' then
    fail := 'closed';
  elsif a.type = 'check_in' then
    v_time := a.payload->>'arrival_time';
    v_notes := nullif(btrim(coalesce(a.payload->>'notes', '')), '');
    if v_time is null or v_time !~ '^([01][0-9]|2[0-3]):(00|30)$'
       or char_length(coalesce(v_notes, '')) > 500 or public.has_invisible_chars(coalesce(v_notes, '')) then
      fail := 'invalid';
    elsif b.check_in < today then
      fail := 'closed';
    else
      insert into public.checkins (booking_id, user_id, arrival_time, notes)
      values (b.id, b.user_id, v_time::time, v_notes)
      on conflict (booking_id) do update set arrival_time = excluded.arrival_time, notes = excluded.notes;
      r := jsonb_build_object('checkin', jsonb_build_object('arrival_time', v_time, 'notes', v_notes));
    end if;
  else
    v_type := a.payload->>'type';
    v_details := nullif(btrim(coalesce(a.payload->>'details', '')), '');
    if v_type is null or v_type not in ('early_check_in', 'late_check_out', 'transfer', 'breakfast', 'other')
       or char_length(coalesce(v_details, '')) > 500 or public.has_invisible_chars(coalesce(v_details, ''))
       or (v_type in ('transfer', 'other') and v_details is null) then
      fail := 'invalid';
    elsif b.check_out < today or (v_type = 'early_check_in' and b.check_in < today) then
      fail := 'closed';
    else
      begin
        insert into public.guest_requests (id, booking_id, user_id, type, details, source)
        values (a.id, b.id, b.user_id, v_type, v_details, 'assistant');
        r := jsonb_build_object('request_id', a.id);
      exception
        when unique_violation then fail := 'duplicate_open';
        when raise_exception then fail := 'limit';
        when check_violation then fail := 'invalid';
      end;
    end if;
  end if;

  if fail is not null then
    update public.assistant_actions set status = 'failed', result = jsonb_build_object('reason', fail), decided_at = now() where id = a.id;
    return jsonb_build_object('status', 'failed', 'reason', fail);
  end if;
  update public.assistant_actions set status = 'confirmed', result = r, decided_at = now() where id = a.id;
  return jsonb_build_object('status', 'confirmed') || r;
end;
$$;

create function public.cancel_assistant_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s text;
begin
  update public.assistant_actions set status = 'cancelled', decided_at = now()
  where id = p_action_id and user_id = (select auth.uid()) and status = 'pending'
  returning status into s;
  if s is not null then
    return jsonb_build_object('status', s);
  end if;
  select status into s from public.assistant_actions where id = p_action_id and user_id = (select auth.uid());
  return jsonb_build_object('status', coalesce(s, 'not_found'));
end;
$$;

revoke all on function public.confirm_assistant_action(uuid) from public, anon;
revoke all on function public.cancel_assistant_action(uuid) from public, anon;
grant execute on function public.confirm_assistant_action(uuid) to authenticated;
grant execute on function public.cancel_assistant_action(uuid) to authenticated;
