import { IMPERIUM, STAR_UPGRADE_BY_ID, starUpgradeCost, type StarUpgradeId } from "../config/imperium";
import type { GameState } from "../types";

/** Lifetime earnings since Stars were last collected. */
export function earnedSinceImperium(s: GameState): number {
  return Math.max(0, s.lifetime.moneyEarned - s.epBase);
}

/**
 * The Stars a company has earned in all by the time it has earned `earned`. They grow with the
 * logarithm of total earnings, so collecting often or once gives the same Stars.
 */
export function starsAt(earned: number): number {
  if (earned < IMPERIUM.minRunEarnings) return 0;
  return Math.max(1, Math.floor(IMPERIUM.perDecade * Math.log10(earned / IMPERIUM.base)));
}

/** Stars waiting to be collected: those earned since the last collection. */
export function pendingStars(s: GameState): number {
  return Math.max(0, starsAt(s.lifetime.moneyEarned) - starsAt(s.epBase));
}

/** Total earnings at which the next Star (after those waiting) is due. */
export function nextStarAt(s: GameState): number {
  const have = Math.max(starsAt(s.lifetime.moneyEarned), starsAt(s.epBase));
  if (have === 0) return IMPERIUM.minRunEarnings;
  return Math.max(IMPERIUM.minRunEarnings, IMPERIUM.base * 10 ** ((have + 1) / IMPERIUM.perDecade));
}

export function canImperium(s: GameState): boolean {
  return pendingStars(s) > 0;
}

/**
 * Collects the ⭐ Stars earned since the last collection. Nothing is reset: the plants, the
 * cash and research all stay (the progress is permanent). Saves from before kept their
 * epBase from the old resets, so they count from there.
 */
export function imperium(s: GameState): number {
  const gained = pendingStars(s);
  if (gained <= 0) return 0;
  s.stars += gained;
  s.imperiumCount += 1;
  s.epBase = s.lifetime.moneyEarned;
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
