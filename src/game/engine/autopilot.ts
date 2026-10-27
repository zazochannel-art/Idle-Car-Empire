// The player's standing orders for decisions that come on their own (Settings → automatic
// decisions): a recall paid or ignored without asking, a VIP order taken on when the plants can
// already make it, a fleet order taken on, and finished orders and contracts cashed in.
// Each returns what it did, so the player can be told.
import { CAR_BY_ID } from "../config/cars";
import type { GameState } from "../types";
import { carValue, plantsOf } from "./chain";
import { claimContract } from "./contracts";
import type { EconomySnapshot } from "./economy";
import { acceptFleetOrder, finishFleetOrder } from "./expansion";
import { acceptVip, claimVip, type VipOrder } from "./live";
import { ignoreRecall, payRecall, qualityOf, recallCost } from "./market";

export const RECALL_POLICIES = ["ask", "pay", "ignore"] as const;
export type RecallPolicy = (typeof RECALL_POLICIES)[number];

/** A pending recall settled by the player's policy: paid (if the cash is there) or ignored. */
export function autoRecall(s: GameState, snap: EconomySnapshot): { paid: number } | { ignored: "scandal" | "quiet" } | null {
  const r = s.quality.recall;
  if (!r || s.settings.autoRecall === "ask") return null;
  if (s.settings.autoRecall === "pay") {
    const cost = recallCost(s, carValue(s, CAR_BY_ID[r.car], snap.gm));
    // short of cash: the player is asked after all
    return payRecall(s, cost) ? { paid: cost } : null;
  }
  const out = ignoreRecall(s);
  return out ? { ignored: out } : null;
}

/** Whether the plants already make what a VIP client wants: the model on a line, in their paint, Premium if asked. */
export function vipDeliverable(s: GameState, o: VipOrder, snap: EconomySnapshot): boolean {
  if (s.designs[o.car]?.color !== o.color) return false;
  return plantsOf(s).some(([id, b]) => snap.chain.plants[id]?.car?.id === o.car && (!o.premium || qualityOf(b.plant) === "premium"));
}

/** The VIP offer on the table, taken on when the plants can deliver it. */
export function autoVip(s: GameState, now: number, snap: EconomySnapshot): boolean {
  const o = s.vip.offer;
  return !!o && s.settings.autoVip && !s.vip.active && vipDeliverable(s, o, snap) && acceptVip(s, now);
}

/** The fleet order on the table, taken on (the division switches to its product). */
export function autoFleet(s: GameState, now: number): boolean {
  const o = s.fleet.order;
  return !!o && s.settings.autoFleet && o.deadline === undefined && acceptFleetOrder(s, now);
}

/** Finished orders and contracts cashed in: what was collected. */
export function autoCollect(s: GameState, now: number, snap: EconomySnapshot): { vip: number | null; fleet: boolean; contract: boolean } {
  const none = { vip: null, fleet: false, contract: false };
  if (!s.settings.autoCollect) return none;
  const pay = s.vip.active?.pay ?? 0;
  return {
    vip: claimVip(s, now) ? pay : null,
    fleet: finishFleetOrder(s, now),
    contract: claimContract(s, now, snap),
  };
}
