-- The leaderboard, visits and gifts (migration 0004), checked inside one
-- transaction that is rolled back: players A, B and five more (made up here,
-- never committed), each acting as the "authenticated" role with their own
-- JWT. Inside one transaction now() doesn't move, so no time passes between
-- saves: the plausibility limit is at its tightest. Any failed check raises
-- an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()
from (values
  ('a0000000-0000-4000-8000-00000000000a'::uuid), ('b0000000-0000-4000-8000-00000000000b'::uuid),
  ('c1000000-0000-4000-8000-00000000000c'::uuid), ('c2000000-0000-4000-8000-00000000000c'::uuid),
  ('c3000000-0000-4000-8000-00000000000c'::uuid), ('c4000000-0000-4000-8000-00000000000c'::uuid),
  ('c5000000-0000-4000-8000-00000000000c'::uuid), ('e9000000-0000-4000-8000-00000000000e'::uuid)
) as u(id)
union all
-- 21 senders for the daily cap on gifts received
select md5('gift-sender-' || g)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()
from generate_series(1, 21) g;

-- five more players with a card each (gift targets), made directly by the owner
-- (ids differing in their first characters: a new player's default name is built from them)
insert into public.empires (user_id, earned, company)
select id, 1000, 'C' from auth.users where id::text like 'c_000000-0000-4000-8000-00000000000c' or id = 'e9000000-0000-4000-8000-00000000000e';

do $test$
declare
  a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  res record;
  n int;
  v text;
  failed boolean;
  alpha constant jsonb := '{"createdAt": 1, "stars": 2, "brand": {"name": "Alpha Motors"},
    "lifetime": {"moneyEarned": 5000000, "carsProduced": 100},
    "city": {"zones": ["town", "industrial"], "buildings": {
      "p1": {"type": "bodyWorks", "level": 3, "plant": {}},
      "p2": {"type": "engineFactory", "level": 99, "plant": {"secret": 1}},
      "p3": {"type": "garage", "level": 2}}},
    "racing": {"rep": 120, "stats": {"races": 4, "wins": 1}}}';
