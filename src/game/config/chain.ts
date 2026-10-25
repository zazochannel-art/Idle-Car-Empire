// The automotive supply chain: what each plant makes, from what, how fast,
// what it sells for, and how plants grow. All balance numbers live here;
// engine/chain.ts runs them.
import type { ComponentId, PlantType, Vehicle } from "../types";
import type { TerritoryId } from "./city";

export interface ComponentConfig {
  id: ComponentId;
  emoji: string;
  /** Market value of one unit at grade 1 (each grade multiplies it). */
  value: number;
  color: string;
}

export const COMPONENTS: ComponentConfig[] = [
  { id: "body", emoji: "🚙", value: 150, color: "#94a3b8" },
  { id: "engine", emoji: "⚙️", value: 1_500, color: "#ef4444" },
  { id: "tires", emoji: "🛞", value: 6_000, color: "#1f2937" },
  { id: "interior", emoji: "💺", value: 20_000, color: "#a16207" },
  { id: "suspension", emoji: "🔩", value: 35_000, color: "#f59e0b" },
  { id: "glass", emoji: "🪟", value: 60_000, color: "#7dd3fc" },
  { id: "paint", emoji: "🎨", value: 150_000, color: "#ec4899" },
  { id: "electronics", emoji: "🔌", value: 300_000, color: "#22c55e" },
  { id: "battery", emoji: "🔋", value: 2_000_000, color: "#84cc16" },
  { id: "software", emoji: "💻", value: 2_500_000, color: "#818cf8" },
  // the drivetrain and running gear every car from the Sedan up needs
  { id: "transmission", emoji: "🕹️", value: 4_000, color: "#64748b" },
  { id: "wheels", emoji: "⭕", value: 5_000, color: "#cbd5e1" },
  { id: "brakes", emoji: "🛑", value: 3_000, color: "#dc2626" },
  // the signature parts of the landmark works, one in each territory (config/landmarks.ts)
  { id: "frame", emoji: "🏗️", value: 8_000, color: "#78716c" },
  { id: "seats", emoji: "🪑", value: 45_000, color: "#0ea5e9" },
  { id: "drive4x4", emoji: "🧭", value: 200_000, color: "#65a30d" },
  { id: "coachwork", emoji: "✂️", value: 900_000, color: "#b45309" },
  { id: "rustproof", emoji: "🛡️", value: 3_000_000, color: "#0f766e" },
  { id: "lidar", emoji: "📡", value: 6_000_000, color: "#7c3aed" },
];

export const COMPONENT_BY_ID = Object.fromEntries(COMPONENTS.map((c) => [c.id, c])) as Record<ComponentId, ComponentConfig>;

/**
 * Every car needs one of each of these, plus its model's extras: three
 * plants and an assembly plant are enough for the first car.
 */
export const BASE_RECIPE: ComponentId[] = ["body", "engine", "tires"];

/**
 * Drivetrain and running gear the supplier delivers at whatever grade the
 * model needs (so no model waits on these plants); building the plant saves
 * the markup and lets better grades make better cars.
 */
export const SUPPLIED_PARTS: ComponentId[] = ["transmission", "wheels", "brakes"];

/**
 * The only finished parts an outside supplier sells: tyres for the first cars
 * (until the Tire Factory) and the drivetrain parts above (until their
 * plants). Bodies and engines are always made in-house; every other part
 * needs its own plant before a model can use it.
 */
export const OUTSOURCED_PARTS: ComponentId[] = ["tires", ...SUPPLIED_PARTS];

/**
 * Buying finished parts is the expensive, slow way: standard cost × `markup`,
 * paid when ordered (never on account), delivered by truck from the depot.
 * An assembly plant keeps `cover` batches' worth on hand or on the way.
 * Emergency parts — for a part the company makes but whose plants have
 * stopped — are off unless the player switches them on, and cost `emergency`.
 */
export const OUTSOURCE = { markup: 1.35, emergency: 1.5, cover: 3 };
/** (Older name of OUTSOURCE.markup.) */
export const SUPPLIER_MARKUP = OUTSOURCE.markup;

export interface PlantConfig {
  id: PlantType;
  emoji: string;
  /** What it makes. null = cars (the assembly plant). */
  item: ComponentId | null;
  /** Raw material it consumes, and how much per unit. */
  raw: string;
  rawPer: number;
  /** Seconds per unit at Level 1, before upgrades. */
  time: number;
  /** Price to build the first one (second one ×PLANT_COPY_COST…). Also the base of every upgrade price. */
  cost: number;
  /** A cheaper price for the very first one (upgrades still scale with `cost`). */
  firstCost?: number;
  /** The plant that must exist before this one can be built. */
  requires: PlantType | null;
  /** Research needed first. */
  research?: string;
  /** A production milestone needed first (lifetime units of a component). */
  unlockMade?: { item: ComponentId; n: number };
  /** A landmark works: the territory whose one lot it stands on (config/landmarks.ts). */
  landmark?: TerritoryId;
  color: string;
  roof: string;
}

