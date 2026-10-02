// The Empire Map economy: zones, plot buildings and garages with their
// interior facilities. Garages earn by servicing cars at their workstations;
// support facilities and nearby buildings make them faster or pricier.
import {
  FACILITY_BY_ID,
  FACILITY_GROWTH,
  GARAGE_BUILD_COST,
  GARAGE_GRID,
  GARAGE_LEVEL_COST,
  GARAGE_LEVEL_MULT,
  GARAGE_MAX_LEVEL,
  GARAGE_POWER,
  GARAGE_WORKER_CAP,
  SERVICE_FEE,
  SPECS,
  SPEC_BONUS,
  SPEC_BY_ID,
  SPEC_CHANGE_COST,
  STRUCTURE_BY_ID,
  WORKER_COST,
  WORKER_GROWTH,
  ZONES,
  ZONE_BY_ID,
} from "../config/city";
import { STARTER_PLOT, plotOf, WORLD_MAP, type Plot } from "../city/layout";
import type {
  BuildingState,
  CityState,
  FacilityType,
  GameState,
  GarageData,
  PlacedFacility,
  Specialization,
  StructureType,
  ZoneId,
} from "../types";

// ───────────────────────────── state ─────────────────────────────

export function newGarage(no: number): BuildingState {
  return { type: "garage", level: 1, garage: { no, spec: "repair", workers: 1, facilities: [], carry: 0, serviced: 0, earned: 0 } };
}

export function createCity(): CityState {
  return { zones: ["town"], buildings: { [STARTER_PLOT]: newGarage(1) }, nextUid: 1, nextGarageNo: 2, carsServiced: 0 };
}

export const isZoneUnlocked = (s: GameState, zone: ZoneId) => s.city.zones.includes(zone);

export function isPlotUnlocked(s: GameState, plot: Plot | undefined): boolean {
  return !!plot && isZoneUnlocked(s, plot.zone);
}

/** Unlocks every zone up to and including `zone` (used by perks and old saves). */
export function ensureZonesUpTo(s: GameState, zone: ZoneId) {
  const stage = ZONE_BY_ID[zone].stage;
  for (const z of ZONES) if (z.stage <= stage && !s.city.zones.includes(z.id)) s.city.zones.push(z.id);
}

export function garagePlots(s: GameState): string[] {
  return Object.entries(s.city.buildings)
    .filter(([, b]) => b.type === "garage" && b.garage)
    .sort(([, a], [, b]) => a.garage!.no - b.garage!.no)
    .map(([id]) => id);
}

/** Price/fee multiplier of a plot: how wealthy its district is. */
export function scaleOf(plotId: string) {
  return ZONE_BY_ID[plotOf(plotId)?.zone ?? "town"].scale;
}

// ───────────────────────────── costs ─────────────────────────────

export function nextZone(s: GameState) {
  return ZONES.find((z) => !s.city.zones.includes(z.id)) ?? null;
}

/** Why a zone cannot be unlocked yet: the previous stage, or null if it can. */
export function zoneBlocker(s: GameState, zone: ZoneId): ZoneId | null {
  const cfg = ZONE_BY_ID[zone];
  const prev = ZONES.find((z) => z.stage === cfg.stage - 1);
  return prev && !s.city.zones.includes(prev.id) ? prev.id : null;
}

export function structureCost(s: GameState, plotId: string, type: StructureType): number {
  const plot = plotOf(plotId);
  if (!plot) return Infinity;
  const scale = scaleOf(plotId);
  if (type === "garage") {
    const inZone = Object.entries(s.city.buildings).filter(([id, b]) => b.type === "garage" && plotOf(id)?.zone === plot.zone).length;
    // The first garage of a district is cheap, the second costs
    // GARAGE_BUILD_COST × district scale, and each one after that ×3.
    if (inZone === 0) return (GARAGE_BUILD_COST / 50) * scale;
    return GARAGE_BUILD_COST * scale * Math.pow(3, inZone - 1);
  }
  return STRUCTURE_BY_ID[type].cost * scale;
}

