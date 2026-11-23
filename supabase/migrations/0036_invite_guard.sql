-- Invite rewards for guests ("Play now" makes an anonymous account in one tap): a friend's reward is
-- due only once the new player has really played, not the moment a save says "1 car".
--
-- Before: the invitee's own save said lifetime.carsProduced >= 1. That is data from the phone, and a
-- guest account costs one tap, so one person could make ten guests, edit ten saves and take the
-- whole reward (2 Stars and 30 minutes of income each, 10 friends in all).
-- Now, on top of that: the invitee's account is at least 2 hours old (the server's clock, which a
-- phone can't change) and the save has at least 15 minutes of play. Real new players reach both in
-- their first evening; farming ten of them now costs two hours of waiting, and the record of the
-- save's growth (0031) still sees an edited save.
--
-- Safe to apply on production: one function replaced (same name, same result type). Applying it again
-- changes nothing. To go back: apply the version in 0012_invites.sql.

create or replace function ops.invites_due(p_user uuid) returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.invitee
  from ops.invites i
  join public.game_saves g on g.user_id = i.invitee
  join auth.users u on u.id = i.invitee
  where i.inviter = p_user
    and i.rewarded_at is null
    and u.created_at <= now() - interval '2 hours'
    and jsonb_typeof(g.data -> 'lifetime' -> 'carsProduced') = 'number'
    and (g.data -> 'lifetime' ->> 'carsProduced')::numeric >= 1
    and jsonb_typeof(g.data -> 'lifetime' -> 'playTime') = 'number'
    and (g.data -> 'lifetime' ->> 'playTime')::numeric >= 900
$$;
revoke all on function ops.invites_due(uuid) from public, anon, authenticated;
