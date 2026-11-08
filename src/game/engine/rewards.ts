// Rewards (missions, achievements, the pass, events…): cash, a share of the income, Research
// Points, boost, Stars. A leaf of the engine: anything may pay one without an import cycle.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { balance } from "./balance";
import { payReward } from "./ledger";

/** Cash value of a reward right now (incomeSeconds scales with production). */
export function rewardCash(r: Reward, snap: EconomySnapshot): number {
  // without the boosts that only last a while: a reward kept for the ×2 boost is worth no more
  const income = Math.max(snap.rewardIncomePerSec, 5);
  return Math.max(r.minCash ?? 0, (r.cash ?? 0) + (r.incomeSeconds ?? 0) * income * balance("rewards"));
}

/** Rewards go straight to the wallet; they are not "earned" (they count toward no reset). */
export function grantReward(s: GameState, r: Reward, snap: EconomySnapshot) {
  payReward(s, rewardCash(r, snap));
  if (r.rp) s.rp += r.rp;
  if (r.boost) s.boost += r.boost;
  if (r.stars) s.stars += r.stars;
}
