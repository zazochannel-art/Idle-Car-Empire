-- The anonymous funnel (0006, 0023), checked inside one transaction that is rolled back:
-- what a visitor with only the public key may send, the flood limit and the year it keeps.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

do $test$
declare
  r text;
  failed boolean;
begin
  -- a year and a day old: removed by the next step
  insert into analytics.funnel_steps (step, minutes, at) values ('start', 1, now() - interval '366 days');

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  if public.track_step('ping', 0) <> 'ok' then raise exception 'FAIL ping'; end if;
  if public.track_step('not-a-step', 0) <> 'unknown' then raise exception 'FAIL an unknown step is refused'; end if;
  if public.track_step(null, 0) <> 'unknown' then raise exception 'FAIL a missing step is refused'; end if;
  if public.track_step('start', 3) <> 'ok' then raise exception 'FAIL a step is kept'; end if;

  -- nothing of the table itself
  failed := false;
  begin
    perform count(*) from analytics.funnel_steps;
  exception when insufficient_privilege then
    failed := true;
  end;
  if not failed then raise exception 'FAIL a visitor reads the funnel'; end if;

  reset role;

  if exists (select 1 from analytics.funnel_steps where at < now() - interval '365 days') then
    raise exception 'FAIL steps past a year are removed';
  end if;
  if (select count(*) from analytics.funnel_steps where step = 'start' and minutes = 3) <> 1 then
    raise exception 'FAIL the step was recorded';
  end if;

  -- a flood: up to 300 steps a minute
  insert into analytics.funnel_steps (step, minutes) select 'start', 0 from generate_series(1, 300);
  set local role anon;
  r := public.track_step('firstBody', 1);
  reset role;
  if r <> 'busy' then raise exception 'FAIL a flood is turned away: %', r; end if;

  raise notice 'funnel rules: all checks passed';
end;
$test$;

rollback;
