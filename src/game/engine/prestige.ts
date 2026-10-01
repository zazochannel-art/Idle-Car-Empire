import { EMPIRE_PERKS, PRESTIGE } from "../config/prestige";
import type { GameState } from "../types";
import { createDealers, createFactories, createStats, emptyCarCounts } from "./state";

/** Empire Points a player is entitled to in total for these lifetime earnings. */
export function totalPointsFor(lifetimeEarned: number): number {
  return Math.floor(PRESTIGE.scale * Math.cbrt(Math.max(0, lifetimeEarned) / PRESTIGE.divisor));
}

export function pendingPoints(s: GameState): number {
  return Math.max(0, totalPointsFor(s.lifetime.moneyEarned) - s.empirePointsEarned);
}

/** Lifetime earnings needed for the next Empire Point. */
export function earningsForNextPoint(s: GameState): number {
  const next = s.empirePointsEarned + pendingPoints(s) + 1;
  return Math.pow(next / PRESTIGE.scale, 3) * PRESTIGE.divisor;
}

export function canPrestige(s: GameState): boolean {
  return s.run.moneyEarned >= PRESTIGE.minRunEarnings && pendingPoints(s) >= 1;
}

export function perksFor(points: number) {
  return EMPIRE_PERKS.filter((p) => points >= p.points);
}

/**
 * Global Expansion. Resets cash, factories, upgrades, dealers and car models.
 * Keeps Empire Points, research, managers (unassigned), achievements and
 * lifetime stats. Start-of-run perks are applied afterwards.
 */
export function prestige(s: GameState, now: number): number {
  if (!canPrestige(s)) return 0;
  const gained = pendingPoints(s);
  s.empirePoints += gained;
  s.empirePointsEarned += gained;
  s.prestigeCount += 1;

  s.cash = 0;
  s.factories = createFactories();
  s.dealers = createDealers();
  s.carModels = emptyCarCounts();
  s.run = createStats();
  s.runStartedAt = now;
  s.pendingOffline = null;
  for (const m of Object.values(s.managers)) m.assignedTo = null;

  applyStartPerks(s);
  return gained;
}

export function applyStartPerks(s: GameState) {
  const perks = perksFor(s.empirePoints);
  const startCash = Math.max(0, ...perks.map((p) => p.startCash ?? 0));
  s.cash = Math.max(s.cash, startCash);
  if (perks.some((p) => p.startAutomation)) s.factories.garage.upgrades.automation = Math.max(1, s.factories.garage.upgrades.automation);
  for (const p of perks) if (p.startFactory) s.factories[p.startFactory].owned = true;
}
