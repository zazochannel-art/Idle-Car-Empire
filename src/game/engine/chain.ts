// The supply chain. Plants on the map turn raw material into components;
// trucks (real objects with a route and a travel time) carry everything:
// raw material from the Materials Depot, components to the Parts Market or
// to a Car Assembly Plant, finished cars to dealerships. Money only comes in
// when a load is sold at the market or a customer buys a car.
import { startWorks } from "./construction";
import { receiveRaceCar } from "./racing";
import { regionCostMult } from "../config/regions";
import { CARS, CAR_BY_ID, CAR_MODEL, type CarConfig } from "../config/cars";
import {
  AUTOMATION,
  BASE_RECIPE,
  SUPPLIER_MARKUP,
  SUPPLIED_PARTS,
  CHASSIS_BONUS,
  CARRIER_CAPACITY,
  COMPONENT_BY_ID,
  DEALER_SALE,
  WHOLESALE,
  DOCK_TIME,
  MAKER,
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
  SPEED,
  ROAD_SPEED,
  HEADWAY,
  CAR_WAIT,
  TRAFFIC_ALLOWANCE,
  VEHICLE_CAPACITY,
  isPlantType,
} from "../config/chain";
import { DEALERS, DEALER_BY_ID, DEALER_MARKUP_PER_LEVEL, DEALER_SPECIALTY } from "../config/dealerships";
import { MATERIALS as MATERIALS_LIST, CAR_STORAGE, CLASS_DEMAND, DEALER_FEE, RESCUE, SALES_TAX, TRIP_FEE, UPGRADE_SCALING, WAREHOUSE_CAP, POWER_SYSTEM, type MaterialId } from "../config/economy";
import { assemblyTime, carListPrice, carStdCost, componentPrice, componentStdCost, componentTime, opRates, opTotal, type OpRates } from "./costs";
import {
  addStock,
  autoRestock,
  book,
  migrateCostBasis,
  spendMaterials,
  createLedger,
  grantMaterials,
  chainNet,
  migrateLedger,
  migrateStock,
  orderCost,
  payOrOwe,
  powerCost,
  settleLedger,
  shortfall,
  unitMaterials,
  unitsInStock,
  warehouseCap,
  warehouseCost,
} from "./materials";
import { MANAGERS } from "../config/managers";
import { OFFLINE } from "../config/prestige";
import { MARKET, RACING, plotOf, roadRoute } from "../city/layout";
import type {
  BuildingState,
  CarId,
  CarRoute,
  ChainState,
  ComponentId,
  DealerId,
  DealerStock,
  GameEvent,
  GameState,
  ItemId,
  MaterialStock,
  PlantData,
  PlantType,
  QualityMode,
  RaceCarState,
  Shipment,
} from "../types";
import { QUALITY_MODES } from "../config/market";
import { carDemandMult, carPriceMult, defectRate, onCarBuilt, qualityOf, qualityTick } from "./market";
import { vipBuilt } from "./live";
import { dockCars, exportTick, fleetTick, isExportRoute, portPlot, protoValueMult } from "./expansion";
import { EXPORT_BY_ID, type ExportMarketId } from "../config/expansion";
import { designStats } from "./design";
import { logisticsMods } from "./logistics";
import { starMods } from "./imperium";
import { managerMult, type GlobalMods } from "./modifiers";

// ───────────────────────────── state ─────────────────────────────

/** A new plant: no upgrades, an empty warehouse (materials are bought at the market). */
export function newPlant(): PlantData {
  return {
    speed: 0,
    automation: 0,
    fleet: 1,
    grade: 1,
    route: "use",
    progress: 0,
    // the warehouse starts empty: materials are bought at the market
    stock: {},
    stockCost: 0,
    stockCostBy: {},
    warehouse: 1,
    power: 0,
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
  return { shipments: [], nextShip: 1, dealers: {}, rate: 0, firstCar: false, wholesale: 0, ledger: createLedger(), owed: 0 };
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
  // the plant before it in the chain must be built or at least going up (sites can run side by side)
  if (cfg.requires && !hasPlant(s, cfg.requires) && !Object.values(s.city.sites).some((st) => st.type === cfg.requires))
    return { kind: "plant", plant: cfg.requires };
  if (cfg.unlockMade && s.lifetime.parts[cfg.unlockMade.item] < cfg.unlockMade.n)
    return { kind: "made", item: cfg.unlockMade.item, n: cfg.unlockMade.n, have: Math.floor(s.lifetime.parts[cfg.unlockMade.item]) };
  if (cfg.research && !s.research.includes(cfg.research)) return { kind: "research", research: cfg.research };
  return null;
}

export function plantBuildCost(s: GameState, type: PlantType): number {
  const cfg = PLANT_BY_ID[type];
  const n = plantCount(s, type);
  return (n === 0 && cfg.firstCost ? cfg.firstCost : cfg.cost * Math.pow(PLANT_COPY_COST, n)) * regionCostMult(s.prestigeCount);
}

const base = (b: BuildingState) => PLANT_BY_ID[b.type as PlantType].cost;

/** Price of the next level: the plant's cost × level.base × level.growth^(level-1) (config/economy.ts). */
export function levelCost(b: BuildingState, gm: GlobalMods): number | null {
  if (b.works || b.level >= Math.min(PLANT_MAX_LEVEL, gm.maxPlantLevel)) return null;
  const u = UPGRADE_SCALING.level;
  return base(b) * u.base * Math.pow(u.growth, b.level - 1) * gm.costMult;
}

export function speedCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (p.speed >= SPEED.max) return null;
  const u = UPGRADE_SCALING.speed;
  return base(b) * u.base * Math.pow(u.growth, p.speed) * gm.costMult;
}

