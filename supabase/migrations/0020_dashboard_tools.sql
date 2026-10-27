-- More for the owner's dashboard (site/admin/, docs/admin.md):
--
-- - The game in numbers: how far players are (money earned, territories, Nordheim, resets…), the
--   week against the week before, errors by version (and marked fixed), invites, the cup, gifts.
-- - A player's card, found by name, company, email or id: their account, save, cloud backups,
--   reports, and what the team did for them. Hiding a player from the boards, renaming them.
-- - Commands for one player's game, carried out by the game itself the next time it runs (money,
--   ⭐ Stars, the company's name, a cloud backup to play again, a message): the save lives on the
--   player's phone, so the server never edits it; it hands the command to the game, as it does
--   gifts. Games from before this migration don't ask for them: commands wait until the player's
--   game is new enough.
-- - Announcements: a short text in the players' languages, shown once in every game while it runs.
-- - A log of what every admin did.
--
-- Everything is in the ops schema, which the API does not expose; every admin_* function checks
-- that the caller is an admin (ops.must_be_admin, 0010). Players reach only claim_my_commands()
-- (their own) and live_announcements().

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

-- ───────────────────────────── helpers ─────────────────────────────

/** The number at a path of a save (0 when it isn't a number). */
create or replace function ops.save_num(d jsonb, variadic p text[]) returns numeric
language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(d #> p) = 'number' then (d #>> p)::numeric else 0 end
$$;

/** The first city's part of a save: the save itself, or its parked copy while the player is in another city. */
create or replace function ops.save_home(d jsonb) returns jsonb
language sql immutable
set search_path = ''
as $$
  select case when coalesce(d ->> 'activeCity', 'home') <> 'home' and jsonb_typeof(d -> 'cities' -> 'home') = 'object' then d -> 'cities' -> 'home' else d end
$$;

/** A city's part of a save (null when the save doesn't have that city). */
create or replace function ops.save_city(d jsonb, p_city text) returns jsonb
language sql immutable
set search_path = ''
as $$
  select case
    when coalesce(d ->> 'activeCity', 'home') = p_city then d
    when jsonb_typeof(d -> 'cities' -> p_city) = 'object' then d -> 'cities' -> p_city
  end
$$;

/** Plants built in a city's part of a save. */
create or replace function ops.save_plants(c jsonb) returns integer
language sql immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_each(case when jsonb_typeof(c -> 'city' -> 'buildings') = 'object' then c -> 'city' -> 'buildings' else '{}'::jsonb end) e
  where jsonb_typeof(e.value -> 'plant') = 'object'
$$;

/** Territories open in a city's part of a save. */
create or replace function ops.save_territories(c jsonb) returns integer
language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(c -> 'city' -> 'territories') = 'array' then jsonb_array_length(c -> 'city' -> 'territories') else 0 end
$$;

/** The game owns Nordheim (the second city). */
create or replace function ops.save_owns_north(d jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(d ->> 'activeCity', 'home') = 'north' or jsonb_typeof(d -> 'cities' -> 'north') = 'object'
$$;

/** One error across versions and days (analytics.client_errors keeps one row per version and day). */
create or replace function ops.error_group(p_kind text, p_message text, p_place text) returns text
language sql immutable
set search_path = ''
as $$
  select md5(p_kind || chr(31) || p_message || chr(31) || p_place)
$$;

/** A search text for ilike, its wildcards taken literally. */
create or replace function ops.like_text(q text) returns text
language sql immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'ops.save_num(jsonb, text[])', 'ops.save_home(jsonb)', 'ops.save_city(jsonb, text)', 'ops.save_plants(jsonb)',
    'ops.save_territories(jsonb)', 'ops.save_owns_north(jsonb)', 'ops.error_group(text, text, text)', 'ops.like_text(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- ───────────────────────────── the admins' log ─────────────────────────────

create table if not exists ops.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 40),
  -- the player it was about: the entry goes with their account
  target uuid references auth.users (id) on delete cascade,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object')
);
create index if not exists admin_log_at on ops.admin_log (at desc);
create index if not exists admin_log_target on ops.admin_log (target, at desc) where target is not null;
alter table ops.admin_log enable row level security;
revoke all on ops.admin_log from public, anon, authenticated;

