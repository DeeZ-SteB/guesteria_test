-- Stage 5: what checkout stores about a confirmed booking.
-- Rows are written only by the server (secret key) after LiteAPI confirms; clients can only read
-- their own rows. Our net cost is deliberately NOT stored: owners can SELECT their rows.
alter table public.bookings
  add column client_reference text not null unique check (client_reference ~ '^gs-[0-9a-f]{24}$'),
  add column prebook_id text not null check (prebook_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  add column hotel_image text check (
    hotel_image is null or (hotel_image like 'https://static.cupid.travel/%' and char_length(hotel_image) <= 500)
  ),
  add column city text check (city is null or city ~ '^[a-z-]{1,64}$'),
  add column room_name text not null check (char_length(room_name) between 1 and 200),
  add column board text check (board is null or board ~ '^[A-Z0-9]{1,8}$'),
  add column refundable_until timestamptz;

alter table public.bookings
  add constraint bookings_hotel_id_check check (hotel_id ~ '^[A-Za-z0-9]{1,32}$'),
  add constraint bookings_liteapi_id_check check (liteapi_booking_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  add constraint bookings_hotel_name_check check (char_length(hotel_name) between 1 and 200),
  add constraint bookings_currency_check check (currency ~ '^[A-Z]{3}$');

-- Defence in depth on top of RLS (there is no insert/update/delete policy anyway).
revoke insert, update, delete on public.bookings from anon, authenticated;
