-- Ghost races and alliances.
--
-- Ghosts: a player publishes their best race car (model, colours and
-- performance figures, kept in range here) on their empire card; a visitor
-- can race it one against one. The race itself runs in the visitor's game
-- and pays only them, so nothing about it is stored here.
--
-- Alliances: up to 20 players with a shared weekly goal. Each member brings
-- points for their own growth this week (money earned since Monday, in % of
-- the week's start, at most 100 each), so small and big empires count alike;
-- the alliance's points open three reward tiers. The server says who may
-- claim a tier: a member for at least a day, once per tier and week whatever
-- alliance they are in. Tables are closed; everything goes through the
-- functions below. Checked by supabase/tests/alliance_rules.sql.

-- ───────────────────────────── ghosts ─────────────────────────────

alter table public.empires add column if not exists ghost jsonb check (ghost is null or jsonb_typeof(ghost) = 'object');

/** Publishes (or with null, withdraws) the caller's ghost: fixed fields only, numbers in range. */
create or replace function public.publish_ghost(p_ghost jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  st jsonb;
  stats jsonb := '{}'::jsonb;
  k text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_ghost is null or jsonb_typeof(p_ghost) <> 'object' then
    update public.empires e set ghost = null where e.user_id = uid;
    return found;
  end if;
  if coalesce(p_ghost->>'model', '') !~ '^[a-zA-Z]{1,16}$' then
    raise exception 'invalid ghost' using errcode = '22023';
  end if;
  st := case when jsonb_typeof(p_ghost->'stats') = 'object' then p_ghost->'stats' else '{}'::jsonb end;
  foreach k in array array['speed', 'accel', 'handling', 'braking', 'aero', 'reliability'] loop
    stats := stats || jsonb_build_object(k, least(100, public.save_number(st->k)));
  end loop;
  stats := stats || jsonb_build_object('hp', least(5000, public.save_number(st->'hp')), 'weight', greatest(300, least(5000, public.save_number(st->'weight'))));
  update public.empires e set ghost = jsonb_build_object(
    'model', p_ghost->>'model',
    'color', case when coalesce(p_ghost->>'color', '') ~ '^#[0-9a-fA-F]{6}$' then p_ghost->>'color' else '#ffffff' end,
    'accent', case when coalesce(p_ghost->>'accent', '') ~ '^#[0-9a-fA-F]{6}$' then p_ghost->>'accent' else '#111827' end,
    'stats', stats
  ) where e.user_id = uid;
  return found;
end;
$fn$;

/** A listed player's card (or one's own), now with their ghost. */
create or replace function public.visit_empire(p_user uuid)
returns table (user_id uuid, username text, avatar text, company text, earned numeric, cars bigint, stars integer, card jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select e.user_id, p.username, p.avatar, e.company, e.earned, e.cars, e.stars, e.card || jsonb_build_object('ghost', e.ghost), e.updated_at
  from public.empires e
  join public.profiles p on p.id = e.user_id
  where (select auth.uid()) is not null and e.user_id = p_user and (p.listed or p_user = (select auth.uid()));
$fn$;

-- ───────────────────────────── alliances ─────────────────────────────

create table if not exists public.alliances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 24 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  tag text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  emblem text not null check (char_length(emblem) between 1 and 8),
  leader uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists alliances_name_key on public.alliances (lower(name));
create unique index if not exists alliances_tag_key on public.alliances (tag);

create table if not exists public.alliance_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists alliance_members_alliance_idx on public.alliance_members (alliance_id);

create table if not exists public.alliance_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  tier integer not null check (tier between 1 and 3),
  alliance_id uuid,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week, tier)
);

alter table public.alliances enable row level security;
alter table public.alliance_members enable row level security;
alter table public.alliance_claims enable row level security;
revoke all on public.alliances, public.alliance_members, public.alliance_claims from anon, authenticated;

/** Members an alliance may have. */
create or replace function public.alliance_size()
returns integer
language sql
immutable
set search_path = ''
as $fn$ select 20 $fn$;

/** Points the alliance needs this week for reward tiers 1, 2 and 3. */
create or replace function public.alliance_tiers()
returns integer[]
language sql
immutable
set search_path = ''
as $fn$ select array[100, 250, 500] $fn$;

/** A player's points this week: growth since Monday (UTC) in % of the week's start (at least $1M), 0–100. */
create or replace function public.member_points(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select least(100, greatest(0, floor((e.earned - e.week_base) / greatest(e.week_base, 1e6) * 100)))
    from public.empires e
    where e.user_id = p_user and e.week_start = (date_trunc('week', now()))::date
  ), 0);