export function automationCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (p.automation >= AUTOMATION.length - 1) return null;
  return base(b) * UPGRADE_SCALING.automation[p.automation + 1] * gm.costMult;
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
  return base(b) * UPGRADE_SCALING.grade[p.grade] * gm.costMult;
}

// ───────────────────────────── cars ─────────────────────────────

export function recipe(car: CarConfig): ComponentId[] {
  return [...BASE_RECIPE, ...car.extras];
}

/** A base part the company doesn't make yet: an outside supplier delivers it to the assembly line. */
export function supplied(s: GameState, c: ComponentId): boolean {
  return (BASE_RECIPE.includes(c) || SUPPLIED_PARTS.includes(c)) && !hasPlant(s, MAKER[c]);
}

/** The grade the supplier delivers for a model: base parts at grade 1, drivetrain parts at whatever the model needs. */
export function suppliedGrade(c: ComponentId, car: CarConfig): number {
  return SUPPLIED_PARTS.includes(c) ? car.grade : 1;
}

/**
 * A drivetrain part the company makes, but its own plants deliver nothing
 * (out of materials, stopped): rather than stalling the line for hours, the
 * outside supplier steps in at its price until the company's parts flow again.
 */
function backupSupply(s: GameState, plot: string, c: ComponentId, p: PlantData): boolean {
  if (!SUPPLIED_PARTS.includes(c) || (p.inputs[c] ?? 0) >= 1) return false;
  if (s.chain.shipments.some((sh) => !sh.back && sh.to === plot && sh.item === c)) return false;
  return plantsOf(s).every(([, b]) => b.type !== MAKER[c] || (b.plant.out < 1 && b.plant.status !== "ok"));
}

/** Whether the supplier covers this part for this model. */
const supplierCovers = (s: GameState, c: ComponentId, car: CarConfig) => supplied(s, c) && suppliedGrade(c, car) >= car.grade;

/** What the supplier charges for one unit. */
export function supplierPrice(c: ComponentId, grade = 1): number {
  return componentStdCost(c, grade) * SUPPLIER_MARKUP;
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
  for (const c of recipe(car)) if (bestGrade(s, c) === 0 && !supplierCovers(s, c, car)) return { kind: "plant", plant: MAKER[c] };
  for (const c of recipe(car)) if (bestGrade(s, c) < car.grade && !supplierCovers(s, c, car)) return { kind: "grade", plant: MAKER[c], grade: car.grade };
  return null;
}

export function availableCars(s: GameState, gm: GlobalMods): CarConfig[] {
  return CARS.filter((c) => carLock(s, c, gm) === null);
}

/** What the Parts Market pays for one unit of a component at a grade, before global multipliers. */
export const componentBase = (c: ComponentId, grade: number) => componentPrice(c, grade);

/** Standard production cost of one car (parts, assembly, QC, transport). */
export function carPartsValue(car: CarConfig): number {
  return carStdCost(car, recipe(car));
}

/** Sale value of one car before dealer markup (bonuses widen its margin). */
export function carValue(s: GameState, car: CarConfig, gm: GlobalMods, extra = 1): number {
  return carListPrice(car, recipe(car), carMarginMult(s, car, gm) * modelStats(s, car).valueMult * protoValueMult(s, car.id) * extra);
}

/** Sale value before the Design studio options (what R&D prices are based on). */
export function carBaseValue(s: GameState, car: CarConfig, gm: GlobalMods): number {
  return carListPrice(car, recipe(car), carMarginMult(s, car, gm));
}

/** How much the bonuses (refinement, research, prestige, events…) widen a car's margin. */
export function carMarginMult(s: GameState, car: CarConfig, gm: GlobalMods): number {
  const refine = Math.pow(CAR_MODEL.valuePerLevel, s.carModels[car.id] ?? 0);
  return refine * gm.value[car.tier] * gm.income;
}

