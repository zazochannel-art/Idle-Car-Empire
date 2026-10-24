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
  /** Total earnings at which the first Stars can be collected. */
  minRunEarnings: 20e9,
  /**
   * Stars earned in all = max(1, floor(perDecade × log10(total earnings / base))), counted from
   * minRunEarnings (engine/imperium.ts starsAt): 3 at $20B, 6 at $100B, 9 at $1T, +3 per tenfold.
   */
  perDecade: 3,
  base: 1e9,
};

/** Stars cost one more for every level: 1, 2, 3 … */
export function starUpgradeCost(level: number): number {
  return level + 1;
}
