// Alliances' weekly rewards (the server says who may take them:
// save/social.ts, supabase/migrations/0005). Paid as rewards: they count
// toward no reset.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./progress";

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
