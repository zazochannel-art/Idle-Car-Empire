-- The weekly cup: one track a week (Monday 00:00 UTC to the next), the same for every player,
-- raced against the clock in the game (src/game/engine/cup.ts, three timed runs a day). The
-- server keeps each player's best time of the week and shows the board; once the week is over,
-- it hands each player their place once, and the game pays the prize.
--
-- The entries are in the ops schema, which the API does not expose: a player reaches them only
-- through cup_submit, cup_board and claim_cup_prizes. The board shows listed players (and the
-- player themselves), like the leaderboard. Times come from the player's game, as every score
-- on the boards does; the server refuses a time faster than the best car could drive.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.cup_entries (
  week integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  best_ms integer not null check (best_ms > 0),
  car text not null check (car ~ '^[a-zA-Z]{1,16}$'),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- times sent on the day one was last sent (a few a day)
  sent_day date not null default (now() at time zone 'utc')::date,
  sent_today smallint not null default 1,
  improved_at timestamptz not null default now(),
  -- when the player took their place's prize (after the week)
  claimed_at timestamptz,
  primary key (week, user_id)
);
create index if not exists cup_entries_board on ops.cup_entries (week, best_ms, improved_at);
create index if not exists cup_entries_unclaimed on ops.cup_entries (user_id) where claimed_at is null;
alter table ops.cup_entries enable row level security;
revoke all on ops.cup_entries from public, anon, authenticated;

/** This week's number: weeks start on Monday 00:00 UTC, as in the game (1970-01-05 began week 1). */
create or replace function ops.cup_week() returns integer
language sql stable set search_path = ''
as $$ select floor((floor(extract(epoch from now()) / 86400) + 3) / 7)::integer $$;
revoke all on function ops.cup_week() from public, anon, authenticated;

/** A week's track: the game's TRACKS (src/game/config/racing.ts) in turn: id, laps, reference lap in seconds. */
create or replace function ops.cup_track(p_week integer) returns table (id text, laps integer, ref_lap integer)
language sql immutable set search_path = ''
as $$
  select t.id, t.laps, t.ref_lap
  from (values
    (0, 'small', 3, 62),
    (1, 'industrial', 3, 70),
    (2, 'mountain', 3, 84),
    (3, 'coastal', 3, 78),
    (4, 'desert', 4, 90),
    (5, 'nightCity', 4, 74),
    (6, 'grandPrix', 5, 96),
    (7, 'international', 5, 102)
  ) as t (n, id, laps, ref_lap)
  where t.n = ((p_week % 8) + 8) % 8
$$;
revoke all on function ops.cup_track(integer) from public, anon, authenticated;

/** Runs a player may send a day (the game races three). */
create or replace function ops.cup_sends_max() returns integer language sql immutable set search_path = '' as $$ select 3 $$;
revoke all on function ops.cup_sends_max() from public, anon, authenticated;

/**
 * Sends a timed run of this week (milliseconds, with the car's model and colour): 'ok' (the
 * board keeps the better of it and the best so far), 'closed' (not this week), 'invalid' (faster
 * than the best car could drive, or not a car) or 'limit' (too many today).
 */
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
  -- the best rating laps in about half the reference time; nothing does better, nor 20 times worse
  if p_ms is null or p_ms < trk.laps * trk.ref_lap * 490 or p_ms > trk.laps * trk.ref_lap * 20000
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

/** A week's board: the best 50 times of listed players (and the player's own), with the entrants counted. */
create or replace function public.cup_board(p_week integer)
returns table (rank bigint, user_id uuid, username text, avatar text, car text, color text, best_ms integer, me boolean, entrants bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with shown as (
    select c.user_id, p.username, p.avatar, c.car, c.color, c.best_ms, c.improved_at
    from ops.cup_entries c
    join public.profiles p on p.id = c.user_id
    where c.week = p_week and (p.listed or c.user_id = (select auth.uid()))
  ), ranked as (
    select rank() over (order by s.best_ms, s.improved_at) as rank, count(*) over () as entrants, s.* from shown s
  )
  select r.rank, r.user_id, r.username, r.avatar, r.car, r.color, r.best_ms, r.user_id = (select auth.uid()) as me, r.entrants
  from ranked r
  where (select auth.uid()) is not null and (r.rank <= 50 or r.user_id = (select auth.uid()))
  order by r.rank
  limit 51;
$fn$;
revoke all on function public.cup_board(integer) from public, anon;
grant execute on function public.cup_board(integer) to authenticated;

/**
 * Hands the signed-in player their place in each finished week they raced and haven't been
 * paid for (each once): the week, the place and the entrants, counted among listed players and
 * the player, as the board shows them.
 */
create or replace function public.claim_cup_prizes()
returns table (week integer, rank bigint, entrants bigint, best_ms integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  wk integer := ops.cup_week();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  return query
  with mine as (
    update ops.cup_entries c set claimed_at = now()
    where c.user_id = uid and c.week < wk and c.claimed_at is null
    returning c.week as w, c.best_ms as ms, c.improved_at as at
  )
  select m.w,
    1 + (select count(*) from ops.cup_entries o join public.profiles p on p.id = o.user_id
         where o.week = m.w and o.user_id <> uid and p.listed and (o.best_ms < m.ms or (o.best_ms = m.ms and o.improved_at < m.at))),
    1 + (select count(*) from ops.cup_entries o join public.profiles p on p.id = o.user_id
         where o.week = m.w and o.user_id <> uid and p.listed),
    m.ms
  from mine m
  order by m.w;
end;
$$;
revoke all on function public.claim_cup_prizes() from public, anon;
grant execute on function public.claim_cup_prizes() to authenticated;
