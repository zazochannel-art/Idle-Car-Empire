-- The anonymous funnel (0006) without an end: anyone with the public key could add up to 600
-- steps a minute, and nothing was ever removed, so a flood could fill the free plan's database.
--   - steps older than a year go as new ones come in (the error reports keep 90 days: 0009);
--   - the flood limit is 300 steps a minute (real players send a handful each, at most once per
--     step and company: engine/funnel.ts).
-- The dashboard's figures (0020) read the last 7 and 14 days, which a year keeps whole.
-- Checked by supabase/tests/funnel_rules.sql.

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
  if (select count(*) from analytics.funnel_steps where at > now() - interval '1 minute') >= 300 then
    return 'busy';
  end if;
  insert into analytics.funnel_steps (step, minutes) values (p_step, greatest(0, least(coalesce(p_minutes, 0), 525600)));
  -- the steps past a year (funnel_steps_at: nothing to scan when there are none)
  delete from analytics.funnel_steps where at < now() - interval '365 days';
  return 'ok';
end;
$$;

revoke all on function public.track_step(text, integer) from public;
grant execute on function public.track_step(text, integer) to anon, authenticated;

-- what was already older than a year
delete from analytics.funnel_steps where at < now() - interval '365 days';