export const PLANTS: PlantConfig[] = [
  // the first car: body + engine + tyres, put together by the assembly plant
  // (tyres come from a supplier until the Tire Factory is built)
  { id: "bodyWorks", emoji: "🚙", item: "body", raw: "steel", rawPer: 10, time: 20, cost: 8_000, requires: null, color: "#e2e8f0", roof: "#64748b" },
  { id: "engineFactory", emoji: "⚙️", item: "engine", raw: "metal", rawPer: 10, time: 30, cost: 6_000, requires: "bodyWorks", unlockMade: { item: "body", n: 12 }, color: "#e7e5e4", roof: "#b91c1c" },
  { id: "assemblyPlant", emoji: "🏭", item: null, raw: "", rawPer: 0, time: 60, cost: 30_000, firstCost: 6_000, requires: "engineFactory", color: "#f1f5f9", roof: "#1d4ed8" },
  { id: "tireFactory", emoji: "🛞", item: "tires", raw: "rubber", rawPer: 10, time: 30, cost: 15_000, requires: "engineFactory", color: "#d4d4d8", roof: "#27272a" },
  // better cars need more parts
  { id: "interiorFactory", emoji: "💺", item: "interior", raw: "fabric", rawPer: 10, time: 40, cost: 150_000, requires: "assemblyPlant", color: "#fef3c7", roof: "#a16207" },
  { id: "suspensionFactory", emoji: "🔩", item: "suspension", raw: "alloy", rawPer: 10, time: 40, cost: 400_000, requires: "interiorFactory", color: "#fef3c7", roof: "#b45309" },
  { id: "glassFactory", emoji: "🪟", item: "glass", raw: "sand", rawPer: 10, time: 40, cost: 1_000_000, requires: "suspensionFactory", color: "#e0f2fe", roof: "#0284c7" },
  { id: "paintFactory", emoji: "🎨", item: "paint", raw: "pigment", rawPer: 10, time: 30, cost: 3_000_000, requires: "glassFactory", color: "#fce7f3", roof: "#db2777" },
  { id: "electronicsFactory", emoji: "🔌", item: "electronics", raw: "chips", rawPer: 10, time: 50, cost: 10_000_000, requires: "paintFactory", color: "#dcfce7", roof: "#15803d" },
  { id: "batteryFactory", emoji: "🔋", item: "battery", raw: "lithium", rawPer: 10, time: 60, cost: 40_000_000, requires: "electronicsFactory", research: "electric_motors", color: "#ecfccb", roof: "#4d7c0f" },
  // the self-driving stack: written, trained on fleet data and flashed onto every Autonomous car (its plots are the Electronics Factory's, see ALT_USES in config/city.ts)
  { id: "softwareStudio", emoji: "💻", item: "software", raw: "code", rawPer: 10, time: 50, cost: 100_000_000, requires: "batteryFactory", research: "driving_software", color: "#e0e7ff", roof: "#4338ca" },
  // drivetrain and running gear: until these plants exist, an outside supplier delivers the parts
  { id: "transmissionFactory", emoji: "🕹️", item: "transmission", raw: "alloy", rawPer: 10, time: 45, cost: 250_000, requires: "suspensionFactory", color: "#e2e8f0", roof: "#475569" },
  { id: "wheelFactory", emoji: "⭕", item: "wheels", raw: "alloy", rawPer: 10, time: 30, cost: 300_000, requires: "transmissionFactory", color: "#f1f5f9", roof: "#94a3b8" },
  { id: "brakeFactory", emoji: "🛑", item: "brakes", raw: "metal", rawPer: 10, time: 30, cost: 450_000, requires: "wheelFactory", color: "#fee2e2", roof: "#b91c1c" },
  // the landmark works: one in each territory, an old works to restore on its own lot, making the
  // part its territory's car line needs (config/landmarks.ts)
  { id: "frameWorks", emoji: "🏗️", item: "frame", raw: "steel", rawPer: 10, time: 35, cost: 120_000, requires: "assemblyPlant", landmark: "raw", color: "#d6d3d1", roof: "#57534e" },
  { id: "familyWorks", emoji: "🪑", item: "seats", raw: "fabric", rawPer: 10, time: 40, cost: 1_200_000, requires: "interiorFactory", landmark: "suburbs", color: "#e0f2fe", roof: "#0369a1" },
  { id: "trailWorks", emoji: "🧭", item: "drive4x4", raw: "alloy", rawPer: 10, time: 45, cost: 5_000_000, requires: "suspensionFactory", landmark: "mountain", color: "#ecfccb", roof: "#3f6212" },
  { id: "coachWorks", emoji: "✂️", item: "coachwork", raw: "leather", rawPer: 10, time: 50, cost: 25_000_000, requires: "paintFactory", landmark: "boulevard", color: "#fef3c7", roof: "#92400e" },
  { id: "harbourWorks", emoji: "🛡️", item: "rustproof", raw: "pigment", rawPer: 10, time: 50, cost: 60_000_000, requires: "electronicsFactory", landmark: "port", color: "#ccfbf1", roof: "#115e59" },
  { id: "mobilityHub", emoji: "📡", item: "lidar", raw: "chips", rawPer: 10, time: 55, cost: 250_000_000, requires: "softwareStudio", landmark: "airport", color: "#ede9fe", roof: "#5b21b6" },
];

