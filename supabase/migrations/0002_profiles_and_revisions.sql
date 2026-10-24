-- Player profiles and revisioned cloud saves.
--
-- Every write to a save gets a server timestamp and a revision number from a
-- trigger, whoever makes it. Clients save through save_game(), which only
-- writes when the save still is at the revision the client last saw: an
-- older or parallel session can never silently overwrite newer progress, it
-- gets a conflict back instead. load_game() returns the server's clock with
-- the save, so time away (offline earnings) is measured on the server.
--
-- This migration keeps the direct table writes of the previous client
-- working (the trigger stamps them too); 0003 closes them once the new
-- client is live. Checked by supabase/tests/access_rules.sql.

-- ───────────────────────────── profiles ─────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar text not null default '🧑‍🔧',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_shape check (username = btrim(username) and char_length(username) between 3 and 20 and username !~ '[[:cntrl:]]'),
  constraint profiles_avatar_shape check (char_length(avatar) between 1 and 16)
);

create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- players may change their name and avatar, nothing else; rows are created by the server
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, avatar) on public.profiles to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- a profile for every new player (guest or registered): "Player-1a2b3c4d5e6f"
create or replace function public.handle_new_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'Player-' || substr(replace(new.id::text, '-', ''), 1, 12))
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_player() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_player();

-- players who existed before profiles
insert into public.profiles (id, username)
select u.id, 'Player-' || substr(replace(u.id::text, '-', ''), 1, 12)
from auth.users u
on conflict do nothing;

-- the profile of the signed-in player, created if it is missing (a rare name clash at sign-up)
create or replace function public.ensure_profile()
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tries int := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  while not exists (select 1 from public.profiles p where p.id = uid) and tries < 5 loop
    insert into public.profiles (id, username)
    values (uid, 'Player-' || substr(md5(random()::text || uid::text), 1, 12))
    on conflict do nothing;
    tries := tries + 1;
  end loop;
  return query select * from public.profiles p where p.id = uid;
end;
$$;

revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- ───────────────────────────── saves ─────────────────────────────

alter table public.game_saves
  add column if not exists save_version integer not null default 3,
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists device text;

update public.game_saves set updated_at = saved_at where updated_at < saved_at;

alter table public.game_saves drop constraint if exists game_saves_data_is_object;
alter table public.game_saves add constraint game_saves_data_is_object check (jsonb_typeof(data) = 'object');
alter table public.game_saves drop constraint if exists game_saves_version_range;
alter table public.game_saves add constraint game_saves_version_range check (save_version between 1 and 1000);
alter table public.game_saves drop constraint if exists game_saves_revision_positive;
alter table public.game_saves add constraint game_saves_revision_positive check (revision >= 1);
alter table public.game_saves drop constraint if exists game_saves_device_length;
alter table public.game_saves add constraint game_saves_device_length check (device is null or char_length(device) <= 64);

-- every write: the server's clock, the next revision, the owner unchanged
create or replace function public.game_saves_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.saved_at := now();
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists game_saves_stamp on public.game_saves;
create trigger game_saves_stamp before insert or update on public.game_saves
  for each row execute function public.game_saves_stamp();

-- no TRUNCATE, REFERENCES or TRIGGER for API roles, and no table access before signing in
revoke all on public.game_saves from anon;
revoke truncate, references, trigger on public.game_saves from authenticated;

/**
 * Saves the signed-in player's game if the cloud copy is still at
 * p_base_revision (0: there is none yet). Returns ok, and the save's
 * revision and server time after the call: on a conflict (another session
 * saved in between, or the stored save is from a newer game version) ok is
 * false and nothing changed.
 */
create or replace function public.save_game(p_data jsonb, p_save_version integer, p_base_revision bigint, p_device text default null)
returns table (ok boolean, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  r bigint;
  t timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid save' using errcode = '22023';
  end if;
  if p_save_version is null or p_save_version < 1 or p_save_version > 1000 then
    raise exception 'invalid save version' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 4000000 then
    raise exception 'save too large' using errcode = '54000';
  end if;

  if coalesce(p_base_revision, 0) = 0 then
    insert into public.game_saves as g (user_id, data, save_version, device)
    values (uid, p_data, p_save_version, left(p_device, 64))
    on conflict (user_id) do nothing
    returning g.revision, g.updated_at into r, t;
  else
    update public.game_saves as g
    set data = p_data, save_version = p_save_version, device = left(p_device, 64)
    where g.user_id = uid and g.revision = p_base_revision and g.save_version <= p_save_version
    returning g.revision, g.updated_at into r, t;
  end if;

  if r is not null then
    return query select true, r, t;
    return;
  end if;
  select g.revision, g.updated_at into r, t from public.game_saves g where g.user_id = uid;
  return query select false, coalesce(r, 0::bigint), t;
end;
$$;

revoke all on function public.save_game(jsonb, integer, bigint, text) from public, anon;
grant execute on function public.save_game(jsonb, integer, bigint, text) to authenticated;

/** The signed-in player's save (or an empty row), with the server's clock. */
create or replace function public.load_game()
returns table (data jsonb, save_version integer, revision bigint, updated_at timestamptz, server_now timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.data, g.save_version, coalesce(g.revision, 0::bigint), g.updated_at, now()
  from (select 1) as one
  left join public.game_saves g on g.user_id = (select auth.uid());
$$;

revoke all on function public.load_game() from public, anon;
grant execute on function public.load_game() to authenticated;
