-- Notifications from the server (push), ready but silent until the game's owner sets up
-- Firebase Cloud Messaging (docs/push.md): no phone gives the server a token before that.
--
-- A phone that allows notifications (Settings → Notifications, in an Android build made with
-- Firebase) gives the server its FCM token, the game's language and its time zone. The server
-- queues a short note for a player when something happens for them:
--   gift    another player sent them a gift
--   invite  a new player used their invite code
--   cup     the weekly cup they raced in is over (a prize waits)
--   event   an event the owner scheduled from the dashboard has started
-- and the "push" Edge Function (supabase/functions/push) sends what is queued, every few
-- minutes, between 9:00 and 21:00 on the player's phone. One note of each kind every 12 hours
-- at most, 3 a day; a note nobody could send in a day is dropped, and opening the game clears
-- what waits (the player sees it in the game).
--
-- Tokens and notes go with the account. Turning notifications off, signing out, or Firebase
-- saying the phone is gone forgets the token. Players reach only their own phone's token, through
-- two functions; the sender's three functions are for the service key only.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- null once forgotten; the account's next phone takes the row
  token text unique check (token is null or (char_length(token) between 20 and 4096 and token !~ '[[:space:][:cntrl:]]')),
  platform text not null default 'android' check (platform in ('android', 'ios')),
  lang text not null default 'en' check (lang in ('en', 'ro', 'ru', 'es', 'pt', 'de')),
  -- the phone's offset from UTC, in minutes (for the quiet hours)
  tz smallint not null default 0 check (tz between -840 and 840),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user on ops.push_tokens (user_id);
alter table ops.push_tokens enable row level security;
revoke all on ops.push_tokens from public, anon, authenticated;

-- one row per player and kind: the last note of that kind (waiting while done_at is null)
create table if not exists ops.push_queue (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('gift', 'invite', 'cup', 'event')),
  args jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default now(),
  -- sent, dropped, or no longer needed (the player opened the game)
  done_at timestamptz,
  sent boolean not null default false,
  primary key (user_id, kind)
);
create index if not exists push_queue_waiting on ops.push_queue (queued_at) where done_at is null;
alter table ops.push_queue enable row level security;
revoke all on ops.push_queue from public, anon, authenticated;

-- what was queued once for everyone: a week's cup, an event's start
create table if not exists ops.push_marks (
  mark text primary key,
  made_at timestamptz not null default now()
);
alter table ops.push_marks enable row level security;
revoke all on ops.push_marks from public, anon, authenticated;

/** Phones per account, the gap between two notes of a kind, notes a day, and the quiet hours (local). */
create or replace function ops.push_phones_max() returns integer language sql immutable set search_path = '' as $$ select 5 $$;
create or replace function ops.push_gap() returns interval language sql immutable set search_path = '' as $$ select interval '12 hours' $$;
create or replace function ops.push_daily_max() returns integer language sql immutable set search_path = '' as $$ select 3 $$;
create or replace function ops.push_day_starts() returns integer language sql immutable set search_path = '' as $$ select 9 $$;
create or replace function ops.push_day_ends() returns integer language sql immutable set search_path = '' as $$ select 21 $$;
revoke all on function ops.push_phones_max(), ops.push_gap(), ops.push_daily_max(), ops.push_day_starts(), ops.push_day_ends() from public, anon, authenticated;

/** Queues a note for a player who has a phone to get it (true: queued). Never fails the caller. */
create or replace function ops.push_note(p_user uuid, p_kind text, p_args jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from ops.push_tokens t where t.user_id = p_user and t.token is not null) then
    return false;
  end if;
  if (select count(*) from ops.push_queue q where q.user_id = p_user and q.sent and q.done_at > now() - interval '24 hours') >= ops.push_daily_max() then
    return false;
  end if;
  -- a note of this kind waiting already, or sent not long ago: nothing more
  insert into ops.push_queue as q (user_id, kind, args) values (p_user, p_kind, coalesce(p_args, '{}'::jsonb))
  on conflict (user_id, kind) do update set args = excluded.args, queued_at = now(), done_at = null, sent = false
    where q.done_at is not null and (not q.sent or q.done_at < now() - ops.push_gap());
  return found;
exception when others then
  raise warning 'push note not queued: %', sqlerrm;
  return false;
end;
$$;
revoke all on function ops.push_note(uuid, text, jsonb) from public, anon, authenticated;

-- ── what queues a note ──

create or replace function ops.push_on_gift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.push_note(new.to_user, 'gift', jsonb_build_object('name', coalesce((select p.username from public.profiles p where p.id = new.from_user), '')));
  return null;
end;
$$;
revoke all on function ops.push_on_gift() from public, anon, authenticated;
create or replace trigger gifts_push after insert on public.gifts for each row execute function ops.push_on_gift();

create or replace function ops.push_on_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.push_note(new.inviter, 'invite');
  return null;
end;
$$;
revoke all on function ops.push_on_invite() from public, anon, authenticated;
create or replace trigger invites_push after insert on ops.invites for each row execute function ops.push_on_invite();

-- ── the player's phone ──

