-- The second city (Nordheim): a company can play in another city than its
-- first one. Its save then holds the city being played in "city" and
-- "dealers", and the first city parked in "cities"."home". The empire card
-- (the leaderboard's plants, visits in 3D) always shows the first city: a
-- visitor's map is the first island, and a friend's Nordheim lots don't exist
-- on it. Saves from before the cities have no "activeCity": nothing changes
-- for them.

alter function public.empire_card(jsonb) rename to empire_card_of_city;

create or replace function public.empire_card(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select public.empire_card_of_city(
    case
      when coalesce(d->>'activeCity', 'home') <> 'home' and jsonb_typeof(d->'cities'->'home') = 'object'
        then d || jsonb_build_object('city', d->'cities'->'home'->'city', 'dealers', d->'cities'->'home'->'dealers')
      else d
    end
  );
$fn$;

revoke all on function public.empire_card(jsonb) from public, anon, authenticated;
revoke all on function public.empire_card_of_city(jsonb) from public, anon, authenticated;