/** Market value of a component with the company's bonuses (widening its margin). */
export function componentValue(c: ComponentId, grade: number, gm: GlobalMods, extra = 1): number {
  return componentPrice(c, grade, gm.value[1] * gm.income * extra);
}

/** The player's model on this platform, with quality from the parts actually made. */
export function modelStats(s: GameState, car: CarConfig) {
  const grades = recipe(car).map((c) => (supplied(s, c) ? suppliedGrade(c, car) : bestGrade(s, c)));
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
  const qm = QUALITY_MODES[qualityOf(p)];
  const speed = Math.pow(SPEED.mult, p.speed) * AUTOMATION[p.automation].speed * gm.speed * mm.speed * big * qm.speed;
  const car = cfg.item ? null : activeCar(s, p, cars);
  const baseTime = cfg.item ? componentTime(cfg.item, p.grade) : car ? assemblyTime(car) * modelStats(s, car).timeMult : assemblyTime(CAR_BY_ID.city);
  const cycle = baseTime / speed;
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
    pace: 1 / ROAD_SPEED,
    trucks: trucksOf(b) + lm.trucks,
    dock: lm.dock,
    load: lm.dock / haul,
    offline: gm.offline + AUTOMATION[p.automation].offline + mm.offline,
    rp: (cfg.item ? (COMPONENT_BY_ID[cfg.item].value / 5_000) * p.grade : (car?.rp ?? 0)) * gm.rp,
  };
}

/** List-price value of a set of materials. */
function stockValue(st: MaterialStock): number {
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
    else potential += st.unitsPerSec * (st.unitValue * (1 - SALES_TAX) - st.unitCost);
  }
  const dealers: Partial<Record<DealerId, DealerStats>> = {};
  for (const d of DEALERS) if (s.dealers[d.id].owned) dealers[d.id] = dealerStats(s, d.id, gm);
  return { plants, dealers, cars, potential, carsPerSec };
}

// ───────────────────────────── travel ─────────────────────────────

/** Road distance between two lots, in tiles: the route the trucks drive on the map. */
export function distance(from: string, to: string): number {
  const a = plotOf(from)?.entry;
  const b = plotOf(to)?.entry;
  if (!a || !b) return 20;
  return roadRoute(a, b).length;
}

function legTime(from: string, to: string, pace: number, dock = 1) {
  return DOCK_TIME * dock + distance(from, to) * pace * (1 + TRAFFIC_ALLOWANCE);
}

const incoming = (s: GameState, to: string, item: Shipment["item"]) =>
  s.chain.shipments.reduce((n, sh) => (!sh.back && sh.to === to && sh.item === item ? n + sh.qty : n), 0);

const busyTrucks = (s: GameState, from: string) => s.chain.shipments.reduce((n, sh) => (sh.from === from ? n + 1 : n), 0);

function ship(s: GameState, sh: Omit<Shipment, "id" | "t" | "back">) {
  s.chain.shipments.push({ ...sh, id: s.chain.nextShip++, t: 0, back: false });
}

// ───────────────────────────── My Cars on the road ─────────────────────────────

/** The factory lot of a car in the collection: its own assembly plant, or any other one. */
export function lotOf(s: GameState, rc: RaceCarState): string | null {
  if (rc.home && s.city.buildings[rc.home]?.type === "assemblyPlant") return rc.home;
  return plantsOf(s).find(([, b]) => b.type === "assemblyPlant")?.[0] ?? null;
}

export type CarDestination = "factory" | "racing" | "showroom";

/** The company showroom for a car: the dealer of its class it owns, else any it owns. */
export function showroomFor(s: GameState, rc: RaceCarState): DealerId | null {
  const cls = CAR_BY_ID[rc.car].class;
  const owned = DEALERS.filter((d) => s.dealers[d.id]?.owned && plotOf(`d:${d.id}`));
  return (owned.find((d) => d.classes.includes(cls)) ?? owned[0])?.id ?? null;
}

/** Where a car of the collection is parked now (plot id), or null on the road. */
function parkedAt(s: GameState, rc: RaceCarState): string | null {
  const at = rc.location ?? "racing";
  if (at === "transit") return null;
  if (at === "racing") return RACING;
  if (at === "showroom") return rc.listing ? `d:${rc.listing.dealer}` : null;
  return lotOf(s, rc);
}

/** Driving time and fee of moving a car of the collection; null if it can't go there now. */
export function carTrip(s: GameState, rc: RaceCarState, to: CarDestination): { from: string; to: string; dur: number; fee: number } | null {
  const at = rc.location ?? "racing";
  if (at === "transit" || at === to || s.racing.live?.car === rc.id || rc.install) return null;
  if (to === "racing" && !s.racing.unlocked) return null;
  const from = parkedAt(s, rc);
  const dealer = to === "showroom" ? showroomFor(s, rc) : null;
  const dest = to === "racing" ? RACING : to === "showroom" ? (dealer ? `d:${dealer}` : null) : lotOf(s, rc);
  if (!from || !dest || from === dest) return null;
  return { from, to: dest, dur: legTime(from, dest, 1), fee: TRIP_FEE.carrier };
}

