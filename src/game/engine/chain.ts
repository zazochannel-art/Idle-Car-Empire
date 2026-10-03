// The supply chain. Plants on the map turn raw material into components;
// trucks (real objects with a route and a travel time) carry everything:
// raw material from the Materials Depot, components to the Parts Market or
// to a Car Assembly Plant, finished cars to dealerships. Money only comes in
// when a load is sold at the market or a customer buys a car.
import { regionCostMult } from "../config/regions";
import { CARS, CAR_BY_ID, CAR_MODEL, type CarConfig } from "../config/cars";
import {
  AUTOMATION,
  BASE_RECIPE,
  CHASSIS_BONUS,
  CARRIER_CAPACITY,
  COMPONENT_BY_ID,
  DEALER_SALE,
  DOCK_TIME,
  GRADES,
  MAKER,
  MATERIAL_SHARE,
  MAX_GRADE,
  MAX_WAIT,
  OUT_STORAGE,
  PLANT_BY_ID,
  PLANT_COPY_COST,
  MAX_TRUCKS,
  PLANT_LEVELS,
  PLANT_MAX_LEVEL,
  PLANT_TRUCKS,
  PLANT_VEHICLE,
  RATE_WINDOW,
  RAW_STORAGE,
  RESUPPLY_AT,
  SPEED,
  SUPPLY_LOAD,
  TRUCK_SPEED,
  VEHICLE_CAPACITY,
  isPlantType,
} from "../config/chain";
import { DEALERS, DEALER_BY_ID, DEALER_MARKUP_PER_LEVEL, DEALER_SPECIALTY } from "../config/dealerships";
import { MANAGERS } from "../config/managers";
import { OFFLINE } from "../config/prestige";
import { DEPOT, MARKET, plotOf } from "../city/layout";
import type {
  BuildingState,
  CarId,
  ChainState,
  ComponentId,
  DealerId,
  DealerStock,
  GameEvent,
  GameState,
  ItemId,
  PlantData,
  PlantType,
  Shipment,
} from "../types";
import { designStats } from "./design";
import { logisticsMods } from "./logistics";
import { starMods } from "./imperium";
import { managerMult, type GlobalMods } from "./modifiers";

// ───────────────────────────── state ─────────────────────────────

export function newPlant(type: PlantType): PlantData {
  const cfg = PLANT_BY_ID[type];
  return {
    speed: 0,
    automation: 0,
    fleet: 1,
    grade: 1,
    route: "use",
    progress: 0,
    // a new plant comes with a full yard of raw material
    raw: cfg.rawPer * RAW_STORAGE,
    inputs: {},
    out: 0,
    outValue: 0,
    car: null,
    wait: 0,
    made: 0,
    status: "ok",
  };
}

export function createChain(): ChainState {
  return { shipments: [], nextShip: 1, dealers: {}, rate: 0, firstCar: false };
}

export function emptyDealerStock(): DealerStock {
  return { cars: 0, value: 0, models: [], next: 0, sold: 0 };
}

export type PlantEntry = [string, BuildingState & { plant: PlantData; type: PlantType }];

export function plantsOf(s: GameState): PlantEntry[] {
  return Object.entries(s.city.buildings).filter((e): e is PlantEntry => !!e[1].plant && isPlantType(e[1].type));
}

export function plantCount(s: GameState, type: PlantType): number {
  return plantsOf(s).filter(([, b]) => b.type === type).length;
}

export const hasPlant = (s: GameState, type: PlantType) => plantCount(s, type) > 0;

/** Plants are numbered per type in build order: Engine Factory #2… */
export function plantNumber(s: GameState, plotId: string): number {
  const b = s.city.buildings[plotId];
  if (!b) return 0;
  return plantsOf(s).filter(([, o]) => o.type === b.type).findIndex(([id]) => id === plotId) + 1;
}

// ───────────────────────────── unlocks & costs ─────────────────────────────

export type PlantLock =
  | { kind: "plant"; plant: PlantType }
  | { kind: "research"; research: string }
  | { kind: "made"; item: ComponentId; n: number; have: number }
  | null;