/** Next level of a plot building, or null at max. Garages have their own table. */
export function buildingUpgradeCost(s: GameState, plotId: string): number | null {
  const b = s.city.buildings[plotId];
  if (!b) return null;
  const scale = scaleOf(plotId);
  if (b.type === "garage") {
    if (b.level >= GARAGE_MAX_LEVEL) return null;
    return GARAGE_LEVEL_COST[b.level - 1] * scale;
  }
  const cfg = STRUCTURE_BY_ID[b.type];
  if (b.level >= cfg.maxLevel) return null;
  return cfg.cost * scale * Math.pow(cfg.levelGrowth, b.level);
}

export function facilityCount(g: GarageData, type: FacilityType) {
  return g.facilities.filter((f) => f.type === type).length;
}

export function facilityCap(level: number, type: FacilityType) {
  return FACILITY_BY_ID[type].caps[Math.min(level, GARAGE_MAX_LEVEL) - 1] ?? 0;
}

export function facilityCost(s: GameState, plotId: string, type: FacilityType): number {
  const g = s.city.buildings[plotId]?.garage;
  if (!g) return Infinity;
  return FACILITY_BY_ID[type].cost * scaleOf(plotId) * Math.pow(FACILITY_GROWTH, facilityCount(g, type));
}

export function workerCap(level: number, g: GarageData) {
  return GARAGE_WORKER_CAP[level - 1] + g.facilities.reduce((n, f) => n + (FACILITY_BY_ID[f.type].workers ?? 0), 0);
}

export function workerCost(s: GameState, plotId: string): number | null {
  const b = s.city.buildings[plotId];
  if (!b?.garage || b.garage.workers >= workerCap(b.level, b.garage)) return null;
  return WORKER_COST * scaleOf(plotId) * Math.pow(WORKER_GROWTH, b.garage.workers);
}

export function specCost(s: GameState, plotId: string): number {
  const b = s.city.buildings[plotId];
  return SPEC_CHANGE_COST * scaleOf(plotId) * (b?.level ?? 1);
}

// ───────────────────────────── grid placement ─────────────────────────────

export const gridSize = (level: number) => GARAGE_GRID[Math.min(level, GARAGE_MAX_LEVEL) - 1];

export function footprint(type: FacilityType, rot: 0 | 1) {
  const f = FACILITY_BY_ID[type];
  return rot ? { w: f.d, d: f.w } : { w: f.w, d: f.d };
}

export type PlaceProblem = "bounds" | "overlap" | "cap" | null;

export function placementProblem(level: number, g: GarageData, type: FacilityType, x: number, y: number, rot: 0 | 1, ignoreUid?: number): PlaceProblem {
  const [gw, gd] = gridSize(level);
  const { w, d } = footprint(type, rot);
  if (x < 0 || y < 0 || x + w > gw || y + d > gd) return "bounds";
  for (const f of g.facilities) {
    if (f.uid === ignoreUid) continue;
    const o = footprint(f.type, f.rot);
    if (x < f.x + o.w && f.x < x + w && y < f.y + o.d && f.y < y + d) return "overlap";
  }
  if (ignoreUid === undefined && facilityCount(g, type) >= facilityCap(level, type)) return "cap";
  return null;
}

/** First free spot for a facility, scanning from the back wall forward. */
export function findSpot(level: number, g: GarageData, type: FacilityType, rot: 0 | 1): { x: number; y: number } | null {
  const [gw, gd] = gridSize(level);
  for (let y = 0; y < gd; y++)
    for (let x = 0; x < gw; x++) {
      const p = placementProblem(level, g, type, x, y, rot, -1);
      if (p === null) return { x, y };
    }
  return null;
}

// ───────────────────────────── stats ─────────────────────────────

export interface StationStats {
  uid: number;
  type: FacilityType;
  /** What one serviced car pays here. */
  perCar: number;
  /** Seconds per car. */
  time: number;
  staffed: boolean;
  boosted: boolean;
}

export interface GarageStats {
  plotId: string;
  zone: ZoneId;
  level: number;
  stations: StationStats[];
  workstations: number;
  staffed: number;
  workers: number;
  workerCap: number;
  power: number;
  powerCap: number;
  /** 1 when there is enough power, lower when overloaded. */
  powerFactor: number;
  /** Share of workstations running at full speed. */
  efficiency: number;
  speedMult: number;
  valueMult: number;
  incomePerSec: number;
  carsPerSec: number;
}

export interface CitySnapshot {
  garages: Record<string, GarageStats>;
  /** Flat income from car washes, service centres… */
  structureIncome: Record<string, number>;
  incomePerSec: number;
  carsPerSec: number;
}

