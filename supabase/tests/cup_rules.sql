-- The weekly cup's times (migrations 0013 and 0027), inside one transaction that is rolled
-- back: a player with no ghost is held to the track's floor; with a ghost, to what that car laps.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at) values
  ('d1000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

do $test$
declare
  p constant uuid := 'd1000000-0000-4000-8000-00000000000d';
  wk integer := ops.cup_week();
  trk record;
  track_floor integer;
  car_floor integer;
  v text;
begin
  select * into trk from ops.cup_track(wk);
  track_floor := trk.laps * trk.ref_lap * 490;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- no card, no ghost: the track's floor only
  v := public.cup_submit(wk, track_floor - 1, 'sedan', '#ff0000');
  if v <> 'invalid' then raise exception 'FAIL under the track floor: %', v; end if;
  v := public.cup_submit(wk, track_floor + 1, 'sedan', '#ff0000');
  if v <> 'ok' then raise exception 'FAIL at the track floor with no ghost: %', v; end if;

  -- a card and a modest ghost (rating 300): a time only a far better car drives is refused
  perform public.save_game('{"createdAt": 5, "brand": {"name": "Delta"}, "lifetime": {"moneyEarned": 1000}}'::jsonb, 3, 0, 'pc');
  if not public.publish_ghost('{"model": "sedan", "color": "#ff0000", "stats": {"speed": 30, "accel": 30, "handling": 30, "braking": 30, "aero": 30, "reliability": 30, "hp": 200, "weight": 1200}}'::jsonb) then
    raise exception 'FAIL publish ghost';
  end if;
  reset role;
  car_floor := ops.cup_floor_ms(p, wk);
  if car_floor <= track_floor then raise exception 'FAIL the car floor (%) is above the track floor (%)', car_floor, track_floor; end if;
  if abs(ops.ghost_rating((select ghost from public.empires where user_id = p)) - 300) > 0.001 then raise exception 'FAIL ghost rating'; end if;
  set local role authenticated;
  v := public.cup_submit(wk, car_floor - 1, 'sedan', '#ff0000');
  if v <> 'invalid' then raise exception 'FAIL faster than the car: %', v; end if;
  -- what the car really laps (no luck): taken
  v := public.cup_submit(wk, (1000 * trk.ref_lap * 530 / 330.0 * (trk.laps + 0.04))::integer, 'sedan', '#ff0000');
  if v <> 'ok' then raise exception 'FAIL a time the car drives: %', v; end if;
  reset role;

  raise notice 'all cup checks passed';
end;
$test$;

rollback;
