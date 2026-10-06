// The Empire Map: zones (stages), what can be built on plots, and the garage
// interior (facilities, levels, specializations). All balance numbers live
// here; engine/city.ts turns them into income.
import type { Effect, FacilityType, Specialization, StructureType, ZoneId } from "../types";
import { PLANTS } from "./chain";

// ───────────────────────────── zones ─────────────────────────────

export interface ZoneConfig {
  id: ZoneId;
  stage: number;
  /** Price to unlock. The previous stage must be unlocked first. */
  cost: number;
  /** Richer districts: garage fees and prices here are multiplied by this. */
  scale: number;
  ground: string;
  accent: string;
  /** What empty plots here can become. */
  builds: StructureType[];
}

export const ZONES: ZoneConfig[] = [
  {
    id: "town", stage: 1, cost: 0, scale: 1, ground: "#7fd062", accent: "#60a5fa",
    builds: ["garage", "carWash", "parking", "serviceCenter", "warehouse"],
  },
  {
    id: "industrial", stage: 2, cost: 25_000, scale: 1.5, ground: "#a9b87c", accent: "#38bdf8",
    builds: ["garage", "partsFactory", "warehouse", "logistics", "truckDepot", "parking", "fleetPlant"],
  },
  {
    id: "downtown", stage: 3, cost: 150_000, scale: 2.5, ground: "#8fcf78", accent: "#22d3ee",
    builds: ["garage", "carWash", "parking", "serviceCenter", "researchCenter", "museum"],
  },
  {
    id: "automotive", stage: 4, cost: 600_000, scale: 4, ground: "#9fc584", accent: "#818cf8",
    builds: ["garage", "partsFactory", "researchCenter", "logistics", "warehouse", "fleetPlant"],
  },
  {
    id: "luxury", stage: 5, cost: 2_500_000, scale: 7, ground: "#6fd486", accent: "#facc15",
    builds: ["garage", "serviceCenter", "carWash", "parking", "hq", "museum"],
  },
  {
    id: "supercar", stage: 6, cost: 10_000_000, scale: 12, ground: "#d4bd78", accent: "#fb923c",
    builds: ["garage", "researchCenter", "exportTerminal", "warehouse"],
  },
  {
    id: "mega", stage: 7, cost: 40_000_000, scale: 20, ground: "#97be9a", accent: "#e879f9",
    builds: ["garage", "hq", "exportTerminal", "logistics", "truckDepot"],
  },
  {
    id: "global", stage: 8, cost: 150_000_000, scale: 35, ground: "#86c2c9", accent: "#c084fc",
    builds: ["garage", "airport", "hq", "exportTerminal"],
  },
];

// ───────────────────────────── territories ─────────────────────────────

export type TerritoryId = "mountain" | "port" | "raw" | "suburbs" | "boulevard" | "airport" | "campus" | "racing";

/**
 * The land around the districts: bought as the empire grows. Each one is a
 * landmark area with a real effect on the business (the Racing District has
 * its own unlock in config/racing.ts; the campus comes with the Automotive
 * District).
 */
export interface TerritoryConfig {
  id: TerritoryId;
  emoji: string;
  cost: number;
  /** District that must be unlocked first. */
  zone?: ZoneId;
  /** Racing reputation needed. */
  rep?: number;
  /** Empire Points earned (lifetime) needed. */
  ep?: number;
  /** Effects on the whole empire once it is open. */
  effects: Effect[];
}

