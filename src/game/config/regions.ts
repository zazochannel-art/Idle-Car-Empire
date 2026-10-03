import type { Effect } from "../types";

export type RegionId = "local" | "romania" | "germany" | "italy" | "japan" | "usa" | "global";

export interface RegionConfig {
  id: RegionId;
  emoji: string;
  name: string;
  /** What the market is known for (shown in the Expansion screen). */
  flavor: string;
  /** Bonuses of operating in this region; costMult is the price of the bigger market. */
  effects: Effect[];
}

/**
 * Global Expansion ladder: every expansion moves the empire to the next
 * region. Each region pays more but plants, upgrades and dealers cost more.
 */
export const REGIONS: RegionConfig[] = [
  { id: "local", emoji: "🏭", name: "Local Factory", flavor: "A single workshop on the edge of town.", effects: [] },
  {
    id: "romania",
    emoji: "🇷🇴",
    name: "Romania",
    flavor: "Cheap skilled labour and a fast-growing home market.",
    effects: [{ kind: "income", mult: 1.5 }, { kind: "speed", mult: 1.1 }, { kind: "costMult", mult: 1.1 }],
  },
  {
    id: "germany",
    emoji: "🇩🇪",
    name: "Germany",
    flavor: "Precision engineering: every car is worth more.",
    effects: [{ kind: "income", mult: 2 }, { kind: "value", mult: 1.5 }, { kind: "costMult", mult: 1.25 }],
  },
  {
    id: "italy",
    emoji: "🇮🇹",
    name: "Italy",
    flavor: "Design houses and supercar buyers: sport and luxury cars sell for more.",
    effects: [{ kind: "income", mult: 3 }, { kind: "value", mult: 1.5, minTier: 5 }, { kind: "markup", add: 0.1 }, { kind: "costMult", mult: 1.4 }],
  },
  {
    id: "japan",
    emoji: "🇯🇵",
    name: "Japan",
    flavor: "Lean production: lines and trucks run faster.",
    effects: [{ kind: "income", mult: 4.5 }, { kind: "speed", mult: 1.5 }, { kind: "delivery", mult: 1.3 }, { kind: "costMult", mult: 1.6 }],
  },
  {
    id: "usa",
    emoji: "🇺🇸",
    name: "USA",
    flavor: "The biggest car market on earth: dealers sell much more.",
    effects: [{ kind: "income", mult: 7 }, { kind: "dealerCap", mult: 1.5 }, { kind: "costMult", mult: 1.8 }],
  },
  {
    id: "global",
    emoji: "🌐",
    name: "Global Empire",
    flavor: "Plants and dealers on every continent, working around the clock.",
    effects: [{ kind: "income", mult: 12 }, { kind: "speed", mult: 1.5 }, { kind: "offline", add: 0.25 }, { kind: "costMult", mult: 2 }],
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionConfig>;

/** The region the empire operates in after this many expansions. */
export function regionIndex(prestigeCount: number): number {
  return Math.min(REGIONS.length - 1, Math.max(0, prestigeCount));
}

/** The region's price multiplier on everything you build. */
export function regionCostMult(prestigeCount: number): number {
  return REGIONS[regionIndex(prestigeCount)].effects.reduce((a, e) => (e.kind === "costMult" ? a * e.mult : a), 1);
}
