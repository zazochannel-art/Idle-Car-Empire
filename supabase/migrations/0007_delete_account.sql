-- Account deletion from inside the game (Google Play requires it of any app that
-- creates accounts, guests included).
--
-- delete_my_account() deletes the signed-in player's account. Everything the
-- server keeps of them goes with it: game_saves, profiles, empires (leaderboard,
-- visits), gifts sent and received, alliance seat and reward claims all reference
-- auth.users with "on delete cascade". The player's seat in an alliance is given
-- up first, the way leave_alliance() does it, so the alliance gets a new leader
-- (or closes when it was the last member). The anonymous funnel steps
-- (analytics.funnel_steps) were never linked to an account and are not touched.
--
-- Run once in the Supabase SQL Editor (it can be run again safely).

create or replace function public.delete_my_account()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  aid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- the alliance seat (alliances come with 0005; without them there is nothing to give up)
  if to_regclass('public.alliance_members') is not null then
    delete from public.alliance_members m where m.user_id = uid returning m.alliance_id into aid;
    if aid is not null then
      if not exists (select 1 from public.alliance_members m where m.alliance_id = aid) then
        delete from public.alliances a where a.id = aid;
      else
        update public.alliances a
        set leader = (select m.user_id from public.alliance_members m where m.alliance_id = aid order by m.joined_at, m.user_id limit 1)
        where a.id = aid and (a.leader is null or a.leader = uid);
      end if;
    end if;
  end if;
  delete from auth.users u where u.id = uid;
  return 'ok';
end;
$fn$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
