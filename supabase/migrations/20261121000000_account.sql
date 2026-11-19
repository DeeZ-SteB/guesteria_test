-- Stage 6: personal cabinet.

-- 1. Deleting an account keeps booking records (money moved through our LiteAPI key; support
--    and accounting need them). The row loses its owner, so RLS hides it from everyone.
alter table public.bookings alter column user_id drop not null;
alter table public.bookings drop constraint bookings_user_id_fkey;
alter table public.bookings
  add constraint bookings_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

-- 2. Wrong current-password attempts (password change / account deletion), counted per user so
--    a hijacked session cannot guess the password, and so the server stops calling Supabase sign-in
--    (whose per-IP limit is shared by all users) after a few failures.
create table public.password_failures (
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index password_failures_user_idx on public.password_failures (user_id, created_at);
alter table public.password_failures enable row level security;
-- No policies: clients can neither read nor write the table; only the functions below touch it.
revoke all on public.password_failures from anon, authenticated;

create function public.recent_password_failures()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.password_failures
  where user_id = auth.uid() and created_at > now() - interval '15 minutes';
$$;

create function public.record_password_failure()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.password_failures where user_id = auth.uid() and created_at < now() - interval '1 day';
  insert into public.password_failures (user_id) select auth.uid() where auth.uid() is not null;
$$;

revoke all on function public.recent_password_failures() from public, anon;
revoke all on function public.record_password_failure() from public, anon;
grant execute on function public.recent_password_failures() to authenticated;
grant execute on function public.record_password_failure() to authenticated;