/** Loads a car of the collection onto its own transporter: to the paddock, a showroom or back to the factory lot. */
export function sendCar(s: GameState, id: number, to: CarDestination, price?: number): boolean {
  const rc = s.racing.cars.find((c) => c.id === id);
  const trip = rc && carTrip(s, rc, to);
  if (!rc || !trip || s.cash < trip.fee) return false;
  if (to === "showroom" && !(price && price > 0)) return false;
  s.cash -= trip.fee;
  book(s, "logistics", trip.fee);
  ship(s, { from: trip.from, to: trip.to, item: "car", qty: 1, value: 0, dur: trip.dur, vehicle: "carrier", models: [rc.car], fleet: [rc.id] });
  if (to === "factory" && !rc.home) rc.home = trip.to;
  if (to === "showroom") rc.listing = { price: price!, dealer: trip.to.slice(2) as DealerId, since: 0 };
  else delete rc.listing;
  rc.location = "transit";
  return true;
}

const destOf = (to: string): CarDestination => (to === RACING ? "racing" : to.startsWith("d:") ? "showroom" : "factory");

/** Where a car on the road is going (null: not on the road). */
export function carEta(s: GameState, id: number): { to: CarDestination; left: number } | null {
  const sh = s.chain.shipments.find((x) => !x.back && x.fleet?.includes(id));
  return sh ? { to: destOf(sh.to), left: Math.max(0, sh.dur - sh.t) } : null;
}

// ───────────────────────────── tick ─────────────────────────────

export interface ChainTickOut {
  earned: number;
  spent: number;
  components: number;
  cars: number;
  deliveries: number;
  rp: number;
  /** Cars sold wholesale (dealers were full). */
  wholesale: number;
  carsSold: number;
  /** Material units used. */
  materials: number;
}

