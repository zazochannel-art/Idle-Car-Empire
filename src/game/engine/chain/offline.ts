// The chain while the player is away.
import type { ChainSnapshot } from "./stats";
import { type ChainTickOut, chainTick, goodsValue } from "./tick";
import type { GameState } from "../../types";
import { chainNet } from "../ledger";

// ───────────────────────────── offline ─────────────────────────────

/**
 * Runs the chain for `seconds` of absence in steps. Plants produce at their
 * offline efficiency; trucks keep driving. Returns what happened; money is
 * credited to the wallet as it is earned.
 */
export function simulateChain(s: GameState, seconds: number, snap: ChainSnapshot, credit: (amount: number) => void, maxSteps = 20_000): ChainTickOut {
  const total: ChainTickOut = { earned: 0, spent: 0, components: 0, cars: 0, deliveries: 0, rp: 0, wholesale: 0, carsSold: 0, materials: 0 };
  if (seconds <= 0 || Object.keys(snap.plants).length === 0) return total;
  const steps = Math.max(1, Math.min(Math.ceil(seconds), Math.floor(maxSteps)));
  const dt = seconds / steps;
  // the HUD and dashboard rates describe the session, not the absence: keep them
  const rates = { ...s.chain.ledger.rate };
  const steady = s.chain.steady;
  const steadyBase = s.chain.steadyBase;
  const goodsRate = s.chain.goodsRate;
  for (let i = 0; i < steps; i++) {
    const r = chainTick(s, dt, snap, credit, undefined, true);
    total.earned += r.earned;
    total.spent += r.spent;
    total.components += r.components;
    total.cars += r.cars;
    total.deliveries += r.deliveries;
    total.rp += r.rp;
    total.wholesale += r.wholesale;
    total.carsSold += r.carsSold;
    total.materials += r.materials;
  }
  s.chain.ledger.rate = rates;
  s.chain.goods = goodsValue(s);
  s.chain.goodsRate = goodsRate;
  s.chain.rate = chainNet(rates) + (goodsRate ?? 0);
  s.chain.steady = steady;
  s.chain.steadyBase = steadyBase;
  return total;
}