export const PLANT_BY_ID = Object.fromEntries(PLANTS.map((p) => [p.id, p])) as Record<PlantType, PlantConfig>;
export const PLANT_TYPES = PLANTS.map((p) => p.id);
export const isPlantType = (t: string): t is PlantType => t in PLANT_BY_ID;

/** The plant that makes each component. */
export const MAKER: Record<ComponentId, PlantType> = Object.fromEntries(
  PLANTS.filter((p) => p.item).map((p) => [p.item, p.id]),
) as Record<ComponentId, PlantType>;

/** Each extra plant of the same type costs this many times the previous. */
export const PLANT_COPY_COST = 2.5;

/**
 * Before an assembly plant exists, an engine factory can fit each engine into
 * a car body and sell the motorized chassis: worth this many times a body and
 * an engine sold separately, but it stops when bodies run out.
 */
export const CHASSIS_BONUS = 1.05;

// ───────────────────────────── growth ─────────────────────────────

export interface LevelConfig {
  /** Units made per batch. */
  lines: number;
  /** Storage multiplier (raw, inputs and finished goods). */
  storage: number;
  /** (Unused: level prices follow UPGRADE_SCALING in config/economy.ts.) */
  cost: number;
}

/** Small → Mega Factory → Auto City → … Global Flagship (15 levels). Every level also changes how the building and its floor look. */
export const PLANT_LEVELS: LevelConfig[] = [
  { lines: 1, storage: 1, cost: 0 },
  { lines: 2, storage: 1.5, cost: 0 },
  { lines: 3, storage: 2, cost: 0 },
  { lines: 4, storage: 2.5, cost: 0 },
  { lines: 5, storage: 3, cost: 0 },
  { lines: 6, storage: 3.5, cost: 0 },
  { lines: 7, storage: 4, cost: 0 },
  { lines: 8, storage: 4.5, cost: 0 },
  { lines: 9, storage: 5, cost: 0 },
  { lines: 10, storage: 5.5, cost: 0 },
  // 11-15: open as the company's total earnings grow (PLANT_LEVEL_UNLOCKS)
  { lines: 12, storage: 6.5, cost: 0 },
  { lines: 14, storage: 7.5, cost: 0 },
  { lines: 16, storage: 8.5, cost: 0 },
  { lines: 18, storage: 9.5, cost: 0 },
  { lines: 20, storage: 10.5, cost: 0 },
];
/** Levels every player can reach; the rest open with total earnings. */
export const BASE_MAX_LEVEL = 10;
export const PLANT_MAX_LEVEL = PLANT_LEVELS.length;
/** Total money earned (lifetime, across resets) that opens plant levels 11, 12, 13, 14 and 15. */
export const PLANT_LEVEL_UNLOCKS = [5e7, 2.5e8, 1e9, 5e9, 2.5e10];

/** Highest plant level the company can build to with this much earned in total. */
export function plantLevelCap(lifetimeEarned: number): number {
  return BASE_MAX_LEVEL + PLANT_LEVEL_UNLOCKS.filter((need) => lifetimeEarned >= need).length;
}

/** What must be earned in total to open this plant level (null: open from the start, or no such level). */
export function plantLevelNeed(level: number): number | null {
  return PLANT_LEVEL_UNLOCKS[level - BASE_MAX_LEVEL - 1] ?? null;
}

