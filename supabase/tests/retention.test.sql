-- Data retention: old chats, decided drafts and rate-limit windows are deleted (pgTAP).
begin;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.local');
insert into public.bookings (id, user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name)
values ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'R1', 'h1', 'H', current_date + 10, current_date + 12, 2, 1, 'UAH', 'gs-200000000000000000000001', 'P', 'R');
insert into public.assistant_threads (id, user_id, updated_at) values
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', now() - interval '91 days'),
  ('71000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', now() - interval '5 days');
insert into public.assistant_actions (user_id, booking_id, type, payload, status, expires_at, created_at) values
  ('00000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', 'check_in', '{}', 'expired', now() - interval '40 days', now() - interval '40 days'),
  ('00000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', 'check_in', '{}', 'pending', now() + interval '10 minutes', now());
insert into public.rate_limits (key, window_start, count) values ('x', now() - interval '3 days', 1), ('y', now(), 1);

select lives_ok($$ select public.prune_old_data() $$, 'Retention job runs');
select is((select count(*) from public.assistant_threads where user_id = '00000000-0000-0000-0000-00000000000a')::int, 1, 'Chats idle for 90+ days are deleted');
select is((select count(*) from public.assistant_actions where user_id = '00000000-0000-0000-0000-00000000000a')::int, 1, 'Drafts older than 30 days are deleted, current ones kept');
select is((select count(*) from public.rate_limits where key in ('x', 'y'))::int, 1, 'Old rate-limit windows are deleted');
select throws_ok($$ set local role authenticated; select public.prune_old_data() $$, '42501', null, 'Users cannot run the retention job');

select * from finish();
rollback;
