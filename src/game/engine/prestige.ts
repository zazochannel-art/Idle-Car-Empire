import { EMPIRE_PERKS, PRESTIGE } from "../config/prestige";
import type { GameState } from "../types";
import { STARTER_PLOT, WORLD_MAP } from "../city/layout";
import { createChain, newPlant } from "./chain";
import { createCity } from "./city";
import { resetDesignLevels } from "./design";
import { createLogistics } from "./logistics";
import { createDealers, createStats, emptyCarCounts } from "./state";

/** Empire Points a player is entitled to in total for these lifetime earnings. */
export function totalPointsFor(lifetimeEarned: number): number {
  return Math.floor(PRESTIGE.scale * Math.cbrt(Math.max(0, lifetimeEarned) / PRESTIGE.divisor));
}

export function pendingPoints(s: GameState): number {
  return Math.max(0, totalPointsFor(s.lifetime.moneyEarned - s.epBase) - s.empirePointsEarned);
}

/** Lifetime earnings needed for the next Empire Point. */
export function earningsForNextPoint(s: GameState): number {
  const next = s.empirePointsEarned + pendingPoints(s) + 1;
  return Math.pow(next / PRESTIGE.scale, 3) * PRESTIGE.divisor + s.epBase;
}

export function canPrestige(s: GameState): boolean {
  return s.run.moneyEarned >= PRESTIGE.minRunEarnings && pendingPoints(s) >= 1;
}

export function perksFor(points: number) {
  return EMPIRE_PERKS.filter((p) => points >= p.points);
}

/**
 * Global Expansion. Resets cash, plants, the map, dealers and car models.
 * Keeps Empire Points, research, managers (unassigned), achievements and
 * lifetime stats. Start-of-run perks are applied afterwards.
 */
export function prestige(s: GameState, now: number): number {
  if (!canPrestige(s)) return 0;
  const gained = pendingPoints(s);
  s.empirePoints += gained;
  s.empirePointsEarned += gained;
  s.prestigeCount += 1;
  prestigeReset(s, now);
  return gained;
}

/** Clears the current run: shared by Global Expansion and Reset Imperium. */
export function prestigeReset(s: GameState, now: number) {
  s.cash = 0;
  s.dealers = createDealers();
  s.carModels = emptyCarCounts();
  resetDesignLevels(s);
  s.logistics = createLogistics();
  s.city = { ...createCity(), carsServiced: s.city.carsServiced };
  s.chain = createChain();
  // the racing team stays (cars, reputation, trophies); what was on its way from the old plants is gone
  s.racing.orders = [];
  s.racing.arrivals = [];
  s.run = createStats();
  s.runStartedAt = now;
  s.pendingOffline = null;
  for (const m of Object.values(s.managers)) m.assignedTo = null;

  applyStartPerks(s);
}

export function applyStartPerks(s: GameState) {
  const perks = perksFor(s.empirePoints);
  const startCash = Math.max(0, ...perks.map((p) => p.startCash ?? 0));
  s.cash = Math.max(s.cash, startCash);
  const starter = s.city.buildings[STARTER_PLOT]?.plant;
  if (starter && perks.some((p) => p.startAutomation)) starter.automation = Math.max(1, starter.automation);
  const types = [...new Set(perks.flatMap((p) => p.startPlants ?? []))];
  for (const type of types) {
    if (Object.values(s.city.buildings).some((b) => b.type === type)) continue;
    const free = WORLD_MAP.plots.find((p) => p.kind === "plot" && !p.big && p.zone === "town" && !s.city.buildings[p.id]);
    if (free) s.city.buildings[free.id] = { type, level: 1, plant: newPlant() };
  }
}
