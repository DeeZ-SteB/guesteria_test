-- Wrong current-password attempts in the cabinet are counted per user (pgTAP).
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

select has_table('public', 'password_failures', 'password_failures exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.recent_password_failures(), 0, 'No failures yet');
select public.record_password_failure();
select public.record_password_failure();
select is(public.recent_password_failures(), 2, 'Failures are counted for the caller');
select throws_ok($$ insert into public.password_failures (user_id) values ('00000000-0000-0000-0000-00000000000a') $$, '42501', null, 'Users cannot write the table directly');
select throws_ok($$ delete from public.password_failures $$, '42501', null, 'Users cannot clear their own failures');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.recent_password_failures(), 0, 'B does not see A''s failures');

reset role;
set local role anon;
select throws_ok($$ select public.record_password_failure() $$, '42501', null, 'Anonymous callers cannot record failures');

select * from finish();
rollback;