create or replace function ops.log(p_action text, p_target uuid, p_detail jsonb default '{}'::jsonb) returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.admin_log (admin, action, target, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;
revoke all on function ops.log(text, uuid, jsonb) from public, anon, authenticated;

-- ───────────────────────────── announcements ─────────────────────────────

create table if not exists ops.announcements (
  id bigint generated always as identity primary key,
  icon text not null default '📣' check (char_length(icon) between 1 and 8),
  -- per language ('en', 'ro', 'de', 'es', 'pt', 'ru'): {"title": …, "body": …}; a game shows its
  -- player's language, else English, else Romanian, else the first there is
  texts jsonb not null check (jsonb_typeof(texts) = 'object'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- cancelled from the dashboard: kept for the record, never shown to players
  cancelled_at timestamptz,
  constraint announcements_length check (ends_at > starts_at and ends_at - starts_at <= interval '14 days')
);
create index if not exists announcements_ends_at on ops.announcements (ends_at);
alter table ops.announcements enable row level security;
revoke all on ops.announcements from public, anon, authenticated;

-- What the dashboard schedules goes in the log: events, seasons, announcements, and their cancelling.
create or replace function ops.log_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  what text := case tg_table_name when 'live_events' then 'event' when 'live_seasons' then 'season' else 'news' end;
  detail jsonb := jsonb_build_object('id', j -> 'id', 'starts_at', j -> 'starts_at', 'ends_at', j -> 'ends_at',
    'name', coalesce(j ->> 'event', j ->> 'season', j -> 'texts' -> 'ro' ->> 'title', j -> 'texts' -> 'en' ->> 'title', ''));
begin
  if tg_op = 'INSERT' then
    perform ops.log(what || '.schedule', null, detail);
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    perform ops.log(what || '.cancel', null, detail);
  end if;
  return null;
end;
$$;
revoke all on function ops.log_schedule() from public, anon, authenticated;

create or replace trigger live_events_log after insert or update of cancelled_at on ops.live_events
  for each row execute function ops.log_schedule();
create or replace trigger live_seasons_log after insert or update of cancelled_at on ops.live_seasons
  for each row execute function ops.log_schedule();
create or replace trigger announcements_log after insert or update of cancelled_at on ops.announcements
  for each row execute function ops.log_schedule();

/** The announcements running now (at most 5), for every game (lib/live-events.ts). */
create or replace function public.live_announcements()
returns table (id bigint, icon text, texts jsonb, starts_at timestamptz, ends_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select a.id, a.icon, a.texts, a.starts_at, a.ends_at
  from ops.announcements a
  where a.cancelled_at is null and a.starts_at <= now() and a.ends_at > now()
  order by a.starts_at
  limit 5
$$;
revoke all on function public.live_announcements() from public;
grant execute on function public.live_announcements() to anon, authenticated;

/** The announcements: running, coming, and those of the last 30 days. */
create or replace function public.admin_announcements()
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
      select a.id, a.icon, a.texts, a.starts_at, a.ends_at, a.created_at, a.cancelled_at
      from ops.announcements a
      where a.ends_at > now() - interval '30 days'
      order by a.starts_at desc
      limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

/**
 * Puts an announcement on: from `p_starts` (now if earlier) for `p_hours` (1 to 336), with its
 * texts per language (a title of 1–60 characters and a text of up to 300 each). 'ok', 'invalid'
 * or 'limit' (10 waiting or running already).
 */
create or replace function public.admin_post_announcement(p_icon text, p_texts jsonb, p_starts timestamptz, p_hours numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_icon text := coalesce(nullif(btrim(coalesce(p_icon, '')), ''), '📣');
  v_texts jsonb := '{}'::jsonb;
  v_start timestamptz;
  k text;
  v jsonb;
  t text;
  b text;
begin
  perform ops.must_be_admin();
  if jsonb_typeof(p_texts) is distinct from 'object' or char_length(v_icon) > 8 then
    return 'invalid';
  end if;
  for k, v in select e.key, e.value from jsonb_each(p_texts) e loop
    if k not in ('en', 'ro', 'de', 'es', 'pt', 'ru') or jsonb_typeof(v) is distinct from 'object' then
      return 'invalid';
    end if;
    t := btrim(coalesce(v ->> 'title', ''));
    b := btrim(coalesce(v ->> 'body', ''));
    if t = '' and b = '' then
      continue;
    end if;
    if char_length(t) not between 1 and 60 or char_length(b) > 300 or t ~ '[[:cntrl:]]' then
      return 'invalid';
    end if;
    v_texts := v_texts || jsonb_build_object(k, jsonb_build_object('title', t, 'body', b));
  end loop;
  if v_texts = '{}'::jsonb then
    return 'invalid';
  end if;
  if p_starts is null or p_hours is null or p_hours < 1 or p_hours > 336 or p_starts > now() + interval '60 days' then
    return 'invalid';
  end if;
  if (select count(*) from ops.announcements a where a.cancelled_at is null and a.ends_at > now()) >= 10 then
    return 'limit';
  end if;
  v_start := greatest(p_starts, now());
  insert into ops.announcements (icon, texts, starts_at, ends_at, created_by)
  values (v_icon, v_texts, v_start, v_start + make_interval(secs => round(p_hours * 3600)::double precision), auth.uid());
  return 'ok';
end;
$$;

/** Cancels an announcement that hasn't ended: games stop showing it (those that showed it keep it in their notification center). */
create or replace function public.admin_cancel_announcement(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  update ops.announcements a set cancelled_at = now() where a.id = p_id and a.cancelled_at is null and a.ends_at > now();
  return case when found then 'ok' else 'unknown' end;
end;
$$;

-- ───────────────────────────── commands for a player's game ─────────────────────────────

create table if not exists ops.player_commands (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- cash: {mode: add|set, amount, city: here|home|north}; stars: {mode, amount}; company: {name};
  -- restore: {backup, made_at}; message: {} (the note is the message)
  kind text not null check (kind in ('cash', 'stars', 'company', 'restore', 'message')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  -- shown to the player with it
  note text check (note is null or char_length(note) between 1 and 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- the player's game took it (and carried it out)
  claimed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists player_commands_waiting on ops.player_commands (user_id, id) where claimed_at is null and cancelled_at is null;
create index if not exists player_commands_user on ops.player_commands (user_id, created_at desc);
alter table ops.player_commands enable row level security;
revoke all on ops.player_commands from public, anon, authenticated;

/**
 * Queues a command for a player's game. 'ok'; 'unknown' (no such player); 'invalid' (the kind, the
 * amount, the name, the backup or the note isn't right); 'blocked' (a company name the name check
 * refuses); 'limit' (20 waiting already).
 */
create or replace function public.admin_send_command(p_user uuid, p_kind text, p_payload jsonb, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_mode text;
  v_amount numeric;
  v_name text;
  v_made timestamptz;
  v_id bigint;
begin
  perform ops.must_be_admin();
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    return 'unknown';
  end if;
  if jsonb_typeof(v_in) is distinct from 'object' or (v_note is not null and (char_length(v_note) > 200 or v_note ~ '[[:cntrl:]]')) then
    return 'invalid';
  end if;
  v_mode := v_in ->> 'mode';
  if p_kind in ('cash', 'stars') then
    if jsonb_typeof(v_in -> 'amount') is distinct from 'number' or v_mode is null or v_mode not in ('add', 'set') then
      return 'invalid';
    end if;
    v_amount := (v_in ->> 'amount')::numeric;
    if abs(v_amount) > 1e30 or (v_mode = 'set' and v_amount < 0) or (v_mode = 'add' and v_amount = 0)
       or (p_kind = 'stars' and (v_amount <> trunc(v_amount) or abs(v_amount) > 1e9)) then
      return 'invalid';
    end if;
    v_payload := jsonb_build_object('mode', v_mode, 'amount', v_amount);
    if p_kind = 'cash' then
      if coalesce(v_in ->> 'city', 'here') not in ('here', 'home', 'north') then
        return 'invalid';
      end if;
      v_payload := v_payload || jsonb_build_object('city', coalesce(v_in ->> 'city', 'here'));
    end if;
  elsif p_kind = 'company' then
    v_name := btrim(coalesce(v_in ->> 'name', ''));
    if char_length(v_name) not between 1 and 24 or v_name ~ '[[:cntrl:]]' then
      return 'invalid';
    end if;
    if not public.name_is_clean(v_name) then
      return 'blocked';
    end if;
    v_payload := jsonb_build_object('name', v_name);
  elsif p_kind = 'restore' then
    if jsonb_typeof(v_in -> 'backup') is distinct from 'number' then
      return 'invalid';
    end if;
    select b.made_at into v_made from ops.save_backups b where b.id = (v_in ->> 'backup')::bigint and b.user_id = p_user;
    if v_made is null then
      return 'invalid';
    end if;
    v_payload := jsonb_build_object('backup', (v_in ->> 'backup')::bigint, 'made_at', v_made);
  elsif p_kind = 'message' then
    if v_note is null then
      return 'invalid';
    end if;
    v_payload := '{}'::jsonb;
  else
    return 'invalid';
  end if;
  if (select count(*) from ops.player_commands c where c.user_id = p_user and c.claimed_at is null and c.cancelled_at is null) >= 20 then
    return 'limit';
  end if;
  insert into ops.player_commands (user_id, kind, payload, note, created_by)
  values (p_user, p_kind, v_payload, v_note, auth.uid())
  returning id into v_id;
  perform ops.log('command.' || p_kind, p_user, v_payload || jsonb_build_object('command', v_id, 'note', v_note));
  return 'ok';
end;
$$;

/** Cancels a command the player's game hasn't taken yet. */
create or replace function public.admin_cancel_command(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_kind text;
begin
  perform ops.must_be_admin();
  update ops.player_commands c set cancelled_at = now()
  where c.id = p_id and c.claimed_at is null and c.cancelled_at is null
  returning c.user_id, c.kind into v_user, v_kind;
  if v_user is null then
    return 'unknown';
  end if;
  perform ops.log('command.cancel', v_user, jsonb_build_object('command', p_id, 'kind', v_kind));
  return 'ok';
end;
$$;

/**
 * The signed-in player's waiting commands of the kinds their game knows (oldest first, at most 20),
 * handed out once: the game carries them out and saves (engine/team.ts).
 */
create or replace function public.claim_my_commands(p_kinds text[])
returns table (id bigint, kind text, payload jsonb, note text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  return query
  update ops.player_commands c set claimed_at = now()
  where c.id in (
    select w.id from ops.player_commands w
    where w.user_id = uid and w.claimed_at is null and w.cancelled_at is null and w.kind = any (coalesce(p_kinds, '{}'::text[]))
    order by w.id
    limit 20
    for update skip locked
  )
  returning c.id, c.kind, c.payload, c.note, c.created_at;
end;
$$;
revoke all on function public.claim_my_commands(text[]) from public, anon;
grant execute on function public.claim_my_commands(text[]) to authenticated;

-- ───────────────────────────── the game in numbers ─────────────────────────────

/** The game at a glance (0010), with the week before each weekly number and the players in Nordheim. */
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  perform ops.must_be_admin();
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'new7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'new7dPrev', (select count(*) from auth.users u where u.created_at > now() - interval '14 days' and u.created_at <= now() - interval '7 days'),
    'active1d', (select count(*) from public.game_saves s where s.updated_at > now() - interval '1 day'),
    'active7d', (select count(*) from public.game_saves s where s.updated_at > now() - interval '7 days'),
    -- the days played (0015): the last 7 UTC days, and the 7 before
    'played7d', (select count(distinct p.user_id) from analytics.play_days p where p.day > today - 7),
    'played7dPrev', (select count(distinct p.user_id) from analytics.play_days p where p.day > today - 14 and p.day <= today - 7),
    'saves', (select count(*) from public.game_saves),
    'alliances', (select count(*) from public.alliances),
    'openReports', (select count(*) from public.player_reports r where r.status = 'open'),
    'errors1d', (select coalesce(sum(e.times), 0) from analytics.client_errors e where e.last_at > now() - interval '1 day'),
    'errors7d', (select coalesce(sum(e.times), 0) from analytics.client_errors e where e.day > current_date - 7),
    'errors7dPrev', (select coalesce(sum(e.times), 0) from analytics.client_errors e where e.day > current_date - 14 and e.day <= current_date - 7),
    'errorKinds7d', (select count(distinct e.key) from analytics.client_errors e where e.day >= current_date - 7),
    'starts7d', (select count(*) from analytics.funnel_steps f where f.step = 'start' and f.at > now() - interval '7 days'),
    'starts7dPrev', (select count(*) from analytics.funnel_steps f where f.step = 'start' and f.at > now() - interval '14 days' and f.at <= now() - interval '7 days'),
    'nordheim', (select count(*) from public.game_saves s where ops.save_owns_north(s.data)),
    'serverNow', now()
  );
end;
$$;

/**
 * How far the players are, from their cloud saves: those saved in the last `p_days` days (0: all).
 * Totals only: money earned in bands, territories of the first city, Nordheim, resets, plants,
 * ⭐ Stars, research, racing, and the app versions (saves from 1.0.7 on say theirs).
 */
create or replace function public.admin_progress(p_days integer default 30)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform ops.must_be_admin();
  with s as (
    select g.data as d
    from public.game_saves g
    where coalesce(p_days, 0) <= 0 or g.updated_at > now() - make_interval(days => least(p_days, 3650))
  ), x as (
    select
      ops.save_earned(s.d) as earned,
      ops.save_num(s.d, 'stars') as stars,
      ops.save_num(s.d, 'imperiumCount') as resets,
      ops.save_num(s.d, 'lifetime', 'carsProduced') as cars,
      case when jsonb_typeof(s.d -> 'research') = 'array' then jsonb_array_length(s.d -> 'research') else 0 end as research,
      ops.save_territories(ops.save_home(s.d)) as territories,
      ops.save_plants(ops.save_home(s.d)) as plants,
      ops.save_owns_north(s.d) as north,
      coalesce(s.d ->> 'activeCity', 'home') = 'north' as in_north,
      coalesce(s.d -> 'racing' -> 'unlocked' = 'true'::jsonb, false) as racing,
      nullif(left(s.d ->> 'appVersion', 40), '') as app
    from s
  )
  select jsonb_build_object(
    'players', (select count(*) from x),
    -- under $1M, $1M–$1B, $1B–$1T, $1T–$1Qa, $1Qa and more
    'earned', (select jsonb_build_array(
      count(*) filter (where earned < 1e6), count(*) filter (where earned >= 1e6 and earned < 1e9),
      count(*) filter (where earned >= 1e9 and earned < 1e12), count(*) filter (where earned >= 1e12 and earned < 1e15),
      count(*) filter (where earned >= 1e15)) from x),
    -- 0 to 6 territories open in the first city
    'territories', (select jsonb_build_array(
      count(*) filter (where territories = 0), count(*) filter (where territories = 1), count(*) filter (where territories = 2),
      count(*) filter (where territories = 3), count(*) filter (where territories = 4), count(*) filter (where territories = 5),
      count(*) filter (where territories >= 6)) from x),
    'readyForNorth', (select count(*) from x where territories >= 6 and not north),
    'north', (select count(*) from x where north),
    'inNorth', (select count(*) from x where in_north),
    -- 0, 1, 2, 3 and more Reset Imperiums
    'resets', (select jsonb_build_array(count(*) filter (where resets = 0), count(*) filter (where resets = 1),
      count(*) filter (where resets = 2), count(*) filter (where resets >= 3)) from x),
    'racing', (select count(*) from x where racing),
    'median', (select jsonb_build_object(
      'plants', coalesce(percentile_cont(0.5) within group (order by plants), 0),
      'stars', coalesce(percentile_cont(0.5) within group (order by stars), 0),
      'research', coalesce(percentile_cont(0.5) within group (order by research), 0),
      'cars', coalesce(percentile_cont(0.5) within group (order by cars), 0),
      'earned', coalesce(percentile_cont(0.5) within group (order by earned), 0)) from x),
    'top', (select jsonb_build_object('plants', coalesce(max(plants), 0), 'stars', coalesce(max(stars), 0), 'earned', coalesce(max(earned), 0)) from x),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version', y.app, 'players', y.n) order by y.n desc, y.app desc)
      from (select app, count(*) as n from x where app is not null group by app) y), '[]'::jsonb),
    'noVersion', (select count(*) from x where app is null)
  ) into v;
  return v;
end;
$$;

/** Invites, the weekly cup, gifts, alliances and phones with notifications. */
create or replace function public.admin_social()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  perform ops.must_be_admin();
  return jsonb_build_object(
    'invites', jsonb_build_object(
      'codes', (select count(*) from ops.invite_codes),
      'used', (select count(*) from ops.invites),
      'used7d', (select count(*) from ops.invites i where i.made_at > now() - interval '7 days'),
      'used30d', (select count(*) from ops.invites i where i.made_at > now() - interval '30 days'),
      'rewarded', (select count(*) from ops.invites i where i.rewarded_at is not null),
      'inviters', (select count(distinct i.inviter) from ops.invites i where i.inviter is not null)),
    'cupWeek', ops.cup_week(),
    'cup', coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'entrants', w.n, 'claimed', w.c) order by w.week desc)
      from (select e.week, count(*) as n, count(*) filter (where e.claimed_at is not null) as c
            from ops.cup_entries e where e.week > ops.cup_week() - 8 group by e.week) w), '[]'::jsonb),
    'gifts', jsonb_build_object(
      'today', (select count(*) from public.gifts g where g.day = today),
      'week', (select count(*) from public.gifts g where g.day > today - 7),
      'senders7d', (select count(distinct g.from_user) from public.gifts g where g.day > today - 7)),
    'alliances', jsonb_build_object(
      'count', (select count(*) from public.alliances),
      'members', (select count(*) from public.alliance_members)),
    'push', jsonb_build_object(
      'phones', (select count(*) from ops.push_tokens t where t.token is not null),
      'sent7d', (select count(*) from ops.push_queue q where q.sent and q.done_at > now() - interval '7 days'))
  );
end;
$$;

-- ───────────────────────────── errors by version ─────────────────────────────

create table if not exists ops.error_marks (
  -- ops.error_group(kind, message, place): one error across versions
  key text primary key check (key ~ '^[0-9a-f]{32}$'),
  resolved_at timestamptz not null default now(),
  -- the versions it had come from when it was marked: it is back when another one sends it
  versions text[] not null default '{}'::text[],
  by uuid references auth.users (id) on delete set null
);
alter table ops.error_marks enable row level security;
revoke all on ops.error_marks from public, anon, authenticated;

/**
 * The last 30 days' errors (at most 150, most frequent first), all versions or one (`p_version`):
 * each with the version it first came from (in the 90 days kept), whether it is marked fixed, and
 * whether it came back since from a version it hadn't come from. With the versions seen.
 */
create or replace function public.admin_error_list(p_version text default null)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_errors jsonb;
begin
  perform ops.must_be_admin();
  with e as (
    select ops.error_group(c.kind, c.message, c.place) as g, c.*
    from analytics.client_errors c
    where c.day >= current_date - 30
  ), firsts as (
    select distinct on (f.g) f.g, f.version as first_version
    from (select ops.error_group(c.kind, c.message, c.place) as g, c.version, c.first_at from analytics.client_errors c) f
    order by f.g, f.first_at
  ), agg as (
    select e.g, min(e.kind) as kind, min(e.message) as message, min(e.place) as place,
      coalesce(sum(e.times) filter (where p_version is null or e.version = p_version), 0) as times,
      count(distinct e.day) filter (where p_version is null or e.version = p_version) as days,
      string_agg(distinct nullif(e.version, ''), ', ') as versions,
      string_agg(distinct nullif(e.platform, ''), ', ') as platforms,
      string_agg(distinct nullif(e.engine, ''), ', ') as engines,
      min(e.first_at) as first_seen,
      max(e.last_at) as last_seen
    from e
    group by e.g
  )
  select jsonb_agg(to_jsonb(r) order by r.times desc, r.last_seen desc)
  into v_errors
  from (
    select a.g as key, a.kind, a.message, a.place, a.times, a.days, a.versions, a.platforms, a.engines, a.first_seen, a.last_seen,
      f.first_version, m.resolved_at,
      (m.key is not null and exists (
        select 1 from e where e.g = a.g and e.last_at > m.resolved_at and not (e.version = any (m.versions)))) as back
    from agg a
    left join firsts f on f.g = a.g
    left join ops.error_marks m on m.key = a.g
    where a.times > 0
    order by a.times desc, a.last_seen desc
    limit 150
  ) r;
  return jsonb_build_object(
    'errors', coalesce(v_errors, '[]'::jsonb),
    'versions', coalesce((
      select jsonb_agg(x.version order by x.last desc)
      from (select c.version, max(c.last_at) as last from analytics.client_errors c
            where c.day >= current_date - 30 and c.version <> '' group by c.version) x
    ), '[]'::jsonb)
  );
end;
$$;

/** Marks an error fixed (it hides until a version it hadn't come from sends it again), or not. */
create or replace function public.admin_error_resolve(p_key text, p_resolved boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
begin
  perform ops.must_be_admin();
  if p_key is null or p_key !~ '^[0-9a-f]{32}$' then
    return 'invalid';
  end if;
  select left(min(c.message), 120) into v_message from analytics.client_errors c where ops.error_group(c.kind, c.message, c.place) = p_key;
  if p_resolved then
    if v_message is null then
      return 'unknown';
    end if;
    insert into ops.error_marks (key, versions, by)
    values (p_key, coalesce((select array_agg(distinct c.version) from analytics.client_errors c where ops.error_group(c.kind, c.message, c.place) = p_key), '{}'::text[]), auth.uid())
    on conflict (key) do update set resolved_at = now(), versions = excluded.versions, by = excluded.by;
    perform ops.log('error.resolve', null, jsonb_build_object('key', p_key, 'message', v_message));
  else
    delete from ops.error_marks m where m.key = p_key;
    if not found then
      return 'unknown';
    end if;
    perform ops.log('error.reopen', null, jsonb_build_object('key', p_key, 'message', v_message));
  end if;
  return 'ok';
end;
$$;

-- ───────────────────────────── players ─────────────────────────────

/** Players whose name, company, email or id has the text (at least 2 characters), the last saved first (at most 25). */
create or replace function public.admin_find_players(p_query text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_query, ''));
begin
  perform ops.must_be_admin();
  if char_length(q) < 2 or char_length(q) > 100 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.last_save desc nulls last, x.created_at desc)
    from (
      select u.id, u.email, coalesce(u.is_anonymous, false) as guest, u.created_at,
             p.username, coalesce(p.banned, false) as banned, coalesce(p.listed, false) as listed,
             coalesce(g.data -> 'brand' ->> 'name', '') as company, g.updated_at as last_save
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.game_saves g on g.user_id = u.id
      where u.id::text = lower(q)
         or p.username ilike ops.like_text(q)
         or u.email ilike ops.like_text(q)
         or (g.data -> 'brand' ->> 'name') ilike ops.like_text(q)
      order by g.updated_at desc nulls last, u.created_at desc
      limit 25
    ) x
  ), '[]'::jsonb);
end;
$$;

/** Everything the dashboard shows of one player: account, profile, save, cloud backups, reports, commands and the log. */
create or replace function public.admin_player(p_user uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  u auth.users%rowtype;
  g public.game_saves%rowtype;
  v_save jsonb;
  v_home jsonb;
  v_north jsonb;
begin
  perform ops.must_be_admin();
  select * into u from auth.users x where x.id = p_user;
  if not found then
    return null;
  end if;
  select * into g from public.game_saves s where s.user_id = p_user;
  if found then
    v_home := ops.save_city(g.data, 'home');
    v_north := ops.save_city(g.data, 'north');
    v_save := jsonb_build_object(
      'revision', g.revision, 'updatedAt', g.updated_at, 'device', g.device, 'saveVersion', g.save_version,
      'app', g.data ->> 'appVersion',
      'company', coalesce(g.data -> 'brand' ->> 'name', ''),
      'activeCity', coalesce(g.data ->> 'activeCity', 'home'),
      'cash', jsonb_build_object('home', ops.save_num(v_home, 'cash'), 'north', case when v_north is null then null else ops.save_num(v_north, 'cash') end),
      'plants', jsonb_build_object('home', ops.save_plants(v_home), 'north', case when v_north is null then null else ops.save_plants(v_north) end),
      'territories', ops.save_territories(v_home),
      'earned', ops.save_earned(g.data),
      'cars', ops.save_num(g.data, 'lifetime', 'carsProduced'),
      'stars', ops.save_num(g.data, 'stars'),
      'rp', ops.save_num(g.data, 'rp'),
      'resets', ops.save_num(g.data, 'imperiumCount'),
      'racing', coalesce(g.data -> 'racing' -> 'unlocked' = 'true'::jsonb, false),
      'createdAt', ops.save_num(g.data, 'createdAt'),
      'lastActiveAt', ops.save_num(g.data, 'lastActiveAt'));
  end if;
  return jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'guest', coalesce(u.is_anonymous, false),
    'createdAt', u.created_at,
    'lastSignIn', u.last_sign_in_at,
    'profile', (select jsonb_build_object('username', p.username, 'avatar', p.avatar, 'listed', p.listed, 'banned', p.banned)
                from public.profiles p where p.id = p_user),
    'save', v_save,
    'daysPlayed30', (select count(*) from analytics.play_days d where d.user_id = p_user and d.day > (now() at time zone 'utc')::date - 30),
    'backups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'madeAt', b.made_at, 'reason', b.reason, 'device', b.device, 'saveVersion', b.save_version,
        'company', coalesce(b.data -> 'brand' ->> 'name', ''), 'cash', ops.save_num(b.data, 'cash'),
        'earned', ops.save_earned(b.data), 'plants', ops.save_plants(ops.save_home(b.data))) order by b.made_at desc, b.id desc)
      from ops.save_backups b where b.user_id = p_user
    ), '[]'::jsonb),
    'alliance', (select jsonb_build_object('name', a.name, 'tag', a.tag, 'leader', a.leader = p_user)
                 from public.alliance_members m join public.alliances a on a.id = m.alliance_id where m.user_id = p_user),
    'invites', jsonb_build_object(
      'code', (select k.code from ops.invite_codes k where k.user_id = p_user),
      'friends', (select count(*) from ops.invites i where i.inviter = p_user),
      'usedCode', exists (select 1 from ops.invites i where i.invitee = p_user)),
    'reportsAbout', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'at', r.created_at, 'reason', r.reason, 'status', r.status,
        'seen', concat_ws(' · ', r.seen_name, r.seen_company, r.seen_alliance)) order by r.created_at desc)
      from (select * from public.player_reports y where y.target = p_user order by y.created_at desc limit 10) r
    ), '[]'::jsonb),
    'reportsAboutTotal', (select count(*) from public.player_reports y where y.target = p_user),
    'reportsBy', (select count(*) from public.player_reports y where y.reporter = p_user),
    'commands', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'payload', c.payload, 'note', c.note,
        'createdAt', c.created_at, 'claimedAt', c.claimed_at, 'cancelledAt', c.cancelled_at) order by c.id desc)
      from (select * from ops.player_commands y where y.user_id = p_user order by y.id desc limit 30) c
    ), '[]'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'detail', l.detail,
        'admin', (select a.email from auth.users a where a.id = l.admin)) order by l.at desc)
      from (select * from ops.admin_log y where y.target = p_user order by y.at desc limit 30) l
    ), '[]'::jsonb)
  );
