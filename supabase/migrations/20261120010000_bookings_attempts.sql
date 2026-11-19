-- Review fix (stage 5): a booking attempt is recorded as `pending` BEFORE calling LiteAPI book.
-- The unique client_reference makes the row a lock (two concurrent submits can't both book),
-- and an in-flight / timed-out / unsaved attempt stays visible after reloads and token expiry.
alter table public.bookings alter column liteapi_booking_id drop not null;

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check check (status in ('pending', 'confirmed', 'cancelled')),
  -- Anything past pending must point at a real LiteAPI booking.
  add constraint bookings_confirmed_has_liteapi_id check (status = 'pending' or liteapi_booking_id is not null);

-- Explicit flag: "refundable with no deadline" is not the same as "non-refundable".
alter table public.bookings add column refundable boolean not null default false;

-- Backfill: rows written before this column existed had a deadline only when refundable.
update public.bookings set refundable = true where refundable_until is not null;