/** What must happen before a plant type can be built (null = ready). */
export function plantLock(s: GameState, type: PlantType): PlantLock {
  const cfg = PLANT_BY_ID[type];
  if (cfg.requires && !hasPlant(s, cfg.requires)) return { kind: "plant", plant: cfg.requires };
  if (cfg.unlockMade && s.lifetime.parts[cfg.unlockMade.item] < cfg.unlockMade.n)
    return { kind: "made", item: cfg.unlockMade.item, n: cfg.unlockMade.n, have: Math.floor(s.lifetime.parts[cfg.unlockMade.item]) };
  if (cfg.research && !s.research.includes(cfg.research)) return { kind: "research", research: cfg.research };
  return null;
}

export function plantBuildCost(s: GameState, type: PlantType): number {
  return PLANT_BY_ID[type].cost * Math.pow(PLANT_COPY_COST, plantCount(s, type)) * regionCostMult(s.prestigeCount);
}

const base = (b: BuildingState) => PLANT_BY_ID[b.type as PlantType].cost;

export function levelCost(b: BuildingState, gm: GlobalMods): number | null {
  if (b.level >= Math.min(PLANT_MAX_LEVEL, gm.maxPlantLevel)) return null;
  return base(b) * PLANT_LEVELS[b.level].cost * gm.costMult;
}

export function speedCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (p.speed >= SPEED.max) return null;
  return base(b) * SPEED.firstCost * Math.pow(SPEED.growth, p.speed) * gm.costMult;
}

export function automationCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (p.automation >= AUTOMATION.length - 1) return null;
  return base(b) * AUTOMATION[p.automation + 1].cost * gm.costMult;
}

/** Whether an engine factory is making motorized chassis (only before the first assembly plant). */
export function combines(s: GameState, b: BuildingState): boolean {
  return b.type === "engineFactory" && !!b.plant?.combine && !hasPlant(s, "assemblyPlant");
}

/** Trucks a plant runs: they come with its level (older saves keep the ones they bought). */
export function trucksOf(b: BuildingState): number {
  return Math.min(MAX_TRUCKS, Math.max(b.plant?.fleet ?? 1, PLANT_TRUCKS[b.level - 1] ?? 1));
}

export function gradeCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (b.type === "assemblyPlant" || p.grade >= MAX_GRADE) return null;
  return base(b) * GRADES[p.grade].cost * gm.costMult;
}

// ───────────────────────────── cars ─────────────────────────────

export function recipe(car: CarConfig): ComponentId[] {
  return [...BASE_RECIPE, ...car.extras];
}

/** Best grade available for a component across all plants that make it. */
export function bestGrade(s: GameState, c: ComponentId): number {
  let g = 0;
  for (const [, b] of plantsOf(s)) if (b.type === MAKER[c]) g = Math.max(g, b.plant.grade);
  return g;
}

/** Why a car model cannot be built yet, or null. */
export type CarLock =
  | { kind: "research"; research: string }
  | { kind: "plant"; plant: PlantType }
  | { kind: "grade"; plant: PlantType; grade: number }
  | null;

export function carLock(s: GameState, car: CarConfig, gm: GlobalMods): CarLock {
  if (car.requiresResearch && !gm.unlockedCars.has(car.id)) return { kind: "research", research: car.requiresResearch };
  if (!hasPlant(s, "assemblyPlant")) return { kind: "plant", plant: "assemblyPlant" };
  // missing plants first (the bigger step), then grades
  for (const c of recipe(car)) if (bestGrade(s, c) === 0) return { kind: "plant", plant: MAKER[c] };
  for (const c of recipe(car)) if (bestGrade(s, c) < car.grade) return { kind: "grade", plant: MAKER[c], grade: car.grade };
  return null;
}

export function availableCars(s: GameState, gm: GlobalMods): CarConfig[] {
  return CARS.filter((c) => carLock(s, c, gm) === null);
}

/** Value of one unit of a component at a grade, before global multipliers. */
export const componentBase = (c: ComponentId, grade: number) => COMPONENT_BY_ID[c].value * GRADES[grade - 1].value;

/** What the parts of one car are worth (its "cost"). */
export function carPartsValue(car: CarConfig): number {
  return recipe(car).reduce((a, c) => a + componentBase(c, car.grade), 0);
}

/** Sale value of one car before dealer markup. */
export function carValue(s: GameState, car: CarConfig, gm: GlobalMods): number {
  return carBaseValue(s, car, gm) * modelStats(s, car).valueMult;
}

/** Sale value before the Design studio options (what R&D prices are based on). */
export function carBaseValue(s: GameState, car: CarConfig, gm: GlobalMods): number {
  const refine = Math.pow(CAR_MODEL.valuePerLevel, s.carModels[car.id] ?? 0);
  return carPartsValue(car) * car.markup * refine * gm.value[car.tier] * gm.income;
}

