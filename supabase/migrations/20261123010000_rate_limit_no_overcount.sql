-- Stage 8 security review: a refused hit must not be counted. Otherwise one account that is already
-- over its own limit could keep inflating a shared counter (e.g. bookings per day for everyone).
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    where public.rate_limits.count < p_limit
  returning count into n;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return jsonb_build_object(
    'allowed', n is not null and n <= p_limit,
    'retry_after', ceil(extract(epoch from (w + make_interval(secs => p_window_seconds) - now())))::integer
  );
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
