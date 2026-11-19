-- Trip page: online check-in and guest requests (pgTAP).
begin;
select plan(41);

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

-- Boundaries in Kyiv time (current_date is UTC and differs between 21:00 and 24:00 UTC).
insert into public.bookings (id, user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name, status) values
  ('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', 'L6', 'h1', 'H', (now() at time zone 'Europe/Kyiv')::date, (now() at time zone 'Europe/Kyiv')::date + 2, 2, 1, 'UAH', 'gs-000000000000000000000006', 'P6', 'R', 'confirmed'),
  ('30000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000a', 'L7', 'h1', 'H', (now() at time zone 'Europe/Kyiv')::date - 2, (now() at time zone 'Europe/Kyiv')::date, 2, 1, 'UAH', 'gs-000000000000000000000007', 'P7', 'R', 'confirmed');

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
select lives_ok($$ insert into public.checkins (booking_id, arrival_time) values ('30000000-0000-0000-0000-0000000000d1', '14:30') $$,
  'Check-in is still open on the arrival day (Kyiv)');
select lives_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000d2', 'late_check_out') $$,
  'Requests are still open on the check-out day (Kyiv)');
update public.checkins set booking_id = '30000000-0000-0000-0000-0000000000d1' where booking_id = '30000000-0000-0000-0000-0000000000f1';
select is((select count(*) from public.checkins where booking_id = '30000000-0000-0000-0000-0000000000f1')::int, 1, 'A check-in cannot be moved to another booking');
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
select lives_ok($$ update public.checkins set arrival_time = '16:00' where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  'A can change the arrival time');
select throws_ok($$ update public.checkins set completed_at = '2000-01-01' where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'Clients cannot forge completed_at');
select throws_ok($$ delete from public.checkins $$, '42501', null, 'Check-ins cannot be deleted by clients');
select throws_ok($$ update public.checkins set notes = 'a' || chr(8238) || 'b' where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'Invisible / bidi characters are rejected in check-in notes');
select throws_ok($$ update public.checkins set user_id = '00000000-0000-0000-0000-00000000000b' where booking_id = '30000000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'Clients cannot reassign a check-in to another user');
select throws_ok($$ insert into public.checkins (booking_id, user_id, arrival_time) values ('30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b', '14:00') $$,
  '42501', null, 'Clients cannot set user_id on a check-in');

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
select throws_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000a1', 'early_check_in') $$,
  '42501', null, 'No early check-in request after the arrival day');
select throws_ok($$ insert into public.guest_requests (booking_id, type, details) values ('30000000-0000-0000-0000-0000000000f1', 'transfer', '   ') $$,
  '23514', null, 'A transfer request needs details');
select throws_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000f1', 'other') $$,
  '23514', null, 'An "other" request needs details');
select throws_ok($$ insert into public.guest_requests (booking_id, type, details) values ('30000000-0000-0000-0000-0000000000f1', 'breakfast', 'x' || chr(8203) || 'y') $$,
  '23514', null, 'Invisible / bidi characters are rejected in request details');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.checkins)::int, 0, 'B cannot see A''s check-in');
select is((select count(*) from public.guest_requests)::int, 0, 'B cannot see A''s requests');
update public.checkins set arrival_time = '09:00';  -- RLS: matches none of B's rows
reset role;
select is((select arrival_time from public.checkins where booking_id = '30000000-0000-0000-0000-0000000000f1'), '16:00'::time, 'B cannot change A''s check-in');
set local role authenticated;

-- The hotel side (service role / Studio) answers; a new request of that type is then allowed.
reset role;
update public.guest_requests set status = 'declined' where type = 'early_check_in';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ insert into public.guest_requests (booking_id, type) values ('30000000-0000-0000-0000-0000000000f1', 'early_check_in') $$,
  'After an answer, the same type can be asked again');

-- Cap: 20 requests per booking ('other' has no open-per-type limit).
select lives_ok($$ insert into public.guest_requests (booking_id, type, details) select '30000000-0000-0000-0000-0000000000f1', 'other', 'x' from generate_series(1, 18) $$,
  'Up to 20 requests per booking');
select throws_ok($$ insert into public.guest_requests (booking_id, type, details) values ('30000000-0000-0000-0000-0000000000f1', 'other', 'x') $$,
  'P0001', null, 'The 21st request is refused');
select throws_ok(format($$ insert into public.guest_requests (id, booking_id, type, details) values (%L, '30000000-0000-0000-0000-0000000000f1', 'other', 'x') $$,
  (select id from public.guest_requests where booking_id = '30000000-0000-0000-0000-0000000000f1' and type = 'other' limit 1)),
  '23505', null, 'Replaying an existing request at the cap is a duplicate, not "limit reached"');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ insert into public.guest_requests (booking_id, type, details) values ('30000000-0000-0000-0000-0000000000f1', 'other', 'x') $$,
  '42501', null, 'A foreign booking gets "not allowed", never "limit reached" (no count oracle)');

select * from finish();
rollback;
