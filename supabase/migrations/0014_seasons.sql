-- Seasons the game's owner schedules: spring and summer come with the calendar (21 March –
-- 10 April, 15 July – 10 August: src/game/engine/season.ts), and the owner can also put one on
-- at another time, for up to 31 days, from the dashboard (site/admin/). While a scheduled one
-- runs it takes the place of the calendar's season; its festival (three goals and a livery:
-- src/game/engine/festival.ts) is the game's own, so a scheduled season can't do more than
-- the calendar's.
--
-- Like the scheduled events (0010): every player's game asks live_seasons() what is on; the
-- admin_* functions check on the server that the caller is in ops.admins; the table is in the
-- ops schema, which the API does not expose.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.live_seasons (
  id bigint generated always as identity primary key,
  season text not null check (season in ('spring', 'summer')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- cancelled from the dashboard: kept for the record, never shown to players
  cancelled_at timestamptz,
  constraint live_seasons_length check (ends_at > starts_at and ends_at - starts_at <= interval '31 days')
);
create index if not exists live_seasons_ends_at on ops.live_seasons (ends_at);
alter table ops.live_seasons enable row level security;
revoke all on ops.live_seasons from public, anon, authenticated;

/** The scheduled seasons running now or starting in the next 60 days (at most 10). */
create or replace function public.live_seasons()
returns table (season text, starts_at timestamptz, ends_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select s.season, s.starts_at, s.ends_at
  from ops.live_seasons s
  where s.cancelled_at is null and s.ends_at > now() and s.starts_at < now() + interval '60 days'
  order by s.starts_at
  limit 10
$$;
revoke all on function public.live_seasons() from public;
grant execute on function public.live_seasons() to anon, authenticated;

/** The scheduled seasons: running, coming, and those of the last 30 days. */
create or replace function public.admin_seasons()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.starts_at desc)
    from (
      select s.id, s.season, s.starts_at, s.ends_at, s.created_at, s.cancelled_at
      from ops.live_seasons s
      where s.ends_at > now() - interval '30 days'
      order by s.starts_at desc
      limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

/**
 * Schedules spring or summer: from `p_starts` (now if earlier) for `p_days` (1 to 31), at most 120
 * days ahead. 'ok', 'unknown' (not spring or summer), 'invalid' (time), 'overlap' (another
 * scheduled season at that time: one at a time) or 'limit' (10 waiting already).
 */
create or replace function public.admin_schedule_season(p_season text, p_starts timestamptz, p_days numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform ops.must_be_admin();
  if p_season is null or p_season not in ('spring', 'summer') then
    return 'unknown';
  end if;
  if p_starts is null or p_days is null or p_days < 1 or p_days > 31 or p_starts > now() + interval '120 days' then
    return 'invalid';
  end if;
  v_start := greatest(p_starts, now());
  v_end := v_start + make_interval(secs => round(p_days * 86400)::double precision);
  if exists (select 1 from ops.live_seasons s where s.cancelled_at is null and s.starts_at < v_end and s.ends_at > v_start) then
    return 'overlap';
  end if;
  if (select count(*) from ops.live_seasons s where s.cancelled_at is null and s.ends_at > now()) >= 10 then
    return 'limit';
  end if;
  insert into ops.live_seasons (season, starts_at, ends_at, created_by) values (p_season, v_start, v_end, auth.uid());
  return 'ok';
end;
$$;

/** Cancels a scheduled season that hasn't ended: players go back to the calendar's; the dashboard keeps it, marked. */
create or replace function public.admin_cancel_season(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  update ops.live_seasons s set cancelled_at = now() where s.id = p_id and s.cancelled_at is null and s.ends_at > now();
  return case when found then 'ok' else 'unknown' end;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_seasons()',
    'public.admin_schedule_season(text, timestamptz, numeric)',
    'public.admin_cancel_season(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
