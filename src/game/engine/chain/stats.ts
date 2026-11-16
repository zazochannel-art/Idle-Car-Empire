// The chain's snapshot: each plant's and dealer's numbers.
import { AUTOMATION, CARRIER_CAPACITY, CHASSIS_BONUS, COMPONENT_BY_ID, DEALER_SALE, OUT_STORAGE, PLANT_BY_ID, PLANT_LEVELS, PLANT_VEHICLE, ROAD_SPEED, SPEED, VEHICLE_CAPACITY, isPlantType } from "../../config/chain";
import { CAR_BY_ID, type CarConfig } from "../../config/cars";
import { CAR_STORAGE, MATERIALS as MATERIALS_LIST, type MaterialId, TRIP_FEE } from "../../config/economy";
import type { CarId, DealerId, GameState, MaterialStock, PlantData, PlantType, Shipment } from "../../types";
import { DEALERS, DEALER_BY_ID, DEALER_MARKUP_PER_LEVEL } from "../../config/dealerships";
import { type GlobalMods, managerMult, offlineShare } from "../modifiers";
import { MANAGERS } from "../../config/managers";
import { OFFLINE } from "../../config/offline";
import { type OpRates, assemblyTime, componentStdCost, componentTime, netOfSale, opRates, opTotal } from "../costs";
import { QUALITY_MODES } from "../../config/market";
import { availableCars, bestGrade, carValue, componentValue, modelStats, recipe } from "./cars";
import { combines, trucksOf, workshopOf, workshopSpeed } from "./unlocks";
import { logisticsMods } from "../logistics";
import { plantsOf } from "../plants";
import { plotOf } from "../../city/layout";
import { qualityOf } from "../market";
import { starMods } from "../imperium";
import { unitMaterials, warehouseCap } from "../materials";

// ───────────────────────────── stats ─────────────────────────────

export interface PlantStats {
  plotId: string;
  type: PlantType;
  level: number;
  /** Seconds per batch. */
  cycle: number;
  lines: number;
  unitsPerSec: number;
  /** Warehouse capacity (material units). */
  rawCap: number;
  outCap: number;
  inCap: number;
  /** Market value of one finished unit (components) or sale value (cars, before markup). */
  unitValue: number;
  /** What one unit really costs this plant: materials at list price + running costs (+ parts for cars). */
  unitCost: number;
  /** Materials one unit uses. */
  need: MaterialStock;
  /** Running costs per second of work, and the crew and power behind them. */
  op: OpRates;
  opPerSec: number;
  vehicle: Shipment["vehicle"];
  capacity: number;
  /** Assembly: model on the line. */
  car: CarConfig | null;
  /** Engine factory: making motorized chassis, and what one is worth (null on other plants). */
  combine: boolean;
  chassisValue: number | null;
  /** Engine factory: what a plain engine is worth. */
  engineValue: number;
  /** Speed from the shop floor's machines and operators (Body Works; 1 elsewhere), part of `cycle`. */
  workshopSpeed: number;
  /** Seconds per tile for this plant's trucks. */
  pace: number;
  /** Dock time multiplier for loading and unloading (Loading upgrades and the delivery rate). */
  load: number;
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
  /** Share of live play earned while away (GlobalMods.offline): customers come at that pace then. */
  offline: number;
  /** The income multiplier that only lasts a while (GlobalMods.tempIncome): left out of steadyBase. */
  tempIncome: number;
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
  // a landmark works' line only when chosen: a plant never switches to one on its own
  return [...cars].reverse().find((c) => !c.line) ?? cars[cars.length - 1] ?? null;
}