begin
  -- ── A saves: the card is published, levels and the first total are bounded ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into res from public.save_game(alpha, 3, 0, 'pc');
  if not res.ok then raise exception 'FAIL A first save'; end if;

  -- a hand-edited jump in the same moment is held to the limit
  select * into res from public.save_game(alpha || '{"lifetime": {"moneyEarned": 1e15, "carsProduced": 1e12}}'::jsonb, 3, 1, 'pc');
  if not res.ok then raise exception 'FAIL A second save'; end if;

  -- ── B saves ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select * into res from public.save_game('{"createdAt": 2, "brand": {"name": "Beta"}, "lifetime": {"moneyEarned": 1000000}}'::jsonb, 3, 0, 'pc');
  if not res.ok then raise exception 'FAIL B first save'; end if;

  -- the board: A first, then B; B's row is marked as theirs; no save data in it
  select count(*) into n from public.leaderboard('all') l where l.user_id in (a, b);
  if n <> 2 then raise exception 'FAIL board lists A and B (%)', n; end if;
  select * into res from public.leaderboard('all') l where l.user_id = a;
  if res.value > 6000001 or res.value < 5000000 or res.company <> 'Alpha Motors' or res.me then
    raise exception 'FAIL A on the board, with the edited jump held back: %', res;
  end if;
  select * into res from public.leaderboard('all') l where l.user_id = b;
  if not res.me or res.value <> 1000000 then raise exception 'FAIL B is marked as the caller: %', res; end if;
  select count(*) into n from public.leaderboard('week') l where l.user_id = a and l.value >= 0;
  if n <> 1 then raise exception 'FAIL weekly board'; end if;

  -- B visits A: the card only (plants clamped, non-plants left out)
  select * into res from public.visit_empire(a);
  if res.user_id is distinct from a or res.company <> 'Alpha Motors' or res.cars > 1100 then
    raise exception 'FAIL visit A: %', res;
  end if;
  if jsonb_array_length(res.card->'plants') <> 2 or (res.card->'plants'->1->>'level')::int <> 15 or res.card->'plants'->0 ? 'plant'
     or (res.card->>'zones')::int <> 2 or (res.card->>'wins')::int <> 1 then
    raise exception 'FAIL visit card: %', res.card;
  end if;
  select count(*) into n from public.visit_empire('d0000000-0000-4000-8000-00000000000d');
  if n <> 0 then raise exception 'FAIL visit of nobody'; end if;

  -- the tables themselves stay closed
  failed := false;
  begin
    perform 1 from public.empires;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL empires table readable'; end if;
  failed := false;
  begin
    insert into public.gifts (from_user, to_user) values (b, a);
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL gifts table writable'; end if;
  update public.profiles set listed = false where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B unlisted A'; end if;

  -- ── gifts ──
  v := public.send_gift(a);
  if v <> 'sent' then raise exception 'FAIL gift to A: %', v; end if;
  v := public.send_gift(a);
  if v <> 'already' then raise exception 'FAIL second gift to A the same day: %', v; end if;
  v := public.send_gift(b);
  if v <> 'self' then raise exception 'FAIL gift to oneself: %', v; end if;
  v := public.send_gift('d0000000-0000-4000-8000-00000000000d');
  if v <> 'unknown' then raise exception 'FAIL gift to nobody: %', v; end if;
  perform public.send_gift('c1000000-0000-4000-8000-00000000000c');
  perform public.send_gift('c2000000-0000-4000-8000-00000000000c');
  perform public.send_gift('c3000000-0000-4000-8000-00000000000c');
  perform public.send_gift('c4000000-0000-4000-8000-00000000000c');
  if public.gifts_sent_today() <> 5 then raise exception 'FAIL gifts counted'; end if;
  v := public.send_gift('c5000000-0000-4000-8000-00000000000c');
  if v <> 'limit' then raise exception 'FAIL daily gift limit: %', v; end if;

  -- A collects the gift once
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if public.claim_gifts() <> 1 then raise exception 'FAIL A claims one gift'; end if;
  if public.claim_gifts() <> 0 then raise exception 'FAIL a gift claimed twice'; end if;

  -- ── A leaves the board: not listed, not visitable, can't be gifted; still sees their own rank ──
  update public.profiles set listed = false where id = a;
  select count(*) into n from public.leaderboard('all') l where l.user_id = a and l.me;
  if n <> 1 then raise exception 'FAIL unlisted A still sees their own rank'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.leaderboard('all') l where l.user_id = a;
  if n <> 0 then raise exception 'FAIL unlisted A on B''s board'; end if;
  select count(*) into n from public.visit_empire(a);
  if n <> 0 then raise exception 'FAIL unlisted A visitable'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  v := public.send_gift(a);
  if v <> 'unknown' then raise exception 'FAIL gift to unlisted A: %', v; end if;

  -- ── signed out: nothing ──
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  failed := false;
  begin
    perform public.leaderboard('all');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon board'; end if;

  -- ── a new week: the weekly score counts from the total at its start ──
  reset role;
  update public.empires set week_start = week_start - 7, week_base = 0 where user_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into res from public.save_game('{"createdAt": 2, "lifetime": {"moneyEarned": 1500000}}'::jsonb, 3, 1, 'pc');
  if not res.ok then raise exception 'FAIL B save in a new week'; end if;
  select * into res from public.leaderboard('week') l where l.user_id = b;
  if res.value <> 500000 then raise exception 'FAIL weekly score from the week''s start: %', res; end if;

  -- a deleted save takes its card with it
  delete from public.game_saves where user_id = b;
  reset role;
  if exists (select 1 from public.empires where user_id = b) then raise exception 'FAIL card left after the save was deleted'; end if;

  -- a player receives at most 20 gifts a day: spare accounts can't feed one player without end
  for n in 1..21 loop
    perform set_config('request.jwt.claims', json_build_object('sub', md5('gift-sender-' || n)::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v := public.send_gift('e9000000-0000-4000-8000-00000000000e');
    reset role;
    if n <= 20 and v <> 'sent' then raise exception 'FAIL gift % to a player: %', n, v; end if;
    if n = 21 and v <> 'full' then raise exception 'FAIL the 21st gift of the day to one player: %', v; end if;
  end loop;

  raise notice 'all social checks passed';
end;
$test$;

rollback;
