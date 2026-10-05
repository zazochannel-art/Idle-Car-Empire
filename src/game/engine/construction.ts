// Land and construction: every important building goes
//   land plot → purchase → construction site → building → upgrades
// Plots are zoned for one kind of building (config/city.ts PLOT_USES). The
// player buys the land, then pays for the construction, which takes real
// time (it carries on offline) and shows on the map as a building site going
// through its phases. Level upgrades are built the same way while the
// building keeps working. Nothing appears instantly; paying to finish early
// is possible but never the default.
import { regionCostMult } from "../config/regions";
import {
  BUILD_SIZE_MULT,
  BUILD_TIME,
  LAND_SHARE,
  LAND_SIZE_MULT,
  SPEED_UP_SHARE,
  UPGRADE_TIME,
  type PlotSize,
} from "../config/city";
import { isPlantType } from "../config/chain";
import { WORLD_MAP, plotOf } from "../city/layout";
import type { BuildingState, GameEvent, GameState, StructureType, ZoneId } from "../types";
import { newPlant, plantLock, type PlantLock } from "./chain";
import { builtInZone, isZoneUnlocked, newGarage, structureCost } from "./city";

export type PlotStatus = "locked" | "available" | "owned" | "construction" | "operational";

export type LandLock = { kind: "zone"; zone: ZoneId } | { kind: "chain"; lock: NonNullable<PlantLock> } | { kind: "onePerZone" } | null;

/** The phases a construction goes through (share of the time at which each starts). */
export const PHASES = [
  { id: "site", from: 0 },
  { id: "foundation", from: 0.15 },
  { id: "structure", from: 0.3 },
  { id: "walls", from: 0.5 },
  { id: "equipment", from: 0.7 },
  { id: "final", from: 0.9 },
] as const;
export type PhaseId = (typeof PHASES)[number]["id"];

export function phaseOf(progress: number): PhaseId {
  let id: PhaseId = "site";
  for (const p of PHASES) if (progress >= p.from) id = p.id;
  return id;
}

const scaled = (cfg: { min: number; base: number; ref: number; exp: number; max: number }, cost: number, mult = 1) =>
  Math.round(Math.min(cfg.max, Math.max(cfg.min, cfg.base * Math.pow(Math.max(cost, 1) / cfg.ref, cfg.exp) * mult)));

/** Seconds to put up a building that costs `cost` on a plot of this size. */
export const buildTime = (cost: number, size: PlotSize = "small") => scaled(BUILD_TIME, cost, BUILD_SIZE_MULT[size]);
/** Seconds to build a level upgrade that costs `cost`. */
export const upgradeTime = (cost: number) => scaled(UPGRADE_TIME, cost);

export const ownsLand = (s: GameState, plotId: string) => s.city.land.includes(plotId) || !!s.city.buildings[plotId];

/** What the plot is zoned for (null for lots that are not building plots). */
export function plotUse(plotId: string): StructureType | null {
  const p = plotOf(plotId);
  return p?.kind === "plot" ? (p.use ?? null) : null;
}

/** Why the plot cannot be bought or built on yet. */
export function landLock(s: GameState, plotId: string): LandLock {
  const plot = plotOf(plotId);
  const use = plotUse(plotId);
  if (!plot || !use) return null;
  if (!isZoneUnlocked(s, plot.zone)) return { kind: "zone", zone: plot.zone };
  if (isPlantType(use)) {
    const lock = plantLock(s, use);
    if (lock) return { kind: "chain", lock };
  } else if (use !== "garage" && !s.city.buildings[plotId] && !s.city.sites[plotId] && (builtInZone(s, plot.zone, use) || siteInZone(s, plot.zone, use)))
    return { kind: "onePerZone" };
  return null;
}

function siteInZone(s: GameState, zone: ZoneId, type: StructureType) {
  return Object.entries(s.city.sites).some(([id, st]) => st.type === type && plotOf(id)?.zone === zone);
}

export function plotStatus(s: GameState, plotId: string): PlotStatus {
  if (s.city.buildings[plotId]) return "operational";
  if (s.city.sites[plotId]) return "construction";
  if (ownsLand(s, plotId)) return "owned";
  return landLock(s, plotId) ? "locked" : "available";
}

/** Price of the whole building on this plot (land + construction). */
function fullPrice(s: GameState, plotId: string): number {
  const use = plotUse(plotId);
  return use ? structureCost(s, plotId, use) : Infinity;
}

export function landCost(s: GameState, plotId: string): number {
  const size = plotOf(plotId)?.size ?? "small";
  return fullPrice(s, plotId) * LAND_SHARE * LAND_SIZE_MULT[size];
}

export function constructionCost(s: GameState, plotId: string): number {
  return fullPrice(s, plotId) * (1 - LAND_SHARE);
}

/**
 * How long the construction on this plot takes: from the building's price
 * before the region's cost multiplier (a later region pays more, but does not
 * wait longer) and the plot's size.
 */
export function constructionTime(s: GameState, plotId: string): number {
  const use = plotUse(plotId);
  const plot = plotOf(plotId);
  if (!use || !plot) return BUILD_TIME.min;
  return buildTime(fullPrice(s, plotId) / regionCostMult(s.prestigeCount), plot.size);
}