$fn$;

create or replace function public.alliance_points(p_alliance uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(sum(public.member_points(m.user_id)), 0) from public.alliance_members m where m.alliance_id = p_alliance;
$fn$;

revoke all on function public.member_points(uuid) from public, anon, authenticated;
revoke all on function public.alliance_points(uuid) from public, anon, authenticated;

/** Founds an alliance (the caller leads it). 'ok', 'member' (already in one), 'invalid', 'name' or 'tag' (taken). */
create or replace function public.create_alliance(p_name text, p_tag text, p_emblem text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_tag text := upper(btrim(coalesce(p_tag, '')));
  v_emblem text := btrim(coalesce(p_emblem, ''));
  aid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.alliance_members m where m.user_id = uid) then
    return 'member';
  end if;
  if char_length(v_name) not between 3 and 24 or v_name ~ '[[:cntrl:]]' or v_tag !~ '^[A-Z0-9]{2,4}$' or char_length(v_emblem) not between 1 and 8 then
    return 'invalid';
  end if;
  if exists (select 1 from public.alliances a where lower(a.name) = lower(v_name)) then
    return 'name';
  end if;
  if exists (select 1 from public.alliances a where a.tag = v_tag) then
    return 'tag';
  end if;
  insert into public.alliances (name, tag, emblem, leader) values (v_name, v_tag, v_emblem, uid) returning id into aid;
  insert into public.alliance_members (user_id, alliance_id) values (uid, aid);
  return 'ok';
exception when unique_violation then
  return 'name';
end;
$fn$;

/** Joins an alliance. 'ok', 'member' (already in one), 'full' or 'unknown'. */
create or replace function public.join_alliance(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.alliance_members m where m.user_id = uid) then
    return 'member';
  end if;
  -- one join at a time per alliance, so it never goes past its size
  perform 1 from public.alliances a where a.id = p_id for update;
  if not found then
    return 'unknown';
  end if;
  if (select count(*) from public.alliance_members m where m.alliance_id = p_id) >= public.alliance_size() then
    return 'full';
  end if;
  insert into public.alliance_members (user_id, alliance_id) values (uid, p_id);
  return 'ok';
exception when unique_violation then
  return 'member';
end;
$fn$;

/** Leaves the alliance; the longest-standing member leads next, an empty alliance is closed. 'ok' or 'none'. */
create or replace function public.leave_alliance()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  aid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.alliance_members m where m.user_id = uid returning m.alliance_id into aid;
  if aid is null then
    return 'none';
  end if;
  if not exists (select 1 from public.alliance_members m where m.alliance_id = aid) then
    delete from public.alliances a where a.id = aid;
  else
    update public.alliances a
    set leader = (select m.user_id from public.alliance_members m where m.alliance_id = aid order by m.joined_at, m.user_id limit 1)
    where a.id = aid and (a.leader is null or a.leader = uid);
  end if;
  return 'ok';
end;
$fn$;

/** The leader removes a member. 'ok', 'leader' (the caller doesn't lead) or 'unknown'. */
create or replace function public.kick_member(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  aid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select a.id into aid from public.alliances a join public.alliance_members m on m.alliance_id = a.id where m.user_id = uid and a.leader = uid;
  if aid is null then
    return 'leader';
  end if;
  if p_user = uid then
    return 'unknown';
  end if;
  delete from public.alliance_members m where m.user_id = p_user and m.alliance_id = aid;
  return case when found then 'ok' else 'unknown' end;
end;
$fn$;

/** Alliances to join: the strongest this week, or those whose name or tag contains the search. */
create or replace function public.list_alliances(p_search text default null)
returns table (id uuid, name text, tag text, emblem text, members integer, points numeric, mine boolean)
language sql
stable
security definer
set search_path = ''
as $fn$
  select a.id, a.name, a.tag, a.emblem,
    (select count(*)::int from public.alliance_members m where m.alliance_id = a.id),
    public.alliance_points(a.id),
    exists (select 1 from public.alliance_members m where m.alliance_id = a.id and m.user_id = (select auth.uid()))
  from public.alliances a
  where (select auth.uid()) is not null
    and (coalesce(btrim(p_search), '') = '' or position(lower(btrim(p_search)) in lower(a.name)) > 0 or position(upper(btrim(p_search)) in a.tag) > 0)
  order by 6 desc, a.created_at
  limit 30;
$fn$;

/** The caller's alliance: members and their points, the week's goal and the tiers they took (null: none). */
create or replace function public.my_alliance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  wk date := (date_trunc('week', now()))::date;
  a public.alliances%rowtype;
  joined timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select al.*, m.joined_at into a.id, a.name, a.tag, a.emblem, a.leader, a.created_at, joined
  from public.alliance_members m join public.alliances al on al.id = m.alliance_id where m.user_id = uid;
  if a.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', a.id, 'name', a.name, 'tag', a.tag, 'emblem', a.emblem,
    'leader', a.leader = uid,
    'size', public.alliance_size(),
    'week', wk,
    'points', public.alliance_points(a.id),
    'tiers', to_jsonb(public.alliance_tiers()),
    'claimed', coalesce((select jsonb_agg(c.tier order by c.tier) from public.alliance_claims c where c.user_id = uid and c.week = wk), '[]'::jsonb),
    'claimFrom', joined + interval '1 day',
    'serverNow', now(),
    'members', (
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', p.username, 'avatar', p.avatar, 'points', public.member_points(m.user_id), 'leader', m.user_id = a.leader, 'me', m.user_id = uid)
        order by public.member_points(m.user_id) desc, m.joined_at)
      from public.alliance_members m join public.profiles p on p.id = m.user_id
      where m.alliance_id = a.id
    )
  );
