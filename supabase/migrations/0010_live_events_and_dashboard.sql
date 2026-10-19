-- Live events the game's owner schedules, and the owner's dashboard (site/admin/).
--
-- The game runs a market event every few hours on its own (src/game/engine/events.ts);
-- the owner can also put one of those same events on at a chosen time, for up to 72 hours
-- (a weekend, a holiday). Every player's game asks live_events() what is scheduled; the
-- event's effects are the game's own, so a scheduled one can't do more than the regular ones.
--
-- The dashboard is a page on the site that signs in with the owner's game account and calls
-- the admin_* functions below. Each one checks on the server that the caller is in ops.admins
-- (nobody is until the owner adds themselves, docs/admin.md); the tables are in the ops
-- schema, which the API does not expose, and nobody but the database owner can read them.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table ops.admins enable row level security;
revoke all on ops.admins from public, anon, authenticated;

-- the event ids of src/game/config/events.ts (a test checks the two lists match)
create or replace function ops.event_ids() returns text[]
language sql immutable
set search_path = ''
as $$
  select array['rushOrders', 'carShow', 'steelSale', 'luxuryBoom', 'researchFair', 'exportDeal', 'raceWeekend', 'electricWeek']
$$;

create table if not exists ops.live_events (
  id bigint generated always as identity primary key,
  event text not null check (event = any (ops.event_ids())),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- cancelled from the dashboard: kept for the record, never shown to players
  cancelled_at timestamptz,
  constraint live_events_length check (ends_at > starts_at and ends_at - starts_at <= interval '72 hours')
);
create index if not exists live_events_ends_at on ops.live_events (ends_at);
alter table ops.live_events enable row level security;
revoke all on ops.live_events from public, anon, authenticated;

/** True when the caller is one of the game's admins. */
create or replace function ops.is_admin() returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (select 1 from ops.admins a where a.user_id = auth.uid())
$$;
revoke all on function ops.is_admin() from public, anon, authenticated;

create or replace function ops.must_be_admin() returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if not ops.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function ops.must_be_admin() from public, anon, authenticated;

-- ───────────────────────────── for every player ─────────────────────────────

/** The scheduled events running now or starting in the next two weeks (at most 20). */
create or replace function public.live_events()
returns table (event text, starts_at timestamptz, ends_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select e.event, e.starts_at, e.ends_at
  from ops.live_events e
  where e.cancelled_at is null and e.ends_at > now() and e.starts_at < now() + interval '14 days'
  order by e.starts_at
  limit 20
$$;
revoke all on function public.live_events() from public;
grant execute on function public.live_events() to anon, authenticated;

-- ───────────────────────────── the owner's dashboard ─────────────────────────────

/** Whether the signed-in account is an admin (the dashboard's first question). */
create or replace function public.admin_check()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select ops.is_admin()
$$;

/** The game at a glance: accounts, players, reports, errors, new players. */
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'new7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'active1d', (select count(*) from public.game_saves s where s.updated_at > now() - interval '1 day'),
    'active7d', (select count(*) from public.game_saves s where s.updated_at > now() - interval '7 days'),
    'saves', (select count(*) from public.game_saves),
    'alliances', (select count(*) from public.alliances),
    'openReports', (select count(*) from public.player_reports r where r.status = 'open'),
    'errors1d', (select coalesce(sum(e.times), 0) from analytics.client_errors e where e.last_at > now() - interval '1 day'),
    'errorKinds7d', (select count(distinct e.key) from analytics.client_errors e where e.day >= current_date - 7),
    'starts7d', (select count(*) from analytics.funnel_steps f where f.step = 'start' and f.at > now() - interval '7 days'),
    'serverNow', now()
  );
end;
$$;

/** The new-player funnel (analytics.funnel_report). */
create or replace function public.admin_funnel()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((select jsonb_agg(to_jsonb(r)) from analytics.funnel_report r), '[]'::jsonb);
end;
$$;

/** The last 30 days' errors, most frequent first (analytics.error_report), at most 100. */
create or replace function public.admin_errors()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((select jsonb_agg(to_jsonb(r)) from (select * from analytics.error_report limit 100) r), '[]'::jsonb);
end;
$$;

/** Open player reports, newest first, with the reported player's name today (docs/moderation.md). */
create or replace function public.admin_reports()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select r.id, r.created_at, r.reason, r.seen_name, r.seen_company, r.seen_alliance, r.target, r.alliance,
             p.username as name_now,
             (select count(*) from public.player_reports y where y.target = r.target) as reports_about_them
      from public.player_reports r
      left join public.profiles p on p.id = r.target
      where r.status = 'open'
      order by r.created_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;

/** Marks a report: 'done' (acted on), 'dismissed' (nothing wrong) or back to 'open'. */
create or replace function public.admin_report_status(p_id bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  if p_status is null or p_status not in ('open', 'done', 'dismissed') then
    return 'invalid';
  end if;
  update public.player_reports set status = p_status where id = p_id;
  return case when found then 'ok' else 'unknown' end;
end;
$$;

/** Gives an offending player name a neutral one (they can choose a new one, which the filter checks). */
create or replace function public.admin_rename_player(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform ops.must_be_admin();
  update public.profiles
  set username = 'Player-' || substr(replace(id::text, '-', ''), 1, 12)
  where id = p_user
  returning username into v_name;
  return coalesce(v_name, 'unknown');
end;
$$;

/** The scheduled events: running, coming, and those of the last 7 days. */
create or replace function public.admin_events()
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
      select e.id, e.event, e.starts_at, e.ends_at, e.created_at, e.cancelled_at
      from ops.live_events e
      where e.ends_at > now() - interval '7 days'
      order by e.starts_at desc
      limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

/**
 * Schedules one of the game's events: from `p_starts` (now if earlier) for `p_hours` (¼ to 72).
 * 'ok', 'unknown' (not one of the game's events), 'invalid' (time), 'overlap' (another scheduled
 * event at that time: one at a time) or 'limit' (20 waiting already).
 */
create or replace function public.admin_schedule_event(p_event text, p_starts timestamptz, p_hours numeric)
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
  if p_event is null or not (p_event = any (ops.event_ids())) then
    return 'unknown';
  end if;
  if p_starts is null or p_hours is null or p_hours < 0.25 or p_hours > 72 or p_starts > now() + interval '60 days' then
    return 'invalid';
  end if;
  v_start := greatest(p_starts, now());
  v_end := v_start + make_interval(secs => round(p_hours * 3600)::double precision);
  if exists (select 1 from ops.live_events e where e.cancelled_at is null and e.starts_at < v_end and e.ends_at > v_start) then
    return 'overlap';
  end if;
  if (select count(*) from ops.live_events e where e.cancelled_at is null and e.ends_at > now()) >= 20 then
    return 'limit';
  end if;
  insert into ops.live_events (event, starts_at, ends_at, created_by) values (p_event, v_start, v_end, auth.uid());
  return 'ok';
end;
$$;

/** Cancels a scheduled event that hasn't ended: players stop seeing it; the dashboard keeps it, marked. */
create or replace function public.admin_cancel_event(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  update ops.live_events e set cancelled_at = now() where e.id = p_id and e.cancelled_at is null and e.ends_at > now();
  return case when found then 'ok' else 'unknown' end;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_check()',
    'public.admin_overview()',
    'public.admin_funnel()',
    'public.admin_errors()',
    'public.admin_reports()',
    'public.admin_report_status(bigint, text)',
    'public.admin_rename_player(uuid)',
    'public.admin_events()',
    'public.admin_schedule_event(text, timestamptz, numeric)',
    'public.admin_cancel_event(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
