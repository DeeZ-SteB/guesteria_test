-- Caps favorites per user (found by the security-auditor agent): the insert policy lets a user
-- add rows directly through the API, so the limit lives in the database, not only in the UI.
create function public.enforce_favorites_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.favorites where user_id = new.user_id) >= 500 then
    raise exception 'favorites limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger favorites_limit
  before insert on public.favorites
  for each row execute function public.enforce_favorites_limit();
