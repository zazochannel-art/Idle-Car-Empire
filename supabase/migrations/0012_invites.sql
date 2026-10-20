-- Invite codes: each player has a short code to give friends. A new player (in their account's
-- first 7 days) can enter one friend's code once: they get a welcome gift at once, and the friend
-- gets a reward when the new player builds their first car (read from the new player's own save,
-- on the server), for up to 10 friends. The rewards themselves are paid by the game
-- (src/game/engine/invites.ts); the server only says how many are due, each counted once.
--
-- Codes and invites are in the ops schema, which the API does not expose: a player reaches them
-- only through the three functions below, which never show who else used a code.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.invite_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 6 letters and digits, without the ones that look alike (I, O, 0, 1)
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  made_at timestamptz not null default now()
);
alter table ops.invite_codes enable row level security;
revoke all on ops.invite_codes from public, anon, authenticated;

create table if not exists ops.invites (
  -- one code per new player, ever
  invitee uuid primary key references auth.users (id) on delete cascade,
  -- the friend whose code it was (null once their account is gone; the new player still used one)
  inviter uuid references auth.users (id) on delete set null,
  made_at timestamptz not null default now(),
  -- when the friend took their reward for this one
  rewarded_at timestamptz
);
create index if not exists invites_inviter on ops.invites (inviter);
alter table ops.invites enable row level security;
revoke all on ops.invites from public, anon, authenticated;

/** How many friends' first cars reward a player, how many players one code takes, and the window to use one. */
create or replace function ops.invite_rewarded_max() returns integer language sql immutable set search_path = '' as $$ select 10 $$;
create or replace function ops.invite_uses_max() returns integer language sql immutable set search_path = '' as $$ select 50 $$;
create or replace function ops.invite_window() returns interval language sql immutable set search_path = '' as $$ select interval '7 days' $$;
revoke all on function ops.invite_rewarded_max() from public, anon, authenticated;
revoke all on function ops.invite_uses_max() from public, anon, authenticated;
revoke all on function ops.invite_window() from public, anon, authenticated;

/** A player's code, made the first time it is asked for. */
create or replace function ops.invite_code_of(p_user uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c text;
  letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select k.code into c from ops.invite_codes k where k.user_id = p_user;
  if c is not null then
    return c;
  end if;
  for attempt in 1..10 loop
    c := (select string_agg(substr(letters, 1 + floor(random() * length(letters))::integer, 1), '') from generate_series(1, 6));
    insert into ops.invite_codes (user_id, code) values (p_user, c) on conflict do nothing;
    select k.code into c from ops.invite_codes k where k.user_id = p_user;
    if c is not null then
      return c;
    end if;
  end loop;
  raise exception 'no free invite code' using errcode = '23505';
end;
$$;
revoke all on function ops.invite_code_of(uuid) from public, anon, authenticated;

/** The friends of p_user whose first car is built and who haven't rewarded them yet. */
create or replace function ops.invites_due(p_user uuid) returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.invitee
  from ops.invites i
  join public.game_saves g on g.user_id = i.invitee
  where i.inviter = p_user
    and i.rewarded_at is null
    and jsonb_typeof(g.data -> 'lifetime' -> 'carsProduced') = 'number'
    and (g.data -> 'lifetime' ->> 'carsProduced')::numeric >= 1
$$;
revoke all on function ops.invites_due(uuid) from public, anon, authenticated;

/**
 * The signed-in player's invites: their code, how many friends used it, how many rewards are
 * due (friends with their first car, within the limit) and taken, and whether they can still
 * use a friend's code themselves.
 */
create or replace function public.my_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  taken integer;
  due integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select count(*) into taken from ops.invites i where i.inviter = uid and i.rewarded_at is not null;
  select count(*) into due from ops.invites_due(uid);
  return jsonb_build_object(
    'code', ops.invite_code_of(uid),
    'friends', (select count(*) from ops.invites i where i.inviter = uid),
    'due', least(due, greatest(0, ops.invite_rewarded_max() - taken)),
    'rewarded', taken,
    'max', ops.invite_rewarded_max(),
    'used', exists (select 1 from ops.invites i where i.invitee = uid),
    'canUse', not exists (select 1 from ops.invites i where i.invitee = uid)
      and coalesce((select u.created_at from auth.users u where u.id = uid) > now() - ops.invite_window(), false)
  );
end;
$$;
revoke all on function public.my_invite() from public, anon;
grant execute on function public.my_invite() to authenticated;

/**
 * Uses a friend's code: 'ok' (the game then pays the welcome gift), 'already' (a code was used
 * on this account before), 'late' (the account is more than 7 days old), 'self' (the player's
 * own code, or a friend who used theirs), 'full' (the code took its 50 players) or 'unknown'.
 */
create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  friend uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from ops.invites i where i.invitee = uid) then
    return 'already';
  end if;
  if coalesce((select u.created_at from auth.users u where u.id = uid) <= now() - ops.invite_window(), true) then
    return 'late';
  end if;
  select k.user_id into friend from ops.invite_codes k where k.code = upper(btrim(coalesce(p_code, '')));
  if friend is null then
    return 'unknown';
  end if;
  if friend = uid or exists (select 1 from ops.invites i where i.invitee = friend and i.inviter = uid) then
    return 'self';
  end if;
  if (select count(*) from ops.invites i where i.inviter = friend) >= ops.invite_uses_max() then
    return 'full';
  end if;
  insert into ops.invites (invitee, inviter) values (uid, friend) on conflict (invitee) do nothing;
  return case when found then 'ok' else 'already' end;
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

/** Takes the rewards due to the signed-in player for friends' first cars: how many (each once, 10 at most in all). */
create or replace function public.claim_invite_rewards()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  room integer;
  n integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select greatest(0, ops.invite_rewarded_max() - count(*)) into room from ops.invites i where i.inviter = uid and i.rewarded_at is not null;
  if room = 0 then
    return 0;
  end if;
  update ops.invites i set rewarded_at = now()
  where i.invitee in (select d from ops.invites_due(uid) d limit room)
    and i.inviter = uid
    and i.rewarded_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.claim_invite_rewards() from public, anon;
grant execute on function public.claim_invite_rewards() to authenticated;
