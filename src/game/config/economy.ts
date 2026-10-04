// The real economy of the empire, in one place: raw materials and their
// market, what every component is made of, what it costs to run a plant
// (labour, energy, maintenance), logistics, dealer fees and taxes, and the
// margins cars and parts sell at. Money only comes from selling what the
// plants made out of materials the player bought; every value that shapes
// that loop lives here so balancing never touches the engine or the UI.
import type { CarClass } from "./cars";
import type { ComponentId, PlantType } from "../types";

// ───────────────────────────── materials ─────────────────────────────

export type MaterialId = "steel" | "aluminum" | "plastic" | "rubber" | "glass" | "copper" | "electronics" | "fabric" | "leather" | "paint" | "battery" | "fluids";

export interface MaterialConfig {
  id: MaterialId;
  emoji: string;
  /** Base market price per unit (before supplier, bulk discount and drift). */
  price: number;
  color: string;
}

export const MATERIALS: MaterialConfig[] = [
  { id: "steel", emoji: "🔩", price: 25, color: "#94a3b8" },
  { id: "aluminum", emoji: "🔧", price: 40, color: "#cbd5e1" },
  { id: "plastic", emoji: "🧴", price: 10, color: "#f59e0b" },
  { id: "rubber", emoji: "⚫", price: 18, color: "#334155" },
  { id: "glass", emoji: "🪟", price: 15, color: "#7dd3fc" },
  { id: "copper", emoji: "🟠", price: 55, color: "#c2410c" },
  { id: "electronics", emoji: "💾", price: 120, color: "#22c55e" },
  { id: "fabric", emoji: "🧵", price: 12, color: "#a16207" },
  { id: "leather", emoji: "👜", price: 80, color: "#7c2d12" },
  { id: "paint", emoji: "🎨", price: 30, color: "#ec4899" },
  { id: "battery", emoji: "🔋", price: 300, color: "#84cc16" },
  { id: "fluids", emoji: "🛢️", price: 8, color: "#0f766e" },
];
export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<MaterialId, MaterialConfig>;
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

/** Materials in one unit of each component at grade 1 (better grades use more and finer material). */
export const COMPONENT_RECIPE: Record<ComponentId, Partial<Record<MaterialId, number>>> = {
  body: { steel: 60, plastic: 6 },
  engine: { aluminum: 25, steel: 10, copper: 4, fluids: 5 },
  tires: { rubber: 16, steel: 2 },
  interior: { fabric: 15, plastic: 20, leather: 2 },
  suspension: { steel: 12, aluminum: 6, fluids: 2 },
  glass: { glass: 15, plastic: 1 },
  paint: { paint: 5, fluids: 2 },
  electronics: { electronics: 10, copper: 4, plastic: 3 },
  battery: { battery: 20, copper: 6, aluminum: 5 },
};

/** Material per unit grows with the component grade (Standard … Carbon). */
export const GRADE_MATERIAL = [1, 1.8, 3.2, 5.5, 9];

/** Seconds to make one unit at Level 1, manual, grade 1. */
export const COMPONENT_TIME: Record<ComponentId, number> = {
  body: 45,
  engine: 60,
  tires: 30,
  interior: 40,
  suspension: 35,
  glass: 25,
  paint: 25,
  electronics: 35,
  battery: 60,
};

/** Prices drift a little, slowly and predictably (no wild swings): ±amp over a period of minutes. */
export const PRICE_DRIFT = { amp: 0.06, minPeriod: 18 * 60, maxPeriod: 40 * 60 };

// ───────────────────────────── suppliers ─────────────────────────────

export type SupplierId = "local" | "wholesale" | "international" | "contract";

export interface SupplierConfig {
  id: SupplierId;
  emoji: string;
  /** Discount on every order. */
  discount: number;
  /** Largest single order (units of one material). */
  maxOrder: number;
  /** Lifetime material units bought to unlock it. */
  unlockBought: number;
  /** Plants may restock automatically from this supplier on. */
  autoBuy: boolean;
}

export const SUPPLIERS: SupplierConfig[] = [
  { id: "local", emoji: "🏪", discount: 0, maxOrder: 1_000, unlockBought: 0, autoBuy: false },
  { id: "wholesale", emoji: "🏭", discount: 0.03, maxOrder: 10_000, unlockBought: 5_000, autoBuy: true },
  { id: "international", emoji: "🚢", discount: 0.06, maxOrder: 50_000, unlockBought: 60_000, autoBuy: true },
  { id: "contract", emoji: "📜", discount: 0.1, maxOrder: 250_000, unlockBought: 600_000, autoBuy: true },
];
export const SUPPLIER_BY_ID = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s])) as Record<SupplierId, SupplierConfig>;