/** Where a finished load from this plant should go now, or null to wait. */
function destination(s: GameState, snap: ChainSnapshot, id: string, b: BuildingState & { plant: PlantData }): { to: string; room: number; market?: ExportMarketId } | null {
  const cfg = PLANT_BY_ID[b.type as PlantType];
  // motorized chassis are sold at the market
  if (snap.plants[id]?.combine) return { to: MARKET, room: Infinity };
  if (!cfg.item) {
    // cars: by the plant's route: the dealer that pays most for this model (its speciality first),
    // the one that will sell it soonest, or a chosen dealer first; always one with room
    const car = snap.plants[id]?.car?.id;
    const route = b.plant.carRoute ?? "price";
    // overseas: to the port, while the market is open
    if (isExportRoute(route)) {
      const port = portPlot(s);
      const market = route.slice(7) as ExportMarketId;
      if (port && s.export.open.includes(market)) return { to: port, room: Infinity, market };
    }
    let best: { to: string; room: number; score: number } | null = null;
    for (const d of Object.values(snap.dealers)) {
      if (!d) continue;
      const to = `d:${d.id}`;
      const stock = s.chain.dealers[d.id]?.cars ?? 0;
      const queued = stock + incoming(s, to, "car");
      const room = d.stockCap - queued;
      if (room <= 0) continue;
      const match = !!car && dealerMatches(d.id, car);
      const markup = d.markup + (match ? DEALER_SPECIALTY.price : 0);
      // soonest sale: fewer cars ahead of it and quicker customers for this model
      const wait = ((queued + 1) * d.interval) / ((match ? DEALER_SPECIALTY.speed : 1) * (car ? CLASS_DEMAND[CAR_BY_ID[car].class] : 1));
      const score = route === "fast" ? -wait : route !== "price" && route === d.id ? 1e9 + markup : markup;
      if (!best || score > best.score) best = { to, room, score };
    }
    // every dealer is full: the cars wait in the plant's car storage
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
  const out: ChainTickOut = { earned: 0, spent: 0, components: 0, cars: 0, deliveries: 0, rp: 0, wholesale: 0, carsSold: 0, materials: 0 };
  const lm = logisticsMods(s);
  s.market.t += dt;
  // settle what the company owes for trips before anything else
  if (s.chain.owed > 0 && s.cash > 0) {
    const pay = Math.min(s.chain.owed, s.cash);
    s.cash -= pay;
    s.chain.owed -= pay;
  }
  rescue(s);
  qualityTick(s, dt);
  const earn = (amount: number) => {
    credit(amount);
    out.earned += amount;
  };

  for (const [id, b] of plantsOf(s)) {
    const st = snap.plants[id];
    if (!st) continue;
    const cfg = PLANT_BY_ID[b.type];
    const p = b.plant;

    // 1. materials: restock automatically when the plant is set to (Wholesale supplier and up)
    if (cfg.item && p.autoBuy) autoRestock(s, id, st.unitsPerSec);

    // 1b. parts the company doesn't make yet come from the supplier
    if (!cfg.item && st.car)
      for (const c of recipe(st.car)) {
        if (!supplied(s, c) && !backupSupply(s, id, c, p)) continue;
        // only what the next car needs, on account when cash is short (the car pays it back)
        const n = Math.floor(st.lines - (p.inputs[c] ?? 0));
        if (n <= 0) continue;
        const price = supplierPrice(c, suppliedGrade(c, st.car));
        payOrOwe(s, n * price);
        out.spent += n * price;
        book(s, "materials", n * price);
        p.inputs[c] = (p.inputs[c] ?? 0) + n;
      }

    // 2. production
    const canMake = () => {
      let n = Math.min(st.lines, Math.floor(st.outCap - p.out));
      if (n <= 0) return { n: 0, why: "full" as const };
      if (cfg.item) {
        const inStock = unitsInStock(p, st.need);
        if (inStock.n < n) {
          n = inStock.n;
          if (n <= 0) p.short = inStock.short;
        }
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
    const speed = offline ? st.offline : 1;
    // running the plant costs wages, energy and maintenance for every second it works
    const run = st.opPerSec * dt * speed;
    if (can.n <= 0) {
      p.status = can.why;
    } else {
      p.status = "ok";
      p.missing = undefined;
      p.short = undefined;
      payOrOwe(s, run);
      out.spent += run;
      const k = run / Math.max(1e-9, st.opPerSec * dt * speed);
      book(s, "labor", st.op.labor * dt * speed * k);
      book(s, "energy", st.op.energy * dt * speed * k);
      book(s, "maintenance", st.op.maintenance * dt * speed * k);
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
          out.materials += spendMaterials(s, p, st.need, n);
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
          const partModes = recipe(st.car).flatMap((c) => plantsOf(s).filter(([, o]) => o.type === MAKER[c]).map(([, o]) => qualityOf(o.plant)));
          for (let k = 0; k < n; k++) onCarBuilt(s, st.car.id, defectRate(s, p, partModes), qualityOf(p));
          vipBuilt(s, st.car.id, n, qualityOf(p));
        }
        p.made += n;
        out.rp += n * st.rp;
      }
    }

    // 3a. a car the company keeps (My Cars): before the Racing District it stays at the factory lot
    if (!cfg.item && st.car && p.out >= 1 && !s.racing.unlocked && s.racing.orders.includes(st.car.id)) {
      const value = p.outValue / p.out;
      s.racing.orders.splice(s.racing.orders.indexOf(st.car.id), 1);
      p.out -= 1;
      p.outValue -= value;
      receiveRaceCar(s, st.car.id, "factory").home = id;
    }
    // …with it, the car leaves for the paddock on its own transporter
    if (!cfg.item && st.car && p.out >= 1 && s.racing.unlocked && s.racing.orders.includes(st.car.id) && busyTrucks(s, id) < st.trucks) {
      const value = p.outValue / p.out;
      payOrOwe(s, TRIP_FEE.carrier);
      out.spent += TRIP_FEE.carrier;
      book(s, "logistics", TRIP_FEE.carrier);
      ship(s, { from: id, to: RACING, item: "car", qty: 1, value, dur: legTime(id, RACING, st.pace, st.load), vehicle: "carrier", models: [st.car.id] });
      s.racing.orders.splice(s.racing.orders.indexOf(st.car.id), 1);
      p.out -= 1;
      p.outValue -= value;
    }

    // 3. loading dock: send a truck when there is a full load (or it waited long enough)
    if (p.out >= 1 && busyTrucks(s, id) < st.trucks) {
      p.wait += dt;
      // finished cars leave for the dealers straight away (no waiting for a full load);
      // other goods wait for a full truck or MAX_WAIT
      // HEADWAY: the next truck waits a moment so two never leave nose to tail on top of each other
      // finished cars wait only a few seconds to fill the transporter
      const maxWait = cfg.item ? MAX_WAIT : CAR_WAIT;
      if (p.wait >= HEADWAY && (p.out >= st.capacity || p.wait >= maxWait * st.dock)) {
        const dest = destination(s, snap, id, b);
        if (dest) {
          const qty = Math.min(Math.floor(p.out), st.capacity, dest.room);
          // every trip costs fuel and a driver (on account when the cash is not there yet)
          const fee = TRIP_FEE[st.vehicle];
          if (qty >= 1) {
            payOrOwe(s, fee);
            out.spent += fee;
            book(s, "logistics", fee);
            const value = (p.outValue / p.out) * qty;
            const models = cfg.item ? undefined : (Array.from({ length: qty }, () => st.car?.id ?? "city") as CarId[]);
            ship(s, { from: id, to: dest.to, item: cfg.item ? (st.combine ? "chassis" : cfg.item) : "car", qty, value, dur: legTime(id, dest.to, st.pace, st.load), vehicle: st.vehicle, models, ...(dest.market ? { market: dest.market } : {}) });
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
    out.wholesale += arrive(s, sh, snap, earn, events);
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

  // 4b. ships to the export markets, and the truck & bus division's line
  out.earned += exportTick(s, dt);
  out.earned += fleetTick(s, dt, offline ? snap.plants[Object.keys(snap.plants)[0]]?.offline ?? 0.5 : 1);

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
      const price = each * (1 + d.markup + (match ? DEALER_SPECIALTY.price : 0)) * (1 + lm.cars) * carPriceMult(s, model);
      stock.cars -= 1;
      stock.value -= each;
      stock.sold += 1;
      s.run.carsSold += 1;
      s.lifetime.carsSold += 1;
      s.run.carRevenue += price;
      s.lifetime.carRevenue += price;
      earn(price);
      book(s, "carSales", price);
      // the dealer keeps its fee and the state its tax
      const fee = price * DEALER_FEE;
      const tax = price * SALES_TAX;
      s.cash -= fee + tax;
      out.spent += fee + tax;
      book(s, "dealerFees", fee);
      book(s, "tax", tax);
      out.carsSold += 1;
      events?.push({ type: "sale", plot: `d:${d.id}`, item: "car", count: 1, amount: price - fee - tax });
      // the next customer: popular classes sell faster than exotic ones
      const demand = (model ? CLASS_DEMAND[CAR_BY_ID[model].class] : 1) * carDemandMult(s, model);
      stock.next += d.interval / ((match ? DEALER_SPECIALTY.speed : 1) * demand);
    }
  }

  s.rp += out.rp;
  // net income: revenue minus every cost (materials count when a plant uses them)
  const net = chainNet(s.chain.ledger.pending); // garages and racing are counted on their own
  s.chain.steady = (s.chain.steady ?? s.chain.rate) + (net / dt - (s.chain.steady ?? s.chain.rate)) * Math.min(1, dt / STEADY_WINDOW);
  settleLedger(s, dt, RATE_WINDOW);
  // the chain's income rate is read off the ledger, never smoothed on its own
  s.chain.rate = chainNet(s.chain.ledger.rate);
  s.chain.wholesale += (out.wholesale / dt - s.chain.wholesale) * Math.min(1, dt / 120);
  return out;
}

/** Seconds the steady income averages over. */
const STEADY_WINDOW = 600;

/**
 * A company that is completely stuck — no plant can work, it can't afford one
 * unit of material anywhere, and nothing is made, on the road or at a dealer
 * — gets material for a couple of units on supplier credit, and what it owes
 * is written off. Material, never cash, and at most once per cooldown: it
 * can't be farmed into upgrades.
 */
function rescue(s: GameState) {
  if (s.chain.shipments.length) return;
  if (s.chain.rescueT !== undefined && s.market.t - s.chain.rescueT < RESCUE.cooldown) return;
  for (const d of Object.values(s.chain.dealers)) if ((d?.cars ?? 0) >= 1) return;
  const short: [string, MaterialStock][] = [];
  for (const [id, b] of plantsOf(s)) {
    const p = b.plant;
    if (p.out >= 1 || p.status === "ok") return;
    if (!PLANT_BY_ID[b.type as PlantType]?.item) continue;
    const need = unitMaterials(b.type as PlantType, p.grade);
    if (unitsInStock(p, need).n >= 1) return;
    const missing = shortfall(p, need, RESCUE.units);
    if ((Object.entries(shortfall(p, need, 1)) as [MaterialId, number][]).reduce((a, [m, n]) => a + orderCost(s, m, n), 0) <= s.cash) return;
    short.push([id, missing]);
  }
  if (!short.length) return;
  s.chain.owed = 0;
  s.chain.rescueT = s.market.t;
  for (const [id, missing] of short) grantMaterials(s, id, missing);
}

/** Unloads a truck; returns how many cars it sold wholesale. */
function arrive(s: GameState, sh: Shipment, snap: ChainSnapshot, earn: (n: number) => void, events?: GameEvent[]): number {
  if (sh.fleet) {
    // a car of the collection unloaded at the paddock or back at its factory lot
    for (const id of sh.fleet) {
      const rc = s.racing.cars.find((c) => c.id === id);
      if (rc) rc.location = destOf(sh.to);
    }
    return 0;
  }
  if (sh.to === MARKET) {
    if (sh.item === "car") {
      // the dealers were full: a wholesale buyer takes the whole load, below dealer price
      // (older saves only: cars no longer go to the wholesale buyer)
      const amount = sh.value * WHOLESALE;
      earn(amount);
      book(s, "carSales", amount);
      s.run.carsSold += sh.qty;
      s.lifetime.carsSold += sh.qty;
      s.run.carRevenue += amount;
      s.lifetime.carRevenue += amount;
      events?.push({ type: "sale", plot: MARKET, item: "car", count: sh.qty, amount });
      return sh.qty;
    }
    // a port sells components for more abroad; tax is due on every sale
    const amount = sh.value * (1 + logisticsMods(s).market);
    earn(amount);
    book(s, "partSales", amount);
    const tax = amount * SALES_TAX;
    s.cash -= tax;
    book(s, "tax", tax);
    events?.push({ type: "sale", plot: MARKET, item: sh.item as ItemId, count: sh.qty, amount: amount - tax });
    return 0;
  }
  if (sh.to.startsWith("d:")) {
    const id = sh.to.slice(2) as DealerId;
    const stock = (s.chain.dealers[id] ??= emptyDealerStock());
    if (stock.cars < 1) stock.next = Math.max(stock.next, (snap.dealers[id]?.interval ?? 10) * 0.4);
    stock.cars += sh.qty;
    stock.value += sh.value;
    stock.models.push(...(sh.models ?? []));
    return 0;
  }
  if (sh.item === "car" && sh.market) {
    // at the port: onto the next ship to that market
    dockCars(s, sh.market, sh.models ?? [], sh.value);
    return 0;
  }
  if (sh.to === RACING) {
    // a car for the racing team: the paddock unloads it
    for (const m of sh.models ?? []) s.racing.arrivals.push(m);
    return 0;
  }
  const p = s.city.buildings[sh.to]?.plant;
  if (!p) return 0;
  if (sh.item === "raw") {
    // a materials delivery: into the warehouse, each material at what it cost
    addStock(p, sh.materials ?? {}, sh.value);
  }
  else if (sh.item !== "car" && sh.item !== "chassis") p.inputs[sh.item] = (p.inputs[sh.item] ?? 0) + sh.qty;
  return 0;
}

// ───────────────────────────── offline ─────────────────────────────

/**
 * Runs the chain for `seconds` of absence in steps. Plants produce at their
 * offline efficiency; trucks keep driving. Returns what happened; money is
 * credited to the wallet as it is earned.
 */
export function simulateChain(s: GameState, seconds: number, snap: ChainSnapshot, credit: (amount: number) => void): ChainTickOut {
  const total: ChainTickOut = { earned: 0, spent: 0, components: 0, cars: 0, deliveries: 0, rp: 0, wholesale: 0, carsSold: 0, materials: 0 };
  if (seconds <= 0 || Object.keys(snap.plants).length === 0) return total;
  const steps = Math.max(1, Math.min(Math.ceil(seconds), 20_000));
  const dt = seconds / steps;
  // the HUD and dashboard rates describe the session, not the absence: keep them
  const rates = { ...s.chain.ledger.rate };
  const steady = s.chain.steady;
  for (let i = 0; i < steps; i++) {
    const r = chainTick(s, dt, snap, credit, undefined, true);
    total.earned += r.earned;
    total.spent += r.spent;
    total.components += r.components;
    total.cars += r.cars;
    total.deliveries += r.deliveries;
    total.rp += r.rp;
    total.wholesale += r.wholesale;
    total.carsSold += r.carsSold;
    total.materials += r.materials;
  }
  s.chain.ledger.rate = rates;
  s.chain.rate = chainNet(rates);
  s.chain.steady = steady;
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

/** A new level is built onto the plant (it keeps producing at its level meanwhile). */
export function upgradePlantLevel(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !startWorks(s, plotId, levelCost(b, gm))) return false;
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

/** A bigger warehouse: more materials on site. */
export function upgradeWarehouse(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, warehouseCost(b, gm.costMult))) return false;
  b.plant.warehouse += 1;
  countUpgrade(s);
  return true;
}

/** ⚡ Power System: a cheaper energy bill. */
export function upgradePower(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.plant.power >= POWER_SYSTEM.max || !spend(s, powerCost(b, gm.costMult))) return false;
  b.plant.power += 1;
  countUpgrade(s);
  return true;
}

/** Switches automatic restocking (it only runs once a supplier allows it). */
export function setAutoBuy(s: GameState, plotId: string, on: boolean): boolean {
  const b = plantAt(s, plotId);
  if (!b || !PLANT_BY_ID[b.type as PlantType].item) return false;
  b.plant.autoBuy = on;
  return true;
}

/** Engine factory strategy before assembly: sell engines, or motorized chassis. */
/** Quality against quantity for one plant. */
export function setQualityMode(s: GameState, plotId: string, mode: QualityMode): boolean {
  const b = plantAt(s, plotId);
  if (!b || qualityOf(b.plant) === mode) return false;
  if (mode === "balanced") delete b.plant.mode;
  else b.plant.mode = mode;
  return true;
}

/** Where an assembly plant sends its cars. */
export function setCarRoute(s: GameState, plotId: string, route: CarRoute): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "assemblyPlant" || (b.plant.carRoute ?? "price") === route) return false;
  if (route === "price") delete b.plant.carRoute;
  else b.plant.carRoute = route;
  return true;
}

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
  const p = newPlant();
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
  p.stock = migrateStock(raw.stock);
  p.warehouse = int(raw.warehouse, 1, WAREHOUSE_CAP.length, 1);
  p.power = int(raw.power, 0, POWER_SYSTEM.max, 0);
  if (raw.autoBuy === true) p.autoBuy = true;
  if (typeof raw.short === "string") p.short = raw.short as MaterialId;
  // saves from before the materials market: the old raw yard becomes a starter stock
  if (raw.stock === undefined && PLANT_BY_ID[type].item) p.stock = starterStock(type, p.grade, 6);
  // saves from before materials were costed on use: value the stock at list price
  p.stockCost = typeof raw.stockCost === "number" && Number.isFinite(raw.stockCost) && raw.stockCost >= 0 ? raw.stockCost : stockValue(p.stock);
  // each material's own cost; saves from before it split their total by list price
  p.stockCostBy = migrateCostBasis(raw.stockCostBy, p);
  p.out = num(raw.out);
  p.outValue = num(raw.outValue);
  p.made = num(raw.made);
  p.wait = num(raw.wait);
  if (raw.status === "noRaw" || raw.status === "full" || raw.status === "noParts" || raw.status === "noModel" || raw.status === "noCash") p.status = raw.status;
  if (typeof raw.missing === "string" && raw.missing in COMPONENT_BY_ID) p.missing = raw.missing as ComponentId;
  p.car = typeof raw.car === "string" && raw.car in CAR_BY_ID ? (raw.car as CarId) : null;
  if (raw.mode === "fast" || raw.mode === "premium") p.mode = raw.mode;
  if (raw.carRoute === "fast" || (typeof raw.carRoute === "string" && (raw.carRoute in DEALER_BY_ID || isExportRoute(raw.carRoute)))) p.carRoute = raw.carRoute as CarRoute;
  if (isObj(raw.inputs)) for (const c of Object.keys(COMPONENT_BY_ID) as ComponentId[]) if (raw.inputs[c] !== undefined) p.inputs[c] = num(raw.inputs[c]);
  return p;
}

