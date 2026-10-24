-- Ghosts and alliances (migration 0005), checked inside one transaction that
-- is rolled back: players A, B and C (made up here, never committed), each
-- acting as the "authenticated" role with their own JWT. Any failed check
-- raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()
from (values
  ('a7000000-0000-4000-8000-00000000000a'::uuid), ('b7000000-0000-4000-8000-00000000000b'::uuid), ('c7000000-0000-4000-8000-00000000000c'::uuid)
) as u(id);

-- their cards this week: A grew 60%, B $500K from nothing (counted from $1M: 50%), C 300% (counted as 100)
insert into public.empires (user_id, earned, week_start, week_base, company) values
  ('a7000000-0000-4000-8000-00000000000a', 16e6, (date_trunc('week', now()))::date, 10e6, 'A'),
  ('b7000000-0000-4000-8000-00000000000b', 5e5, (date_trunc('week', now()))::date, 0, 'B'),
  ('c7000000-0000-4000-8000-00000000000c', 4e7, (date_trunc('week', now()))::date, 1e7, 'C');

do $test$
declare
  a constant uuid := 'a7000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b7000000-0000-4000-8000-00000000000b';
  c constant uuid := 'c7000000-0000-4000-8000-00000000000c';
  wk date := (date_trunc('week', now()))::date;
  v text;
  j jsonb;
  n int;
  aid uuid;
  failed boolean;
  res record;