/** Speed upgrades: each makes production this much faster. */
export const SPEED = { mult: 1.06, firstCost: 0.08, growth: 1.5, max: 40 };

/**
 * The Body Works shop floor: up to five machines along its line (blanking,
 * press, welding, framing, inspection), each run by one hired operator. The
 * plant comes with the first machine and its operator. Every further machine
 * makes the plant `machine` faster; with an operator at it, `operator` more
 * (a machine alone never replaces a worker). Machines and operators are
 * one-off purchases: the plant's crew wages already cover the shifts.
 */
export const BODY_WORKSHOP = {
  max: 5,
  machine: 0.05,
  operator: 0.15,
  machineCost: { base: 350, growth: 1.75 },
  operatorCost: { base: 180, growth: 1.65 },
};

/** Manual → Semi-Automated → Automated → Advanced Automation → AI Factory. */
export const AUTOMATION = [
  { speed: 1, offline: 0, cost: 0 },
  { speed: 1.5, offline: 0.1, cost: 1 },
  { speed: 2.2, offline: 0.2, cost: 15 },
  { speed: 3.2, offline: 0.3, cost: 200 },
  { speed: 5, offline: 0.4, cost: 3_000 },
];

/** Trucks that come with each plant level (no separate purchase). */
export const PLANT_TRUCKS = [1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5];
export const MAX_TRUCKS = 5;

/** Component grades: Standard, Lightweight, Performance, Luxury, Carbon. */
export const GRADES = [
  { value: 1, time: 1, cost: 0 },
  { value: 2.5, time: 1.15, cost: 25 },
  { value: 6, time: 1.3, cost: 600 },
  { value: 15, time: 1.5, cost: 15_000 },
  { value: 40, time: 1.75, cost: 400_000 },
];
export const MAX_GRADE = GRADES.length;

/** Finished goods and assembly input storage at Level 1, in units. */
export const OUT_STORAGE = 20;

// ───────────────────────────── transport ─────────────────────────────

/**
 * Road speed of every vehicle on the map, tiles per second: cars, vans,
 * trucks and transporters all drive the same city pace. Logistics bonuses
 * ("delivery rate") make loads bigger and docks faster instead.
 */
export const ROAD_SPEED = 1.4;
/** Extra time on every trip for corners and red lights (a share of the driving time). */
export const TRAFFIC_ALLOWANCE = 0.18;
/** Seconds between two trucks leaving the same dock, so they never stack. */
export const HEADWAY = 1.5;
/** Loading/unloading time added to every leg. */
export const DOCK_TIME = 2;
/** A truck leaves with a partial load after waiting this long. */
export const MAX_WAIT = 12;
/** A car transporter leaves with what it has after this long (cars don't wait for a full load). */
export const CAR_WAIT = 5;

export interface VehicleConfig {
  id: Vehicle;
  /** Units per trip. */
  capacity: number;
}

/** What a plant's trucks are, by plant level (index = level - 1). */
export const PLANT_VEHICLE: Vehicle[] = ["van", "van", "truck", "truck", "semi", "semi", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer"];
// sized for trucks that drive the city pace (ROAD_SPEED): bigger loads, same flow of goods
export const VEHICLE_CAPACITY: Record<Vehicle, number> = { van: 9, truck: 22, semi: 62, trailer: 200, carrier: 14 };
/** Car transporters carry more cars at higher assembly levels. */
export const CARRIER_CAPACITY = [4, 7, 9, 13, 18, 23, 28, 40, 43, 56, 70, 85, 99, 113, 141];


// ───────────────────────────── selling ─────────────────────────────

/** Dealerships: seconds between customers at Level 1, and stock. */
/** Dealers keep a storage lot: finished cars are stored there until customers buy them. */
export const DEALER_SALE = { interval: 30, stock: 10, perLevelSpeed: 0.2, perLevelStock: 5 };
/**
 * When every dealership is full, a full transporter load goes to a wholesale
 * buyer at the Parts Market for this share of the car's value (no markup), so
 * the assembly line never stops. Dealers always get cars first.
 */
export const WHOLESALE = 0.7;

/**
 * The Parts Market is the wholesale outlet for components: a thin margin and
 * a limited appetite. Per item it pays full price for up to `depth` units per
 * `window` seconds for every level of the company's plants making it (+1);
 * beyond that each extra unit fetches less — depth ÷ volume of the price —
 * down to `floor` (a wholesale price). Cars are the business; parts are the
 * overflow.
 */
export const PARTS_DEMAND = { window: 300, depth: 25, floor: 0.6 };

/** Smoothing of the HUD income rate (seconds). */
export const RATE_WINDOW = 120;