/** The player's model on this platform, with quality from the parts actually made. */
export function modelStats(s: GameState, car: CarConfig) {
  const grades = recipe(car).map((c) => bestGrade(s, c));
  const grade = grades.length ? Math.max(car.grade, grades.reduce((a, b) => a + b, 0) / grades.length) : car.grade;
  return designStats(car, s.designs[car.id], grade);
}

// ───────────────────────────── stats ─────────────────────────────

export interface PlantStats {
  plotId: string;
  type: PlantType;
  level: number;
  /** Seconds per batch. */
  cycle: number;
  lines: number;
  unitsPerSec: number;
  rawCap: number;
  outCap: number;
  inCap: number;
  /** Market value of one finished unit (components) or sale value (cars, before markup). */
  unitValue: number;
  /** Raw material cost per raw unit. */
  rawPrice: number;
  vehicle: Shipment["vehicle"];
  capacity: number;
  /** Assembly: model on the line. */
  car: CarConfig | null;
  /** Engine factory: making motorized chassis, and what one is worth (null on other plants). */
  combine: boolean;
  chassisValue: number | null;
  /** Engine factory: what a plain engine is worth. */
  engineValue: number;
  /** Seconds per tile for this plant's trucks. */
  pace: number;
  /** Trucks it runs (its level plus the Logistics Center), and its dock time multiplier. */
  trucks: number;
  dock: number;
  offline: number;
  rp: number;
}

export interface DealerStats {
  id: DealerId;
  interval: number;
  markup: number;
  stockCap: number;
}

export interface ChainSnapshot {
  plants: Record<string, PlantStats>;
  dealers: Partial<Record<DealerId, DealerStats>>;
  cars: CarConfig[];
  /** Best case income per second if every plant ran flat out and sold everything. */
  potential: number;
  carsPerSec: number;
}

function managerMods(s: GameState, plotId: string) {
  const m = { speed: 1, value: 1, delivery: 1, offline: 0 };
  for (const cfg of MANAGERS) {
    const st = s.managers[cfg.id];
    if (cfg.scope !== "factory" || !st?.hired || st.assignedTo !== plotId) continue;
    const mult = managerMult(cfg, st.level, starMods(s).managers);
    if (cfg.bonus.stat === "speed") m.speed *= mult;
    else if (cfg.bonus.stat === "value") m.value *= mult;
    else if (cfg.bonus.stat === "delivery") m.delivery *= mult;
    else if (cfg.bonus.stat === "offline") m.offline += (mult - 1) * OFFLINE.baseEfficiency;
  }
  return m;
}

export function activeCar(s: GameState, p: PlantData, cars: CarConfig[]): CarConfig | null {
  if (p.car) {
    const chosen = cars.find((c) => c.id === p.car);
    if (chosen) return chosen;
  }
  return cars[cars.length - 1] ?? null;
}

export function plantStats(s: GameState, plotId: string, gm: GlobalMods, cars: CarConfig[]): PlantStats | null {
  const b = s.city.buildings[plotId];
  if (!b?.plant || !isPlantType(b.type)) return null;
  const cfg = PLANT_BY_ID[b.type];
  const p = b.plant;
  const lv = PLANT_LEVELS[b.level - 1];
  const mm = managerMods(s, plotId);
  const big = plotOf(plotId)?.big ? 1.5 : 1;
  const speed = Math.pow(SPEED.mult, p.speed) * AUTOMATION[p.automation].speed * gm.speed * mm.speed * big;
  const car = cfg.item ? null : activeCar(s, p, cars);
  const baseTime = cfg.item ? cfg.time * GRADES[p.grade - 1].time : car ? car.time * modelStats(s, car).timeMult : cfg.time;
  const cycle = baseTime / speed;
  const lines = lv.lines;
  const itemValue = cfg.item
    ? componentBase(cfg.item, p.grade) * gm.value[1] * gm.income * mm.value
    : car
      ? carValue(s, car, gm) * mm.value
      : 0;
  // engine + the best body you make, worth more together
  const chassisValue = b.type === "engineFactory" ? (itemValue + componentBase("body", Math.max(1, bestGrade(s, "body"))) * gm.value[1] * gm.income) * CHASSIS_BONUS : null;
  const combine = combines(s, b);
  const unitValue = combine && chassisValue !== null ? chassisValue : itemValue;
  const rawPrice = cfg.item ? (componentBase(cfg.item, p.grade) * MATERIAL_SHARE) / cfg.rawPer : 0;
  const vehicle = cfg.item ? PLANT_VEHICLE[b.level - 1] : "carrier";
  const lm = logisticsMods(s);
  const capacity = Math.max(1, Math.round((cfg.item ? VEHICLE_CAPACITY[vehicle] : CARRIER_CAPACITY[b.level - 1]) * lm.capacity));
  const storage = lv.storage * (plotOf(plotId)?.big ? 2 : 1) * lm.storage;
  return {
    plotId,
    type: b.type,
    level: b.level,
    cycle,
    lines,
    unitsPerSec: lines / cycle,
    rawCap: cfg.rawPer * RAW_STORAGE * storage,
    outCap: OUT_STORAGE * storage,
    inCap: OUT_STORAGE * storage,
    unitValue,
    rawPrice,
    vehicle,
    capacity,
    car,
    combine,
    chassisValue,
    engineValue: itemValue,
    pace: 1 / (TRUCK_SPEED * gm.delivery * mm.delivery * lm.speed),
    trucks: trucksOf(b) + lm.trucks,
    dock: lm.dock,
    offline: gm.offline + AUTOMATION[p.automation].offline + mm.offline,
    rp: (cfg.item ? (COMPONENT_BY_ID[cfg.item].value / 5_000) * p.grade : (car?.rp ?? 0)) * gm.rp,
  };
}