/** Volume discounts on one order: the biggest tier reached applies. */
export const BULK_DISCOUNT: [number, number][] = [
  [10_000, 0.15],
  [1_000, 0.1],
  [100, 0.05],
];

/** Auto-restock: refill to this share of the warehouse when a material drops below `below`. */
export const AUTO_BUY = { below: 0.3, upTo: 0.7 };

// ───────────────────────────── warehouse ─────────────────────────────

/** Material units a plant's warehouse holds, by warehouse level. */
export const WAREHOUSE_CAP = [500, 1_000, 2_500, 5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000];
/** Warehouse upgrade price: plant cost × base × growth^(level-1). */
export const WAREHOUSE_COST = { base: 0.2, growth: 1.7 };
/** Seconds a material delivery takes to arrive is the depot truck's drive; a delivery fee per unit. */
export const DELIVERY_FEE = 0.5;

// ───────────────────────────── running a plant ─────────────────────────────

/** Wage per worker per second. */
export const WAGE = 0.8;
/** Workers per production line by automation tier (Manual … AI Factory): robots take over. */
export const WORKERS_PER_LINE = [4, 3, 2, 1, 0.5];
/** Robots per line by automation tier. */
export const ROBOTS_PER_LINE = [0, 1, 2, 3, 4];

/** Power: the building, each line and each robot draw kW; energy is priced per kW per minute. */
export const POWER = { plant: 150, line: 50, robot: 20, paintBooth: 35, pricePerKwMin: 0.08 };
/** ⚡ Power System upgrades: each cuts the energy bill by this share (up to `max` levels). */
export const POWER_SYSTEM = { cut: 0.08, max: 6, costBase: 0.25, growth: 1.9 };

/** Maintenance per plant per second at Level 1; grows with the plant. */
export const MAINTENANCE = { base: 0.5, perLevel: 0.18 };

/** Crew of each plant type, per line (the assembly line needs the most hands). */
export const CREW: Partial<Record<PlantType, number>> = { assemblyPlant: 1.5, paintFactory: 0.75, glassFactory: 0.75 };

// ───────────────────────────── logistics, fees, tax ─────────────────────────────

/** Every truck trip costs fuel and a driver. */
export const TRIP_FEE: Record<"van" | "truck" | "semi" | "trailer" | "carrier", number> = { van: 25, truck: 45, semi: 90, trailer: 180, carrier: 120 };
/** The dealer keeps this share of every sale; the state takes this share as operating tax. */
export const DEALER_FEE = 0.06;
export const SALES_TAX = 0.08;

// ───────────────────────────── margins & demand ─────────────────────────────

/**
 * What a car sells for: its standard production cost × (1 + margin),
 * grossed up for the dealer fee and tax. Premium cars earn more per car
 * but sell slowly (demand).
 */
export const CLASS_MARGIN: Record<CarClass, number> = { economy: 0.16, sport: 0.24, premium: 0.3, luxury: 0.38, supercar: 0.48, hypercar: 0.55 };
/** How quickly each class finds a buyer (× the dealer's customer rate). */
export const CLASS_DEMAND: Record<CarClass, number> = { economy: 1.3, sport: 1, premium: 0.8, luxury: 0.6, supercar: 0.35, hypercar: 0.25 };

/** Surplus parts sold to the Parts Market: a thin margin over their standard cost. */
export const PARTS_MARGIN = 0.06;

/** Final assembly plus quality control, per car at Level 1 (seconds): × the car's own factor. */
export const ASSEMBLY_TIME = { assembly: 90, qc: 20 };

/** Finished cars a plant's car storage holds at Level 1 (grows with the level's storage). */
export const CAR_STORAGE = 6;

// ───────────────────────────── upgrades ─────────────────────────────

/**
 * Upgrade prices scale from the plant's build cost:
 *   level n → cost × level.base × level.growth^(n-2)
 */
export const UPGRADE_SCALING = {
  level: { base: 0.15, growth: 1.8 },
  speed: { base: 0.06, growth: 1.5 },
  /** Automation tiers, × plant cost. */
  automation: [0, 1.5, 5, 15, 45],
  /** Component grades, × plant cost. */
  grade: [0, 2, 8, 30, 120],
};

/**
 * Wages, energy and trip fees the cash cannot cover yet go on the company's
 * account and are paid first from the next sales. The debt stays small by
 * construction: materials are always paid up front, so a plant can only
 * work on account for as long as its warehouse has material.
 */

/** Money every new company starts with. */
export const START_CASH = 10_000;
