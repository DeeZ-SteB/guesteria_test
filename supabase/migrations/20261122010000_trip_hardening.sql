-- Stage 7 security review: every rule the server actions enforce is also enforced by the database,
-- because the browser can call the REST API directly with the user's own JWT.

-- Invisible / control / bidi characters (same class as cleanUserText in src/lib/text/html-to-text.ts).
-- They are stripped by the app; a direct API call must not smuggle them to the hotel or the AI.
create function public.has_invisible_chars(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩﻿]';
$$;

-- ---------------------------------------------------------------- check-in
alter table public.checkins
  add constraint checkins_notes_visible check (notes is null or not public.has_invisible_chars(notes));

-- Clients choose only which booking, the time and the notes. Owner and timestamps are the server's.
revoke insert, update on public.checkins from anon, authenticated;
grant insert (booking_id, arrival_time, notes) on public.checkins to authenticated;
grant update (booking_id, arrival_time, notes) on public.checkins to authenticated;

-- ---------------------------------------------------------------- guest requests
alter table public.guest_requests
  add constraint guest_requests_details_visible check (details is null or not public.has_invisible_chars(details)),
  add constraint guest_requests_details_required check (type not in ('transfer', 'other') or char_length(btrim(coalesce(details, ''))) > 0);

-- Early check-in only until the arrival day (Kyiv), like the app.
drop policy "guest_requests: owner can create for own active booking" on public.guest_requests;
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
        and (type <> 'early_check_in' or b.check_in >= (now() at time zone 'Europe/Kyiv')::date)
    )
  );

-- The cap runs as the caller: for a foreign booking it sees no rows, so it can never answer
-- "limit reached" (a count oracle) — RLS rejects the row instead. The server (service role, stage 8)
-- bypasses RLS and counts everything.
-- A retried insert of a request that already exists must reach the unique check (the app then
-- returns the existing row), not be refused as "limit reached".
create or replace function public.enforce_guest_requests_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.guest_requests where id = new.id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.booking_id::text));
  if (select count(*) from public.guest_requests where booking_id = new.booking_id) >= 20 then
    raise exception 'guest_requests limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