/** Whether a car is one of the dealer's specialities (+20% price, faster customers). */
export function dealerMatches(id: DealerId, car: CarId): boolean {
  return DEALER_BY_ID[id].classes.includes(CAR_BY_ID[car].class);
}

export function dealerStats(s: GameState, id: DealerId, gm: GlobalMods): DealerStats {
  const cfg = DEALER_BY_ID[id];
  const lvl = s.dealers[id].level;
  return {
    id,
    interval: 60 / cfg.customers / (1 + DEALER_SALE.perLevelSpeed * (lvl - 1)) / gm.dealerCap,
    markup: cfg.markup + DEALER_MARKUP_PER_LEVEL * (lvl - 1) + gm.markup,
    stockCap: DEALER_SALE.stock + DEALER_SALE.perLevelStock * (lvl - 1),
  };
}

export function chainSnapshot(s: GameState, gm: GlobalMods): ChainSnapshot {
  const cars = availableCars(s, gm);
  const plants: Record<string, PlantStats> = {};
  let potential = 0;
  let carsPerSec = 0;
  for (const [id] of plantsOf(s)) {
    const st = plantStats(s, id, gm, cars);
    if (!st) continue;
    plants[id] = st;
    if (st.type === "assemblyPlant") carsPerSec += st.unitsPerSec;
    else potential += st.unitsPerSec * (st.unitValue - st.rawPrice * PLANT_BY_ID[st.type].rawPer);
  }
  const dealers: Partial<Record<DealerId, DealerStats>> = {};
  for (const d of DEALERS) if (s.dealers[d.id].owned) dealers[d.id] = dealerStats(s, d.id, gm);
  return { plants, dealers, cars, potential, carsPerSec };
}

// ───────────────────────────── travel ─────────────────────────────

