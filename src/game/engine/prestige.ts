import { EMPIRE_PERKS, PRESTIGE } from "../config/prestige";
import { createExport, createFleet } from "./expansion";
import type { GameState } from "../types";
import { STARTER_PLOT, plotOf } from "../city/layout";
import { createChain } from "./chain";
import { createCity } from "./city";
import { constructionTime, plotsFor } from "./construction";
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
  // the old transporters and showrooms are gone: cars on the road or on display are back at the lot
  for (const rc of s.racing.cars) {
    if (rc.location === "transit" || rc.location === "showroom") rc.location = "factory";
    delete rc.listing;
    delete rc.home;
  }
  s.run = createStats();
  s.runStartedAt = now;
  s.pendingOffline = null;
  s.unlocks = [];
  // a new region: new ports and a new division (the engineers and launched models stay)
  s.export = createExport();
  s.fleet = createFleet();
  s.proto.active = null;
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
  // perk plants: free land and construction on their plots, but they are still built (nothing appears at once)
  for (const type of types) {
    if (Object.values(s.city.buildings).some((b) => b.type === type) || Object.values(s.city.sites).some((st) => st.type === type)) continue;
    const free = plotsFor(type).find((id) => s.city.zones.includes(plotOf(id)!.zone) && !s.city.buildings[id] && !s.city.sites[id]);
    if (!free) continue;
    if (!s.city.land.includes(free)) s.city.land.push(free);
    s.city.sites[free] = { type, t: 0, dur: constructionTime(s, free), cost: 0 };
  }
}
