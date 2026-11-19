-- Stage 7: trip page — online check-in and guest requests with live statuses.
-- Dates are compared in Kyiv time, like everywhere else in the app.

-- ---------------------------------------------------------------- check-in
create table public.checkins (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  arrival_time time not null check (extract(minute from arrival_time) in (0, 30) and extract(second from arrival_time) = 0),
  notes text check (char_length(notes) <= 500),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checkins enable row level security;

-- Own confirmed booking whose check-in day has not passed.
create policy "checkins: owner can read"
  on public.checkins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "checkins: owner can create before arrival"
  on public.checkins for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = (select auth.uid()) and b.status = 'confirmed'
        and b.check_in >= (now() at time zone 'Europe/Kyiv')::date
    )
  );

create policy "checkins: owner can change before arrival"
  on public.checkins for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = (select auth.uid()) and b.status = 'confirmed'
        and b.check_in >= (now() at time zone 'Europe/Kyiv')::date
    )
  );

revoke delete, truncate on public.checkins from anon, authenticated;

-- Timestamps and owner are the server's: client-sent values are ignored.
create function public.checkins_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.completed_at := old.completed_at;
    new.user_id := old.user_id;
    new.booking_id := old.booking_id;
  else
    new.completed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger checkins_touch before insert or update on public.checkins
  for each row execute function public.checkins_touch();

-- ---------------------------------------------------------------- guest requests
alter table public.guest_requests
  add column source text not null default 'guest' check (source in ('guest', 'assistant')),
  add column updated_at timestamptz not null default now();

alter table public.guest_requests drop constraint guest_requests_details_check;
alter table public.guest_requests add constraint guest_requests_details_check check (char_length(details) <= 500);

-- One unanswered request per type (except "other"), so the hotel is not spammed.
create unique index guest_requests_one_open_per_type
  on public.guest_requests (booking_id, type) where status = 'sent' and type <> 'other';

create function public.guest_requests_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger guest_requests_touch before update on public.guest_requests
  for each row execute function public.guest_requests_touch();

-- At most 20 requests per booking. The advisory lock serialises concurrent inserts for a booking.
create function public.enforce_guest_requests_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.booking_id::text));
  if (select count(*) from public.guest_requests where booking_id = new.booking_id) >= 20 then
    raise exception 'guest_requests limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_guest_requests_limit before insert on public.guest_requests
  for each row execute function public.enforce_guest_requests_limit();

-- Only for an own confirmed stay that has not ended; only as the guest.
drop policy "guest_requests: owner can create for own booking" on public.guest_requests;
create policy "guest_requests: owner can create for own active booking"
  on public.guest_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'sent'
    and source = 'guest'
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = (select auth.uid()) and b.status = 'confirmed'
        and b.check_out >= (now() at time zone 'Europe/Kyiv')::date
    )
  );

-- Clients may only choose which booking, what type and the text; everything else is a default.
revoke insert, update, delete, truncate on public.guest_requests from anon, authenticated;
grant insert (id, booking_id, type, details) on public.guest_requests to authenticated;

-- Live statuses. Realtime applies the SELECT policy above to every subscriber.
alter publication supabase_realtime add table public.guest_requests;
