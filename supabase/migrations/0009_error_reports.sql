-- Anonymous error reports from the game: when it hits an error on a player's
-- phone, what went wrong and where, so it can be fixed.
--
-- What is stored: the error's message (cut, with anything that looks like an
-- email, a web address or a long number taken out by the game first), where in
-- the game's code it happened (the screen and the top lines of the stack: file
-- names and positions), the app version, the platform (android/ios/web), the
-- Android or iOS version and the web engine's version, and how many times it
-- happened each day. Nothing else: no account, no name, no device or install
-- id, no IP address, no save. The game sends at most a few per session,
-- without the player's session (only the project's public key), and none when
-- the player switched "Anonymous statistics" off in Settings.
--
-- Like the funnel (0006), the table lives in the analytics schema, which the
-- API does not expose: no client can read it. The only way in is
-- report_error(). The project owner reads them in the SQL Editor:
--   select * from analytics.error_report;
-- Reports older than 90 days are removed as new ones come in.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create table if not exists analytics.client_errors (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  kind text not null check (kind in ('error', 'rejection', 'screen')),
  message text not null check (length(message) between 1 and 300),
  place text not null default '' check (length(place) <= 600),
  version text not null default '' check (length(version) <= 40),
  platform text not null default '' check (length(platform) <= 16),
  engine text not null default '' check (length(engine) <= 64),
  times integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  -- one row per error and day (messages and stacks are too long for a plain unique index)
  key text generated always as (md5(kind || chr(31) || message || chr(31) || place || chr(31) || version || chr(31) || platform)) stored,
  unique (day, key)
);
create index if not exists client_errors_last_at on analytics.client_errors (last_at);
create index if not exists client_errors_day on analytics.client_errors (day);
alter table analytics.client_errors enable row level security;
revoke all on analytics.client_errors from public, anon, authenticated;

-- Records one error, or counts it again. A flood (not players) is turned away:
-- over 300 reports in the last minute, or 2,000 different errors in a day.
create or replace function public.report_error(p_kind text, p_message text, p_place text, p_version text, p_platform text, p_engine text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := left(btrim(coalesce(p_message, '')), 300);
  plc text := left(coalesce(p_place, ''), 600);
  ver text := left(coalesce(p_version, ''), 40);
  plat text := left(coalesce(p_platform, ''), 16);
  eng text := left(coalesce(p_engine, ''), 64);
  k text;
begin
  if p_kind is null or p_kind not in ('error', 'rejection', 'screen') or msg = '' then
    return 'unknown';
  end if;
  if (select count(*) from analytics.client_errors where last_at > now() - interval '1 minute') >= 300 then
    return 'busy';
  end if;
  k := md5(p_kind || chr(31) || msg || chr(31) || plc || chr(31) || ver || chr(31) || plat);
  if not exists (select 1 from analytics.client_errors where day = current_date and key = k)
     and (select count(*) from analytics.client_errors where day = current_date) >= 2000 then
    return 'busy';
  end if;
  insert into analytics.client_errors (kind, message, place, version, platform, engine)
  values (p_kind, msg, plc, ver, plat, eng)
  on conflict (day, key) do update set times = analytics.client_errors.times + 1, last_at = now(), engine = excluded.engine;
  -- now and then, the reports past 90 days go
  if random() < 0.02 then
    delete from analytics.client_errors where day < current_date - 90;
  end if;
  return 'ok';
end;
$$;
revoke all on function public.report_error(text, text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text, text) to anon, authenticated;

-- The report: the last 30 days' errors, most frequent first, with the days they
-- came on and the versions and engines they came from.
create or replace view analytics.error_report with (security_invoker = on) as
select
  kind,
  message,
  place,
  sum(times) as times,
  count(distinct day) as days,
  string_agg(distinct version, ', ') as versions,
  string_agg(distinct platform, ', ') as platforms,
  string_agg(distinct engine, ', ') as engines,
  min(first_at) as first_seen,
  max(last_at) as last_seen
from analytics.client_errors
where day >= current_date - 30
group by kind, message, place
order by sum(times) desc, max(last_at) desc;
revoke all on analytics.error_report from public, anon, authenticated;
