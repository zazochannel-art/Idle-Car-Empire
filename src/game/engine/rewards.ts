// Rewards (missions, achievements, the pass, events…): cash, a share of the income, Research
// Points, boost, Stars. A leaf of the engine: anything may pay one without an import cycle.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { payReward } from "./ledger";

/** Cash value of a reward right now (incomeSeconds scales with production). */
export function rewardCash(r: Reward, snap: EconomySnapshot): number {
  const income = Math.max(snap.steadyIncomePerSec, 5);
  return (r.cash ?? 0) + (r.incomeSeconds ?? 0) * income;
}

/** Rewards go straight to the wallet; they are not "earned" (they count toward no reset). */
export function grantReward(s: GameState, r: Reward, snap: EconomySnapshot) {
  payReward(s, rewardCash(r, snap));
  if (r.rp) s.rp += r.rp;
  if (r.boost) s.boost += r.boost;
  if (r.stars) s.stars += r.stars;
}
