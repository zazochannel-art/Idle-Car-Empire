-- The weekly alliance tournament (migration 0034), checked inside one transaction that is rolled
-- back: players A, B and C (made up here, never committed), A and B in one alliance, C in another.
-- Last week's stored points are written directly; this week's come from the members' cards.
-- Any failed check raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()
from (values
  ('a8000000-0000-4000-8000-00000000000a'::uuid), ('b8000000-0000-4000-8000-00000000000b'::uuid), ('c8000000-0000-4000-8000-00000000000c'::uuid)
) as u(id);

-- this week: A grew 60%, B 0%, C 100%
insert into public.empires (user_id, earned, week_start, week_base, company) values
  ('a8000000-0000-4000-8000-00000000000a', 16e6, (date_trunc('week', now()))::date, 10e6, 'A'),
  ('b8000000-0000-4000-8000-00000000000b', 1e6, (date_trunc('week', now()))::date, 1e6, 'B'),
  ('c8000000-0000-4000-8000-00000000000c', 4e7, (date_trunc('week', now()))::date, 1e7, 'C');

do $test$
declare
  a constant uuid := 'a8000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b8000000-0000-4000-8000-00000000000b';
  c constant uuid := 'c8000000-0000-4000-8000-00000000000c';
  wk date := (date_trunc('week', now()))::date;
  ab uuid;
  cc uuid;
  j jsonb;
  failed boolean;
begin
  -- A founds an alliance, B joins it; C founds another
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.create_alliance('Tourney Club', 'TQ', '🏎️') <> 'ok' then raise exception 'FAIL A founds'; end if;
  reset role;
  select m.alliance_id into ab from public.alliance_members m where m.user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.join_alliance(ab) <> 'ok' then raise exception 'FAIL B joins'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.create_alliance('Rival Club', 'RQ', '🐺') <> 'ok' then raise exception 'FAIL C founds'; end if;
  reset role;
  select m.alliance_id into cc from public.alliance_members m where m.user_id = c;

  -- they were all members before this week began; last week C's alliance won, A's came second
  update public.alliance_members set joined_at = wk - 10;
  insert into ops.alliance_weeks (alliance_id, week, points) values (cc, wk - 7, 300), (ab, wk - 7, 120);

  -- this week: the call stores the alliance's points and ranks it
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.alliance_tournament();
  if (j ->> 'rank')::int <> 1 then raise exception 'FAIL A''s alliance leads this week alone: %', j; end if;
  if (j -> 'top' -> 0 ->> 'mine')::boolean is not true then raise exception 'FAIL the top row is A''s alliance: %', j; end if;
  if (j ->> 'lastRank')::int <> 2 or (j ->> 'prize')::int <> 6 then raise exception 'FAIL second last week: 6 Stars due: %', j; end if;
  if public.claim_alliance_tournament() <> 6 then raise exception 'FAIL A takes 6 Stars'; end if;
  if public.claim_alliance_tournament() <> 0 then raise exception 'FAIL only once'; end if;
  if (public.alliance_tournament() ->> 'prize')::int <> 0 then raise exception 'FAIL the prize shows as taken'; end if;
  reset role;

  -- C's alliance stores more points this week, and takes the lead; C won last week: 10 Stars
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.alliance_tournament();
  if (j ->> 'rank')::int <> 1 or (j ->> 'prize')::int <> 10 then raise exception 'FAIL C leads and won last week: %', j; end if;
  if jsonb_array_length(j -> 'top') <> 2 then raise exception 'FAIL two alliances on the board: %', j; end if;
  reset role;

  -- a member who joined after last week ended gets no prize for it
  update public.alliance_members set joined_at = now() where user_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (public.alliance_tournament() ->> 'prize')::int <> 0 then raise exception 'FAIL a newcomer has no prize'; end if;
  if public.claim_alliance_tournament() <> 0 then raise exception 'FAIL a newcomer takes nothing'; end if;
  -- the stored weeks are out of the API's reach
  failed := false;
  begin
    perform 1 from ops.alliance_weeks;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL players read the stored weeks'; end if;
  reset role;

  -- signed out: nothing
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  failed := false;
  begin
    perform public.alliance_tournament();
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon reads the tournament'; end if;
  reset role;

  raise notice 'tournament rules: all checks passed';
end;
$test$;

rollback;
