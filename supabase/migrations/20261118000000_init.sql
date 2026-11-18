-- Core schema: bookings, favorites and guest requests, all private to their owner.
--
-- Security model
-- * RLS is on for every table; a user only ever sees rows where user_id = auth.uid().
-- * bookings has NO insert/update policy for clients. A row is written by the server
--   (secret key) only after LiteAPI confirms the booking, so a user cannot forge one
--   through the public REST API.
-- * LiteAPI lists every booking made with our API key, not per user. This table is the
--   source of truth for "which booking belongs to whom".

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  liteapi_booking_id text not null unique,
  hotel_id text not null,
  hotel_name text not null,
  check_in date not null,
  check_out date not null,
  adults smallint not null check (adults between 1 and 8),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  currency char(3) not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint bookings_dates_check check (check_out > check_in)
);

create index bookings_user_id_idx on public.bookings (user_id, check_in);

create table public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hotel_id text not null,
  hotel_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, hotel_id)
);

create table public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('early_check_in', 'late_check_out', 'transfer', 'breakfast', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'sent' check (status in ('sent', 'confirmed', 'declined')),
  created_at timestamptz not null default now()
);

create index guest_requests_booking_id_idx on public.guest_requests (booking_id);

alter table public.bookings enable row level security;
alter table public.favorites enable row level security;
alter table public.guest_requests enable row level security;

-- bookings: read own only. Writes go through the server.
create policy "bookings: owner can read"
  on public.bookings for select to authenticated
  using ((select auth.uid()) = user_id);

-- favorites: full control over own rows.
create policy "favorites: owner can read"
  on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "favorites: owner can add"
  on public.favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "favorites: owner can remove"
  on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

-- guest_requests: read own; create only for a booking the user owns. Status is set by the hotel side.
create policy "guest_requests: owner can read"
  on public.guest_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "guest_requests: owner can create for own booking"
  on public.guest_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'sent'
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = (select auth.uid())
    )
  );
