-- The global leaderboard, visits to other players' empires and daily gifts.
--
-- Every save publishes a small public card of the empire (public.empires):
-- the company's name, its plants and levels, a few totals. Nothing else of
-- a save is ever readable by another player. Totals are taken from the save
-- but can't grow faster than the game allows on the server's clock (money
-- earned at most doubles every 30 minutes, plus a floor for the first
-- hours), so a hand-edited save doesn't top the board at once.
--
-- Players read the board, visit and send gifts only through the functions
-- below; the tables themselves are closed. A player can leave the board
-- (profiles.listed = false): they are then neither listed nor visitable.
-- Checked by supabase/tests/social_rules.sql.

-- ───────────────────────────── listing ─────────────────────────────

alter table public.profiles add column if not exists listed boolean not null default true;
grant update (listed) on public.profiles to authenticated;

-- ───────────────────────────── public empire cards ─────────────────────────────

create table if not exists public.empires (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- money earned in total (lifetime, across resets), as far as it is plausible
  earned numeric not null default 0 check (earned >= 0),
  -- the week (Monday, UTC) the weekly score counts from, and the total at its start
  week_start date not null default (date_trunc('week', now()))::date,
  week_base numeric not null default 0 check (week_base >= 0),
  cars bigint not null default 0 check (cars >= 0),
  stars integer not null default 0 check (stars >= 0),
  company text not null default '' check (char_length(company) <= 40),
  -- what a visitor sees: plants and levels, districts, racing, resets (built by the server)
  card jsonb not null default '{}'::jsonb check (jsonb_typeof(card) = 'object'),
  updated_at timestamptz not null default now()
);

create index if not exists empires_earned_idx on public.empires (earned desc);

alter table public.empires enable row level security;
revoke all on public.empires from anon, authenticated;

