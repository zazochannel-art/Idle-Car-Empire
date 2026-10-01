import type { UpgradeCategory } from "../types";

export interface UpgradeConfig {
  id: UpgradeCategory;
  name: string;
  description: string;
  /** Category price relative to the factory's upgradeBase. */
  costFactor: number;
  /** Multiplier applied per level (meaning depends on the category). */
  perLevel: number;
  maxLevel: number;
  icon: string;
}

/**
 * Price curve, in multiples of the base price. For the garage (base $100):
 * $100 → $300 → $1,000 → $4,000 → $15K, then ×8 per level. The first levels
 * come every few seconds; later ones are long-term goals.
 */
const HEAD = [1, 3, 10, 40, 150];
export const UPGRADE_TAIL_GROWTH = 8;
export function upgradeCurve(level: number): number {
  if (level < HEAD.length) return HEAD[level];
  return HEAD[HEAD.length - 1] * Math.pow(UPGRADE_TAIL_GROWTH, level - HEAD.length + 1);
}

export const UPGRADES: UpgradeConfig[] = [
  { id: "production", name: "Production", description: "Faster assembly: +12% build speed per level.", costFactor: 1, perLevel: 1.12, maxLevel: 10, icon: "Gauge" },
  { id: "quality", name: "Quality", description: "Better builds: +12% car value per level.", costFactor: 1.4, perLevel: 1.12, maxLevel: 10, icon: "Sparkles" },
  { id: "automation", name: "Automation", description: "Robots: +6% build speed, +4% offline output. Lv 1 automates manual lines.", costFactor: 2, perLevel: 1.06, maxLevel: 10, icon: "Bot" },
  { id: "marketing", name: "Marketing", description: "+6% sell price and +2% chance of a ×2 premium sale per level.", costFactor: 1.2, perLevel: 1.06, maxLevel: 10, icon: "Megaphone" },
  { id: "logistics", name: "Logistics", description: "Faster delivery to dealers: +20% delivery speed per level.", costFactor: 1.6, perLevel: 1.2, maxLevel: 10, icon: "Truck" },
  { id: "technology", name: "Technology", description: "Unlocks the next car tier for this factory, then +6% value per level.", costFactor: 40, perLevel: 1.06, maxLevel: 8, icon: "Cpu" },
];

export const UPGRADE_BY_ID: Record<UpgradeCategory, UpgradeConfig> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeCategory, UpgradeConfig>;

export const UPGRADE_IDS = UPGRADES.map((u) => u.id);

/** Share of each batch spent building vs. driving to the dealer. */
export const BUILD_SHARE = 0.75;
export const DELIVERY_SHARE = 0.25;
export const PREMIUM_CHANCE_PER_LEVEL = 0.02;
export const PREMIUM_CHANCE_MAX = 0.3;
export const AUTOMATION_OFFLINE_PER_LEVEL = 0.04;
