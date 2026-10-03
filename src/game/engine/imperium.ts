import { IMPERIUM, STAR_UPGRADE_BY_ID, starUpgradeCost, type StarUpgradeId } from "../config/imperium";
import type { GameState } from "../types";
import { prestigeReset } from "./prestige";

/** Lifetime earnings since the last Reset Imperium. */
export function earnedSinceImperium(s: GameState): number {
  return Math.max(0, s.lifetime.moneyEarned - s.epBase);
}

export function pendingStars(s: GameState): number {
  const x = earnedSinceImperium(s) / IMPERIUM.base;
  return x <= 1 ? 1 : Math.max(1, Math.floor(IMPERIUM.perDecade * Math.log10(x)));
}

export function canImperium(s: GameState): boolean {
  return s.prestigeCount >= IMPERIUM.minExpansions && s.run.moneyEarned >= IMPERIUM.minRunEarnings;
}

/**
 * Reset Imperium: the end-game reset. On top of a Global Expansion it also
 * clears Empire Points, the region (back to Local Factory) and research.
 * Keeps ⭐ Stars and their upgrades, milestone boosts, managers,
 * achievements and statistics.
 */
export function imperium(s: GameState, now: number): number {
  if (!canImperium(s)) return 0;
  const gained = pendingStars(s);
  s.stars += gained;
  s.imperiumCount += 1;
  s.empirePoints = 0;
  s.empirePointsEarned = 0;
  s.epBase = s.lifetime.moneyEarned;
  s.prestigeCount = 0;
  s.research = [];
  s.rp = 0;
  prestigeReset(s, now);
  return gained;
}

export function starLevel(s: GameState, id: StarUpgradeId): number {
  return s.starUpgrades[id] ?? 0;
}

/** Cost of the next level in Stars, or null at max. */
export function starCost(s: GameState, id: StarUpgradeId): number | null {
  const lvl = starLevel(s, id);
  return lvl >= STAR_UPGRADE_BY_ID[id].max ? null : starUpgradeCost(lvl);
}

export function buyStarUpgrade(s: GameState, id: StarUpgradeId): boolean {
  const cost = starCost(s, id);
  if (cost === null || s.stars < cost) return false;
  s.stars -= cost;
  s.starUpgrades[id] = starLevel(s, id) + 1;
  return true;
}

/** Strength of the Star upgrades as multipliers. */
export function starMods(s: GameState) {
  const l = (id: StarUpgradeId) => starLevel(s, id) * STAR_UPGRADE_BY_ID[id].step;
  return {
    speed: 1 + l("production"),
    value: 1 + l("value"),
    offline: l("offline"),
    cost: Math.max(0.5, 1 - l("cost")),
    managers: 1 + l("managers"),
  };
}