/** Bonuses that nearby plot buildings give to garages in the same zone. */
function zoneGarageBonus(s: GameState, zone: ZoneId) {
  let income = 0;
  let speed = 0;
  for (const [id, b] of Object.entries(s.city.buildings)) {
    if (b.type === "garage" || plotOf(id)?.zone !== zone) continue;
    const cfg = STRUCTURE_BY_ID[b.type];
    income += (cfg.zoneGarageIncome ?? 0) * b.level;
    speed += (cfg.zoneGarageSpeed ?? 0) * b.level;
  }
  return { income, speed };
}

export function garageStats(s: GameState, plotId: string, incomeMult: number): GarageStats | null {
  const b = s.city.buildings[plotId];
  const plot = plotOf(plotId);
  if (!b?.garage || !plot) return null;
  const g = b.garage;
  const zone = ZONE_BY_ID[plot.zone];
  const spec = SPEC_BY_ID[g.spec] ?? SPECS[0];
  const near = zoneGarageBonus(s, plot.zone);

  let incomeBonus = near.income;
  let speedBonus = near.speed;
  let power = 0;
  for (const f of g.facilities) {
    const cfg = FACILITY_BY_ID[f.type];
    incomeBonus += cfg.income ?? 0;
    speedBonus += cfg.speed ?? 0;
    power += cfg.power;
  }
  const powerCap = GARAGE_POWER[b.level - 1];
  const powerFactor = power > powerCap ? powerCap / power : 1;
  const speedMult = (1 + speedBonus) * powerFactor;
  const valueMult = Math.pow(GARAGE_LEVEL_MULT, b.level - 1) * (1 + incomeBonus) * incomeMult;

  const stations: StationStats[] = g.facilities
    .filter((f) => FACILITY_BY_ID[f.type].fee)
    .map((f) => {
      const cfg = FACILITY_BY_ID[f.type];
      const boosted = spec.boosts.includes(f.type);
      return {
        uid: f.uid,
        type: f.type,
        perCar: cfg.fee! * SERVICE_FEE * zone.scale * valueMult * (boosted ? SPEC_BONUS : 1),
        time: cfg.time! / speedMult,
        staffed: false,
        boosted,
      };
    });
  // Mechanics go to the best-paying stations first.
  const byIncome = [...stations].sort((a, b2) => b2.perCar / b2.time - a.perCar / a.time);
  byIncome.slice(0, g.workers).forEach((st) => (st.staffed = true));

  let incomePerSec = 0;
  let carsPerSec = 0;
  for (const st of stations) {
    if (!st.staffed) continue;
    incomePerSec += st.perCar / st.time;
    carsPerSec += 1 / st.time;
  }
  const staffed = Math.min(g.workers, stations.length);
  return {
    plotId,
    zone: plot.zone,
    level: b.level,
    stations,
    workstations: stations.length,
    staffed,
    workers: g.workers,
    workerCap: workerCap(b.level, g),
    power,
    powerCap,
    powerFactor,
    efficiency: stations.length ? (staffed / stations.length) * powerFactor : 0,
    speedMult,
    valueMult,
    incomePerSec,
    carsPerSec,
  };
}

export function citySnapshot(s: GameState, incomeMult: number): CitySnapshot {
  const garages: Record<string, GarageStats> = {};
  const structureIncome: Record<string, number> = {};
  let incomePerSec = 0;
  let carsPerSec = 0;
  for (const [id, b] of Object.entries(s.city.buildings)) {
    if (b.type === "garage") {
      const st = garageStats(s, id, incomeMult);
      if (!st) continue;
      garages[id] = st;
      incomePerSec += st.incomePerSec;
      carsPerSec += st.carsPerSec;
    } else {
      const cfg = STRUCTURE_BY_ID[b.type];
      if (!cfg.income) continue;
      const inc = cfg.income * scaleOf(id) * b.level * incomeMult;
      structureIncome[id] = inc;
      incomePerSec += inc;
    }
  }
  return { garages, structureIncome, incomePerSec, carsPerSec };
}

/**
 * Global effects of plot buildings. Bonuses of the same kind add up (two
 * Parts Factories at level 3 give +2 × 3 × 3%), so building more helps
 * without compounding out of control.
 */
