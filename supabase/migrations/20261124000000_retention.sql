-- Stage 10: data retention (privacy). Guests' chats are not kept forever.
-- * assistant threads (and their messages) idle for 90 days
-- * drafted actions older than 30 days (confirmed results live in checkins / guest_requests)
-- * rate-limit windows older than 2 days
create function public.prune_old_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.assistant_threads where updated_at < now() - interval '90 days';
  delete from public.assistant_actions where created_at < now() - interval '30 days' and status <> 'pending';
  delete from public.assistant_actions where expires_at < now() - interval '30 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
$$;
revoke all on function public.prune_old_data() from public, anon, authenticated;

-- Nightly at 03:15 UTC.
create extension if not exists pg_cron;
select cron.schedule('guesteria-prune-old-data', '15 3 * * *', 'select public.prune_old_data()');