export function migrateChain(raw: unknown, s: GameState): ChainState {
  const chain = createChain();
  if (!isObj(raw)) return chain;
  chain.rate = typeof raw.rate === "number" && Number.isFinite(raw.rate) ? raw.rate : 0;
  chain.firstCar = raw.firstCar === true;
  chain.wholesale = 0;
  chain.ledger = migrateLedger(raw.ledger);
  chain.owed = num(raw.owed);
  if (typeof raw.steady === "number" && Number.isFinite(raw.steady)) chain.steady = raw.steady;
  if (typeof raw.rescueT === "number" && Number.isFinite(raw.rescueT)) chain.rescueT = raw.rescueT;
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
        materials: isObj(sh.materials) ? migrateStock(sh.materials) : undefined,
        ...(typeof sh.market === "string" && sh.market in EXPORT_BY_ID ? { market: sh.market as ExportMarketId } : {}),
        ...(Array.isArray(sh.fleet) ? { fleet: sh.fleet.filter((n): n is number => typeof n === "number") } : {}),
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

/** What one finished unit costs the plant: materials (or a car's parts) and its running time. */
export function plantUnitCost(st: PlantStats, gm: GlobalMods): number {
  void gm;
  return st.unitCost;
}

/** What one unit brings in after the dealer's fee and tax (components: tax only). */
export function plantNetValue(st: PlantStats): number {
  return st.unitValue * (1 - SALES_TAX - (PLANT_BY_ID[st.type].item ? 0 : DEALER_FEE));
}

/** Profit per minute at full speed: units made × (net sale value − cost). */
export function plantProfitPerMin(st: PlantStats, gm: GlobalMods): number {
  return st.unitsPerSec * 60 * (plantNetValue(st) - plantUnitCost(st, gm));
}

/** Materials for `units` finished units (a new plant's starter stock, and old saves). */
export function starterStock(type: PlantType, grade: number, units: number): MaterialStock {
  const out: MaterialStock = {};
  for (const [m, n] of Object.entries(unitMaterials(type, grade)) as [MaterialId, number][]) out[m] = n * units;
  return out;
}