/** Road distance between two lots, in tiles (along the grid). */
export function distance(from: string, to: string): number {
  const a = plotOf(from)?.entry;
  const b = plotOf(to)?.entry;
  if (!a || !b) return 20;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function legTime(from: string, to: string, pace: number, dock = 1) {
  return DOCK_TIME * dock + distance(from, to) * pace;
}

const incoming = (s: GameState, to: string, item: Shipment["item"]) =>
  s.chain.shipments.reduce((n, sh) => (!sh.back && sh.to === to && sh.item === item ? n + sh.qty : n), 0);

const busyTrucks = (s: GameState, from: string) => s.chain.shipments.reduce((n, sh) => (sh.from === from ? n + 1 : n), 0);

function ship(s: GameState, sh: Omit<Shipment, "id" | "t" | "back">) {
  s.chain.shipments.push({ ...sh, id: s.chain.nextShip++, t: 0, back: false });
}

// ───────────────────────────── tick ─────────────────────────────

export interface ChainTickOut {
  earned: number;
  spent: number;
  components: number;
  cars: number;
  deliveries: number;
  rp: number;
}

/** Where a finished load from this plant should go now, or null to wait. */
function destination(s: GameState, snap: ChainSnapshot, id: string, b: BuildingState & { plant: PlantData }): { to: string; room: number } | null {
  const cfg = PLANT_BY_ID[b.type as PlantType];
  // motorized chassis are sold at the market
  if (snap.plants[id]?.combine) return { to: MARKET, room: Infinity };
  if (!cfg.item) {
    // cars: to the dealer that pays most for this model (its speciality first) and has room
    const car = snap.plants[id]?.car?.id;
    let best: { to: string; room: number; markup: number } | null = null;
    for (const d of Object.values(snap.dealers)) {
      if (!d) continue;
      const to = `d:${d.id}`;
      const stock = s.chain.dealers[d.id]?.cars ?? 0;
      const room = d.stockCap - stock - incoming(s, to, "car");
      const markup = d.markup + (car && dealerMatches(d.id, car) ? DEALER_SPECIALTY.price : 0);
      if (room > 0 && (!best || markup > best.markup)) best = { to, room, markup };
    }
    return best;
  }
  // parts go to the assembly plant that needs them most; the rest is sold
  let best: { to: string; room: number } | null = null;
  for (const [id, other] of plantsOf(s)) {
    if (other.type !== "assemblyPlant") continue;
    const ost = snap.plants[id];
    if (!ost?.car || !recipe(ost.car).includes(cfg.item)) continue;
    const room = ost.inCap - (other.plant.inputs[cfg.item] ?? 0) - incoming(s, id, cfg.item);
    if (room > 0 && (!best || room > best.room)) best = { to: id, room };
  }
  // before assembly: bodies go to engine factories that make motorized chassis
  if (!best && cfg.item === "body")
    for (const [id, other] of plantsOf(s)) {
      const ost = snap.plants[id];
      if (!ost?.combine) continue;
      const room = ost.inCap - (other.plant.inputs.body ?? 0) - incoming(s, id, "body");
      if (room > 0 && (!best || room > best.room)) best = { to: id, room };
    }
  return best ?? { to: MARKET, room: Infinity };
}

/**
 * Advances the chain by `dt` seconds. `speedMult` slows production (offline
 * efficiency); trucks always drive at full speed.
 */
export function chainTick(
  s: GameState,
  dt: number,
  snap: ChainSnapshot,
  credit: (amount: number) => void,
  events?: GameEvent[],
  offline = false,
): ChainTickOut {
  const out: ChainTickOut = { earned: 0, spent: 0, components: 0, cars: 0, deliveries: 0, rp: 0 };
  const lm = logisticsMods(s);
  const earn = (amount: number) => {
    credit(amount);
    out.earned += amount;
  };

  for (const [id, b] of plantsOf(s)) {
    const st = snap.plants[id];
    if (!st) continue;
    const cfg = PLANT_BY_ID[b.type];
    const p = b.plant;

    // 1. raw material: order more from the depot before it runs out
    if (cfg.item) {
      const inbound = incoming(s, id, "raw");
      if (p.raw + inbound < st.rawCap * RESUPPLY_AT && inbound === 0) {
        let qty = Math.min(st.rawCap - p.raw, Math.ceil(st.rawCap * SUPPLY_LOAD));
        const afford = Math.floor(s.cash / st.rawPrice);
        qty = Math.min(qty, afford);
        // only send whole units' worth
        qty -= qty % cfg.rawPer;
        if (qty >= cfg.rawPer) {
          const cost = qty * st.rawPrice;
          s.cash -= cost;
          out.spent += cost;
          ship(s, { from: DEPOT, to: id, item: "raw", qty, value: cost, dur: legTime(DEPOT, id, st.pace, st.dock), vehicle: "truck" });
        }
      }
    }

    // 2. production
    const canMake = () => {
      let n = Math.min(st.lines, Math.floor(st.outCap - p.out));
      if (n <= 0) return { n: 0, why: "full" as const };
      if (cfg.item) {
        n = Math.min(n, Math.floor(p.raw / cfg.rawPer));
        if (n > 0 && st.combine) {
          // a motorized chassis needs a body from the Body Works
          const bodies = Math.floor(p.inputs.body ?? 0);
          if (bodies < 1) {
            p.missing = "body";
            return { n: 0, why: "noParts" as const };
          }
          n = Math.min(n, bodies);
        }
        return { n, why: "noRaw" as const };
      }
      if (!st.car) return { n: 0, why: "noModel" as const };
      let missing: ComponentId | undefined;
      for (const c of recipe(st.car)) {
        const have = Math.floor(p.inputs[c] ?? 0);
        if (have < n) {
          n = have;
          if (have === 0 && !missing) missing = c;
        }
      }
      p.missing = missing;
      return { n, why: "noParts" as const };
    };
    let can = canMake();
    if (can.n <= 0) {
      p.status = can.why;
    } else {
      p.status = "ok";
      p.missing = undefined;
      const speed = offline ? st.offline : 1;
      p.progress += (dt * speed) / st.cycle;
      while (p.progress >= 1) {
        can = canMake();
        if (can.n <= 0) {
          p.status = can.why;
          p.progress = 0.999;
          break;
        }
        p.progress -= 1;
        const n = can.n;
        if (cfg.item) {
          p.raw -= n * cfg.rawPer;
          if (st.combine) p.inputs.body = (p.inputs.body ?? 0) - n;
          p.out += n;
          p.outValue += n * st.unitValue;
          out.components += n;
          s.run.parts[cfg.item] += n;
          s.lifetime.parts[cfg.item] += n;
        } else if (st.car) {
          for (const c of recipe(st.car)) p.inputs[c] = (p.inputs[c] ?? 0) - n;
          p.out += n;
          p.outValue += n * st.unitValue;
          out.cars += n;
          s.run.carsProduced += n;
          s.lifetime.carsProduced += n;
          s.run.carsByType[st.car.id] += n;
          s.lifetime.carsByType[st.car.id] += n;
          const first = !s.chain.firstCar;
          s.chain.firstCar = true;
          // the first car opens the Local Dealer, so cars start selling right away
          if (first && !s.dealers.local.owned) {
            s.dealers.local.owned = true;
            s.chain.dealers.local = emptyDealerStock();
          }
          events?.push({ type: "carBuilt", plot: id, car: st.car.id, first });
        }
        p.made += n;
        out.rp += n * st.rp;
      }
    }

    // 3. loading dock: send a truck when there is a full load (or it waited long enough)
    if (p.out >= 1 && busyTrucks(s, id) < st.trucks) {
      p.wait += dt;
      if (p.out >= st.capacity || p.wait >= MAX_WAIT * st.dock) {
        const dest = destination(s, snap, id, b);
        if (dest) {
          const qty = Math.min(Math.floor(p.out), st.capacity, dest.room);
          if (qty >= 1) {
            const value = (p.outValue / p.out) * qty;
            const models = cfg.item ? undefined : (Array.from({ length: qty }, () => st.car?.id ?? "city") as CarId[]);
            ship(s, { from: id, to: dest.to, item: cfg.item ? (st.combine ? "chassis" : cfg.item) : "car", qty, value, dur: legTime(id, dest.to, st.pace, st.dock), vehicle: st.vehicle, models });
            p.out -= qty;
            p.outValue -= value;
            p.wait = 0;
          }
        }
      }
    } else if (p.out < 1) {
      p.wait = 0;
    }
  }

  // 4. trucks on the road
  const keep: Shipment[] = [];
  for (const sh of s.chain.shipments) {
    sh.t += dt;
    if (sh.t < sh.dur) {
      keep.push(sh);
      continue;
    }
    if (sh.back) continue; // home again
    arrive(s, sh, snap, earn, events);
    if (sh.item !== "raw") {
      out.deliveries += sh.qty;
      s.run.deliveries += sh.qty;
      s.lifetime.deliveries += sh.qty;
    }
    // drive back empty (the leftover time counts on the way back)
    sh.back = true;
    sh.t = Math.min(sh.t - sh.dur, sh.dur);
    keep.push(sh);
  }
  s.chain.shipments = keep;

  // 5. customers at the dealerships
  for (const d of Object.values(snap.dealers)) {
    if (!d) continue;
    const stock = (s.chain.dealers[d.id] ??= emptyDealerStock());
    stock.next -= dt;
    while (stock.next <= 0) {
      if (stock.cars < 1) {
        stock.next = Math.max(stock.next, 0);
        break;
      }
      const each = stock.value / stock.cars;
      const model = stock.models.shift();
      const match = !!model && dealerMatches(d.id, model);
      // export (top transport tier) sells every car for more
      const price = each * (1 + d.markup + (match ? DEALER_SPECIALTY.price : 0)) * (1 + lm.cars);
      stock.cars -= 1;
      stock.value -= each;
      stock.sold += 1;
      s.run.carsSold += 1;
      s.lifetime.carsSold += 1;
      s.run.carRevenue += price;
      s.lifetime.carRevenue += price;
      earn(price);
      events?.push({ type: "sale", plot: `d:${d.id}`, item: "car", count: 1, amount: price });
      stock.next += d.interval / (match ? DEALER_SPECIALTY.speed : 1);
    }
  }

  s.rp += out.rp;
  const k = Math.min(1, dt / RATE_WINDOW);
  s.chain.rate += ((out.earned - out.spent) / dt - s.chain.rate) * k;
  return out;
}

function arrive(s: GameState, sh: Shipment, snap: ChainSnapshot, earn: (n: number) => void, events?: GameEvent[]) {
  if (sh.to === MARKET) {
    // a port sells components for more abroad
    const amount = sh.value * (1 + logisticsMods(s).market);
    earn(amount);
    events?.push({ type: "sale", plot: MARKET, item: sh.item as ItemId, count: sh.qty, amount });
    return;
  }
  if (sh.to.startsWith("d:")) {
    const id = sh.to.slice(2) as DealerId;
    const stock = (s.chain.dealers[id] ??= emptyDealerStock());
    if (stock.cars < 1) stock.next = Math.max(stock.next, (snap.dealers[id]?.interval ?? 10) * 0.4);
    stock.cars += sh.qty;
    stock.value += sh.value;
    stock.models.push(...(sh.models ?? []));
    return;
  }
  const p = s.city.buildings[sh.to]?.plant;
  if (!p) return;
  if (sh.item === "raw") p.raw += sh.qty;
  else if (sh.item !== "car" && sh.item !== "chassis") p.inputs[sh.item] = (p.inputs[sh.item] ?? 0) + sh.qty;
}

// ───────────────────────────── offline ─────────────────────────────

/**
 * Runs the chain for `seconds` of absence in steps. Plants produce at their
 * offline efficiency; trucks keep driving. Returns what happened; money is
 * credited to the wallet as it is earned.
 */
export function simulateChain(s: GameState, seconds: number, snap: ChainSnapshot, credit: (amount: number) => void): ChainTickOut {
  const total: ChainTickOut = { earned: 0, spent: 0, components: 0, cars: 0, deliveries: 0, rp: 0 };
  if (seconds <= 0 || Object.keys(snap.plants).length === 0) return total;
  const steps = Math.max(1, Math.min(Math.ceil(seconds), 20_000));
  const dt = seconds / steps;
  const rate = s.chain.rate;
  for (let i = 0; i < steps; i++) {
    const r = chainTick(s, dt, snap, credit, undefined, true);
    total.earned += r.earned;
    total.spent += r.spent;
    total.components += r.components;
    total.cars += r.cars;
    total.deliveries += r.deliveries;
    total.rp += r.rp;
  }
  s.chain.rate = rate;
  return total;
}

// ───────────────────────────── actions ─────────────────────────────

function spend(s: GameState, cost: number | null): boolean {
  if (cost === null || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  return true;
}

function plantAt(s: GameState, plotId: string) {
  const b = s.city.buildings[plotId];
  return b?.plant ? (b as BuildingState & { plant: PlantData }) : null;
}

function countUpgrade(s: GameState, levels = false) {
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  if (levels) {
    s.run.levelsBought += 1;
    s.lifetime.levelsBought += 1;
  }
}

export function upgradePlantLevel(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, levelCost(b, gm))) return false;
  b.level += 1;
  countUpgrade(s, true);
  return true;
}

