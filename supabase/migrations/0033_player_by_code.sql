-- Race challenges: a player shares their invite code (0012) to challenge a friend to a duel with
-- their ghost; the friend types it in the game, which finds the player here and opens their public
-- card (visit_empire, 0004/0005: null for a player who left the board), where the duel is.
-- Only the account id comes back, and only to a signed-in player: codes are meant to be shared.
--
-- Safe to apply on production: one new function. Applying it again changes nothing.

create or replace function public.player_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select k.user_id
  from ops.invite_codes k
  where auth.uid() is not null
    and k.code = upper(btrim(coalesce(p_code, '')))
  limit 1
$$;
revoke all on function public.player_by_code(text) from public, anon;
grant execute on function public.player_by_code(text) to authenticated;
