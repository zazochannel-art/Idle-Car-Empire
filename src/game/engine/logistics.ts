// Company-wide logistics: what the Logistics Center upgrades do to every
// truck, dock and warehouse, and how much the next level costs.
import { LOGISTICS, LOGISTICS_BY_ID, TRANSPORT_TIERS, type LogisticsUpgrade } from "../config/logistics";
import type { GameState, LogisticsState } from "../types";

export function createLogistics(): LogisticsState {
  return { speed: 0, capacity: 0, loading: 0, warehouse: 0, fleet: 0, tier: 0 };
}

export interface LogisticsMods {
  speed: number;
  capacity: number;
  /** Multiplier on dock time and on how long a truck waits for a full load. */
  dock: number;
  storage: number;
  trucks: number;
  market: number;
  cars: number;
}

export function logisticsMods(s: GameState): LogisticsMods {
  const l = s.logistics;
  const tier = TRANSPORT_TIERS[Math.min(l.tier, TRANSPORT_TIERS.length - 1)];
  return {
    speed: (1 + LOGISTICS_BY_ID.speed.step * l.speed) * tier.speed,
    capacity: (1 + LOGISTICS_BY_ID.capacity.step * l.capacity) * tier.capacity,
    dock: Math.max(0.3, 1 - LOGISTICS_BY_ID.loading.step * l.loading),
    storage: 1 + LOGISTICS_BY_ID.warehouse.step * l.warehouse,
    trucks: l.fleet,
    market: tier.market,
    cars: tier.cars,
  };
}

export function logisticsCost(s: GameState, id: LogisticsUpgrade, costMult = 1): number | null {
  const cfg = LOGISTICS_BY_ID[id];
  const lvl = s.logistics[id];
  if (lvl >= cfg.max) return null;
  return cfg.cost * Math.pow(cfg.growth, lvl) * costMult;
}

export function buyLogistics(s: GameState, id: LogisticsUpgrade, costMult = 1): boolean {
  const cost = logisticsCost(s, id, costMult);
  if (cost === null || s.cash < cost) return false;
  s.cash -= cost;
  s.logistics[id] += 1;
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  return true;
}

export function nextTier(s: GameState) {
  return TRANSPORT_TIERS[s.logistics.tier + 1] ?? null;
}

export function buyTier(s: GameState, costMult = 1): boolean {
  const next = nextTier(s);
  if (!next) return false;
  const cost = next.cost * costMult;
  if (s.cash < cost) return false;
  s.cash -= cost;
  s.logistics.tier += 1;
  return true;
}

export const LOGISTICS_IDS = LOGISTICS.map((l) => l.id);