export function upgradePlantSpeed(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, speedCost(b, gm))) return false;
  b.plant.speed += 1;
  countUpgrade(s, true);
  return true;
}

export function upgradeAutomation(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, automationCost(b, gm))) return false;
  b.plant.automation += 1;
  countUpgrade(s);
  return true;
}

export function upgradeGrade(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, gradeCost(b, gm))) return false;
  b.plant.grade += 1;
  countUpgrade(s);
  return true;
}

/** Engine factory strategy before assembly: sell engines, or motorized chassis. */
export function setCombine(s: GameState, plotId: string, on: boolean): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "engineFactory" || !!b.plant.combine === on) return false;
  b.plant.combine = on;
  return true;
}

export function setPlantCar(s: GameState, plotId: string, car: CarId | null, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "assemblyPlant") return false;
  if (car && carLock(s, CAR_BY_ID[car], gm) !== null) return false;
  b.plant.car = car;
  return true;
}

// ───────────────────────────── saves ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, dflt = 0) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : dflt;

export function migratePlant(type: PlantType, raw: unknown): PlantData {
  const p = newPlant(type);
  if (!isObj(raw)) return p;
  p.speed = int(raw.speed, 0, SPEED.max, 0);
  p.automation = int(raw.automation, 0, AUTOMATION.length - 1, 0);
  p.fleet = int(raw.fleet, 1, MAX_TRUCKS, 1);
  p.grade = int(raw.grade, 1, MAX_GRADE, 1);
  // routing is automatic now: parts go where they are needed
  p.route = "use";
  if (raw.combine === true) p.combine = true;
  if (raw.auto === true) p.auto = true;
  p.progress = Math.min(0.999, num(raw.progress));
  p.raw = num(raw.raw, p.raw);
  p.out = num(raw.out);
  p.outValue = num(raw.outValue);
  p.made = num(raw.made);
  p.wait = num(raw.wait);
  if (raw.status === "noRaw" || raw.status === "full" || raw.status === "noParts" || raw.status === "noModel") p.status = raw.status;
  if (typeof raw.missing === "string" && raw.missing in COMPONENT_BY_ID) p.missing = raw.missing as ComponentId;
  p.car = typeof raw.car === "string" && raw.car in CAR_BY_ID ? (raw.car as CarId) : null;
  if (isObj(raw.inputs)) for (const c of Object.keys(COMPONENT_BY_ID) as ComponentId[]) if (raw.inputs[c] !== undefined) p.inputs[c] = num(raw.inputs[c]);
  return p;
}