export const TERRITORIES: TerritoryConfig[] = [
  { id: "raw", emoji: "⛏️", cost: 250_000, zone: "industrial", effects: [{ kind: "speed", mult: 1.05 }] },
  { id: "suburbs", emoji: "🏡", cost: 1_500_000, zone: "downtown", effects: [{ kind: "dealerCap", mult: 1.1 }] },
  { id: "campus", emoji: "🏢", cost: 0, zone: "automotive", effects: [] },
  { id: "racing", emoji: "🏁", cost: 0, effects: [] },
  { id: "mountain", emoji: "🏔️", cost: 8_000_000, rep: 800, effects: [{ kind: "rp", mult: 1.1 }] },
  { id: "boulevard", emoji: "💎", cost: 40_000_000, zone: "luxury", effects: [{ kind: "markup", add: 0.03 }] },
  { id: "port", emoji: "⚓", cost: 100_000_000, rep: 5_000, effects: [{ kind: "delivery", mult: 1.15 }] },
  { id: "airport", emoji: "✈️", cost: 500_000_000, rep: 20_000, ep: 25, zone: "global", effects: [{ kind: "income", mult: 1.1 }] },
];
export const TERRITORY_BY_ID = Object.fromEntries(TERRITORIES.map((t) => [t.id, t])) as Record<TerritoryId, TerritoryConfig>;
/** Territories the player buys (the campus opens with its district, racing with its own unlock). */
export const BUYABLE_TERRITORIES = TERRITORIES.filter((t) => t.id !== "campus" && t.id !== "racing");

export const ZONE_BY_ID: Record<ZoneId, ZoneConfig> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneConfig>;
export const ZONE_IDS = ZONES.map((z) => z.id);

// ───────────────────────────── map structures ─────────────────────────────

export interface StructureConfig {
  id: StructureType;
  emoji: string;
  /** Base price (× zone scale). */
  cost: number;
  /** Each level costs this many times the previous one. */
  levelGrowth: number;
  maxLevel: number;
  /** Per level: flat income/s (× zone scale), or a bonus. */
  income?: number;
  /** Garages in the same zone: +x income per level. */
  zoneGarageIncome?: number;
  /** Garages in the same zone: +x speed per level. */
  zoneGarageSpeed?: number;
  /** Global bonuses per level. */
  speed?: number;
  delivery?: number;
  dealerCap?: number;
  rp?: number;
  markup?: number;
  income2?: number;
  color: string;
  roof: string;
}

export const GARAGE_BUILD_COST = 25_000;

export const STRUCTURES: StructureConfig[] = [
  { id: "garage", emoji: "🔧", cost: GARAGE_BUILD_COST, levelGrowth: 1, maxLevel: 10, color: "#e9edf3", roof: "#3b82f6" },
  { id: "carWash", emoji: "🫧", cost: 4_000, levelGrowth: 3, maxLevel: 10, income: 0.3, color: "#dff3ff", roof: "#0ea5e9" },
  { id: "parking", emoji: "🅿️", cost: 3_000, levelGrowth: 3, maxLevel: 10, zoneGarageIncome: 0.08, color: "#9aa3ad", roof: "#64748b" },
  { id: "serviceCenter", emoji: "🛠️", cost: 20_000, levelGrowth: 3, maxLevel: 10, income: 1.2, color: "#fff4e0", roof: "#f97316" },
  { id: "warehouse", emoji: "📦", cost: 10_000, levelGrowth: 3, maxLevel: 10, zoneGarageSpeed: 0.06, color: "#e8dcc4", roof: "#a16207" },
  { id: "partsFactory", emoji: "⚙️", cost: 80_000, levelGrowth: 4, maxLevel: 10, speed: 0.02, color: "#d6d3d1", roof: "#57534e" },
  { id: "logistics", emoji: "🚚", cost: 60_000, levelGrowth: 4, maxLevel: 10, delivery: 0.05, color: "#e5e7eb", roof: "#2563eb" },
  { id: "truckDepot", emoji: "🚛", cost: 50_000, levelGrowth: 4, maxLevel: 10, dealerCap: 0.04, color: "#d1d5db", roof: "#dc2626" },
  { id: "researchCenter", emoji: "🔬", cost: 150_000, levelGrowth: 4, maxLevel: 10, rp: 0.05, color: "#f8fafc", roof: "#06b6d4" },
  { id: "exportTerminal", emoji: "🚢", cost: 1_500_000, levelGrowth: 4, maxLevel: 10, markup: 0.02, color: "#cbd5e1", roof: "#0f766e" },
  { id: "hq", emoji: "🏢", cost: 3_000_000, levelGrowth: 4, maxLevel: 10, income2: 0.02, color: "#bfdbfe", roof: "#1e3a8a" },
  { id: "fleetPlant", emoji: "🚌", cost: 800_000, levelGrowth: 3, maxLevel: 10, color: "#e2e8f0", roof: "#ca8a04" },
  { id: "museum", emoji: "🏛️", cost: 300_000, levelGrowth: 3, maxLevel: 10, income: 1, color: "#f5f0e6", roof: "#b45309" },
  { id: "airport", emoji: "✈️", cost: 8_000_000, levelGrowth: 4, maxLevel: 10, markup: 0.04, color: "#e2e8f0", roof: "#475569" },
  // supply-chain plants (their economy lives in config/chain.ts)
  ...PLANTS.map((p) => ({ id: p.id, emoji: p.emoji, cost: p.cost, levelGrowth: 1, maxLevel: 8, color: p.color, roof: p.roof })),
];

