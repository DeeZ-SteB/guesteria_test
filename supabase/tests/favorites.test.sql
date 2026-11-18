-- Favorites: new columns, value checks and owner isolation (pgTAP).
begin;
select plan(9);

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

-- Same tricky URLs the Zod schema rejects.
select throws_ok(
  $$ insert into public.favorites (hotel_id, hotel_name, hotel_image) values ('lp4', 'X', 'https://static.cupid.travel@evil.com/x.jpg') $$,
  '23514', null, 'userinfo trick is rejected');

-- Per-user cap: fill A's list to 500, the next insert fails.
insert into public.favorites (hotel_id, hotel_name) select 'cap' || g, 'H' from generate_series(1, 499) g;
select throws_ok(
  $$ insert into public.favorites (hotel_id, hotel_name) values ('over', 'X') $$,
  'P0001', 'favorites limit reached', 'A cannot store more than 500 favorites');

select * from finish();
rollback;