export function migrateChain(raw: unknown, s: GameState): ChainState {
  const chain = createChain();
  if (!isObj(raw)) return chain;
  chain.rate = typeof raw.rate === "number" && Number.isFinite(raw.rate) ? raw.rate : 0;
  chain.firstCar = raw.firstCar === true;
  chain.nextShip = int(raw.nextShip, 1, 1e12, 1);
  if (Array.isArray(raw.shipments)) {
    for (const sh of raw.shipments) {
      if (!isObj(sh) || typeof sh.from !== "string" || typeof sh.to !== "string" || typeof sh.item !== "string") continue;
      if (!plotOf(sh.from) || !plotOf(sh.to)) continue;
      chain.shipments.push({
        id: chain.nextShip++,
        from: sh.from,
        to: sh.to,
        item: sh.item as Shipment["item"],
        qty: num(sh.qty),
        value: num(sh.value),
        t: num(sh.t),
        dur: Math.max(1, num(sh.dur, 10)),
        back: sh.back === true,
        vehicle: (["van", "truck", "semi", "trailer", "carrier"].includes(sh.vehicle as string) ? sh.vehicle : "truck") as Shipment["vehicle"],
        models: Array.isArray(sh.models) ? (sh.models.filter((m) => typeof m === "string" && m in CAR_BY_ID) as CarId[]) : undefined,
      });
    }
  }
  if (isObj(raw.dealers)) {
    for (const d of DEALERS) {
      const v = raw.dealers[d.id];
      if (!isObj(v) || !s.dealers[d.id].owned) continue;
      chain.dealers[d.id] = {
        cars: num(v.cars),
        value: num(v.value),
        models: Array.isArray(v.models) ? (v.models.filter((m) => typeof m === "string" && m in CAR_BY_ID) as CarId[]) : [],
        next: num(v.next),
        sold: num(v.sold),
      };
    }
  }
  return chain;
}


/** Plants this automated can upgrade themselves. */
export const AUTO_UPGRADE_FROM = 2;

/**
 * Auto-upgrade: each switched-on plant buys its cheapest speed or level
 * upgrade, but only when it costs at most a quarter of the cash, so the
 * player can still save for new plants. One purchase per plant per call.
 */
export function autoUpgrade(s: GameState, gm: GlobalMods): number {
  let bought = 0;
  for (const [id, b] of plantsOf(s)) {
    if (!b.plant.auto || b.plant.automation < AUTO_UPGRADE_FROM) continue;
    const sp = speedCost(b, gm);
    const lv = levelCost(b, gm);
    const pickLevel = lv !== null && (sp === null || lv <= sp);
    const cost = pickLevel ? lv : sp;
    if (cost === null || cost > s.cash * 0.25) continue;
    if (pickLevel ? upgradePlantLevel(s, id, gm) : upgradePlantSpeed(s, id, gm)) bought++;
  }
  return bought;
}