function spend(s: GameState, cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0 || s.cash < cost) return false;
  s.cash -= cost;
  return true;
}

export function buyLand(s: GameState, plotId: string): boolean {
  if (!plotUse(plotId) || ownsLand(s, plotId) || landLock(s, plotId)) return false;
  if (!spend(s, landCost(s, plotId))) return false;
  s.city.land.push(plotId);
  return true;
}

/** Starts building what the plot is zoned for, on land the player owns. */
export function startConstruction(s: GameState, plotId: string): boolean {
  const use = plotUse(plotId);
  if (!use || !ownsLand(s, plotId) || s.city.buildings[plotId] || s.city.sites[plotId] || landLock(s, plotId)) return false;
  const cost = constructionCost(s, plotId);
  const dur = constructionTime(s, plotId);
  if (!spend(s, cost)) return false;
  s.city.sites[plotId] = { type: use, t: 0, dur, cost };
  return true;
}

/** Buys the land if needed and starts the construction: both or neither. */
export function buyAndBuild(s: GameState, plotId: string): boolean {
  if (!plotUse(plotId) || landLock(s, plotId) || s.city.buildings[plotId] || s.city.sites[plotId]) return false;
  const land = ownsLand(s, plotId) ? 0 : landCost(s, plotId);
  if (s.cash < land + constructionCost(s, plotId)) return false;
  if (land > 0 && !buyLand(s, plotId)) return false;
  return startConstruction(s, plotId);
}

/** Pays for a level upgrade and starts building it (one job per building at a time). */
export function startWorks(s: GameState, plotId: string, cost: number | null): boolean {
  const b = s.city.buildings[plotId];
  if (!b || b.works || cost === null || !spend(s, cost)) return false;
  // timed from the price before the region's cost multiplier
  b.works = { to: b.level + 1, t: 0, dur: upgradeTime(cost / regionCostMult(s.prestigeCount)), cost };
  return true;
}

/** Progress (0–1) of whatever is being built on the plot, or null. */
export function progressOf(s: GameState, plotId: string): number | null {
  const job = s.city.sites[plotId] ?? s.city.buildings[plotId]?.works;
  return job ? Math.min(1, job.t / Math.max(1, job.dur)) : null;
}

export function remainingOf(s: GameState, plotId: string): number {
  const job = s.city.sites[plotId] ?? s.city.buildings[plotId]?.works;
  return job ? Math.max(0, job.dur - job.t) : 0;
}

/** Price to finish the job now: a share of its cost for the part still to do. */
export function speedUpCost(s: GameState, plotId: string): number | null {
  const job = s.city.sites[plotId] ?? s.city.buildings[plotId]?.works;
  if (!job || job.t >= job.dur) return null;
  return Math.max(1, job.cost * SPEED_UP_SHARE * (1 - job.t / job.dur));
}

export function speedUp(s: GameState, plotId: string): boolean {
  const cost = speedUpCost(s, plotId);
  const job = s.city.sites[plotId] ?? s.city.buildings[plotId]?.works;
  if (!job || cost === null || !spend(s, cost)) return false;
  job.t = job.dur;
  return true;
}

function finished(s: GameState, plotId: string, type: StructureType): BuildingState {
  if (isPlantType(type)) return { type, level: 1, plant: newPlant() };
  if (type === "garage") return newGarage(s.city.nextGarageNo++);
  return { type, level: 1 };
}

/** Moves every construction forward by `dt` seconds; returns what was finished. */
export function constructionTick(s: GameState, dt: number, events?: GameEvent[]): string[] {
  const done: string[] = [];
  for (const [id, site] of Object.entries(s.city.sites)) {
    site.t = Math.min(site.dur, site.t + dt);
    if (site.t < site.dur) continue;
    delete s.city.sites[id];
    if (!s.city.land.includes(id)) s.city.land.push(id);
    s.city.buildings[id] = finished(s, id, site.type);
    done.push(id);
    events?.push({ type: "built", plot: id, structure: site.type, level: 1, upgrade: false });
  }
  for (const [id, b] of Object.entries(s.city.buildings)) {
    const w = b.works;
    if (!w) continue;
    w.t = Math.min(w.dur, w.t + dt);
    if (w.t < w.dur) continue;
    b.level = Math.max(b.level, w.to);
    delete b.works;
    events?.push({ type: "built", plot: id, structure: b.type, level: b.level, upgrade: true });
  }
  return done;
}

/** First plot zoned for `type` that can be built on now (land already owned first). */
export function freePlotFor(s: GameState, type: StructureType): string | null {
  let best: string | null = null;
  for (const p of plotsFor(type)) {
    if (s.city.buildings[p] || s.city.sites[p] || landLock(s, p)) continue;
    if (ownsLand(s, p)) return p;
    best ??= p;
  }
  return best;
}

const PLOTS_FOR = new Map<StructureType, string[]>();
/** Every plot zoned for `type`, nearest first. */
export function plotsFor(type: StructureType): string[] {
  let hit = PLOTS_FOR.get(type);
  if (!hit) {
    hit = WORLD_MAP.plots
      .filter((p) => p.use === type)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((p) => p.id);
    PLOTS_FOR.set(type, hit);
  }
  return hit;
}
