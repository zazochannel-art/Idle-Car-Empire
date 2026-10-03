// The automotive supply chain: what each plant makes, from what, how fast,
// what it sells for, and how plants grow. All balance numbers live here;
// engine/chain.ts runs them.
import type { ComponentId, PlantType, Vehicle } from "../types";

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
];

export const COMPONENT_BY_ID = Object.fromEntries(COMPONENTS.map((c) => [c.id, c])) as Record<ComponentId, ComponentConfig>;

/**
 * Every car needs one of each of these, plus its model's extras: three
 * plants and an assembly plant are enough for the first car.
 */
export const BASE_RECIPE: ComponentId[] = ["body", "engine", "tires"];

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
  /** The plant that must exist before this one can be built. */
  requires: PlantType | null;
  /** Research needed first. */
  research?: string;
  /** A production milestone needed first (lifetime units of a component). */
  unlockMade?: { item: ComponentId; n: number };
  color: string;
  roof: string;
}

export const PLANTS: PlantConfig[] = [
  // the first car: body + engine + tyres, put together by the assembly plant
  { id: "bodyWorks", emoji: "🚙", item: "body", raw: "steel", rawPer: 10, time: 20, cost: 5_000, requires: null, color: "#e2e8f0", roof: "#64748b" },
  { id: "engineFactory", emoji: "⚙️", item: "engine", raw: "metal", rawPer: 10, time: 30, cost: 1_500, requires: "bodyWorks", unlockMade: { item: "body", n: 12 }, color: "#e7e5e4", roof: "#b91c1c" },
  { id: "tireFactory", emoji: "🛞", item: "tires", raw: "rubber", rawPer: 10, time: 30, cost: 60_000, requires: "engineFactory", color: "#d4d4d8", roof: "#27272a" },
  { id: "assemblyPlant", emoji: "🏭", item: null, raw: "", rawPer: 0, time: 60, cost: 600_000, requires: "tireFactory", color: "#f1f5f9", roof: "#1d4ed8" },
  // better cars need more parts
  { id: "interiorFactory", emoji: "💺", item: "interior", raw: "fabric", rawPer: 10, time: 40, cost: 1.5e7, requires: "assemblyPlant", color: "#fef3c7", roof: "#a16207" },
  { id: "suspensionFactory", emoji: "🔩", item: "suspension", raw: "alloy", rawPer: 10, time: 40, cost: 4e7, requires: "interiorFactory", color: "#fef3c7", roof: "#b45309" },
  { id: "glassFactory", emoji: "🪟", item: "glass", raw: "sand", rawPer: 10, time: 40, cost: 1.2e8, requires: "suspensionFactory", color: "#e0f2fe", roof: "#0284c7" },
  { id: "paintFactory", emoji: "🎨", item: "paint", raw: "pigment", rawPer: 10, time: 30, cost: 8e8, requires: "glassFactory", color: "#fce7f3", roof: "#db2777" },
  { id: "electronicsFactory", emoji: "🔌", item: "electronics", raw: "chips", rawPer: 10, time: 50, cost: 3e10, requires: "paintFactory", color: "#dcfce7", roof: "#15803d" },
  { id: "batteryFactory", emoji: "🔋", item: "battery", raw: "lithium", rawPer: 10, time: 60, cost: 8e11, requires: "electronicsFactory", research: "electric_motors", color: "#ecfccb", roof: "#4d7c0f" },
];

export const PLANT_BY_ID = Object.fromEntries(PLANTS.map((p) => [p.id, p])) as Record<PlantType, PlantConfig>;
export const PLANT_TYPES = PLANTS.map((p) => p.id);
export const isPlantType = (t: string): t is PlantType => t in PLANT_BY_ID;

/** The plant that makes each component. */
export const MAKER: Record<ComponentId, PlantType> = Object.fromEntries(
  PLANTS.filter((p) => p.item).map((p) => [p.item, p.id]),
) as Record<ComponentId, PlantType>;

/** Each extra plant of the same type costs this many times the previous. */
export const PLANT_COPY_COST = 6;

/**
 * Before an assembly plant exists, an engine factory can fit each engine into
 * a car body and sell the motorized chassis: worth this many times a body and
 * an engine sold separately, but it stops when bodies run out.
 */
export const CHASSIS_BONUS = 1.3;

// ───────────────────────────── growth ─────────────────────────────

export interface LevelConfig {
  /** Units made per batch. */
  lines: number;
  /** Storage multiplier (raw, inputs and finished goods). */
  storage: number;
  /** Upgrade price to reach this level, × plant cost. */
  cost: number;
}

