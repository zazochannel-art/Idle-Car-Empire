export type StarUpgradeId = "production" | "value" | "offline" | "cost" | "managers";

export interface StarUpgradeConfig {
  id: StarUpgradeId;
  emoji: string;
  /** Effect per level (0.1 = +10%, or −5% for costs). */
  step: number;
  max: number;
}

/** Permanent upgrades bought with ⭐ Stars. They survive every reset. */
export const STAR_UPGRADES: StarUpgradeConfig[] = [
  { id: "production", emoji: "🏭", step: 0.1, max: 10 },
  { id: "value", emoji: "💎", step: 0.1, max: 10 },
  { id: "offline", emoji: "🌙", step: 0.1, max: 10 },
  { id: "cost", emoji: "🏷️", step: 0.05, max: 10 },
  { id: "managers", emoji: "👔", step: 0.1, max: 10 },
];

export const STAR_UPGRADE_BY_ID = Object.fromEntries(STAR_UPGRADES.map((u) => [u.id, u])) as Record<StarUpgradeId, StarUpgradeConfig>;

export const IMPERIUM = {
  /** Expansions needed first: the empire must reach the Global Empire region. */
  minExpansions: 6,
  /** Run earnings needed for the reset. */
  minRunEarnings: 1e12,
  /** Stars = max(1, floor(perDecade × log10(earned since last reset / base))). */
  perDecade: 3,
  base: 1e11,
};

/** Stars cost one more for every level: 1, 2, 3 … */
export function starUpgradeCost(level: number): number {
  return level + 1;
}
