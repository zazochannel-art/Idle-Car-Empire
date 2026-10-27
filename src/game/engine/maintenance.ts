// The maintenance crew: one team for every plant. What a level does is in
// floor.ts (CREW): machines break down less often, a broken one runs again
// sooner, and from level 3 a breakdown no longer costs the crew's morale.
// A level is paid once, at a price that follows the company's income.
import type { GameState } from "../types";
import { passiveIncome, type EconomySnapshot } from "./economy";
import { CREW } from "./floor";

export interface MaintenanceState {
  /** 0 (no crew) … CREW.maxLevel. */
  level: number;
}

export const createMaintenance = (): MaintenanceState => ({ level: 0 });

export const MAINTENANCE_COST = {
  /** The next level's price: this many seconds of the company's income… */
  seconds: [10 * 60, 30 * 60, 3600, 2 * 3600, 4 * 3600],
  /** …and never less than this. */
  min: [100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000],
} as const;

/** What the next level costs; null at the top. */
export function maintenanceCost(s: GameState, snap: EconomySnapshot): number | null {
  const l = s.maintenance.level;
  if (l >= CREW.maxLevel) return null;
  return Math.max(MAINTENANCE_COST.min[l], passiveIncome(snap) * MAINTENANCE_COST.seconds[l]);
}

/** Buys the next level; false when it is at the top or the money isn't there. */
export function upgradeMaintenance(s: GameState, snap: EconomySnapshot): boolean {
  const cost = maintenanceCost(s, snap);
  if (cost === null || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  s.maintenance.level += 1;
  return true;
}

export function migrateMaintenance(raw: unknown): MaintenanceState {
  const level = typeof raw === "object" && raw !== null ? (raw as { level?: unknown }).level : 0;
  return { level: typeof level === "number" && Number.isFinite(level) ? Math.max(0, Math.min(CREW.maxLevel, Math.floor(level))) : 0 };
}
