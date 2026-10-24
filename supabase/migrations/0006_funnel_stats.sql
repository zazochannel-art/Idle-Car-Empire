-- Anonymous new-player funnel (idea 9): where new players stop.
--
-- What is stored: the name of a step a new company reached (from a fixed
-- list), the minutes of play it took, and when. Nothing else: no account,
-- no device or install id, no IP address, no save. The game sends each step
-- once, without the player's session (only the project's public key), and
-- a player can switch it off in Settings.
--
-- The table lives in its own schema, which the API does not expose: no
-- client can read it. The only way in is track_step(), which checks the
-- step name and caps the rate. The project owner reads the report in the
-- SQL Editor: select * from analytics.funnel_report;

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create table if not exists analytics.funnel_steps (
  id bigint generated always as identity primary key,
  step text not null,
  minutes integer not null check (minutes >= 0),
  at timestamptz not null default now()
);
create index if not exists funnel_steps_at on analytics.funnel_steps (at);
alter table analytics.funnel_steps enable row level security;
revoke all on analytics.funnel_steps from public, anon, authenticated;

-- The steps, in the order a new player meets them.
create or replace function analytics.funnel_order() returns text[]
language sql immutable
set search_path = ''
as $$
  select array['gate', 'start', 'firstBody', 'engineFactory', 'assemblyPlant', 'firstCar', 'firstSale', 'min30', 'zone2', 'research', 'hour3', 'racing', 'day1', 'day7', 'imperium']
$$;

-- Records one step. 'ping' answers without writing (the live check uses it).
-- Over 600 steps in the last minute (a flood, not players) are turned away.
create or replace function public.track_step(p_step text, p_minutes integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_step = 'ping' then
    return 'ok';
  end if;
  if p_step is null or not (p_step = any (analytics.funnel_order())) then
    return 'unknown';
  end if;
  if (select count(*) from analytics.funnel_steps where at > now() - interval '1 minute') >= 600 then
    return 'busy';
  end if;
  insert into analytics.funnel_steps (step, minutes) values (p_step, greatest(0, least(coalesce(p_minutes, 0), 525600)));
  return 'ok';
end;
$$;
revoke all on function public.track_step(text, integer) from public;
grant execute on function public.track_step(text, integer) to anon, authenticated;

-- The report: how many new players reached each step, the share of those who
-- started, the median minutes of play it took, and the dates covered.
create or replace view analytics.funnel_report as
with counts as (
  select step, count(*) as players, percentile_cont(0.5) within group (order by minutes) as median_minutes, min(at)::date as since, max(at)::date as last
  from analytics.funnel_steps
  group by step
)
select
  c.step,
  c.players,
  round(100.0 * c.players / nullif((select players from counts where step = 'start'), 0), 1) as pct_of_start,
  c.median_minutes,
  c.since,
  c.last
from counts c
order by array_position(analytics.funnel_order(), c.step);
revoke all on analytics.funnel_report from public, anon, authenticated;
