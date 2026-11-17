-- Creator codes: a creator (a YouTuber, a streamer) gives their audience the invite code of their
-- own account (0012). An ordinary code takes 50 new players; a creator's takes as many as the
-- owner sets here. Nothing else changes: the new players get the same welcome gift, and the
-- creator's own reward stays capped at 10 friends (ops.invite_rewarded_max), so a big audience
-- brings players, not a pile of Stars.
--
-- The owner marks a creator from the SQL editor:
--   insert into ops.creators (user_id, uses_max, note)
--   select user_id, 100000, 'Channel name' from ops.invite_codes where code = 'ABC234'
--   on conflict (user_id) do update set uses_max = excluded.uses_max, note = excluded.note;
-- and reads how many players each creator brought with public.admin_creators() (admins only).
--
-- Safe to apply on production: one new table, one new function, and redeem_invite redefined with
-- the same answers as before. Applying it again changes nothing.

create table if not exists ops.creators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  uses_max integer not null check (uses_max between 1 and 10000000),
  note text not null default '' check (length(note) <= 200),
  made_at timestamptz not null default now()
);
alter table ops.creators enable row level security;
revoke all on ops.creators from public, anon, authenticated;

/** How many new players one player's code takes: the creator's own limit, else the usual 50. */
create or replace function ops.invite_uses_of(p_user uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.uses_max from ops.creators c where c.user_id = p_user), ops.invite_uses_max())
$$;
revoke all on function ops.invite_uses_of(uuid) from public, anon, authenticated;

/** As in 0012, with the code's limit from ops.invite_uses_of. */
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
  if (select count(*) from ops.invites i where i.inviter = friend) >= ops.invite_uses_of(friend) then
    return 'full';
  end if;
  insert into ops.invites (invitee, inviter) values (uid, friend) on conflict (invitee) do nothing;
  return case when found then 'ok' else 'already' end;
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

/** For the dashboard: each creator, their code, the players it brought and how many built a first car. */
create or replace function public.admin_creators()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'note', c.note,
      'code', k.code,
      'usesMax', c.uses_max,
      'players', (select count(*) from ops.invites i where i.inviter = c.user_id),
      'firstCars', (select count(*) from ops.invites_due(c.user_id)) + (select count(*) from ops.invites i where i.inviter = c.user_id and i.rewarded_at is not null),
      'since', c.made_at
    ) order by c.made_at)
    from ops.creators c
    left join ops.invite_codes k on k.user_id = c.user_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_creators() from public, anon;
grant execute on function public.admin_creators() to authenticated;