/** What a plot in a district can hold: any plant, plus the district's own buildings. */
// ───────────────────────────── land plots ─────────────────────────────

/**
 * What each district's plots are zoned for: every plot takes one kind of
 * building only (an Engine Factory plot, a Warehouse plot…), so the map has
 * a real structure. The list is dealt out to the district's plots nearest
 * first (town: nearest the starter works) and repeats if there are more
 * plots than entries. `big` is for the whole-block lots.
 */
export const PLOT_USES: Record<ZoneId, { cells: StructureType[]; big: StructureType[] }> = {
  town: {
    cells: ["engineFactory", "assemblyPlant", "tireFactory", "interiorFactory", "suspensionFactory", "garage", "warehouse", "engineFactory", "carWash", "garage", "parking", "serviceCenter"],
    big: ["assemblyPlant"],
  },
  industrial: {
    cells: ["interiorFactory", "suspensionFactory", "truckDepot", "logistics", "transmissionFactory", "partsFactory", "fleetPlant", "warehouse"],
    big: ["assemblyPlant", "glassFactory"],
  },
  downtown: {
    cells: ["researchCenter", "garage", "wheelFactory", "museum", "brakeFactory", "carWash", "parking", "serviceCenter", "engineFactory", "garage", "tireFactory"],
    big: ["paintFactory"],
  },
  automotive: {
    cells: ["partsFactory", "researchCenter", "glassFactory", "logistics", "warehouse", "interiorFactory", "suspensionFactory", "fleetPlant", "transmissionFactory", "wheelFactory", "brakeFactory", "garage", "bodyWorks", "engineFactory", "tireFactory", "paintFactory", "assemblyPlant"],
    big: ["electronicsFactory"],
  },
  luxury: {
    cells: ["hq", "museum", "garage", "serviceCenter", "carWash", "parking", "glassFactory", "paintFactory", "interiorFactory"],
    big: ["assemblyPlant"],
  },
  supercar: {
    cells: ["researchCenter", "exportTerminal", "electronicsFactory", "warehouse", "garage", "paintFactory", "suspensionFactory", "transmissionFactory", "wheelFactory", "brakeFactory", "engineFactory", "glassFactory", "tireFactory"],
    big: ["batteryFactory", "assemblyPlant"],
  },
  mega: {
    cells: ["hq", "exportTerminal", "batteryFactory", "logistics", "truckDepot", "garage", "electronicsFactory", "engineFactory", "bodyWorks", "assemblyPlant"],
    big: ["assemblyPlant"],
  },
  global: {
    cells: ["airport", "hq", "exportTerminal", "batteryFactory", "garage", "electronicsFactory", "paintFactory", "glassFactory", "interiorFactory", "suspensionFactory", "assemblyPlant"],
    big: ["batteryFactory"],
  },
};

export type PlotSize = "small" | "medium" | "large" | "mega";

/** Size class of a plot: town-centre cells are small, industrial cells medium, whole blocks large (mega in the last districts). */
export function plotSizeOf(zone: ZoneId, big: boolean): PlotSize {
  if (big) return zone === "mega" || zone === "global" ? "mega" : "large";
  return zone === "town" || zone === "downtown" || zone === "luxury" ? "small" : "medium";
}