end;
$$;

/** Takes a player off the boards (they still play their own game; they can't list themselves again), or lets them back. */
create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  if p_banned is null then
    return 'invalid';
  end if;
  update public.profiles p set banned = p_banned where p.id = p_user;
  if not found then
    return 'unknown';
  end if;
  perform ops.log(case when p_banned then 'player.ban' else 'player.unban' end, p_user);
  return 'ok';
end;
$$;

/** Gives a player a name of the admin's choosing: 'ok', 'invalid' (3–20 characters), 'blocked' (the name check), 'taken' or 'unknown'. */
create or replace function public.admin_set_name(p_user uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_new text := btrim(coalesce(p_name, ''));
begin
  perform ops.must_be_admin();
  select p.username into v_old from public.profiles p where p.id = p_user;
  if v_old is null then
    return 'unknown';
  end if;
  if char_length(v_new) not between 3 and 20 or v_new ~ '[[:cntrl:]]' then
    return 'invalid';
  end if;
  begin
    update public.profiles p set username = v_new where p.id = p_user;
  exception
    when unique_violation then return 'taken';
    when check_violation then return case when sqlerrm like '%not allowed%' then 'blocked' else 'invalid' end;
  end;
  perform ops.log('player.name', p_user, jsonb_build_object('from', v_old, 'to', v_new));
  return 'ok';
end;
$$;

-- the two actions of 0010 that touch a player or a report, now in the log too

/** Marks a report: 'done' (acted on), 'dismissed' (nothing wrong) or back to 'open'. */
create or replace function public.admin_report_status(p_id bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  perform ops.must_be_admin();
  if p_status is null or p_status not in ('open', 'done', 'dismissed') then
    return 'invalid';
  end if;
  update public.player_reports r set status = p_status where r.id = p_id returning r.target into v_target;
  if not found then
    return 'unknown';
  end if;
  perform ops.log('report.' || p_status, v_target, jsonb_build_object('report', p_id));
  return 'ok';
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
  v_old text;
  v_name text;
begin
  perform ops.must_be_admin();
  select p.username into v_old from public.profiles p where p.id = p_user;
  update public.profiles
  set username = 'Player-' || substr(replace(id::text, '-', ''), 1, 12)
  where id = p_user
  returning username into v_name;
  if v_name is not null then
    perform ops.log('player.name', p_user, jsonb_build_object('from', v_old, 'to', v_name));
  end if;
  return coalesce(v_name, 'unknown');
end;
$$;

/** What the admins did, newest first (at most 200), or what they did about one player. */
create or replace function public.admin_log_list(p_user uuid default null)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'detail', l.detail, 'target', l.target,
      'admin', (select a.email from auth.users a where a.id = l.admin),
      'targetName', (select p.username from public.profiles p where p.id = l.target)) order by l.at desc, l.id desc)
    from (select * from ops.admin_log y where p_user is null or y.target = p_user order by y.at desc, y.id desc limit 200) l
  ), '[]'::jsonb);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_overview()',
    'public.admin_progress(integer)',
    'public.admin_social()',
    'public.admin_error_list(text)',
    'public.admin_error_resolve(text, boolean)',
    'public.admin_find_players(text)',
    'public.admin_player(uuid)',
    'public.admin_set_banned(uuid, boolean)',
    'public.admin_set_name(uuid, text)',
    'public.admin_report_status(bigint, text)',
    'public.admin_rename_player(uuid)',
    'public.admin_log_list(uuid)',
    'public.admin_send_command(uuid, text, jsonb, text)',
    'public.admin_cancel_command(bigint)',
    'public.admin_announcements()',
    'public.admin_post_announcement(text, jsonb, timestamptz, numeric)',
    'public.admin_cancel_announcement(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
