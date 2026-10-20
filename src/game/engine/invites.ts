// Invite codes (the server keeps them: supabase/migrations/0012, save/social.ts): a new player
// who enters a friend's code gets a welcome gift at once; the friend gets Stars and income when
// the new player builds their first car. Paid as rewards: they count toward no reset.
import type { GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./progress";

export const INVITE = {
  /** The new player's welcome gift: a head start, plus a little of their income. */
  welcome: { cash: 25_000, incomeSeconds: 600 },
  /** For each friend who built their first car with the player's code. */
  perFriend: { stars: 2, incomeSeconds: 1_800 },
  /** Friends whose first car rewards the player, in all (the server holds the count). */
  maxFriends: 10,
  /** Days a new account has to use a friend's code. */
  days: 7,
};

/** Pays a new player's welcome gift, returns the money. */
export function inviteWelcome(s: GameState, snap: EconomySnapshot): number {
  const money = rewardCash(INVITE.welcome, snap);
  grantReward(s, INVITE.welcome, snap);
  return money;
}

/** Pays the rewards for friends' first cars (n, from the server), returns what was paid. */
export function inviteRewards(s: GameState, n: number, snap: EconomySnapshot): { stars: number; money: number } {
  const count = Math.max(0, Math.min(INVITE.maxFriends, Math.floor(n)));
  if (!count) return { stars: 0, money: 0 };
  const reward = { stars: INVITE.perFriend.stars * count, incomeSeconds: INVITE.perFriend.incomeSeconds * count };
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  return { stars: reward.stars, money };
}
