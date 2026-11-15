-- Plausibility checks on cloud saves: RECORD ONLY. The game's economy runs on the player's phone
-- (so it works offline), which means the server can't recompute it; what it can do is notice a save
-- whose lifetime earnings grew faster than the game can possibly produce, and write it down for the
-- owner. Nothing is refused, changed or hidden: a false alarm costs a row, never a player's game.
--
-- The limit is the one the leaderboard already uses (0004): earnings at most double every 30
-- minutes of the SERVER's clock, plus $20K per second and $1M for the early game. A real game
-- never gets near it (the late-game simulation sits far under); a hand-edited save does.
--
-- Rows are bounded without a cleanup job: at most 20 per player, and they go with the account.
--
-- Safe to apply on production: one new table, one trigger, one function for the dashboard. Applying
-- it again changes nothing. To turn it off: drop trigger game_saves_plausibility on public.game_saves;

create table if not exists ops.save_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  flagged_at timestamptz not null default now(),
  -- the cloud revision the save became
  revision bigint not null,
  -- lifetime.moneyEarned as the save claims it, what the limit allowed, and what the save before it said
  claimed numeric not null,
  allowed numeric not null,
  previous numeric not null,
  -- server seconds between the two saves
  elapsed numeric not null
);
create index if not exists save_flags_user on ops.save_flags (user_id, flagged_at desc);
create index if not exists save_flags_at on ops.save_flags (flagged_at);
alter table ops.save_flags enable row level security;
revoke all on ops.save_flags from public, anon, authenticated;

-- After a save is written: compare it with the one it replaced. Never raises: a failure here must not
-- stop a save, so any error is swallowed.
create or replace function public.game_saves_plausibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  claimed numeric := public.save_number(new.data -> 'lifetime' -> 'moneyEarned');
  before numeric := public.save_number(old.data -> 'lifetime' -> 'moneyEarned');
  elapsed numeric := greatest(0, extract(epoch from new.updated_at - old.updated_at));
  allowed numeric;
begin
  begin
    allowed := before * power(2::numeric, least(elapsed / 1800, 40)) + 2e4 * elapsed + 1e6;
    if claimed > allowed then
      insert into ops.save_flags (user_id, revision, claimed, allowed, previous, elapsed)
      values (new.user_id, new.revision, claimed, allowed, before, elapsed);
      -- at most 20 kept for each player (the newest)
      delete from ops.save_flags f
      where f.user_id = new.user_id
        and f.id not in (select s.id from ops.save_flags s where s.user_id = new.user_id order by s.id desc limit 20);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$fn$;
revoke all on function public.game_saves_plausibility() from public, anon, authenticated;

create or replace trigger game_saves_plausibility after update of data on public.game_saves
  for each row execute function public.game_saves_plausibility();

-- For the dashboard (and the SQL editor): the saves flagged, newest first, with the player's name.
create or replace function public.admin_save_flags(p_days integer default 30)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform ops.must_be_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.flagged_at desc)
    from (
      select f.id, f.user_id, p.username, f.flagged_at, f.revision, f.claimed, f.allowed, f.previous, f.elapsed
      from ops.save_flags f
      left join public.profiles p on p.id = f.user_id
      where f.flagged_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
      order by f.flagged_at desc
      limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_save_flags(integer) from public, anon;
grant execute on function public.admin_save_flags(integer) to authenticated;