export function cityEffects(s: GameState) {
  const e = { speed: 1, delivery: 1, dealerCap: 1, rp: 1, markup: 0, income: 1 };
  for (const b of Object.values(s.city.buildings)) {
    if (b.type === "garage") continue;
    const cfg = STRUCTURE_BY_ID[b.type];
    e.speed += (cfg.speed ?? 0) * b.level;
    e.delivery += (cfg.delivery ?? 0) * b.level;
    e.dealerCap += (cfg.dealerCap ?? 0) * b.level;
    e.rp += (cfg.rp ?? 0) * b.level;
    e.markup += (cfg.markup ?? 0) * b.level;
    e.income += (cfg.income2 ?? 0) * b.level;
  }
  return e;
}

/** Credits garage and structure income for `dt` seconds. */
export function cityTick(s: GameState, dt: number, snap: CitySnapshot, credit: (amount: number) => void) {
  for (const [id, st] of Object.entries(snap.garages)) {
    const g = s.city.buildings[id]?.garage;
    if (!g || st.incomePerSec <= 0) continue;
    const earned = st.incomePerSec * dt;
    credit(earned);
    g.earned += earned;
    g.carry += st.carsPerSec * dt;
    const whole = Math.floor(g.carry);
    if (whole > 0) {
      g.carry -= whole;
      g.serviced += whole;
      s.city.carsServiced += whole;
    }
  }
  for (const inc of Object.values(snap.structureIncome)) credit(inc * dt);
}

// ───────────────────────────── actions ─────────────────────────────

