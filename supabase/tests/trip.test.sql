-- Trip page: online check-in and guest requests (pgTAP).
begin;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

-- A: future confirmed (F), cancelled (C), already started (S), ended (E). B: future confirmed (BF).
insert into public.bookings (id, user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name, status) values
  ('30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'L1', 'h1', 'H', current_date + 10, current_date + 12, 2, 1, 'UAH', 'gs-000000000000000000000001', 'P1', 'R', 'confirmed'),
  ('30000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'L2', 'h1', 'H', current_date + 10, current_date + 12, 2, 1, 'UAH', 'gs-000000000000000000000002', 'P2', 'R', 'cancelled'),
  ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'L3', 'h1', 'H', current_date - 3, current_date + 3, 2, 1, 'UAH', 'gs-000000000000000000000003', 'P3', 'R', 'confirmed'),
  ('30000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 'L4', 'h1', 'H', current_date - 10, current_date - 8, 2, 1, 'UAH', 'gs-000000000000000000000004', 'P4', 'R', 'confirmed'),
  ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'L5', 'h1', 'H', current_date + 10, current_date + 12, 2, 1, 'UAH', 'gs-000000000000000000000005', 'P5', 'R', 'confirmed');

select has_table('public', 'checkins', 'checkins exists');
select ok((select relrowsecurity from pg_class where oid = 'public.checkins'::regclass), 'checkins has RLS');
select has_column('public', 'guest_requests', 'source', 'guest_requests.source exists');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest_requests'),
  'guest_requests is published to Realtime');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- ---------- check-in ----------
select lives_ok($$ insert into public.checkins (booking_id, arrival_time, notes) values ('30000000-0000-0000-0000-0000000000f1', '14:30', 'Late') $$,
  'A checks in for own future booking');
select throws_ok($$ insert into public.checkins (booking_id, arrival_time) values ('30000000-0000-0000-0000-0000000000b1', '14:30') $$,
  '42501', null, 'A cannot check in for B''s booking');
select throws_ok($$ insert into public.checkins (booking_id, arrival_time) values ('30000000-0000-0000-0000-0000000000c1', '14:30') $$,
  '42501', null, 'No check-in for a cancelled booking');
select throws_ok($$ insert into public.checkins (booking_id, arrival_time) values ('30000000-0000-0000-0000-0000000000a1', '14:30') $$,
  '42501', null, 'No check-in after the check-in day');
select throws_ok($$ update public.checkins set arrival_time = '10:15' where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'Arrival time must be on a 30-minute step');
select throws_ok($$ update public.checkins set notes = repeat('x', 501) where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'Notes are capped at 500 characters');
select lives_ok($$ update public.checkins set arrival_time = '16:00', completed_at = '2000-01-01' where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  'A can change the arrival time');
select ok((select completed_at > '2001-01-01' and arrival_time = '16:00' from public.checkins where booking_id = '30000000-0000-0000-0000-0000000000f1'),
  'A forged completed_at is ignored');
select throws_ok($$ delete from public.checkins $$, '42501', null, 'Check-ins cannot be deleted by clients');

-- ---------- guest requests ----------
select lives_ok($$ insert into public.guest_requests (booking_id, type, details) values ('30000000-0000-0000-0000-0000000000f1', 'early_check_in', 'From 10:00') $$,
  'A files a request for own booking');
select is((select source from public.guest_requests where booking_id = '30000000-0000-0000-0000-0000000000f1' limit 1), 'guest', 'Source defaults to guest');
select throws_ok($$ insert into public.guest_requests (booking_id, type, source) values ('30000000-0000-0000-0000-0000000000f1', 'transfer', 'assistant') $$,
  '42501', null, 'Clients cannot claim a request was made by the AI');
select throws_ok($$ insert into public.guest_requests (booking_id, type, status) values ('30000000-0000-0000-0000-0000000000f1', 'transfer', 'confirmed') $$,
  '42501', null, 'Clients cannot set a status');
select throws_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000c1', 'transfer') $$,
  '42501', null, 'No requests for a cancelled booking');
select throws_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000e1', 'transfer') $$,
  '42501', null, 'No requests for an ended stay');
select lives_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000a1', 'late_check_out') $$,
  'Requests are allowed during the stay');
select throws_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000f1', 'early_check_in') $$,
  '23505', null, 'Only one open request per type');
select throws_ok($$ insert into public.guest_requests (booking_id, type, details) values ('30000000-0000-0000-0000-0000000000f1', 'other', repeat('x', 501)) $$,
  '23514', null, 'Details are capped at 500 characters');
select throws_ok($$ update public.guest_requests set status = 'confirmed' $$, '42501', null, 'Guests cannot change a request status');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.checkins)::int, 0, 'B cannot see A''s check-in');
select is((select count(*) from public.guest_requests)::int, 0, 'B cannot see A''s requests');

-- The hotel side (service role / Studio) answers; a new request of that type is then allowed.
reset role;
update public.guest_requests set status = 'declined' where type = 'early_check_in';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000f1', 'early_check_in') $$,
  'After an answer, the same type can be asked again');

-- Cap: 20 requests per booking ('other' has no open-per-type limit).
select lives_ok($$ insert into public.guest_requests (booking_id, type) select '30000000-0000-0000-0000-0000000000f1', 'other' from generate_series(1, 18) $$,
  'Up to 20 requests per booking');
select throws_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000f1', 'other') $$,
  'P0001', null, 'The 21st request is refused');

select * from finish();
rollback;
