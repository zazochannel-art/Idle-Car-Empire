-- Player safety: what one player writes and others see (player names, company
-- names, alliance names and tags) follows the game's terms of use
-- (site/terms/), as Google Play's rules for content made by users ask.
--
-- 1. Names are checked against a list of slurs, obscenities and staff
--    impersonation, the same the game checks before sending
--    (src/game/engine/names.ts; names.test.ts keeps the two equal). A player
--    name that fails is refused; a company name that fails is not shown.
-- 2. Players report a player (name, company name, cheating, other) or an
--    alliance from the game. Reports are only readable by the developer
--    (Supabase dashboard → Table editor → player_reports; docs/moderation.md).
-- 3. The developer can ban a player (profiles.banned): they are then off the
--    leaderboards and can't be visited, and can't list themselves again.
-- Hiding a player is done in the game, on the player's own device and save.
-- Checked by scripts/cloud-e2e.mjs.

-- ───────────────────────────── the name check ─────────────────────────────

/** A name folded for the checks: lower case, diacritics off, look-alike digits and symbols as letters. */
create or replace function public.name_fold(p text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select translate(lower(coalesce(p, '')), 'ăâîșşțţéèêëáàäåíìïóòöôõúùüûñçýÿёй013457@$!8', 'aaisstteeeeaaaaiiiooooouuuuncyyеиoieastasib');
$fn$;

/** Never inside a name, wherever they stand (the name's letters run together). */
create or replace function public.name_parts()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['fuck', 'motherf', 'shit', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'asshole', 'dickhead', 'retard', 'pussy', 'penis', 'vagina', 'porn', 'hitler', 'rapist', 'wanker', 'twat', 'jizz', 'bollock', 'kkk', 'pizd', 'cacat', 'labagiu', 'bulangiu', 'poponar', 'sugipula', 'хуи', 'хуе', 'хуя', 'хую', 'пизд', 'ебат', 'ебан', 'ебал', 'ебло', 'ебну', 'уеб', 'заеб', 'выеб', 'въеб', 'бля', 'сука', 'мудак', 'мудил', 'пидор', 'пидар', 'пидр', 'гандон', 'шлюх', 'залуп', 'дроч', 'гитлер', 'нацист', 'blyat', 'blyad', 'eblan', 'mudak', 'pidor', 'pidar', 'gandon'];
$fn$;

/** Never a whole word of a name. */
create or replace function public.name_words()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['ass', 'cunt', 'dick', 'cock', 'fag', 'rape', 'cum', 'nazi', 'nazis', 'sex', 'anal', 'anus', 'tits', 'boobs', 'kike', 'spic', 'chink', 'gook', 'tranny', 'wank', 'pula', 'pule', 'curva', 'muie', 'javra', 'tigan', 'tigani', 'bozgor', 'futu', 'futut', 'fututi', 'jidan', 'жид', 'жиды', 'хохол', 'чурка', 'чурки', 'суки', 'хер', 'suka', 'ebat', 'suki', 'huy', 'huj', 'xuy', 'blya', 'admin', 'administrator', 'moderator', 'администратор', 'модератор'];
$fn$;

/** True when the name has no word or part from the lists. */
create or replace function public.name_is_clean(p text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select not exists (
      select 1 from unnest(public.name_parts()) w
      where position(w in regexp_replace(public.name_fold(p), '[^a-zа-я]', '', 'g')) > 0
    )
    and not (regexp_split_to_array(public.name_fold(p), '[^a-zа-я]+') && public.name_words());
$fn$;

-- ───────────────────────────── player names ─────────────────────────────

-- set by the developer only (players may update their name, avatar and listing, nothing else)
alter table public.profiles add column if not exists banned boolean not null default false;

/** A name that fails the check is refused (the game says so); a banned player stays off the boards. */
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.banned then
    new.listed := false;
  end if;
  -- the names the server gives ("Player-1a2b3c4d5e6f") are never checked
  if (tg_op = 'INSERT' or new.username is distinct from old.username)
     and new.username !~ '^Player-[0-9a-f]{12}$'
     and not public.name_is_clean(new.username) then
    raise exception 'name not allowed' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create or replace trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ───────────────────────────── company names ─────────────────────────────

/** The company's name comes from the save at every save: one that fails the check is not shown. */
create or replace function public.empires_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if not public.name_is_clean(new.company) then
    new.company := '';
  end if;
  return new;
end;
$fn$;

create or replace trigger empires_guard before insert or update of company on public.empires
  for each row execute function public.empires_guard();

-- ───────────────────────────── alliances ─────────────────────────────

/** Founds an alliance (the caller leads it). 'ok', 'member' (already in one), 'invalid', 'blocked' (name or tag not allowed), 'name' or 'tag' (taken). */
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
  if not public.name_is_clean(v_name) or not public.name_is_clean(v_tag) then
    return 'blocked';
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

-- ───────────────────────────── reports ─────────────────────────────

create table if not exists public.player_reports (
  id bigint generated always as identity primary key,
  reporter uuid references auth.users (id) on delete set null,
  -- the player reported (an alliance's report names its leader too)
  target uuid references auth.users (id) on delete cascade,
  alliance uuid references public.alliances (id) on delete cascade,
  reason text not null check (reason in ('name', 'company', 'alliance', 'cheating', 'other')),
  -- what the reporter saw, kept as it was (names can change)
  seen_name text,
  seen_company text,
  seen_alliance text,
  -- the developer's handling: open → done (acted on) or dismissed
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint player_reports_about check (target is not null or alliance is not null)
);

create index if not exists player_reports_open_idx on public.player_reports (created_at desc) where status = 'open';
create index if not exists player_reports_reporter_idx on public.player_reports (reporter, created_at);

-- written only through the functions below, read only by the developer
alter table public.player_reports enable row level security;
revoke all on public.player_reports from anon, authenticated;

/** Reports a player. 'ok' (also when the same report was made today), 'self', 'unknown', 'limit' (20 a day) or 'invalid'. */
create or replace function public.report_player(p_user uuid, p_reason text)
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
  if p_reason is null or p_reason not in ('name', 'company', 'cheating', 'other') then
    return 'invalid';
  end if;
  if p_user = uid then
    return 'self';
  end if;
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return 'unknown';
  end if;
  if exists (select 1 from public.player_reports r where r.reporter = uid and r.target = p_user and r.reason = p_reason and r.created_at > now() - interval '1 day') then
    return 'ok';
  end if;
  if (select count(*) from public.player_reports r where r.reporter = uid and r.created_at > now() - interval '1 day') >= 20 then
    return 'limit';
  end if;
  insert into public.player_reports (reporter, target, reason, seen_name, seen_company)
  select uid, p.id, p_reason, p.username, e.company
  from public.profiles p
  left join public.empires e on e.user_id = p.id
  where p.id = p_user;
  return 'ok';
end;
$fn$;

/** Reports an alliance's name or tag. 'ok' (also when made today already), 'unknown' or 'limit'. */
create or replace function public.report_alliance(p_alliance uuid)
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
  if p_alliance is null or not exists (select 1 from public.alliances a where a.id = p_alliance) then
    return 'unknown';
  end if;
  if exists (select 1 from public.player_reports r where r.reporter = uid and r.alliance = p_alliance and r.created_at > now() - interval '1 day') then
    return 'ok';
  end if;
  if (select count(*) from public.player_reports r where r.reporter = uid and r.created_at > now() - interval '1 day') >= 20 then
    return 'limit';
  end if;
  insert into public.player_reports (reporter, target, alliance, reason, seen_alliance)
  select uid, a.leader, a.id, 'alliance', a.name || ' [' || a.tag || ']'
  from public.alliances a
  where a.id = p_alliance;
  return 'ok';
end;
$fn$;

revoke all on function public.report_player(uuid, text) from public, anon;
grant execute on function public.report_player(uuid, text) to authenticated;
revoke all on function public.report_alliance(uuid) from public, anon;
grant execute on function public.report_alliance(uuid) to authenticated;