end;
$fn$;

/**
 * Takes a reward tier of this week's goal. 'ok', 'none' (in no alliance),
 * 'new' (a member for less than a day), 'short' (the alliance hasn't the
 * points), 'claimed' (this week already, in any alliance) or 'invalid'.
 */
create or replace function public.claim_alliance_tier(p_tier integer)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  wk date := (date_trunc('week', now()))::date;
  aid uuid;
  joined timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_tier is null or p_tier not between 1 and 3 then
    return 'invalid';
  end if;
  select m.alliance_id, m.joined_at into aid, joined from public.alliance_members m where m.user_id = uid;
  if aid is null then
    return 'none';
  end if;
  if joined > now() - interval '1 day' then
    return 'new';
  end if;
  if exists (select 1 from public.alliance_claims c where c.user_id = uid and c.week = wk and c.tier = p_tier) then
    return 'claimed';
  end if;
  if public.alliance_points(aid) < (public.alliance_tiers())[p_tier] then
    return 'short';
  end if;
  insert into public.alliance_claims (user_id, week, tier, alliance_id) values (uid, wk, p_tier, aid);
  return 'ok';
exception when unique_violation then
  return 'claimed';
end;
$fn$;

revoke all on function public.publish_ghost(jsonb) from public, anon;
revoke all on function public.create_alliance(text, text, text) from public, anon;
revoke all on function public.join_alliance(uuid) from public, anon;
revoke all on function public.leave_alliance() from public, anon;
revoke all on function public.kick_member(uuid) from public, anon;
revoke all on function public.list_alliances(text) from public, anon;
revoke all on function public.my_alliance() from public, anon;
revoke all on function public.claim_alliance_tier(integer) from public, anon;
grant execute on function public.publish_ghost(jsonb) to authenticated;
grant execute on function public.create_alliance(text, text, text) to authenticated;
grant execute on function public.join_alliance(uuid) to authenticated;
grant execute on function public.leave_alliance() to authenticated;
grant execute on function public.kick_member(uuid) to authenticated;
grant execute on function public.list_alliances(text) to authenticated;
grant execute on function public.my_alliance() to authenticated;
grant execute on function public.claim_alliance_tier(integer) to authenticated;
