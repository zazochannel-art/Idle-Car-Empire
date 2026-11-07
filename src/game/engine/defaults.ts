// Fresh parts of a company's state used when a city starts too (cities.ts): a leaf of the engine.
import { DEALER_IDS } from "../config/dealerships";
import type { DealerId, DealerState, GameState } from "../types";

export function createDealers(): Record<DealerId, DealerState> {
  return Object.fromEntries(DEALER_IDS.map((d) => [d, { owned: false, level: 1 }])) as Record<DealerId, DealerState>;
}

export const createShowroom = (): GameState["showroom"] => ({ campaignUntil: 0, campaigns: 0, sold: 0, revenue: 0 });
