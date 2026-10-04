import type { Effect } from "../types";

export type EventId = "rushOrders" | "carShow" | "steelSale" | "luxuryBoom" | "researchFair" | "exportDeal" | "raceWeekend" | "electricWeek";

/** What an event asks of the company (counted from the moment it starts). */
export type EventMetric = "carsBuilt" | "carsSold" | "upgrades" | "premiumBuilt" | "research" | "exported" | "raceWins" | "topBuilt";

export interface MarketEvent {
  id: EventId;
  emoji: string;
  name: string;
  description: string;
  effects: Effect[];
  /** Its objective: reach it during the event for the reward (seconds of steady income, racing parts). */
  goal: { metric: EventMetric; target: number; incomeSeconds: number; parts?: number };
}

/** Limited-time market events. Every player sees the same one at the same time. */
export const EVENTS: MarketEvent[] = [
  { id: "rushOrders", emoji: "⚡", name: "Factory Week", description: "Every plant runs 50% faster.", effects: [{ kind: "speed", mult: 1.5 }], goal: { metric: "carsBuilt", target: 25, incomeSeconds: 600 } },
  { id: "carShow", emoji: "🎪", name: "International Car Show", description: "Dealers sell 30% more, +20% markup.", effects: [{ kind: "dealerCap", mult: 1.3 }, { kind: "markup", add: 0.2 }], goal: { metric: "carsSold", target: 25, incomeSeconds: 600 } },
  { id: "steelSale", emoji: "🏷️", name: "Steel Price Crash", description: "Upgrades and plants cost 25% less.", effects: [{ kind: "costMult", mult: 0.75 }], goal: { metric: "upgrades", target: 6, incomeSeconds: 480 } },
  { id: "luxuryBoom", emoji: "💎", name: "Luxury Boom", description: "Sport, luxury and faster cars are worth 50% more.", effects: [{ kind: "value", mult: 1.5, minTier: 5 }], goal: { metric: "premiumBuilt", target: 8, incomeSeconds: 720 } },
  { id: "researchFair", emoji: "🔬", name: "Engineering Fair", description: "Double research points.", effects: [{ kind: "rp", mult: 2 }], goal: { metric: "research", target: 1, incomeSeconds: 480 } },
  { id: "exportDeal", emoji: "🚢", name: "Export Deal", description: "+25% income from everything.", effects: [{ kind: "income", mult: 1.25 }], goal: { metric: "exported", target: 8, incomeSeconds: 720 } },
  { id: "raceWeekend", emoji: "🏁", name: "Race Weekend", description: "+10% income; the crowds are at the circuit.", effects: [{ kind: "income", mult: 1.1 }], goal: { metric: "raceWins", target: 3, incomeSeconds: 600, parts: 5 } },
  { id: "electricWeek", emoji: "🔋", name: "Electric Week", description: "Hypercars and electric cars are worth 40% more.", effects: [{ kind: "value", mult: 1.4, minTier: 8 }], goal: { metric: "topBuilt", target: 3, incomeSeconds: 900 } },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<EventId, MarketEvent>;

/** One event per block: it starts at the beginning of the block and lasts EVENT_LENGTH. */
export const EVENT_BLOCK_MS = 3 * 60 * 60 * 1000;
export const EVENT_LENGTH_MS = 45 * 60 * 1000;
/** Events start this far into each block (so block boundaries stay quiet). */
export const EVENT_OFFSET_MS = 60 * 60 * 1000;