/** This phone's token for the signed-in player ("ok" or "invalid"); the game sends it at each start while notifications are on. */
create or replace function public.register_push_token(p_token text, p_platform text, p_lang text, p_tz integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lang text := case when p_lang in ('en', 'ro', 'ru', 'es', 'pt', 'de') then p_lang else 'en' end;
  v_tz smallint := greatest(-840, least(840, coalesce(p_tz, 0)));
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 or p_token ~ '[[:space:][:cntrl:]]' or p_platform not in ('android', 'ios') then
    return 'invalid';
  end if;
  -- this phone's row, whoever had it (another account signed in on it before): now this player's
  update ops.push_tokens set user_id = v_uid, platform = p_platform, lang = v_lang, tz = v_tz, updated_at = now()
  where token = p_token;
  if not found then
    -- a forgotten row of the player's, or their oldest phone once they have their fill
    select t.id into v_id from ops.push_tokens t where t.user_id = v_uid and t.token is null order by t.updated_at limit 1;
    if v_id is null and (select count(*) from ops.push_tokens t where t.user_id = v_uid) >= ops.push_phones_max() then
      select t.id into v_id from ops.push_tokens t where t.user_id = v_uid order by t.updated_at limit 1;
    end if;
    if v_id is not null then
      update ops.push_tokens set token = p_token, platform = p_platform, lang = v_lang, tz = v_tz, updated_at = now() where id = v_id;
    else
      insert into ops.push_tokens (user_id, token, platform, lang, tz) values (v_uid, p_token, p_platform, v_lang, v_tz)
      on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, tz = excluded.tz, updated_at = now();
    end if;
  end if;
  -- the player is in the game: what waited for them needs no notification now
  update ops.push_queue set done_at = now() where user_id = v_uid and done_at is null;
  return 'ok';
end;
$$;
revoke all on function public.register_push_token(text, text, text, integer) from public, anon;
grant execute on function public.register_push_token(text, text, text, integer) to authenticated;

/** Forgets this phone's token (notifications off, signing out); only the player's own. */
create or replace function public.forget_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update ops.push_tokens set token = null, updated_at = now() where token = p_token and user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.forget_push_token(text) from public, anon;
grant execute on function public.forget_push_token(text) to authenticated;

-- ── the sender (supabase/functions/push, with the service key) ──

/** Queues the notes for everyone: the cup of the week just over (once), and events that started in the last half hour (once each). */
create or replace function public.push_collect()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week integer := ops.cup_week() - 1;
  v_n integer := 0;
  v_player record;
  v_event record;
begin
  insert into ops.push_marks (mark) values ('cup:' || v_week) on conflict do nothing;
  if found then
    for v_player in select ce.user_id from ops.cup_entries ce where ce.week = v_week and ce.claimed_at is null loop
      if ops.push_note(v_player.user_id, 'cup', jsonb_build_object('week', v_week)) then v_n := v_n + 1; end if;
    end loop;
  end if;
  for v_event in
    select ev.id, ev.event from ops.live_events ev
    where ev.cancelled_at is null and ev.starts_at <= now() and ev.starts_at > now() - interval '30 minutes' and ev.ends_at > now()
  loop
    insert into ops.push_marks (mark) values ('event:' || v_event.id) on conflict do nothing;
    if found then
      for v_player in select distinct t.user_id from ops.push_tokens t where t.token is not null loop
        if ops.push_note(v_player.user_id, 'event', jsonb_build_object('event', v_event.event)) then v_n := v_n + 1; end if;
      end loop;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.push_collect() from public, anon, authenticated;
grant execute on function public.push_collect() to service_role;

/**
 * Takes up to p_limit waiting notes to send now: one row per phone in its day hours (with the
 * phone's language). Notes waiting for more than a day are dropped. A note is done once taken.
 */
create or replace function public.push_take(p_limit integer)
returns table (token text, lang text, kind text, args jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update ops.push_queue q set done_at = now() where q.done_at is null and q.queued_at < now() - interval '24 hours';
  return query
  with awake as (
    select t.user_id, t.token, t.lang from ops.push_tokens t
    where t.token is not null
      and extract(hour from (now() at time zone 'utc') + make_interval(mins => t.tz)) >= ops.push_day_starts()
      and extract(hour from (now() at time zone 'utc') + make_interval(mins => t.tz)) < ops.push_day_ends()
  ), due as (
    select q.user_id, q.kind from ops.push_queue q
    where q.done_at is null and exists (select 1 from awake a where a.user_id = q.user_id)
    order by q.queued_at
    limit greatest(0, least(coalesce(p_limit, 0), 500))
    for update of q skip locked
  ), taken as (
    update ops.push_queue q set done_at = now(), sent = true
    from due d where q.user_id = d.user_id and q.kind = d.kind
    returning q.user_id, q.kind, q.args
  )
  select a.token, a.lang, tk.kind, tk.args from taken tk join awake a on a.user_id = tk.user_id;
end;
$$;
revoke all on function public.push_take(integer) from public, anon, authenticated;
grant execute on function public.push_take(integer) to service_role;

/** How many notes wait (the sender's report while Firebase isn't set up). */
create or replace function public.push_waiting()
returns integer
language sql stable
security definer
set search_path = ''
as $$ select count(*)::integer from ops.push_queue q where q.done_at is null $$;
revoke all on function public.push_waiting() from public, anon, authenticated;
grant execute on function public.push_waiting() to service_role;

/** Forgets the tokens Firebase says are no longer a phone's. */
create or replace function public.push_forget(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update ops.push_tokens set token = null, updated_at = now() where token = any (coalesce(p_tokens, '{}'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.push_forget(text[]) from public, anon, authenticated;
grant execute on function public.push_forget(text[]) to service_role;
