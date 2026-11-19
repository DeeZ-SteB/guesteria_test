-- RLS isolation tests (pgTAP). Run with `npx supabase test db`.
-- Proves that user B cannot read or touch user A's data through the public API role.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

insert into public.bookings (id, user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
        'LITE-A', 'h1', 'Hotel A', current_date + 10, current_date + 12, 2, 200, 'EUR', 'gs-aaaaaaaaaaaaaaaaaaaaaaaa', 'PRE1', 'Standard');

insert into public.favorites (user_id, hotel_id, hotel_name)
values ('00000000-0000-0000-0000-00000000000a', 'h1', 'Hotel A');

-- Act as user B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is((select count(*) from public.bookings)::int, 0, 'B cannot see A''s bookings');
select is((select count(*) from public.favorites)::int, 0, 'B cannot see A''s favorites');

select throws_ok(
  $$ insert into public.bookings (user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name)
     values ('00000000-0000-0000-0000-00000000000b', 'FORGED', 'h1', 'X', '2026-12-01', '2026-12-02', 1, 0, 'EUR', 'gs-bbbbbbbbbbbbbbbbbbbbbbbb', 'P', 'R') $$,
  '42501', null, 'Clients cannot create bookings directly');

select throws_ok(
  $$ insert into public.guest_requests (booking_id, type) values ('10000000-0000-0000-0000-00000000000a', 'late_check_out') $$,
  '42501', null, 'B cannot file a request against A''s booking');

-- Act as user A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*) from public.bookings)::int, 1, 'A sees own booking');

select lives_ok(
  $$ insert into public.guest_requests (booking_id, type) values ('10000000-0000-0000-0000-00000000000a', 'late_check_out') $$,
  'A can file a request for own booking');

select throws_ok(
  $$ insert into public.guest_requests (booking_id, type, status) values ('10000000-0000-0000-0000-00000000000a', 'transfer', 'confirmed') $$,
  '42501', null, 'A cannot self-confirm a request');

select * from finish();
rollback;