function spend(s: GameState, cost: number | null): boolean {
  if (cost === null || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  return true;
}

export function unlockZone(s: GameState, zone: ZoneId): boolean {
  if (isZoneUnlocked(s, zone) || zoneBlocker(s, zone)) return false;
  if (!spend(s, ZONE_BY_ID[zone].cost)) return false;
  s.city.zones.push(zone);
  return true;
}

export function canBuildOn(s: GameState, plotId: string): boolean {
  const plot = plotOf(plotId);
  return !!plot && plot.kind === "plot" && isZoneUnlocked(s, plot.zone) && !s.city.buildings[plotId];
}

/** Support buildings are one per district; garages are unlimited. */
export function builtInZone(s: GameState, zone: ZoneId, type: StructureType): boolean {
  return Object.entries(s.city.buildings).some(([id, b]) => b.type === type && plotOf(id)?.zone === zone);
}

export function buildStructure(s: GameState, plotId: string, type: StructureType): boolean {
  const plot = plotOf(plotId);
  if (!plot || !canBuildOn(s, plotId) || !ZONE_BY_ID[plot.zone].builds.includes(type)) return false;
  if (type !== "garage" && builtInZone(s, plot.zone, type)) return false;
  if (!spend(s, structureCost(s, plotId, type))) return false;
  if (type === "garage") {
    s.city.buildings[plotId] = newGarage(s.city.nextGarageNo++);
  } else {
    s.city.buildings[plotId] = { type, level: 1 };
  }
  return true;
}

export function upgradeBuilding(s: GameState, plotId: string): boolean {
  const b = s.city.buildings[plotId];
  if (!b || !spend(s, buildingUpgradeCost(s, plotId))) return false;
  b.level += 1;
  return true;
}

export function placeFacility(s: GameState, plotId: string, type: FacilityType, x: number, y: number, rot: 0 | 1): boolean {
  const b = s.city.buildings[plotId];
  if (!b?.garage) return false;
  if (placementProblem(b.level, b.garage, type, x, y, rot) !== null) return false;
  if (!spend(s, facilityCost(s, plotId, type))) return false;
  const placed: PlacedFacility = { uid: s.city.nextUid++, type, x, y, rot };
  b.garage.facilities.push(placed);
  return true;
}

/** Moves (and/or rotates) an existing facility for free. */
export function moveFacility(s: GameState, plotId: string, uid: number, x: number, y: number, rot: 0 | 1): boolean {
  const b = s.city.buildings[plotId];
  const f = b?.garage?.facilities.find((it) => it.uid === uid);
  if (!b?.garage || !f) return false;
  if (placementProblem(b.level, b.garage, f.type, x, y, rot, uid) !== null) return false;
  f.x = x;
  f.y = y;
  f.rot = rot;
  return true;
}

/** Demolishes a facility and refunds half of what the last one of its kind cost. */
export function removeFacility(s: GameState, plotId: string, uid: number): boolean {
  const g = s.city.buildings[plotId]?.garage;
  const idx = g?.facilities.findIndex((f) => f.uid === uid) ?? -1;
  if (!g || idx < 0) return false;
  const [f] = g.facilities.splice(idx, 1);
  s.cash += facilityCost(s, plotId, f.type) * 0.5;
  return true;
}

export function hireWorker(s: GameState, plotId: string): boolean {
  const g = s.city.buildings[plotId]?.garage;
  if (!g || !spend(s, workerCost(s, plotId))) return false;
  g.workers += 1;
  return true;
}

export function setSpecialization(s: GameState, plotId: string, spec: Specialization): boolean {
  const b = s.city.buildings[plotId];
  if (!b?.garage || b.garage.spec === spec || b.level < SPEC_BY_ID[spec].level) return false;
  if (!spend(s, specCost(s, plotId))) return false;
  b.garage.spec = spec;
  return true;
}

// ───────────────────────────── saves ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : dflt;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Rebuilds a valid CityState from whatever a save contained. */
export function migrateCity(raw: unknown): CityState {
  const city = createCity();
  if (!isObj(raw)) return city;
  if (Array.isArray(raw.zones)) {
    const ids = new Set(ZONES.map((z) => z.id as string));
    city.zones = [...new Set(["town", ...raw.zones.filter((z): z is string => typeof z === "string" && ids.has(z))])] as ZoneId[];
  }
  if (isObj(raw.buildings)) {
    city.buildings = {};
    let maxUid = 0;
    let maxNo = 0;
    for (const [id, b] of Object.entries(raw.buildings)) {
      const plot = plotOf(id);
      if (!plot || plot.kind !== "plot" || !isObj(b) || typeof b.type !== "string" || !(b.type in STRUCTURE_BY_ID)) continue;
      const type = b.type as StructureType;
      const maxLevel = type === "garage" ? GARAGE_MAX_LEVEL : STRUCTURE_BY_ID[type].maxLevel;
      const level = int(b.level, 1, maxLevel, 1);
      if (type !== "garage") {
        city.buildings[id] = { type, level };
        continue;
      }
      const g = isObj(b.garage) ? b.garage : {};
      const no = int(g.no, 1, 9999, maxNo + 1);
      maxNo = Math.max(maxNo, no);
      const building = newGarage(no);
      building.level = level;
      const data = building.garage!;
      data.spec = typeof g.spec === "string" && g.spec in SPEC_BY_ID ? (g.spec as Specialization) : "repair";
      data.workers = int(g.workers, 0, 1000, 1);
      data.carry = Math.min(1, num(g.carry));
      data.serviced = num(g.serviced);
      data.earned = num(g.earned);
      if (Array.isArray(g.facilities)) {
        for (const f of g.facilities) {
          if (!isObj(f) || typeof f.type !== "string" || !(f.type in FACILITY_BY_ID)) continue;
          const placed: PlacedFacility = { uid: int(f.uid, 1, 1e9, ++maxUid), type: f.type as FacilityType, x: int(f.x, 0, 99, 0), y: int(f.y, 0, 99, 0), rot: f.rot === 1 ? 1 : 0 };
          if (placementProblem(level, data, placed.type, placed.x, placed.y, placed.rot, -1) !== null) continue;
          data.facilities.push(placed);
          maxUid = Math.max(maxUid, placed.uid);
        }
      }
      city.buildings[id] = building;
    }
    if (!city.buildings[STARTER_PLOT]) city.buildings[STARTER_PLOT] = newGarage(maxNo + 1);
    maxNo = Math.max(maxNo, city.buildings[STARTER_PLOT].garage?.no ?? 0);
    city.nextUid = Math.max(int(raw.nextUid, 1, 1e9, 1), maxUid + 1);
    city.nextGarageNo = Math.max(int(raw.nextGarageNo, 2, 9999, 2), maxNo + 1);
  }
  city.carsServiced = num(raw.carsServiced);
  return city;
}

/** Saves from before the map: open the zones that hold what the player owns. */
export function unlockOwnedZones(s: GameState) {
  for (const p of WORLD_MAP.plots) {
    const owned = (p.factory && s.factories[p.factory].owned) || (p.dealer && s.dealers[p.dealer].owned);
    if (owned) ensureZonesUpTo(s, p.zone);
  }
}

