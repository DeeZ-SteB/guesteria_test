-- AI assistant: threads, drafts confirmed by the user, rate limits (pgTAP).
begin;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

-- A: future confirmed (F), already started (S), cancelled (C).
insert into public.bookings (id, user_id, liteapi_booking_id, hotel_id, hotel_name, check_in, check_out, adults, total_amount, currency, client_reference, prebook_id, room_name, status) values
  ('40000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'M1', 'h1', 'H', (now() at time zone 'Europe/Kyiv')::date + 10, (now() at time zone 'Europe/Kyiv')::date + 12, 2, 1, 'UAH', 'gs-100000000000000000000001', 'Q1', 'R', 'confirmed'),
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'M2', 'h1', 'H', (now() at time zone 'Europe/Kyiv')::date - 1, (now() at time zone 'Europe/Kyiv')::date + 2, 2, 1, 'UAH', 'gs-100000000000000000000002', 'Q2', 'R', 'confirmed'),
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'M3', 'h1', 'H', (now() at time zone 'Europe/Kyiv')::date + 10, (now() at time zone 'Europe/Kyiv')::date + 12, 2, 1, 'UAH', 'gs-100000000000000000000003', 'Q3', 'R', 'cancelled');

insert into public.assistant_threads (id, user_id) values ('50000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a');
insert into public.assistant_messages (thread_id, user_id, seq, role, content) values
  ('50000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 1, 'user', '[{"type":"text","text":"hi"}]');

-- Drafts the server created (secret key).
insert into public.assistant_actions (id, user_id, booking_id, thread_id, type, payload, expires_at) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'check_in', '{"arrival_time":"10:30","notes":"Тихий номер"}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'guest_request', '{"type":"late_check_out","details":"До 14:00"}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'guest_request', '{"type":"breakfast","details":null}', now() - interval '1 minute'),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000c1', null, 'guest_request', '{"type":"transfer","details":"x"}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', null, 'guest_request', '{"type":"early_check_in","details":null}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'guest_request', '{"type":"late_check_out","details":"Ще раз"}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'check_in', '{"arrival_time":"10:15","notes":null}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'guest_request', '{"type":"other","details":"a‮b"}', now() + interval '30 minutes'),
  ('60000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', null, 'guest_request', '{"type":"breakfast","details":null}', now() + interval '30 minutes');

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.assistant_threads'::regclass, 'public.assistant_messages'::regclass, 'public.assistant_actions'::regclass, 'public.rate_limits'::regclass)),
  'RLS is on for all assistant tables');

-- ---------- B: sees and confirms nothing of A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.assistant_threads)::int, 0, 'B cannot see A''s threads');
select is((select count(*) from public.assistant_messages)::int, 0, 'B cannot see A''s messages');
select is((select count(*) from public.assistant_actions)::int, 0, 'B cannot see A''s drafts');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000001')->>'status', 'not_found', 'B cannot confirm A''s draft');
select is(public.cancel_assistant_action('60000000-0000-0000-0000-000000000002')->>'status', 'not_found', 'B cannot cancel A''s draft');

-- ---------- A ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.assistant_actions)::int, 9, 'A sees own drafts');
select throws_ok($$ insert into public.assistant_actions (user_id, booking_id, type, payload, expires_at) values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000f1', 'check_in', '{}', now()) $$,
  '42501', null, 'Clients cannot create drafts');
select throws_ok($$ update public.assistant_actions set status = 'confirmed' $$, '42501', null, 'Clients cannot change a draft directly');
select throws_ok($$ insert into public.assistant_messages (thread_id, user_id, seq, role, content) values ('50000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 2, 'assistant', '[]') $$,
  '42501', null, 'Clients cannot write chat history (no forged tool results)');
select throws_ok($$ insert into public.guest_requests (booking_id, type, source) values ('40000000-0000-0000-0000-0000000000f1', 'breakfast', 'assistant') $$,
  '42501', null, 'Clients still cannot write source = assistant directly');

select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000001')->>'status', 'confirmed', 'A confirms a check-in draft');
select is((select arrival_time::text from public.checkins where booking_id = '40000000-0000-0000-0000-0000000000f1'), '10:30:00', 'The check-in is saved');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000001')->>'status', 'confirmed', 'A second confirm returns the same result (idempotent)');

select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000002')->>'status', 'confirmed', 'A confirms a request draft');
select is((select source from public.guest_requests where id = '60000000-0000-0000-0000-000000000002'), 'assistant', 'The request is marked as created by the AI');
select is((select details from public.guest_requests where id = '60000000-0000-0000-0000-000000000002'), 'До 14:00', 'Details come from the draft');

select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000003')->>'status', 'expired', 'An expired draft cannot be confirmed');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000004')->>'reason', 'closed', 'No request for a cancelled booking');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000005')->>'reason', 'closed', 'No early check-in after the arrival day');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000006')->>'reason', 'duplicate_open', 'One open request per type');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000007')->>'reason', 'invalid', 'Arrival time must be on the 30-minute grid');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000008')->>'reason', 'invalid', 'Invisible characters in a draft are refused');
select is(public.cancel_assistant_action('60000000-0000-0000-0000-000000000009')->>'status', 'cancelled', 'A cancels own draft');
select is(public.confirm_assistant_action('60000000-0000-0000-0000-000000000009')->>'status', 'cancelled', 'A cancelled draft cannot be confirmed');

-- ---------- rate limits ----------
select throws_ok($$ select public.rate_limit_hit('x', 1, 60) $$, '42501', null, 'Users cannot spend anyone''s quota');
select throws_ok($$ select count(*) from public.rate_limits $$, '42501', null, 'Rate-limit counters are invisible to users');
reset role;
set local role anon;
select throws_ok($$ select public.rate_limit_hit('x', 1, 60) $$, '42501', null, 'Anonymous callers cannot touch rate limits');
reset role;
set local role service_role;
select ok((select (public.rate_limit_hit('t:k', 2, 3600)->>'allowed')::boolean and (public.rate_limit_hit('t:k', 2, 3600)->>'allowed')::boolean), 'Within the limit');
select ok(not (public.rate_limit_hit('t:k', 2, 3600)->>'allowed')::boolean, 'Over the limit');

select * from finish();
rollback;
