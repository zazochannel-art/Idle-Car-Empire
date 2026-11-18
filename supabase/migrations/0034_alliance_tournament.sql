-- The weekly alliance tournament: alliances ranked by their week's points (alliance_points, 0005),
-- and a prize in Stars for each member of the best alliances once the week is over: 1st 10, 2nd-3rd
-- 6, 4th-10th 3, 11th-50th 1. The game pays the Stars (src/game/engine/alliance.ts); the server says
-- how many are due, once per player and week.
--
-- Points are worked out live from the members' saves, which roll over every Monday, so the week's
-- points are kept here as they grow: every call of alliance_tournament() by a member stores their
-- alliance's points (the highest seen this week). The game calls it now and then while a member
-- plays, and when the Alliance screen opens; last week's ranking is read from what was stored.
--
-- Safe to apply on production: two new tables in ops (out of the API's reach) and three functions.
-- Applying it again changes nothing.

create table if not exists ops.alliance_weeks (
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  week date not null,
  points numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (alliance_id, week)
);
create index if not exists alliance_weeks_rank on ops.alliance_weeks (week, points desc);
alter table ops.alliance_weeks enable row level security;
revoke all on ops.alliance_weeks from public, anon, authenticated;

create table if not exists ops.alliance_tournament_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  alliance_id uuid,
  rank integer not null,
  stars integer not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table ops.alliance_tournament_claims enable row level security;
revoke all on ops.alliance_tournament_claims from public, anon, authenticated;

/** Stars for a final place. */
create or replace function ops.tournament_prize(p_rank integer) returns integer
language sql immutable set search_path = ''
as $$
  select case when p_rank = 1 then 10 when p_rank between 2 and 3 then 6 when p_rank between 4 and 10 then 3 when p_rank between 11 and 50 then 1 else 0 end
$$;
revoke all on function ops.tournament_prize(integer) from public, anon, authenticated;

/** An alliance's place in a week (null: it scored nothing that week). Ties share the place. */
create or replace function ops.tournament_rank(p_alliance uuid, p_week date) returns integer
language sql stable security definer set search_path = ''
as $$
  select case when mine.points is null then null
    else 1 + (select count(*)::int from ops.alliance_weeks o where o.week = p_week and o.points > mine.points) end
  from (select (select w.points from ops.alliance_weeks w where w.alliance_id = p_alliance and w.week = p_week and w.points > 0) as points) mine
$$;
revoke all on function ops.tournament_rank(uuid, date) from public, anon, authenticated;

/**
 * The tournament: stores the caller's alliance's points for this week, then returns this week's top
 * 20, the caller's alliance's place this week, and last week's place with the prize waiting for the
 * caller (0 when none, or already taken; a member who joined after last week ended gets none).
 */
create or replace function public.alliance_tournament()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wk date := (date_trunc('week', now()))::date;
  prev date := (date_trunc('week', now()))::date - 7;
  aid uuid;
  joined timestamptz;
  last_rank integer;
  prize integer := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select m.alliance_id, m.joined_at into aid, joined from public.alliance_members m where m.user_id = uid;
  if aid is not null then
    insert into ops.alliance_weeks (alliance_id, week, points) values (aid, wk, public.alliance_points(aid))
    on conflict (alliance_id, week) do update set points = greatest(ops.alliance_weeks.points, excluded.points), updated_at = now();
    last_rank := ops.tournament_rank(aid, prev);
    if last_rank is not null and joined < wk and not exists (select 1 from ops.alliance_tournament_claims c where c.user_id = uid and c.week = prev) then
      prize := ops.tournament_prize(last_rank);
    end if;
  end if;
  return jsonb_build_object(
    'week', wk,
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', r.name, 'tag', r.tag, 'emblem', r.emblem, 'points', r.points, 'mine', r.id = aid) order by r.rank, r.name)
      from (
        select a.id, a.name, a.tag, a.emblem, w.points, (rank() over (order by w.points desc))::int as rank
        from ops.alliance_weeks w join public.alliances a on a.id = w.alliance_id
        where w.week = wk and w.points > 0
        order by w.points desc
        limit 20
      ) r
    ), '[]'::jsonb),
    'rank', case when aid is null then null else ops.tournament_rank(aid, wk) end,
    'lastRank', last_rank,
    'prize', prize
  );
end;
$$;
revoke all on function public.alliance_tournament() from public, anon;
grant execute on function public.alliance_tournament() to authenticated;

/** Takes last week's prize: the Stars due (0: none, or taken already). */
create or replace function public.claim_alliance_tournament()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wk date := (date_trunc('week', now()))::date;
  prev date := (date_trunc('week', now()))::date - 7;
  aid uuid;
  joined timestamptz;
  r integer;
  stars integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select m.alliance_id, m.joined_at into aid, joined from public.alliance_members m where m.user_id = uid;
  if aid is null or joined >= wk then
    return 0;
  end if;
  r := ops.tournament_rank(aid, prev);
  stars := coalesce(ops.tournament_prize(r), 0);
  if stars = 0 then
    return 0;
  end if;
  insert into ops.alliance_tournament_claims (user_id, week, alliance_id, rank, stars) values (uid, prev, aid, r, stars);
  return stars;
exception when unique_violation then
  return 0;
end;
$$;
revoke all on function public.claim_alliance_tournament() from public, anon;
grant execute on function public.claim_alliance_tournament() to authenticated;