/** Small → Mega Factory → Auto City → … Global Flagship (15 levels). Every level also changes how the building and its floor look. */
export const PLANT_LEVELS: LevelConfig[] = [
  { lines: 1, storage: 1, cost: 0 },
  { lines: 2, storage: 2, cost: 0.1 },
  { lines: 3, storage: 3, cost: 0.8 },
  { lines: 4, storage: 4, cost: 5 },
  { lines: 6, storage: 6, cost: 30 },
  { lines: 8, storage: 8, cost: 200 },
  { lines: 12, storage: 12, cost: 1_500 },
  { lines: 16, storage: 16, cost: 12_000 },
  { lines: 22, storage: 22, cost: 120_000 },
  { lines: 30, storage: 30, cost: 1_500_000 },
  // 11-15: one more level for every region the empire has expanded to
  { lines: 40, storage: 40, cost: 1.8e7 },
  { lines: 52, storage: 52, cost: 2.2e8 },
  { lines: 68, storage: 68, cost: 2.7e9 },
  { lines: 88, storage: 88, cost: 3.3e10 },
  { lines: 115, storage: 115, cost: 4e11 },
];
/** Levels every player can reach; the rest open one per region. */
export const BASE_MAX_LEVEL = 10;
export const PLANT_MAX_LEVEL = PLANT_LEVELS.length;

/** Speed upgrades: each makes production this much faster. */
export const SPEED = { mult: 1.08, firstCost: 0.02, growth: 1.45, max: 40 };

/** Manual → Semi-Automated → Automated → Advanced Automation → AI Factory. */
export const AUTOMATION = [
  { speed: 1, offline: 0, cost: 0 },
  { speed: 1.5, offline: 0.1, cost: 1 },
  { speed: 2.2, offline: 0.2, cost: 15 },
  { speed: 3.2, offline: 0.3, cost: 200 },
  { speed: 5, offline: 0.4, cost: 3_000 },
];

/** Trucks that come with each plant level (no separate purchase). */
export const PLANT_TRUCKS = [1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 8, 8, 8, 8, 8];
export const MAX_TRUCKS = 8;

/** Component grades: Standard, Lightweight, Performance, Luxury, Carbon. */
export const GRADES = [
  { value: 1, time: 1, cost: 0 },
  { value: 2.5, time: 1.15, cost: 25 },
  { value: 6, time: 1.3, cost: 600 },
  { value: 15, time: 1.5, cost: 15_000 },
  { value: 40, time: 1.75, cost: 400_000 },
];
export const MAX_GRADE = GRADES.length;

/** Raw materials cost this share of the finished unit's value. */
export const MATERIAL_SHARE = 0.6;
/** Raw material storage at Level 1, in units of finished goods. */
export const RAW_STORAGE = 20;
/** Finished goods and assembly input storage at Level 1, in units. */
export const OUT_STORAGE = 20;

// ───────────────────────────── transport ─────────────────────────────

/** Road speed of trucks, tiles per second (before Logistics bonuses). */
export const TRUCK_SPEED = 2.6;
/** Loading/unloading time added to every leg. */
export const DOCK_TIME = 2;
/** A truck leaves with a partial load after waiting this long. */
export const MAX_WAIT = 12;

export interface VehicleConfig {
  id: Vehicle;
  /** Units per trip. */
  capacity: number;
}

/** What a plant's trucks are, by plant level (index = level - 1). */
export const PLANT_VEHICLE: Vehicle[] = ["van", "van", "truck", "truck", "semi", "semi", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer", "trailer"];
export const VEHICLE_CAPACITY: Record<Vehicle, number> = { van: 4, truck: 10, semi: 24, trailer: 60, carrier: 6 };
/** Car transporters carry more cars at higher assembly levels. */
export const CARRIER_CAPACITY = [2, 3, 4, 6, 8, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40];

/** The Materials Depot sends raw material when a plant drops below this share. */
export const RESUPPLY_AT = 0.5;
/** Supply trucks bring up to this share of a plant's raw storage. */
export const SUPPLY_LOAD = 0.6;

// ───────────────────────────── selling ─────────────────────────────

/** Dealerships: seconds between customers at Level 1, and stock. */
export const DEALER_SALE = { interval: 14, stock: 6, perLevelSpeed: 0.25, perLevelStock: 3 };

/** Smoothing of the HUD income rate (seconds). */
export const RATE_WINDOW = 30;
