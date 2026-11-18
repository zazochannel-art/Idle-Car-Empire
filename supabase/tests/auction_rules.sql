-- The auction house (migration 0035), checked inside one transaction that is rolled back: players
-- A, B and C (made up here, never committed), each acting as the "authenticated" role with their
-- own JWT. Any failed check raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()
from (values
  ('a9000000-0000-4000-8000-00000000000a'::uuid), ('b9000000-0000-4000-8000-00000000000b'::uuid), ('c9000000-0000-4000-8000-00000000000c'::uuid)
) as u(id);
-- (the sign-up trigger made their profiles)
update public.profiles set username = 'Auction' || right(id::text, 1) where id in ('a9000000-0000-4000-8000-00000000000a', 'b9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-00000000000c');

do $test$
declare
  a constant uuid := 'a9000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b9000000-0000-4000-8000-00000000000b';
  c constant uuid := 'c9000000-0000-4000-8000-00000000000c';
  j jsonb;
  first bigint;
  i int;
  failed boolean;
begin
  -- ── A lists: shapes checked, 3 open at most ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.auction_list('city', 'gold', 0) <> 'invalid' then raise exception 'FAIL an ask of 0 is refused'; end if;
  if public.auction_list('city', 'gold', 21) <> 'invalid' then raise exception 'FAIL an ask over 20 is refused'; end if;
  if public.auction_list('city', 'plutonium', 5) <> 'invalid' then raise exception 'FAIL an unknown edition is refused'; end if;
  if public.auction_list('<b>', 'gold', 5) <> 'invalid' then raise exception 'FAIL an odd car id is refused'; end if;
  if public.auction_list('city', 'gold', 8) <> 'ok' then raise exception 'FAIL A lists a car'; end if;
  if public.auction_list('sports', 'pearl', 3) <> 'ok' then raise exception 'FAIL A lists a second'; end if;
  if public.auction_list('sedan', 'racing', 12) <> 'ok' then raise exception 'FAIL A lists a third'; end if;
  if public.auction_list('suv', 'mint', 4) <> 'open' then raise exception 'FAIL a fourth open listing is refused'; end if;
  if jsonb_array_length(public.auction_browse()) <> 0 then raise exception 'FAIL A doesn''t see their own listings'; end if;
  if jsonb_array_length(public.auction_mine()) <> 3 then raise exception 'FAIL A sees their 3 listings'; end if;
  reset role;

  -- ── B browses (cheapest first) and buys ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.auction_browse();
  if jsonb_array_length(j) <> 3 or (j -> 0 ->> 'ask')::int <> 3 or j -> 0 ->> 'seller' <> 'Auctiona' then raise exception 'FAIL B sees A''s cars, cheapest first: %', j; end if;
  first := (j -> 0 ->> 'id')::bigint;
  j := public.auction_buy(first);
  if j ->> 'result' <> 'ok' or j ->> 'car' <> 'sports' or j ->> 'edition' <> 'pearl' or (j ->> 'ask')::int <> 3 then raise exception 'FAIL B buys it: %', j; end if;
  if public.auction_buy(first) ->> 'result' <> 'gone' then raise exception 'FAIL a car sells once'; end if;
  if jsonb_array_length(public.auction_browse()) <> 2 then raise exception 'FAIL a sold car leaves the list'; end if;
  if public.auction_cancel(first) then raise exception 'FAIL B can''t take A''s listing down'; end if;
  if jsonb_array_length(public.auction_collect()) <> 0 then raise exception 'FAIL B has nothing to collect'; end if;
  reset role;

  -- ── C can't buy it again; A is paid once ──
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.auction_buy(first) ->> 'result' <> 'gone' then raise exception 'FAIL C can''t buy a sold car'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.auction_buy(first) ->> 'result' <> 'self' then raise exception 'FAIL A can''t buy their own'; end if;
  j := public.auction_collect();
  if jsonb_array_length(j) <> 1 or (j -> 0 ->> 'ask')::int <> 3 then raise exception 'FAIL A collects the sale: %', j; end if;
  if jsonb_array_length(public.auction_collect()) <> 0 then raise exception 'FAIL a sale is paid once'; end if;
  if not exists (select 1 from jsonb_array_elements(public.auction_mine()) e where e ->> 'status' = 'sold') then raise exception 'FAIL A sees it sold'; end if;
  -- a sale freed a slot; taking one down frees another
  if public.auction_list('suv', 'mint', 4) <> 'ok' then raise exception 'FAIL A lists again after a sale'; end if;
  select (e ->> 'id')::bigint into first from jsonb_array_elements(public.auction_mine()) e where e ->> 'car' = 'suv';
  if not public.auction_cancel(first) then raise exception 'FAIL A takes a listing down'; end if;
  if public.auction_cancel(first) then raise exception 'FAIL only once'; end if;
  -- 3 open at most again (city, sedan, and this one)
  if public.auction_list('van', 'camo', 2) <> 'ok' then raise exception 'FAIL A lists a fifth today'; end if;
  if public.auction_list('van', 'camo', 2) <> 'open' then raise exception 'FAIL 3 open again'; end if;
  -- the listings are out of the API's reach
  failed := false;
  begin
    perform 1 from ops.auction_listings;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL players read the listings table'; end if;
  reset role;

  -- ── a buyer takes 5 a day at most ──
  update ops.auction_listings set cancelled = true;
  insert into ops.auction_listings (seller, car, edition, ask) select a, 'city', 'gold', g from generate_series(1, 6) g;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..5 loop
    if public.auction_buy((public.auction_browse() -> 0 ->> 'id')::bigint) ->> 'result' <> 'ok' then raise exception 'FAIL C''s buy %', i; end if;
  end loop;
  if public.auction_buy((public.auction_browse() -> 0 ->> 'id')::bigint) ->> 'result' <> 'limit' then raise exception 'FAIL a sixth buy today is refused'; end if;
  reset role;

  -- ── a banned seller's cars are off the list ──
  update public.profiles set banned = true where id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if jsonb_array_length(public.auction_browse()) <> 0 then raise exception 'FAIL a banned seller''s cars are hidden'; end if;
  reset role;

  -- ── signed out: nothing ──
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  failed := false;
  begin
    perform public.auction_browse();
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon browses the auction'; end if;
  reset role;

  raise notice 'auction rules: all checks passed';
end;
$test$;

rollback;
