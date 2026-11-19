-- Bookings written by checkout: shape checks, uniqueness and read-only access (pgTAP).
begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

-- The server (table owner role here) writes a confirmed booking.
insert into public.bookings (id, user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults,
  total_amount, currency, client_reference, prebook_id, room_name, board, hotel_image, city, refundable_until)
values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'wHbOotXkt', 'lpbbb0c',
  'Grand Hotel', '2026-12-09', '2026-12-12', 2, 26648.98, 'UAH', 'gs-0123456789abcdef01234567', '4bFPhxkgn',
  'Double/Twin', 'RO', 'https://static.cupid.travel/hotels/1.jpg', 'lviv', '2026-12-06 10:00:00+00');

select has_column('public', 'bookings', 'client_reference', 'bookings.client_reference exists');
select has_column('public', 'bookings', 'refundable', 'bookings.refundable exists');

-- A pending attempt (recorded before LiteAPI book) needs no LiteAPI id yet...
select lives_ok(
  $$ insert into public.bookings (user_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name, status)
     values ('00000000-0000-0000-0000-00000000000a', 'lpbbb0c', 'X', '2026-12-20', '2026-12-22', 2, 1, 'UAH', 'gs-cccccccccccccccccccccccc', 'P9', 'R', 'pending') $$,
  'A pending attempt can be recorded without a LiteAPI id');
-- ...but a confirmed booking must have one.
select throws_ok(
  $$ insert into public.bookings (user_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name, status)
     values ('00000000-0000-0000-0000-00000000000a', 'lpbbb0c', 'X', '2026-12-20', '2026-12-22', 2, 1, 'UAH', 'gs-dddddddddddddddddddddddd', 'P8', 'R', 'confirmed') $$,
  '23514', null, 'A confirmed booking must have a LiteAPI id');
select col_is_unique('public', 'bookings', 'client_reference', 'client_reference is unique (idempotency)');

select throws_ok(
  $$ insert into public.bookings (user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name)
     values ('00000000-0000-0000-0000-00000000000a', 'other', 'lpbbb0c', 'X', '2026-12-09', '2026-12-12', 2, 1, 'UAH', 'gs-0123456789abcdef01234567', 'P2', 'R') $$,
  '23505', null, 'The same client reference cannot be stored twice');

select throws_ok(
  $$ insert into public.bookings (user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name, hotel_image)
     values ('00000000-0000-0000-0000-00000000000a', 'x2', 'lpbbb0c', 'X', '2026-12-09', '2026-12-12', 2, 1, 'UAH', 'gs-ffffffffffffffffffffffff', 'P3', 'R', 'javascript:alert(1)') $$,
  '23514', null, 'Foreign image URLs are rejected');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.bookings)::int, 2, 'A reads own bookings (confirmed + pending)');
select throws_ok($$ update public.bookings set total_amount = 1 $$, '42501', null, 'A cannot change a booking (e.g. its price)');
select throws_ok($$ delete from public.bookings $$, '42501', null, 'A cannot delete a booking');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.bookings)::int, 0, 'B cannot see A''s booking');

reset role;
set local role anon;
select is((select count(*) from public.bookings)::int, 0, 'Anonymous visitors see nothing');

select * from finish();
rollback;