export function plantStats(s: GameState, plotId: string, gm: GlobalMods, cars: CarConfig[]): PlantStats | null {
  const b = s.city.buildings[plotId];
  if (!b?.plant || !isPlantType(b.type)) return null;
  const cfg = PLANT_BY_ID[b.type];
  const p = b.plant;
  const lv = PLANT_LEVELS[b.level - 1];
  const mm = managerMods(s, plotId);
  const big = plotOf(plotId)?.big ? 1.5 : 1;
  const qm = QUALITY_MODES[qualityOf(p)];
  const speed = Math.pow(SPEED.mult, p.speed) * AUTOMATION[p.automation].speed * gm.speed * mm.speed * big * qm.speed;
  const car = cfg.item ? null : activeCar(s, p, cars);
  const baseTime = cfg.item ? componentTime(cfg.item, p.grade) : car ? assemblyTime(car) * modelStats(s, car).timeMult : assemblyTime(CAR_BY_ID.city);
  // the Body Works shop floor: machines built and operators hired along the line
  const floor = workshopSpeed(b.type, workshopOf(p));
  const cycle = baseTime / (speed * floor);
  const lines = lv.lines;
  const itemValue = cfg.item ? componentValue(cfg.item, p.grade, gm, mm.value * qm.value) : car ? carValue(s, car, gm, mm.value * qm.value) : 0;
  // engine + the best body you make, worth a little more together
  const chassisValue = b.type === "engineFactory" ? (itemValue + componentValue("body", Math.max(1, bestGrade(s, "body")), gm)) * CHASSIS_BONUS : null;
  const combine = combines(s, b);
  const unitValue = combine && chassisValue !== null ? chassisValue : itemValue;
  const need = unitMaterials(b.type, p.grade);
  const op = opRates(b.type, b.level, p.automation, lv.lines, p.power, Math.pow(SPEED.mult, p.speed) * AUTOMATION[p.automation].speed);
  const opPerSec = opTotal(op);
  // what a unit really costs here: list-price materials (or the car's parts) and this plant's running time
  const inputs = cfg.item ? stockValue(need) + (combine ? componentStdCost("body", 1) : 0) : car ? recipe(car).reduce((a, c) => a + componentStdCost(c, car.grade), 0) : 0;
  const unitCost = inputs + (opPerSec * cycle) / lv.lines + (cfg.item ? 0 : TRIP_FEE.carrier / Math.max(1, CARRIER_CAPACITY[b.level - 1]));
  const vehicle = cfg.item ? PLANT_VEHICLE[b.level - 1] : "carrier";
  const lm = logisticsMods(s);
  // delivery rate: trucks drive the city pace, so bonuses mean bigger loads and quicker docks
  const haul = gm.delivery * mm.delivery * lm.speed;
  const capacity = Math.max(1, Math.round((cfg.item ? VEHICLE_CAPACITY[vehicle] : CARRIER_CAPACITY[b.level - 1]) * lm.capacity * haul));
  const storage = lv.storage * (plotOf(plotId)?.big ? 2 : 1) * lm.storage;
  return {
    plotId,
    type: b.type,
    level: b.level,
    cycle,
    lines,
    unitsPerSec: lines / cycle,
    rawCap: warehouseCap(p),
    outCap: (cfg.item ? OUT_STORAGE : CAR_STORAGE) * storage,
    inCap: OUT_STORAGE * storage,
    unitValue,
    unitCost,
    need,
    op,
    opPerSec,
    vehicle,
    capacity,
    car,
    combine,
    chassisValue,
    engineValue: itemValue,
    workshopSpeed: floor,
    pace: 1 / ROAD_SPEED,
    trucks: trucksOf(b) + lm.trucks,
    dock: lm.dock,
    load: lm.dock / haul,
    offline: offlineShare(gm.offlineRaw + AUTOMATION[p.automation].offline + mm.offline),
    rp: (cfg.item ? (COMPONENT_BY_ID[cfg.item].value / 5_000) * p.grade : (car?.rp ?? 0)) * gm.rp,
  };
}

/** List-price value of a set of materials. */
export function stockValue(st: MaterialStock): number {
  let v = 0;
  for (const [m, n] of Object.entries(st) as [MaterialId, number][]) v += n * MATERIAL_PRICE[m];
  return v;
}
const MATERIAL_PRICE = Object.fromEntries(MATERIALS_LIST.map((m) => [m.id, m.price])) as Record<MaterialId, number>;

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
    else potential += st.unitsPerSec * (netOfSale(st.unitValue, false) - st.unitCost);
  }
  const dealers: Partial<Record<DealerId, DealerStats>> = {};
  for (const d of DEALERS) if (s.dealers[d.id].owned) dealers[d.id] = dealerStats(s, d.id, gm);
  return { plants, dealers, cars, potential, carsPerSec, offline: gm.offline, tempIncome: gm.tempIncome };
}
