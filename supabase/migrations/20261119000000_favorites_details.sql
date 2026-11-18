-- Favorites keep what the account page needs to render a card without calling LiteAPI.
-- Values come from the client, so the database enforces shape too (defence in depth with Zod).
alter table public.favorites
  add column hotel_image text,
  add column city text;

alter table public.favorites
  add constraint favorites_hotel_id_check check (char_length(hotel_id) between 1 and 32 and hotel_id ~ '^[A-Za-z0-9]+$'),
  add constraint favorites_hotel_name_check check (char_length(hotel_name) between 1 and 200),
  add constraint favorites_hotel_image_check check (
    hotel_image is null or (hotel_image like 'https://static.cupid.travel/%' and char_length(hotel_image) <= 500)
  ),
  add constraint favorites_city_check check (city is null or city ~ '^[a-z-]{1,64}$');
-- Policies are unchanged: owner-only select / insert / delete.