begin
  -- ── ghosts: published cleaned, shown on the card ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.publish_ghost('{"model": "sports", "color": "#ff0000", "accent": "bad", "stats": {"speed": 900, "accel": 50, "handling": "x", "braking": 40, "aero": 30, "reliability": 70, "hp": 1e9, "weight": 1}, "extra": "dropped"}'::jsonb) then
    raise exception 'FAIL A publishes a ghost';
  end if;
  failed := false;
  begin
    perform public.publish_ghost('{"model": "<script>"}'::jsonb);
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'FAIL an invalid model is refused'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select * into res from public.visit_empire(a);
  j := res.card->'ghost';
  if j->>'model' <> 'sports' or (j->'stats'->>'speed')::numeric <> 100 or (j->'stats'->>'handling')::numeric <> 0 or (j->'stats'->>'hp')::numeric <> 5000
     or (j->'stats'->>'weight')::numeric <> 300 or j->>'accent' <> '#111827' or j ? 'extra' then
    raise exception 'FAIL B sees A''s ghost, cleaned: %', j;
  end if;

  -- ── founding, names and tags ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  v := public.create_alliance('  Turbo Club ', 'tc', '🏎️');
  if v <> 'ok' then raise exception 'FAIL A founds an alliance: %', v; end if;
  if public.create_alliance('Other', 'OT', '🚗') <> 'member' then raise exception 'FAIL one alliance at a time'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if public.create_alliance('turbo club', 'XX', '🚗') <> 'name' then raise exception 'FAIL name taken (any case)'; end if;
  if public.create_alliance('Speed', 'tc', '🚗') <> 'tag' then raise exception 'FAIL tag taken'; end if;
  if public.create_alliance('ab', 'T1', '🚗') <> 'invalid' then raise exception 'FAIL short name'; end if;
  if public.create_alliance('Speed', 'TOOLONG', '🚗') <> 'invalid' then raise exception 'FAIL bad tag'; end if;

  -- ── finding and joining ──
  select l.id into aid from public.list_alliances('turbo') l;
  if aid is null then raise exception 'FAIL search by name'; end if;
  select count(*) into n from public.list_alliances('TC') l where l.id = aid;
  if n <> 1 then raise exception 'FAIL search by tag'; end if;
  if public.join_alliance(aid) <> 'ok' then raise exception 'FAIL B joins'; end if;
  if public.join_alliance(aid) <> 'member' then raise exception 'FAIL B joins twice'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  if public.join_alliance('d0000000-0000-4000-8000-00000000000d') <> 'unknown' then raise exception 'FAIL join nothing'; end if;
  if public.join_alliance(aid) <> 'ok' then raise exception 'FAIL C joins'; end if;

  -- ── the week's points: A 60 + B 50 + C 100 ──
  j := public.my_alliance();
  if (j->>'points')::numeric <> 210 or jsonb_array_length(j->'members') <> 3 or j->>'tag' <> 'TC' or j->>'name' <> 'Turbo Club' or (j->>'leader')::boolean then
    raise exception 'FAIL C sees the alliance: %', j;
  end if;
  if (j->'members'->0->>'points')::numeric <> 100 then raise exception 'FAIL members by points: %', j->'members'; end if;
  select l.points, l.members, l.mine into res from public.list_alliances(null) l where l.id = aid;
  if res.points <> 210 or res.members <> 3 or not res.mine then raise exception 'FAIL list: %', res; end if;

  -- ── rewards: a member for a day, once per tier and week, only when reached ──
  if public.claim_alliance_tier(1) <> 'new' then raise exception 'FAIL a new member can''t claim'; end if;
  reset role;
  update public.alliance_members set joined_at = now() - interval '2 days' where alliance_id = aid;
  set local role authenticated;
  if public.claim_alliance_tier(1) <> 'ok' then raise exception 'FAIL tier 1'; end if;
  if public.claim_alliance_tier(1) <> 'claimed' then raise exception 'FAIL tier 1 twice'; end if;
  if public.claim_alliance_tier(2) <> 'short' then raise exception 'FAIL tier 2 not reached'; end if;
  if public.claim_alliance_tier(4) <> 'invalid' then raise exception 'FAIL tier 4'; end if;
  if public.my_alliance()->'claimed' <> '[1]'::jsonb then raise exception 'FAIL claimed list'; end if;

  -- ── the leader removes a member; others can't ──
  if public.kick_member(b) <> 'leader' then raise exception 'FAIL C kicks B'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if public.kick_member(c) <> 'ok' then raise exception 'FAIL A kicks C'; end if;
  if public.kick_member(c) <> 'unknown' then raise exception 'FAIL C kicked twice'; end if;

  -- C, now in no alliance, joins again: a new member, and can't take tier 1 a second time this week anyway
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  if public.my_alliance() is not null then raise exception 'FAIL C is out'; end if;
  if public.join_alliance(aid) <> 'ok' then raise exception 'FAIL C joins again'; end if;
  if public.claim_alliance_tier(1) <> 'new' then raise exception 'FAIL a returning member is new again'; end if;
  reset role;
  update public.alliance_members set joined_at = now() - interval '2 days' where user_id = c;
  set local role authenticated;
  if public.claim_alliance_tier(1) <> 'claimed' then raise exception 'FAIL tier 1 a second time in a week'; end if;

  -- ── the leader leaves: the longest-standing member leads; the last one closes it ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if public.leave_alliance() <> 'ok' then raise exception 'FAIL A leaves'; end if;
  if public.leave_alliance() <> 'none' then raise exception 'FAIL A leaves twice'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if not (public.my_alliance()->>'leader')::boolean then raise exception 'FAIL B leads after A'; end if;
  perform public.leave_alliance();
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.leave_alliance();
  select count(*) into n from public.list_alliances('turbo') l;
  if n <> 0 then raise exception 'FAIL an empty alliance is closed'; end if;

  -- ── the tables stay closed; signed out: nothing ──
  failed := false;
  begin
    perform 1 from public.alliance_members;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL members table readable'; end if;
  failed := false;
  begin
    insert into public.alliance_claims (user_id, week, tier) values (c, wk, 3);
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL claims table writable'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  failed := false;
  begin
    perform public.list_alliances(null);
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon lists alliances'; end if;
  reset role;

  raise notice 'all alliance checks passed';
end;
$test$;

rollback;
