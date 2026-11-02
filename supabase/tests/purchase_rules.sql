-- The purchases ledger (0019_purchases.sql), checked inside one transaction that is rolled
-- back: two players A and B (made up here, never committed). The "iap" function's calls run
-- as service_role; players run as "authenticated" with their own JWT, the way PostgREST runs
-- their requests. Any failed check raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

do $test$
declare
  a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  h1 constant text := repeat('1', 64);
  h2 constant text := repeat('2', 64);
  h3 constant text := repeat('3', 64);
  r text;
  n int;
  mine jsonb;
  failed boolean;
begin
  -- ── the function (service key) ──
  set local role service_role;

  r := public.iap_record(h1, a, 'adFree', 'purchased', 'GPA.1', now(), false);
  if r <> 'new' then raise exception 'FAIL first report is new: %', r; end if;
  r := public.iap_record(h1, a, 'adFree', 'purchased', 'GPA.1', now(), false);
  if r <> 'known' then raise exception 'FAIL same account again is known: %', r; end if;
  r := public.iap_record(h1, b, 'adFree', 'purchased', 'GPA.1', now(), false);
  if r <> 'taken' then raise exception 'FAIL another account gets taken: %', r; end if;

  r := public.iap_record(h2, a, 'starter', 'pending', null, null, true);
  if r <> 'new' then raise exception 'FAIL pending purchase kept: %', r; end if;
  r := public.iap_record(h2, a, 'starter', 'purchased', 'GPA.2', now(), true);
  if r <> 'known' then raise exception 'FAIL pending then paid: %', r; end if;
  reset role;
  if (select state from ops.purchases where token_hash = h2) <> 'purchased' then raise exception 'FAIL pending then paid is purchased'; end if;
  set local role service_role;

  -- a state the function never sends, a product the game doesn't have, a malformed hash
  failed := false;
  begin perform public.iap_record(h3, a, 'adFree', 'refunded', null, null, false); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL refunded is not a state to record'; end if;
  failed := false;
  begin perform public.iap_record(h3, a, 'gems', 'purchased', null, null, false); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL unknown product refused'; end if;
  failed := false;
  begin perform public.iap_record('xyz', a, 'adFree', 'purchased', null, null, false); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL malformed hash refused'; end if;

  -- refunds: marked once, the mark moves on, and a refunded purchase stays refunded
  if public.iap_voided_mark() is not null then raise exception 'FAIL no mark before the first read'; end if;
  n := public.iap_refunded(array[h1, repeat('9', 64)], '2026-10-27 12:00+00');
  if n <> 1 then raise exception 'FAIL one purchase refunded: %', n; end if;
  n := public.iap_refunded(array[h1], '2026-10-27 11:00+00');
  if n <> 0 then raise exception 'FAIL refunded only once: %', n; end if;
  if public.iap_voided_mark() <> '2026-10-27 12:00+00' then raise exception 'FAIL the mark never goes back: %', public.iap_voided_mark(); end if;
  r := public.iap_record(h1, a, 'adFree', 'purchased', 'GPA.1', now(), false);
  if r <> 'refunded' then raise exception 'FAIL refunded stays refunded: %', r; end if;

  reset role;

  -- ── player A ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  mine := public.my_purchases();
  if mine <> '[{"product": "adFree", "state": "refunded"}, {"product": "starter", "state": "owned"}]'::jsonb then
    raise exception 'FAIL A sees what A owns: %', mine;
  end if;

  -- the ledger and the function's calls are out of a player's reach
  failed := false;
  begin perform count(*) from ops.purchases; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL players cannot read the ledger'; end if;
  failed := false;
  begin perform public.iap_record(h3, a, 'adFree', 'purchased', null, null, false); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL players cannot record purchases'; end if;
  failed := false;
  begin perform public.iap_refunded(array[h2]); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL players cannot mark refunds'; end if;

  reset role;

  -- ── player B: bought ad-free again (a new purchase) after A's was refunded? B owns nothing ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.my_purchases() <> '[]'::jsonb then raise exception 'FAIL B owns nothing'; end if;
  reset role;

  -- A buys ad-free again: owned again
  set local role service_role;
  r := public.iap_record(h3, a, 'adFree', 'purchased', 'GPA.3', now(), false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.my_purchases() -> 0 <> '{"product": "adFree", "state": "owned"}'::jsonb then raise exception 'FAIL bought again: owned'; end if;
  reset role;

  -- signed out: nothing
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  failed := false;
  begin perform public.my_purchases(); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL the public key cannot ask'; end if;
  reset role;

  -- the purchases go with the account
  delete from auth.users where id = a;
  if exists (select 1 from ops.purchases where user_id = a) then raise exception 'FAIL purchases deleted with the account'; end if;

  raise notice 'purchase rules: all checks passed';
end;
$test$;

rollback;
