-- The auction house: players put up cars in a limited-edition finish they have found (engine/
-- collection.ts), other players buy them for their collector garage (engine/auction.ts).
--
-- Nothing of value crosses between two saves: the price is an "ask" of 1–20 units, and each side
-- turns units into money in their own game (a unit is 10 minutes of that player's own income). The
-- buyer pays from their wallet, the seller is paid when they collect, less a 10% fee. The server
-- only keeps the listings and their limits, so a second account can't feed a main one much:
--   · at most 3 open listings and 6 new ones a day per seller;
--   · at most 5 buys a day per buyer, never their own listing, nor a banned player's;
--   · a listing stays up 48 hours; what doesn't sell is just taken down.
--
-- Safe to apply on production: one new table in ops (out of the API's reach) and six functions.
-- Applying it again changes nothing.

create table if not exists ops.auction_listings (
  id bigint generated always as identity primary key,
  seller uuid not null references auth.users (id) on delete cascade,
  car text not null check (car ~ '^[a-z0-9_]{2,24}$'),
  edition text not null check (edition in ('gold', 'carbon', 'pearl', 'midnight', 'racing', 'chrome', 'camo', 'sunset', 'arctic', 'royal', 'mint', 'copper')),
  ask integer not null check (ask between 1 and 20),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  cancelled boolean not null default false,
  buyer uuid references auth.users (id) on delete set null,
  sold_at timestamptz,
  paid boolean not null default false
);
create index if not exists auction_open on ops.auction_listings (ask, created_at) where buyer is null and not cancelled;
create index if not exists auction_seller on ops.auction_listings (seller, created_at desc);
create index if not exists auction_buyer on ops.auction_listings (buyer, sold_at desc) where buyer is not null;
alter table ops.auction_listings enable row level security;
revoke all on ops.auction_listings from public, anon, authenticated;

/** A listing of the caller's: 'ok', 'invalid', 'open' (3 up already), 'limit' (6 today) or 'banned'. */
create or replace function public.auction_list(p_car text, p_edition text, p_ask integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.banned) then
    return 'banned';
  end if;
  if p_car is null or p_car !~ '^[a-z0-9_]{2,24}$' or p_ask is null or p_ask not between 1 and 20
     or p_edition is null or p_edition not in ('gold', 'carbon', 'pearl', 'midnight', 'racing', 'chrome', 'camo', 'sunset', 'arctic', 'royal', 'mint', 'copper') then
    return 'invalid';
  end if;
  -- one at a time per seller, so two quick taps can't pass the limits together
  perform pg_advisory_xact_lock(hashtext('auction:' || uid::text));
  if (select count(*) from ops.auction_listings l where l.seller = uid and l.buyer is null and not l.cancelled and l.expires_at > now()) >= 3 then
    return 'open';
  end if;
  if (select count(*) from ops.auction_listings l where l.seller = uid and l.created_at > now() - interval '24 hours') >= 6 then
    return 'limit';
  end if;
  insert into ops.auction_listings (seller, car, edition, ask) values (uid, p_car, p_edition, p_ask);
  return 'ok';
end;
$$;

/** Takes one of the caller's open listings down. */
create or replace function public.auction_cancel(p_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with done as (
    update ops.auction_listings l set cancelled = true
    where l.id = p_id and l.seller = auth.uid() and l.buyer is null and not l.cancelled
    returning 1
  )
  select exists (select 1 from done);
$$;

/** The cheapest 40 cars up for sale (others' only, still open), with their sellers' names. */
create or replace function public.auction_browse()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'car', x.car, 'edition', x.edition, 'ask', x.ask, 'seller', x.username, 'avatar', x.avatar, 'expiresAt', x.expires_at) order by x.ask, x.created_at)
    from (
      select l.id, l.car, l.edition, l.ask, l.created_at, l.expires_at, coalesce(p.username, '') as username, coalesce(p.avatar, '') as avatar
      from ops.auction_listings l left join public.profiles p on p.id = l.seller
      where l.buyer is null and not l.cancelled and l.expires_at > now() and l.seller <> uid and not coalesce(p.banned, false)
      order by l.ask, l.created_at
      limit 40
    ) x
  ), '[]'::jsonb);
end;
$$;

/**
 * Buys a listing: {result: 'ok' | 'gone' | 'self' | 'limit' | 'banned', car, edition, ask}. Only
 * one buyer can take it; the game takes the price from the buyer's wallet on 'ok'.
 */
create or replace function public.auction_buy(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  got ops.auction_listings%rowtype;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.banned) then
    return jsonb_build_object('result', 'banned');
  end if;
  perform pg_advisory_xact_lock(hashtext('auction:' || uid::text));
  if exists (select 1 from ops.auction_listings l where l.id = p_id and l.seller = uid) then
    return jsonb_build_object('result', 'self');
  end if;
  if (select count(*) from ops.auction_listings l where l.buyer = uid and l.sold_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('result', 'limit');
  end if;
  update ops.auction_listings l set buyer = uid, sold_at = now()
  where l.id = p_id and l.buyer is null and not l.cancelled and l.expires_at > now()
    and not exists (select 1 from public.profiles p where p.id = l.seller and p.banned)
  returning * into got;
  if got.id is null then
    return jsonb_build_object('result', 'gone');
  end if;
  return jsonb_build_object('result', 'ok', 'car', got.car, 'edition', got.edition, 'ask', got.ask);
end;
$$;

/** The caller's listings of the last 3 days: open, sold, taken down or past their time. */
create or replace function public.auction_mine()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'car', l.car, 'edition', l.edition, 'ask', l.ask, 'expiresAt', l.expires_at,
      'status', case when l.buyer is not null or l.sold_at is not null then 'sold' when l.cancelled then 'cancelled' when l.expires_at <= now() then 'expired' else 'open' end
    ) order by l.created_at desc), '[]'::jsonb)
  from ops.auction_listings l
  where l.seller = auth.uid() and l.created_at > now() - interval '3 days';
$$;

/** The caller's sales not yet paid, marked paid: [{id, car, edition, ask}] (each one once). */
create or replace function public.auction_collect()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with paid as (
    update ops.auction_listings l set paid = true
    where l.seller = auth.uid() and l.sold_at is not null and not l.paid
    returning l.id, l.car, l.edition, l.ask
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'car', car, 'edition', edition, 'ask', ask) order by id), '[]'::jsonb) from paid;
$$;

revoke all on function public.auction_list(text, text, integer) from public, anon;
revoke all on function public.auction_cancel(bigint) from public, anon;
revoke all on function public.auction_browse() from public, anon;
revoke all on function public.auction_buy(bigint) from public, anon;
revoke all on function public.auction_mine() from public, anon;
revoke all on function public.auction_collect() from public, anon;
grant execute on function public.auction_list(text, text, integer) to authenticated;
grant execute on function public.auction_cancel(bigint) to authenticated;
grant execute on function public.auction_browse() to authenticated;
grant execute on function public.auction_buy(bigint) to authenticated;
grant execute on function public.auction_mine() to authenticated;
grant execute on function public.auction_collect() to authenticated;
