-- The weekly cup's lowest time, per player (audit P1): until now any time above the track's
-- floor was taken, the one the best car possible could drive. Now a player's time is also held
-- to their own best car: the ghost the game publishes (0005, public.empires.ghost) carries its
-- stats, and the cup's laps are worked out from the same rating (src/game/engine/cup.ts cupLaps:
-- the reference lap scaled by (500 + 30) / (rating + 30), the first lap 4% slower). A time more
-- than 15% under what that car laps is refused ('invalid'); the margin is far beyond the luck in
-- the laps (about 1%) and covers a car improved since the ghost was last sent. A player with no
-- ghost yet keeps the track's floor. The game sends its ghost just before each time (game-store
-- sendCup), so the board checks against the car that raced.
--
-- Ties: equal times keep the order they were first driven in (improved_at), as before.

/** The circuit rating of a published ghost (src/game/engine/racing.ts rating, RACE_WEIGHTS.circuit), 0-1000; null: no ghost. */
create or replace function ops.ghost_rating(p_ghost jsonb) returns double precision
language sql immutable set search_path = ''
as $$
  select case when p_ghost is null or jsonb_typeof(p_ghost->'stats') <> 'object' then null else
    10 * (0.25 * coalesce((p_ghost->'stats'->>'speed')::double precision, 0)
        + 0.2 * coalesce((p_ghost->'stats'->>'accel')::double precision, 0)
        + 0.3 * coalesce((p_ghost->'stats'->>'handling')::double precision, 0)
        + 0.15 * coalesce((p_ghost->'stats'->>'braking')::double precision, 0)
        + 0.1 * coalesce((p_ghost->'stats'->>'aero')::double precision, 0)) end
$$;
revoke all on function ops.ghost_rating(jsonb) from public, anon, authenticated;

/** The fastest time (ms) a player's car may send on a week's track: 15% under its expected laps, never under the track's floor. */
create or replace function ops.cup_floor_ms(p_user uuid, p_week integer) returns integer
language sql stable security definer set search_path = ''
as $$
  select greatest(
    t.laps * t.ref_lap * 490,
    coalesce(floor(0.85 * 1000 * t.ref_lap * (500 + 30) / (r.rating + 30) * (t.laps + 0.04))::integer, 0))
  from ops.cup_track(p_week) t
  left join lateral (select ops.ghost_rating(e.ghost) as rating from public.empires e where e.user_id = p_user) r on true
$$;
revoke all on function ops.cup_floor_ms(uuid, integer) from public, anon, authenticated;

create or replace function public.cup_submit(p_week integer, p_ms integer, p_car text, p_color text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wk integer := ops.cup_week();
  today date := (now() at time zone 'utc')::date;
  trk record;
  e record;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_week is distinct from wk then
    return 'closed';
  end if;
  select * into trk from ops.cup_track(wk);
  -- faster than the player's own best car could lap (or than any car), 20 times slower, or not a car
  if p_ms is null or p_ms < ops.cup_floor_ms(uid, wk) or p_ms > trk.laps * trk.ref_lap * 20000
    or coalesce(p_car, '') !~ '^[a-zA-Z]{1,16}$' or coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    return 'invalid';
  end if;
  insert into ops.cup_entries (week, user_id, best_ms, car, color) values (wk, uid, p_ms, p_car, p_color)
  on conflict (week, user_id) do nothing;
  if found then
    return 'ok';
  end if;
  select c.sent_day, c.sent_today into e from ops.cup_entries c where c.week = wk and c.user_id = uid for update;
  if e.sent_day = today and e.sent_today >= ops.cup_sends_max() then
    return 'limit';
  end if;
  update ops.cup_entries c set
    car = case when p_ms < c.best_ms then p_car else c.car end,
    color = case when p_ms < c.best_ms then p_color else c.color end,
    improved_at = case when p_ms < c.best_ms then now() else c.improved_at end,
    best_ms = least(c.best_ms, p_ms),
    sent_today = case when c.sent_day = today then c.sent_today + 1 else 1 end,
    sent_day = today
  where c.week = wk and c.user_id = uid;
  return 'ok';
end;
$$;
revoke all on function public.cup_submit(integer, integer, text, text) from public, anon;
grant execute on function public.cup_submit(integer, integer, text, text) to authenticated;
