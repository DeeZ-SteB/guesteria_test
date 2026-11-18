-- Favorites: new columns, value checks and owner isolation (pgTAP).
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

select has_column('public', 'favorites', 'hotel_image', 'favorites.hotel_image exists');
select has_column('public', 'favorites', 'city', 'favorites.city exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.favorites (hotel_id, hotel_name, hotel_image, city)
     values ('lpbbb0c', 'Grand Hotel', 'https://static.cupid.travel/hotels/1.jpg', 'lviv') $$,
  'A saves a favorite with image and city');

select throws_ok(
  $$ insert into public.favorites (hotel_id, hotel_name, hotel_image) values ('lp2', 'X', 'javascript:alert(1)') $$,
  '23514', null, 'Foreign or script image URLs are rejected by the database');

-- Act as B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.favorites (user_id, hotel_id, hotel_name) values ('00000000-0000-0000-0000-00000000000a', 'lp3', 'X') $$,
  '42501', null, 'B cannot add a favorite to A''s list');

delete from public.favorites where hotel_id = 'lpbbb0c';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.favorites)::int, 1, 'B''s delete did not remove A''s favorite');
select is((select city from public.favorites where hotel_id = 'lpbbb0c'), 'lviv', 'A sees own favorite with city');

select * from finish();
rollback;
