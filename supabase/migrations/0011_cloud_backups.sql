-- Cloud backups: older copies of each player's save, kept by the server, so a player can go back
-- to one from the Profile (a save broken by a bug, a choice they regret, a lost phone's progress
-- overwritten by an old one).
--
-- Every time a save is written, the copy it replaces is kept when the newest automatic backup
-- is more than 3 hours old, and always when the new save has less than half the money the
-- old one had earned (a game that lost most of its progress). Restoring one keeps the save it
-- replaces too. Each player has 12 places for backups: a new one takes the oldest one's place.
-- They go with the account when it is deleted.
--
-- The table is in the ops schema, which the API does not expose: a player sees and opens only
-- their own backups, through the two functions below, and nobody can write one by hand.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.save_backups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- one of the player's 12 places (0–11): a new backup takes a free one, or the oldest one's
  slot smallint not null check (slot >= 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  save_version integer not null,
  revision bigint not null,
  device text,
  -- auto: every few hours; drop: before a save with much less progress; restore: before a restore
  reason text not null check (reason in ('auto', 'drop', 'restore')),
  made_at timestamptz not null default now()
);
-- (the first version of this table had no places; it was empty when they came)
alter table ops.save_backups add column if not exists slot smallint not null check (slot >= 0);
create index if not exists save_backups_user_made on ops.save_backups (user_id, made_at desc, id desc);
create unique index if not exists save_backups_user_slot on ops.save_backups (user_id, slot);
alter table ops.save_backups enable row level security;
revoke all on ops.save_backups from public, anon, authenticated;

/** How many backups a player keeps, and how far apart the automatic ones are. */
create or replace function ops.backup_keep() returns integer language sql immutable set search_path = '' as $$ select 12 $$;
create or replace function ops.backup_every() returns interval language sql immutable set search_path = '' as $$ select interval '3 hours' $$;
revoke all on function ops.backup_keep() from public, anon, authenticated;
revoke all on function ops.backup_every() from public, anon, authenticated;

/** The money a saved game has earned in all (0 when the save doesn't say). */
create or replace function ops.save_earned(d jsonb) returns numeric
language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(d -> 'lifetime' -> 'moneyEarned') = 'number' then (d -> 'lifetime' ->> 'moneyEarned')::numeric else 0 end
$$;
revoke all on function ops.save_earned(jsonb) from public, anon, authenticated;

/**
 * Keeps a copy of a save as a backup: in a free place of the player's 12, else in the oldest
 * backup's place (never p_spare's, the one being restored). A backup that takes a place gets a
 * new id, so an id names one backup only.
 */
create or replace function ops.keep_backup(p_user uuid, p_data jsonb, p_version integer, p_revision bigint, p_device text, p_reason text, p_spare bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  place smallint;
begin
  select s into place from generate_series(0, ops.backup_keep() - 1) s
  where not exists (select 1 from ops.save_backups b where b.user_id = p_user and b.slot = s)
  order by s limit 1;
  if place is null then
    select b.slot into place from ops.save_backups b
    where b.user_id = p_user and b.id is distinct from p_spare
    order by b.made_at, b.id limit 1;
  end if;
  insert into ops.save_backups as t (user_id, slot, data, save_version, revision, device, reason, made_at)
  values (p_user, place, p_data, p_version, p_revision, left(p_device, 64), p_reason, now())
  on conflict (user_id, slot) do update
    set id = default, data = excluded.data, save_version = excluded.save_version, revision = excluded.revision,
        device = excluded.device, reason = excluded.reason, made_at = excluded.made_at;
end;
$$;
revoke all on function ops.keep_backup(uuid, jsonb, integer, bigint, text, text, bigint) from public, anon, authenticated;

-- After every write of a save: the copy it replaced, when it is time for one. A backup that
-- can't be made never stops the save (it is logged and skipped).
create or replace function public.game_saves_backup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_auto timestamptz;
  reason text;
begin
  begin
    select max(b.made_at) into last_auto from ops.save_backups b where b.user_id = old.user_id and b.reason = 'auto';
    if last_auto is null or last_auto < now() - ops.backup_every() then
      reason := 'auto';
    elsif ops.save_earned(old.data) > 0 and ops.save_earned(new.data) < ops.save_earned(old.data) / 2 then
      reason := 'drop';
    end if;
    if reason is not null then
      perform ops.keep_backup(old.user_id, old.data, old.save_version, old.revision, old.device, reason);
    end if;
  exception when others then
    raise warning 'save backup skipped for %: %', old.user_id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.game_saves_backup() from public, anon, authenticated;

create or replace trigger game_saves_backup after update of data on public.game_saves
  for each row when (old.data is distinct from new.data)
  execute function public.game_saves_backup();

/**
 * The signed-in player's backups, newest first, with what the Profile shows of each
 * (company, cash, money earned, cars made, factories, when it was last played) and the save
 * format (a game too old to read a backup made by a newer version doesn't offer it).
 */
create or replace function public.list_my_backups()
returns table (id bigint, made_at timestamptz, reason text, device text, save_version integer, company text, cash double precision, earned double precision, cars double precision, plants integer, last_played double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.made_at,
    b.reason,
    b.device,
    b.save_version,
    coalesce(b.data -> 'brand' ->> 'name', ''),
    case when jsonb_typeof(b.data -> 'cash') = 'number' then (b.data ->> 'cash')::double precision else 0 end,
    ops.save_earned(b.data)::double precision,
    case when jsonb_typeof(b.data -> 'lifetime' -> 'carsProduced') = 'number' then (b.data -> 'lifetime' ->> 'carsProduced')::double precision else 0 end,
    (select count(*)::integer
       from jsonb_each(case when jsonb_typeof(b.data -> 'city' -> 'buildings') = 'object' then b.data -> 'city' -> 'buildings' else '{}'::jsonb end) e
       where jsonb_typeof(e.value -> 'plant') = 'object'),
    case when jsonb_typeof(b.data -> 'lastActiveAt') = 'number' then (b.data ->> 'lastActiveAt')::double precision else 0 end
  from ops.save_backups b
  where b.user_id = (select auth.uid())
  order by b.made_at desc, b.id desc
$$;
revoke all on function public.list_my_backups() from public, anon;
grant execute on function public.list_my_backups() to authenticated;

/**
 * One of the signed-in player's backups, to play again: the game then saves it as the account's
 * save (through save_game, which checks the revision as always). The save it is about to replace
 * is kept as a backup first, so a restore can be undone the same way. Nothing for another
 * player's backup, or one that is gone.
 */
create or replace function public.take_my_backup(p_id bigint)
returns table (data jsonb, save_version integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  b ops.save_backups%rowtype;
  s public.game_saves%rowtype;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into b from ops.save_backups k where k.id = p_id and k.user_id = uid;
  if not found then
    return;
  end if;
  select * into s from public.game_saves g where g.user_id = uid;
  if found then
    perform ops.keep_backup(uid, s.data, s.save_version, s.revision, s.device, 'restore', b.id);
  end if;
  return query select b.data, b.save_version;
end;
$$;
revoke all on function public.take_my_backup(bigint) from public, anon;
grant execute on function public.take_my_backup(bigint) to authenticated;