/** Share of a building's price paid for the land; the rest pays for the construction. */
export const LAND_SHARE = 0.3;
/** Land price by plot size (× the share above). */
export const LAND_SIZE_MULT: Record<PlotSize, number> = { small: 0.8, medium: 1, large: 1.4, mega: 2.2 };
/** Construction time by plot size. */
export const BUILD_SIZE_MULT: Record<PlotSize, number> = { small: 1, medium: 1.25, large: 1.6, mega: 3 };
/**
 * Construction time of a new building from its price: 2 minutes for the
 * cheapest, growing with the price (an Electronics Factory takes ~1 hour,
 * a Battery Factory on a mega plot several), at most 8 hours.
 */
export const BUILD_TIME = { min: 120, base: 120, ref: 8_000, exp: 0.45, max: 8 * 3600 };
/** Upgrading a building (a new level) is a smaller job: 15 s for cheap levels, up to 2 hours. */
export const UPGRADE_TIME = { min: 15, base: 15, ref: 1_000, exp: 0.3, max: 2 * 3600 };
/** Finishing a construction now costs this share of its price per remaining fraction. */
export const SPEED_UP_SHARE = 0.6;

export function buildableIn(zone: ZoneId, big = false): StructureType[] {
  const plants = PLANTS.map((p) => p.id);
  return big ? plants : [...plants, ...ZONE_BY_ID[zone].builds];
}

export const STRUCTURE_BY_ID: Record<StructureType, StructureConfig> = Object.fromEntries(
  STRUCTURES.map((s) => [s.id, s]),
) as Record<StructureType, StructureConfig>;

// ───────────────────────────── garages ─────────────────────────────

export const GARAGE_MAX_LEVEL = 10;

/** Interior grid (width × depth in tiles) for each garage level. */
export const GARAGE_GRID: [number, number][] = [
  [8, 8], [10, 10], [12, 10], [14, 12], [16, 14], [18, 14], [18, 16], [20, 16], [22, 18], [24, 20],
];

/** Price of reaching level L+1 from L (index L-1), × zone scale. */
export const GARAGE_LEVEL_COST = [2_000, 6_000, 18_000, 50_000, 140_000, 400_000, 1_100_000, 3_000_000, 8_000_000];
/** Income multiplier per garage level. */
export const GARAGE_LEVEL_MULT = 1.25;
/** Mechanics a garage can employ, per level. */
export const GARAGE_WORKER_CAP = [2, 4, 8, 12, 20, 26, 32, 40, 48, 60];
/** Power available, per level. Using more slows the whole garage down. */
export const GARAGE_POWER = [12, 22, 40, 64, 100, 140, 190, 250, 320, 400];
export const WORKER_COST = 30;
export const WORKER_GROWTH = 1.35;
/** What a serviced car pays, before the facility's fee multiple (× zone scale). */
export const SERVICE_FEE = 1.2;
export const FACILITY_GROWTH = 1.45;

export interface FacilityConfig {
  id: FacilityType;
  emoji: string;
  /** Footprint in tiles (before rotation). */
  w: number;
  d: number;
  cost: number;
  power: number;
  /** Workstations service cars: fee × SERVICE_FEE per car, one car every `time` s. */
  fee?: number;
  time?: number;
  /** Support facilities boost the whole garage. */
  income?: number;
  speed?: number;
  workers?: number;
  /** How many may be built at each garage level (index = level - 1). */
  caps: number[];
  color: string;
}

