-- The server's check of in-app purchases (docs/android/iap.md, "Checking purchases on the
-- server"). The "iap" Edge Function (supabase/functions/iap) asks Google Play about each
-- purchase a phone reports, before the game gives it, and keeps it here:
--   - a purchase belongs to the first account that reports it: the same purchase can't be
--     given to a second account;
--   - a purchase Google refunds or cancels later is marked "refunded" (the function reads
--     Google's voided purchases on a schedule), and the game takes back what it can
--     (ad-free rewards).
--
-- Only a hash of Google's purchase token is kept, never the token. The order id is Google's
-- (GPA.xxxx), so the owner can find a purchase in Play Console. Purchases go with the account.
-- Players read only which products their own account owns (my_purchases); the function's
-- two functions are for the service key only.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.purchases (
  -- SHA-256 of Google's purchase token, as hex
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null check (product in ('starter', 'adFree')),
  order_id text check (order_id is null or char_length(order_id) <= 64),
  -- purchased: paid and checked; pending: waiting for the payment; refunded: refunded or cancelled
  state text not null check (state in ('purchased', 'pending', 'refunded')),
  -- a license tester's purchase (Play Console → License testing): free, kept apart in the totals
  test boolean not null default false,
  bought_at timestamptz,
  checked_at timestamptz not null default now(),
  refunded_at timestamptz
);
create index if not exists purchases_user on ops.purchases (user_id);
alter table ops.purchases enable row level security;
revoke all on ops.purchases from public, anon, authenticated;

-- where the last read of Google's voided purchases got to
create table if not exists ops.purchase_marks (
  name text primary key,
  at timestamptz not null
);
alter table ops.purchase_marks enable row level security;
revoke all on ops.purchase_marks from public, anon, authenticated;

/**
 * A purchase Google Play confirmed, for an account (the function, after asking Google):
 *   new       first seen, kept for this account (give it)
 *   known     this account's already (give it again if the game hasn't: a reinstall)
 *   refunded  this account's, and refunded since (don't give it)
 *   taken     another account's (don't give it)
 * A purchase that is refunded stays refunded, whatever Google answered before.
 */
create or replace function public.iap_record(p_token_hash text, p_user uuid, p_product text, p_state text, p_order text, p_bought_at timestamptz, p_test boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r ops.purchases;
begin
  if p_state not in ('purchased', 'pending') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  select * into r from ops.purchases where token_hash = p_token_hash for update;
  if not found then
    insert into ops.purchases (token_hash, user_id, product, order_id, state, bought_at, test)
    values (p_token_hash, p_user, p_product, left(p_order, 64), p_state, p_bought_at, coalesce(p_test, false))
    on conflict (token_hash) do nothing;
    if not found then
      -- the same purchase reported at the same moment (two phones): the first one keeps it
      select * into r from ops.purchases where token_hash = p_token_hash;
      return case when r.user_id = p_user then 'known' else 'taken' end;
    end if;
    return 'new';
  end if;
  if r.user_id <> p_user then
    return 'taken';
  end if;
  if r.state = 'refunded' then
    return 'refunded';
  end if;
  update ops.purchases
  set state = p_state, checked_at = now(), order_id = coalesce(r.order_id, left(p_order, 64)), bought_at = coalesce(r.bought_at, p_bought_at)
  where token_hash = p_token_hash;
  return 'known';
end;
$$;

revoke all on function public.iap_record(text, uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.iap_record(text, uuid, text, text, text, timestamptz, boolean) to service_role;

/** Marks purchases refunded (Google's voided purchases, by token hash); how many changed. */
create or replace function public.iap_refunded(p_token_hashes text[], p_mark timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update ops.purchases
  set state = 'refunded', refunded_at = now(), checked_at = now()
  where token_hash = any (p_token_hashes) and state <> 'refunded';
  get diagnostics n = row_count;
  if p_mark is not null then
    insert into ops.purchase_marks (name, at) values ('voided', p_mark)
    on conflict (name) do update set at = greatest(ops.purchase_marks.at, excluded.at);
  end if;
  return n;
end;
$$;

revoke all on function public.iap_refunded(text[], timestamptz) from public, anon, authenticated;
grant execute on function public.iap_refunded(text[], timestamptz) to service_role;

/** Where the last read of voided purchases got to (null: never read). */
create or replace function public.iap_voided_mark()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select at from ops.purchase_marks where name = 'voided';
$$;

revoke all on function public.iap_voided_mark() from public, anon, authenticated;
grant execute on function public.iap_voided_mark() to service_role;

/**
 * What the signed-in account owns, as the server checked it: each product once, "owned" if
 * some purchase of it is paid, otherwise "refunded" if one was refunded (products never
 * bought, or only pending, are left out). [{"product": "adFree", "state": "refunded"}, …]
 */
create or replace function public.my_purchases()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product', product, 'state', state) order by product), '[]'::jsonb)
  from (
    select p.product, case when bool_or(p.state = 'purchased') then 'owned' else 'refunded' end as state
    from ops.purchases p
    where p.user_id = (select auth.uid()) and p.state in ('purchased', 'refunded')
    group by p.product
  ) t;
$$;

revoke all on function public.my_purchases() from public, anon;
grant execute on function public.my_purchases() to authenticated;
