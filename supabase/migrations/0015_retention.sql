-- Retention for the owner's dashboard (site/admin/, the "Revin" tab): how many players play each
-- day, and how many new players come back the next day and a week later.
--
-- The server marks the (UTC) days each account's game saved to the cloud: one row per player and
-- day, nothing more (no times, no game data). Rows go with the account (on delete cascade). The
-- table is in the analytics schema, which the API does not expose; only admin_retention() reads
-- it, and only for an admin, and it returns totals, never a player.
--
-- A player's day is marked by a trigger on their save, so the game needs no change. The days
-- before this migration are filled in from what the saves and their backups (0011) tell.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create table if not exists analytics.play_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create index if not exists play_days_day on analytics.play_days (day);
alter table analytics.play_days enable row level security;
revoke all on analytics.play_days from public, anon, authenticated;

/** Marks today (UTC) as a day the player played; never stops a save. */
create or replace function analytics.mark_play_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into analytics.play_days (user_id, day) values (new.user_id, (now() at time zone 'utc')::date)
  on conflict do nothing;
  return null;
exception when others then
  raise warning 'play day not marked: %', sqlerrm;
  return null;
end;
$$;
revoke all on function analytics.mark_play_day() from public, anon, authenticated;

create or replace trigger game_saves_play_day
after insert or update of data on public.game_saves
for each row execute function analytics.mark_play_day();

-- the days before: the last save, every backup, and the day each player with a save signed up
insert into analytics.play_days (user_id, day)
select s.user_id, (s.updated_at at time zone 'utc')::date from public.game_saves s
union
select b.user_id, (b.made_at at time zone 'utc')::date from ops.save_backups b
union
select u.id, (u.created_at at time zone 'utc')::date from auth.users u where exists (select 1 from public.game_saves s where s.user_id = u.id)
on conflict do nothing;

/**
 * The last 30 days for the dashboard: players each day, new players (accounts made that day that
 * played), and how many of them played again the next day (D1), on the 7th day (D7) and on any
 * of the 7 days after (within a week); plus the active players today, in 7 and in 30 days, and
 * the D1 / D7 / week shares over the cohorts old enough to tell.
 */
create or replace function public.admin_retention()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  v_days jsonb;
begin
  perform ops.must_be_admin();
  with days as (
    select (today - n)::date as day from generate_series(0, 29) n
  ), cohort as (
    select u.id, (u.created_at at time zone 'utc')::date as day
    from auth.users u
    where u.created_at >= (today - 37)::timestamp and exists (select 1 from analytics.play_days p where p.user_id = u.id)
  ), rows as (
    select d.day,
      (select count(*) from analytics.play_days p where p.day = d.day) as active,
      (select count(*) from cohort c where c.day = d.day) as new,
      (select count(*) from cohort c where c.day = d.day and exists (select 1 from analytics.play_days p where p.user_id = c.id and p.day = d.day + 1)) as d1,
      (select count(*) from cohort c where c.day = d.day and exists (select 1 from analytics.play_days p where p.user_id = c.id and p.day = d.day + 7)) as d7,
      (select count(*) from cohort c where c.day = d.day and exists (select 1 from analytics.play_days p where p.user_id = c.id and p.day between d.day + 1 and d.day + 7)) as week
    from days d
  )
  select jsonb_agg(jsonb_build_object('day', r.day, 'active', r.active, 'new', r.new, 'd1', r.d1, 'd7', r.d7, 'week', r.week) order by r.day desc)
  into v_days
  from rows r;

  return jsonb_build_object(
    'days', coalesce(v_days, '[]'::jsonb),
    'today', today,
    'dau', (select count(*) from analytics.play_days p where p.day = today),
    'wau', (select count(distinct p.user_id) from analytics.play_days p where p.day > today - 7),
    'mau', (select count(distinct p.user_id) from analytics.play_days p where p.day > today - 30),
    -- cohorts that had their next day / their 7th day: (returned, of)
    'd1', (select jsonb_build_object('back', coalesce(sum((x->>'d1')::int), 0), 'of', coalesce(sum((x->>'new')::int), 0))
           from jsonb_array_elements(coalesce(v_days, '[]'::jsonb)) x where (x->>'day')::date <= today - 1),
    'd7', (select jsonb_build_object('back', coalesce(sum((x->>'d7')::int), 0), 'of', coalesce(sum((x->>'new')::int), 0))
           from jsonb_array_elements(coalesce(v_days, '[]'::jsonb)) x where (x->>'day')::date <= today - 7),
    'week', (select jsonb_build_object('back', coalesce(sum((x->>'week')::int), 0), 'of', coalesce(sum((x->>'new')::int), 0))
             from jsonb_array_elements(coalesce(v_days, '[]'::jsonb)) x where (x->>'day')::date <= today - 7),
    'since', (select min(p.day) from analytics.play_days p)
  );
end;
$$;
revoke all on function public.admin_retention() from public, anon;
grant execute on function public.admin_retention() to authenticated;