export const FACILITIES: FacilityConfig[] = [
  { id: "serviceBay", emoji: "🔧", w: 3, d: 2, cost: 50, power: 2, fee: 1, time: 16, caps: [1, 2, 4, 6, 10, 12, 14, 16, 18, 20], color: "#facc15" },
  { id: "carLift", emoji: "🛗", w: 2, d: 2, cost: 150, power: 3, fee: 1.5, time: 14, caps: [1, 2, 3, 5, 8, 10, 12, 14, 16, 18], color: "#3b82f6" },
  { id: "storage", emoji: "📦", w: 2, d: 2, cost: 100, power: 1, income: 0.1, caps: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6], color: "#a16207" },
  { id: "office", emoji: "🗂️", w: 2, d: 2, cost: 80, power: 1, speed: 0.1, workers: 2, caps: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3], color: "#94a3b8" },
  { id: "partsWorkshop", emoji: "⚙️", w: 3, d: 3, cost: 1_500, power: 3, speed: 0.2, caps: [0, 1, 1, 1, 2, 2, 2, 3, 3, 3], color: "#78716c" },
  { id: "paintBooth", emoji: "🎨", w: 3, d: 3, cost: 1_100, power: 5, fee: 15, time: 24, caps: [0, 1, 1, 2, 2, 2, 3, 3, 3, 4], color: "#ec4899" },
  { id: "engineWorkshop", emoji: "🔩", w: 4, d: 4, cost: 4_800, power: 4, fee: 60, time: 30, caps: [0, 0, 1, 1, 2, 2, 2, 3, 3, 3], color: "#ef4444" },
  { id: "tuningArea", emoji: "🏁", w: 3, d: 3, cost: 10_000, power: 4, fee: 120, time: 30, caps: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3], color: "#f97316" },
  { id: "dyno", emoji: "📈", w: 4, d: 3, cost: 40_000, power: 8, fee: 400, time: 40, caps: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3], color: "#22c55e" },
  { id: "performanceWorkshop", emoji: "🏎️", w: 4, d: 4, cost: 80_000, power: 6, fee: 800, time: 40, caps: [0, 0, 0, 1, 1, 1, 2, 2, 2, 2], color: "#06b6d4" },
  { id: "advancedPaint", emoji: "🖌️", w: 4, d: 3, cost: 120_000, power: 7, fee: 900, time: 30, caps: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2], color: "#d946ef" },
  { id: "supercarWorkshop", emoji: "🏆", w: 4, d: 4, cost: 1.2e6, power: 10, fee: 12_000, time: 60, caps: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2], color: "#f59e0b" },
  { id: "carbonWorkshop", emoji: "🧪", w: 4, d: 4, cost: 1.5e6, power: 8, income: 0.4, caps: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2], color: "#334155" },
  { id: "advancedTuning", emoji: "🚀", w: 4, d: 3, cost: 2.5e6, power: 8, fee: 20_000, time: 50, caps: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2], color: "#8b5cf6" },
  { id: "vipArea", emoji: "🥂", w: 4, d: 3, cost: 3e6, power: 2, income: 0.6, caps: [0, 0, 0, 0, 1, 1, 1, 1, 1, 2], color: "#eab308" },
];

export const FACILITY_BY_ID: Record<FacilityType, FacilityConfig> = Object.fromEntries(
  FACILITIES.map((f) => [f.id, f]),
) as Record<FacilityType, FacilityConfig>;

export interface SpecConfig {
  id: Specialization;
  emoji: string;
  /** Garage level needed. */
  level: number;
  /** Matching workstations earn ×SPEC_BONUS. */
  boosts: FacilityType[];
  color: string;
}

export const SPEC_BONUS = 2;
/** Changing specialization costs this × zone scale × garage level. */
export const SPEC_CHANGE_COST = 2_000;

export const SPECS: SpecConfig[] = [
  { id: "repair", emoji: "🔧", level: 1, boosts: ["serviceBay", "carLift"], color: "#60a5fa" },
  { id: "painting", emoji: "🎨", level: 2, boosts: ["paintBooth", "advancedPaint"], color: "#ec4899" },
  { id: "tuning", emoji: "🏁", level: 3, boosts: ["tuningArea", "engineWorkshop", "advancedTuning"], color: "#f97316" },
  { id: "performance", emoji: "📈", level: 4, boosts: ["dyno", "performanceWorkshop"], color: "#22c55e" },
  { id: "supercar", emoji: "🏆", level: 5, boosts: ["supercarWorkshop", "carbonWorkshop"], color: "#f59e0b" },
];

export const SPEC_BY_ID: Record<Specialization, SpecConfig> = Object.fromEntries(SPECS.map((s) => [s.id, s])) as Record<Specialization, SpecConfig>;