/** A number from a save, or 0 (never an error on a malformed save). */
create or replace function public.save_number(v jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $fn$
  select case when jsonb_typeof(v) = 'number' then greatest(0, least((v #>> '{}')::numeric, 1e30)) else 0 end;
$fn$;

/** The visitor's card of an empire, from its save: fixed fields only. */
create or replace function public.empire_card(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select jsonb_build_object(
    'plants', coalesce((
      select jsonb_agg(p order by p->>'type')
      from (
        select jsonb_build_object(
          'type', left(b.value->>'type', 32),
          'level', least(15, greatest(1, floor(public.save_number(b.value->'level'))::int))
        ) as p
        from jsonb_each(case when jsonb_typeof(d->'city'->'buildings') = 'object' then d->'city'->'buildings' else '{}'::jsonb end) b
        where jsonb_typeof(b.value) = 'object' and b.value ? 'plant' and jsonb_typeof(b.value->'type') = 'string'
        limit 60
      ) plants
    ), '[]'::jsonb),
    'zones', case when jsonb_typeof(d->'city'->'zones') = 'array' then least(jsonb_array_length(d->'city'->'zones'), 20) else 0 end,
    'rep', floor(public.save_number(d->'racing'->'rep')),
    'races', floor(public.save_number(d->'racing'->'stats'->'races')),
    'wins', floor(public.save_number(d->'racing'->'stats'->'wins')),
    'resets', floor(least(public.save_number(d->'imperiumCount'), 10000))
  );
$fn$;

/** Publishes the empire's card after every save (with plausible totals). */
create or replace function public.game_saves_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  d jsonb := new.data;
  claimed numeric := public.save_number(d->'lifetime'->'moneyEarned');
  claimed_cars numeric := public.save_number(d->'lifetime'->'carsProduced');
  prev public.empires%rowtype;
  wk date := (date_trunc('week', now()))::date;
  elapsed numeric;
  v_earned numeric;
  v_cars numeric;
begin
  select * into prev from public.empires e where e.user_id = new.user_id;
  if not found then
    -- a first card: no history to measure against, so a modest start
    v_earned := least(claimed, 1e7);
    v_cars := least(claimed_cars, 5000);
    insert into public.empires (user_id, earned, week_start, week_base, cars, stars, company, card, updated_at)
    values (new.user_id, v_earned, wk, v_earned, v_cars, least(public.save_number(d->'stars'), 1000)::int,
            left(coalesce(d->'brand'->>'name', ''), 40), public.empire_card(d), now());
    return new;
  end if;
  elapsed := greatest(0, extract(epoch from now() - prev.updated_at));
  -- at most doubling every 30 minutes on the server's clock (+ $20K/s and $1M for the early game); never lower
  v_earned := greatest(prev.earned, least(claimed, prev.earned * power(2::numeric, least(elapsed / 1800, 40)) + 2e4 * elapsed + 1e6));
  v_cars := greatest(prev.cars, least(claimed_cars, prev.cars + 20 * elapsed + 1000));
  update public.empires e set
    earned = v_earned,
    week_base = case when e.week_start <> wk then prev.earned else e.week_base end,
    week_start = wk,
    cars = v_cars,
    stars = least(public.save_number(d->'stars'), 1000)::int,
    company = left(coalesce(d->'brand'->>'name', ''), 40),
    card = public.empire_card(d),
    updated_at = now()
  where e.user_id = new.user_id;
  return new;
end;
$fn$;

create or replace trigger game_saves_publish after insert or update of data on public.game_saves
  for each row execute function public.game_saves_publish();

/** A save deleted: its card goes too (the player has no game to show). */
create or replace function public.game_saves_unpublish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from public.empires e where e.user_id = old.user_id;
  return old;
end;
$fn$;

create or replace trigger game_saves_unpublish after delete on public.game_saves
  for each row execute function public.game_saves_unpublish();

revoke all on function public.game_saves_publish() from public, anon, authenticated;
revoke all on function public.save_number(jsonb) from public, anon, authenticated;
revoke all on function public.empire_card(jsonb) from public, anon, authenticated;
revoke all on function public.game_saves_unpublish() from public, anon, authenticated;

-- ───────────────────────────── the board ─────────────────────────────

/**
 * The top 50 listed players, "all" by money earned in total or "week" by
 * money earned since Monday (UTC), with the caller's own row added when they
 * are not among them.
 */
create or replace function public.leaderboard(p_kind text)
returns table (rank bigint, user_id uuid, username text, avatar text, company text, value numeric, me boolean)
language sql
stable
security definer
set search_path = ''
as $fn$
  with scored as (
    select e.user_id, p.username, p.avatar, e.company,
      case when p_kind = 'week'
        then case when e.week_start = (date_trunc('week', now()))::date then e.earned - e.week_base else 0 end
        else e.earned end as value
    from public.empires e
    join public.profiles p on p.id = e.user_id
    where p.listed or e.user_id = (select auth.uid())
  ), ranked as (
    select rank() over (order by s.value desc) as rank, s.* from scored s
  )
  select r.rank, r.user_id, r.username, r.avatar, r.company, r.value, r.user_id = (select auth.uid()) as me
  from ranked r
  where (select auth.uid()) is not null and (r.rank <= 50 or r.user_id = (select auth.uid()))
  order by r.rank, r.username
  limit 51;
$fn$;

/** Another player's empire card (only a listed player's, or one's own). */
create or replace function public.visit_empire(p_user uuid)
returns table (user_id uuid, username text, avatar text, company text, earned numeric, cars bigint, stars integer, card jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select e.user_id, p.username, p.avatar, e.company, e.earned, e.cars, e.stars, e.card, e.updated_at
  from public.empires e
  join public.profiles p on p.id = e.user_id
  where (select auth.uid()) is not null and e.user_id = p_user and (p.listed or p_user = (select auth.uid()));
$fn$;

-- ───────────────────────────── gifts ─────────────────────────────

create table if not exists public.gifts (
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day),
  check (from_user <> to_user)
);

create index if not exists gifts_to_user_idx on public.gifts (to_user) where not claimed;
create index if not exists gifts_to_user_day_idx on public.gifts (to_user, day);

alter table public.gifts enable row level security;
revoke all on public.gifts from anon, authenticated;

/** Players a player may gift each day (UTC). */
create or replace function public.gifts_per_day()
returns integer
language sql
immutable
set search_path = ''
as $fn$ select 5 $fn$;

/** Gifts a player may receive each day (UTC): spare accounts can't feed one player without end. */
create or replace function public.gifts_received_per_day()
returns integer
language sql
immutable
set search_path = ''
as $fn$ select 20 $fn$;

/**
 * Sends a gift to a listed player: one per day to the same player, a few a
 * day in all, and a player receives at most so many a day. Returns 'sent',
 * 'already' (this player today), 'limit' (the day's gifts are spent), 'full'
 * (the player got all they may today), 'self' or 'unknown' (no such listed player).
 */
create or replace function public.send_gift(p_to uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  n integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_to = uid then
    return 'self';
  end if;
  if not exists (select 1 from public.profiles p join public.empires e on e.user_id = p.id where p.id = p_to and p.listed) then
    return 'unknown';
  end if;
  if exists (select 1 from public.gifts g where g.from_user = uid and g.to_user = p_to and g.day = today) then
    return 'already';
  end if;
  select count(*) into n from public.gifts g where g.from_user = uid and g.day = today;
  if n >= public.gifts_per_day() then
    return 'limit';
  end if;
  select count(*) into n from public.gifts g where g.to_user = p_to and g.day = today;
  if n >= public.gifts_received_per_day() then
    return 'full';
  end if;
  insert into public.gifts (from_user, to_user, day) values (uid, p_to, today) on conflict do nothing;
  return 'sent';
end;
$fn$;

/** The gifts waiting for the caller: marked claimed, and how many there were. */
create or replace function public.claim_gifts()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  with c as (
    update public.gifts g set claimed = true where g.to_user = auth.uid() and not g.claimed returning 1
  ) select count(*) into n from c;
  return n;
end;
$fn$;

/** How many gifts the caller has sent today (to show what is left). */
create or replace function public.gifts_sent_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::int from public.gifts g where g.from_user = (select auth.uid()) and g.day = (now() at time zone 'utc')::date;
$fn$;

revoke all on function public.leaderboard(text) from public, anon;
revoke all on function public.visit_empire(uuid) from public, anon;
revoke all on function public.send_gift(uuid) from public, anon;
revoke all on function public.claim_gifts() from public, anon;
revoke all on function public.gifts_sent_today() from public, anon;
grant execute on function public.leaderboard(text) to authenticated;
grant execute on function public.visit_empire(uuid) to authenticated;
grant execute on function public.send_gift(uuid) to authenticated;
grant execute on function public.claim_gifts() to authenticated;
grant execute on function public.gifts_sent_today() to authenticated;

-- players who saved before this migration get their card at their next save
