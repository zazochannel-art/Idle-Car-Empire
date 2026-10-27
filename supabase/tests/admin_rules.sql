-- The dashboard's tools (migrations 0020 and 0021), checked inside one transaction that is rolled back: an
-- admin, a player P with a save in Nordheim and cloud backups, and another player Q (made up here,
-- never committed), each acting as the "authenticated" role with their own JWT. Any failed check
-- raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('ad02000d-0000-4000-8000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-test-0020@example.invalid', false, now(), now()),
  ('ad02000a-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'player-test-0020@example.invalid', false, now(), now()),
  ('ad02000b-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());
insert into ops.admins (user_id) values ('ad02000d-0000-4000-8000-0000000000ad');

-- P plays in Nordheim; the first city is parked in "cities"."home"
insert into public.game_saves (user_id, data, save_version, revision, device)
values ('ad02000a-0000-4000-8000-00000000000a', jsonb_build_object(
  'cash', 5000, 'stars', 12, 'imperiumCount', 1, 'createdAt', 1, 'lastActiveAt', 2, 'activeCity', 'north',
  'appVersion', '9.9.9 (999)', 'brand', jsonb_build_object('name', 'Zq Test Motors'),
  'lifetime', jsonb_build_object('moneyEarned', 2e9, 'carsProduced', 300),
  'racing', jsonb_build_object('unlocked', true),
  'city', jsonb_build_object('buildings', jsonb_build_object('n:1', jsonb_build_object('plant', '{}'::jsonb))),
  'cities', jsonb_build_object('home', jsonb_build_object('cash', 7e8, 'city', jsonb_build_object(
    'territories', '["mountain","port","raw","suburbs","boulevard","airport"]'::jsonb,
    'buildings', jsonb_build_object('a', jsonb_build_object('plant', '{}'::jsonb), 'b', jsonb_build_object('plant', '{}'::jsonb), 'c', '{}'::jsonb))))
), 9, 3, 'test');
select ops.keep_backup('ad02000a-0000-4000-8000-00000000000a', '{"cash": 1, "brand": {"name": "Zq Old"}}'::jsonb, 9, 2, 'test', 'auto');
select ops.keep_backup('ad02000b-0000-4000-8000-00000000000b', '{"cash": 2}'::jsonb, 9, 1, 'test', 'auto');

-- an error from two versions
insert into analytics.client_errors (day, kind, message, place, version, platform, times, first_at, last_at) values
  (current_date - 2, 'error', 'zq test 0020 boom', 'test.ts:1', '9.9.1', 'web', 3, now() - interval '2 days', now() - interval '2 days'),
  (current_date, 'error', 'zq test 0020 boom', 'test.ts:1', '9.9.2', 'web', 2, now() - interval '1 hour', now() - interval '1 hour');

do $test$
declare
  adm constant uuid := 'ad02000d-0000-4000-8000-0000000000ad';
  p constant uuid := 'ad02000a-0000-4000-8000-00000000000a';
  q constant uuid := 'ad02000b-0000-4000-8000-00000000000b';
  k constant text := ops.error_group('error', 'zq test 0020 boom', 'test.ts:1');
  j jsonb;
  r text;
  n int;
  failed boolean;
  backup_p bigint := (select b.id from ops.save_backups b where b.user_id = 'ad02000a-0000-4000-8000-00000000000a');
  backup_q bigint := (select b.id from ops.save_backups b where b.user_id = 'ad02000b-0000-4000-8000-00000000000b');
  stmt text;
begin
  -- ── a player is no admin: every admin function refuses them ──
  perform set_config('request.jwt.claims', json_build_object('sub', q, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach stmt in array array[
    'select public.admin_overview()', 'select public.admin_progress(0)', 'select public.admin_social()',
    'select public.admin_error_list(null)', format('select public.admin_error_resolve(%L, true)', k),
    'select public.admin_find_players(''zq'')', format('select public.admin_player(%L)', p),
    format('select public.admin_set_banned(%L, true)', p), format('select public.admin_set_name(%L, ''Zq Hacker'')', p),
    'select public.admin_log_list(null)', format('select public.admin_send_command(%L, ''cash'', ''{"mode":"add","amount":1}'', null)', q),
    'select public.admin_cancel_command(1)', 'select public.admin_announcements()',
    'select public.admin_post_announcement(''x'', ''{"en":{"title":"x"}}'', now(), 1)', 'select public.admin_cancel_announcement(1)'
  ] loop
    failed := false;
    begin
      execute stmt;
    exception when insufficient_privilege then failed := true;
    end;
    if not failed then raise exception 'FAIL a player ran: %', stmt; end if;
  end loop;
  -- nor read the tables
  failed := false;
  begin
    perform 1 from ops.player_commands;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL a player read ops.player_commands'; end if;
  reset role;

  -- a guest without a session can't claim commands
  set local role anon;
  failed := false;
  begin
    perform * from public.claim_my_commands(array['cash']);
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon claimed commands'; end if;
  reset role;

  -- ── the admin ──
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  j := public.admin_overview();
  if not (j ? 'new7dPrev' and j ? 'played7d' and j ? 'played7dPrev' and j ? 'errors7d' and j ? 'starts7dPrev') or (j ->> 'nordheim')::int < 1 then
    raise exception 'FAIL overview: %', j;
  end if;

  j := public.admin_progress(0);
  if (j ->> 'players')::int < 1 or (j ->> 'north')::int < 1 or (j ->> 'inNorth')::int < 1 or (j -> 'territories' ->> 6)::int < 1 then
    raise exception 'FAIL progress counts: %', j;
  end if;
  if not exists (select 1 from jsonb_array_elements(j -> 'versions') v where v ->> 'version' = '9.9.9 (999)') then
    raise exception 'FAIL progress versions: %', j -> 'versions';
  end if;

  j := public.admin_social();
  if not (j ? 'invites' and j ? 'cup' and j ? 'gifts' and j ? 'push') then raise exception 'FAIL social: %', j; end if;

  -- errors: all versions, one version, the first version
  j := (select e from jsonb_array_elements(public.admin_error_list(null) -> 'errors') e where e ->> 'key' = k);
  if j is null or (j ->> 'times')::int <> 5 or j ->> 'first_version' <> '9.9.1' or j ->> 'resolved_at' is not null then
    raise exception 'FAIL error list: %', j;
  end if;
  j := (select e from jsonb_array_elements(public.admin_error_list('9.9.2') -> 'errors') e where e ->> 'key' = k);
  if j is null or (j ->> 'times')::int <> 2 then raise exception 'FAIL error list by version: %', j; end if;
  if not (public.admin_error_list(null) -> 'versions') ? '9.9.2' then raise exception 'FAIL error versions'; end if;
  -- marked fixed: not back while only the old versions send it
  if public.admin_error_resolve(k, true) <> 'ok' then raise exception 'FAIL resolve'; end if;
  j := (select e from jsonb_array_elements(public.admin_error_list(null) -> 'errors') e where e ->> 'key' = k);
  if j ->> 'resolved_at' is null or (j ->> 'back')::boolean then raise exception 'FAIL resolved: %', j; end if;
  if public.admin_error_resolve('nothex', true) <> 'invalid' then raise exception 'FAIL resolve bad key'; end if;
  reset role;
  insert into analytics.client_errors (day, kind, message, place, version, platform, times, first_at, last_at)
  values (current_date, 'error', 'zq test 0020 boom', 'test.ts:1', '9.9.3', 'web', 1, now() + interval '1 second', now() + interval '1 second');
  set local role authenticated;
  j := (select e from jsonb_array_elements(public.admin_error_list(null) -> 'errors') e where e ->> 'key' = k);
  if not (j ->> 'back')::boolean then raise exception 'FAIL back from a new version: %', j; end if;
  if public.admin_error_resolve(k, false) <> 'ok' or public.admin_error_resolve(k, false) <> 'unknown' then raise exception 'FAIL reopen'; end if;

  -- players: found by company, email, id; the literal text, not a pattern
  if not exists (select 1 from jsonb_array_elements(public.admin_find_players('zq test motors')) x where (x ->> 'id')::uuid = p) then raise exception 'FAIL find by company'; end if;
  if not exists (select 1 from jsonb_array_elements(public.admin_find_players('player-test-0020')) x where (x ->> 'id')::uuid = p) then raise exception 'FAIL find by email'; end if;
  if jsonb_array_length(public.admin_find_players(p::text)) <> 1 then raise exception 'FAIL find by id'; end if;
  if jsonb_array_length(public.admin_find_players('z')) <> 0 then raise exception 'FAIL one letter searches nothing'; end if;
  if exists (select 1 from jsonb_array_elements(public.admin_find_players('zq%motors')) x where (x ->> 'id')::uuid = p) then raise exception 'FAIL a percent sign taken as a wildcard'; end if;

  j := public.admin_player(p);
  if j -> 'save' ->> 'company' <> 'Zq Test Motors' or j -> 'save' ->> 'activeCity' <> 'north'
     or (j -> 'save' -> 'cash' ->> 'home')::numeric <> 7e8 or (j -> 'save' -> 'cash' ->> 'north')::numeric <> 5000
     or (j -> 'save' -> 'plants' ->> 'home')::int <> 2 or (j -> 'save' ->> 'territories')::int <> 6
     or jsonb_array_length(j -> 'backups') <> 1 or j ->> 'email' <> 'player-test-0020@example.invalid'
     or (j -> 'save' ->> 'rep')::numeric <> 50 or (j -> 'save' ->> 'racingRep')::numeric <> 0 then
    raise exception 'FAIL player card: %', j;
  end if;
  if public.admin_player('00000000-0000-4000-8000-000000000000') is not null then raise exception 'FAIL card of nobody'; end if;

  -- names
  if public.admin_set_name(p, 'x') <> 'invalid' then raise exception 'FAIL short name'; end if;
  if public.admin_set_name(p, 'Sh1t Motors') <> 'blocked' then raise exception 'FAIL rude name'; end if;
  if public.admin_set_name(p, 'Zq Renamed 0020') <> 'ok' or (select username from public.profiles where id = p) <> 'Zq Renamed 0020' then raise exception 'FAIL rename'; end if;
  if public.admin_set_name('00000000-0000-4000-8000-000000000000', 'Zq Nobody') <> 'unknown' then raise exception 'FAIL rename nobody'; end if;

  -- off the boards, and back
  if public.admin_set_banned(p, true) <> 'ok' then raise exception 'FAIL ban'; end if;
  if not (select banned and not listed from public.profiles where id = p) then raise exception 'FAIL banned profile'; end if;
  if public.admin_set_banned(p, false) <> 'ok' or (select banned from public.profiles where id = p) then raise exception 'FAIL unban'; end if;

  -- commands: checked before they are queued
  if public.admin_send_command(p, 'cash', '{"mode": "add", "amount": 1000000}', 'Compensation') <> 'ok' then raise exception 'FAIL cash add'; end if;
  if public.admin_send_command(p, 'cash', '{"mode": "set", "amount": -1}', null) <> 'invalid' then raise exception 'FAIL negative set'; end if;
  if public.admin_send_command(p, 'cash', '{"mode": "add"}', null) <> 'invalid' then raise exception 'FAIL no amount'; end if;
  if public.admin_send_command(p, 'cash', '{"mode": "add", "amount": 5, "city": "mars"}', null) <> 'invalid' then raise exception 'FAIL bad city'; end if;
  if public.admin_send_command(p, 'stars', '{"mode": "add", "amount": 1.5}', null) <> 'invalid' then raise exception 'FAIL half a star'; end if;
  if public.admin_send_command(p, 'stars', '{"mode": "set", "amount": 40}', null) <> 'ok' then raise exception 'FAIL stars set'; end if;
  if public.admin_send_command(p, 'company', '{"name": "Sh1t Motors"}', null) <> 'blocked' then raise exception 'FAIL rude company'; end if;
  if public.admin_send_command(p, 'company', '{"name": "Zq Fine Cars"}', null) <> 'ok' then raise exception 'FAIL company'; end if;
  if public.admin_send_command(p, 'restore', jsonb_build_object('backup', backup_q), null) <> 'invalid' then raise exception 'FAIL another player''s backup'; end if;
  if public.admin_send_command(p, 'restore', jsonb_build_object('backup', backup_p), 'Your game from yesterday') <> 'ok' then raise exception 'FAIL restore'; end if;
  if public.admin_send_command(p, 'message', '{}', null) <> 'invalid' then raise exception 'FAIL empty message'; end if;
  if public.admin_send_command(p, 'message', '{}', 'Hello from the team') <> 'ok' then raise exception 'FAIL message'; end if;
  if public.admin_send_command(p, 'teleport', '{}', 'x') <> 'invalid' then raise exception 'FAIL unknown kind'; end if;
  -- reputation (0021): the company's within 0–100, the racing team's in whole points
  if public.admin_send_command(p, 'rep', '{"which": "company", "mode": "set", "amount": 120}', null) <> 'invalid' then raise exception 'FAIL company reputation over 100'; end if;
  if public.admin_send_command(p, 'rep', '{"which": "racing", "mode": "add", "amount": 1.5}', null) <> 'invalid' then raise exception 'FAIL half a racing point'; end if;
  if public.admin_send_command(p, 'rep', '{"which": "fame", "mode": "add", "amount": 5}', null) <> 'invalid' then raise exception 'FAIL unknown reputation'; end if;
  if public.admin_send_command(p, 'rep', '{"mode": "add", "amount": 5}', null) <> 'invalid' then raise exception 'FAIL reputation without which'; end if;
  if public.admin_send_command(p, 'rep', '{"which": "company", "mode": "set", "amount": 80}', 'Sorry for the recall') <> 'ok' then raise exception 'FAIL company reputation'; end if;
  if public.admin_send_command(p, 'rep', '{"which": "racing", "mode": "add", "amount": 500}', null) <> 'ok' then raise exception 'FAIL racing reputation'; end if;
  if public.admin_send_command('00000000-0000-4000-8000-000000000000', 'message', '{}', 'x') <> 'unknown' then raise exception 'FAIL nobody'; end if;
  reset role;
  n := (select max(id) from ops.player_commands where user_id = p and kind = 'message');
  set local role authenticated;
  if public.admin_cancel_command(n) <> 'ok' or public.admin_cancel_command(n) <> 'unknown' then raise exception 'FAIL cancel command'; end if;

  -- announcements
  if public.admin_post_announcement('📣', '{"ro": {"title": "Zq salut", "body": "Text"}, "en": {"title": "Zq hello"}}', now(), 2) <> 'ok' then raise exception 'FAIL announce'; end if;
  if public.admin_post_announcement('📣', '{"xx": {"title": "Hi"}}', now(), 2) <> 'invalid' then raise exception 'FAIL announce language'; end if;
  if public.admin_post_announcement('📣', '{"en": {"title": ""}}', now(), 2) <> 'invalid' then raise exception 'FAIL announce empty'; end if;
  if public.admin_post_announcement('📣', '{"en": {"title": "Hi"}}', now(), 0.5) <> 'invalid' then raise exception 'FAIL announce length'; end if;
  reset role;

  -- ── Q's game gets none of P's commands ──
  perform set_config('request.jwt.claims', json_build_object('sub', q, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.claim_my_commands(array['cash', 'stars', 'company', 'restore', 'message'])) <> 0 then raise exception 'FAIL Q took P''s commands'; end if;
  reset role;

  -- ── P's game takes its commands, once, only the kinds it knows ──
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.claim_my_commands(array['cash', 'stars'])) <> 2 then raise exception 'FAIL claim cash and stars'; end if;
  if (select count(*) from public.claim_my_commands(array['cash', 'stars'])) <> 0 then raise exception 'FAIL claimed twice'; end if;
  if (select string_agg(c.kind, ',' order by c.id) from public.claim_my_commands(array['company', 'restore', 'message']) c) <> 'company,restore' then raise exception 'FAIL claim the rest (the message was cancelled)'; end if;
  if (select string_agg(c.payload ->> 'which', ',' order by c.id) from public.claim_my_commands(array['rep']) c) <> 'company,racing' then raise exception 'FAIL claim the reputation'; end if;
  reset role;

  -- every game reads the running announcements, without an account
  set local role anon;
  if not exists (select 1 from public.live_announcements() a where a.texts -> 'ro' ->> 'title' = 'Zq salut') then raise exception 'FAIL live announcements'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := (select (a ->> 'id')::bigint from jsonb_array_elements(public.admin_announcements()) a where a -> 'texts' -> 'ro' ->> 'title' = 'Zq salut');
  if public.admin_cancel_announcement(n) <> 'ok' then raise exception 'FAIL cancel announcement'; end if;
  reset role;
  set local role anon;
  if exists (select 1 from public.live_announcements() a where a.id = n) then raise exception 'FAIL cancelled announcement still shown'; end if;
  reset role;

  -- ── the log ──
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_log_list(p);
  for r in select unnest(array['player.name', 'player.ban', 'player.unban', 'command.cash', 'command.stars', 'command.rep', 'command.company', 'command.restore', 'command.cancel']) loop
    if not exists (select 1 from jsonb_array_elements(j) e where e ->> 'action' = r and e ->> 'admin' = 'admin-test-0020@example.invalid') then
      raise exception 'FAIL log has no %: %', r, j;
    end if;
  end loop;
  j := public.admin_log_list(null);
  if not exists (select 1 from jsonb_array_elements(j) e where e ->> 'action' = 'news.schedule')
     or not exists (select 1 from jsonb_array_elements(j) e where e ->> 'action' = 'news.cancel')
     or not exists (select 1 from jsonb_array_elements(j) e where e ->> 'action' = 'error.resolve') then
    raise exception 'FAIL log of the schedule and errors';
  end if;
  reset role;

  raise notice 'admin_rules: all checks passed';
end;
$test$;

rollback;
