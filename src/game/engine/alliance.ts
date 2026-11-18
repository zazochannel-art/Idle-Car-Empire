// Alliances' weekly rewards (the server says who may take them:
// save/social.ts, supabase/migrations/0005). Paid as rewards: they count
// toward no reset.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./rewards";

/** Rewards of tiers 1–3 of the week's goal. */
export const ALLIANCE_REWARDS: Reward[] = [{ incomeSeconds: 15 * 60 }, { incomeSeconds: 45 * 60 }, { incomeSeconds: 2 * 3600, stars: 1 }];

/** Emblems an alliance can fly. */
export const ALLIANCE_EMBLEMS = ["🏎️", "🦁", "🐺", "🦅", "⚡", "🔥", "👑", "🛠️", "🏁", "🚀", "🐉", "⭐"];

/** Pays a tier the server granted (1–3), returns the money. */
export function allianceReward(s: GameState, tier: number, snap: EconomySnapshot): number {
  const reward = ALLIANCE_REWARDS[tier - 1];
  if (!reward) return 0;
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  return money;
}

/**
 * The weekly tournament between alliances (supabase/migrations/0034): Stars for each member of the
 * best alliances once the week is over, by final place. The same table as the server's
 * ops.tournament_prize; the server says what is due, this pays at most the top prize.
 */
export const TOURNAMENT_PRIZES: { upTo: number; stars: number }[] = [
  { upTo: 1, stars: 10 },
  { upTo: 3, stars: 6 },
  { upTo: 10, stars: 3 },
  { upTo: 50, stars: 1 },
];

/** Stars for a final place (0: none). */
export function tournamentPrize(rank: number | null): number {
  if (!rank || rank < 1) return 0;
  return TOURNAMENT_PRIZES.find((p) => rank <= p.upTo)?.stars ?? 0;
}

/** Pays the tournament prize the server granted: the Stars paid (whole, at most the top prize). */
export function payTournament(s: GameState, stars: number): number {
  const n = Math.max(0, Math.min(TOURNAMENT_PRIZES[0].stars, Math.floor(Number.isFinite(stars) ? stars : 0)));
  s.stars += n;
  return n;
}
