// The Empire Map: zones (stages), what can be built on plots, and the garage
// interior (facilities, levels, specializations). All balance numbers live
// here; engine/city.ts turns them into income.
import type { DealerId, FacilityType, Specialization, StructureType, ZoneId } from "../types";
import { PLANTS } from "./chain";

// ───────────────────────────── zones ─────────────────────────────

export interface ZoneConfig {
  id: ZoneId;
  stage: number;
  /** Letter marking this district's blocks on WORLD_BLOCKS. */
  letter: string;
  /** Price to unlock. The previous stage must be unlocked first. */
  cost: number;
  /** Richer districts: garage fees and prices here are multiplied by this. */
  scale: number;
  ground: string;
  accent: string;
  /** What empty plots here can become. */
  builds: StructureType[];
  /**
   * What fills the free cells, as a weighted bag of letters:
   *  .  empty plot   h  house   a  apartments   o  office tower
   *  s  shops        i  industry   t  park
   */
  mix: string;
}

export const ZONES: ZoneConfig[] = [
  {
    id: "town", stage: 1, letter: "T", cost: 0, scale: 1, ground: "#6cb35a", accent: "#60a5fa",
    builds: ["garage", "carWash", "parking", "serviceCenter", "warehouse"],
    mix: "....hhhhttsa",
  },
  {
    id: "industrial", stage: 2, letter: "I", cost: 25_000, scale: 1.5, ground: "#94a06f", accent: "#38bdf8",
    builds: ["garage", "partsFactory", "warehouse", "logistics", "truckDepot", "parking", "fleetPlant"],
    mix: "....iiiit",
  },
  {
    id: "downtown", stage: 3, letter: "D", cost: 150_000, scale: 2.5, ground: "#7fae6e", accent: "#22d3ee",
    builds: ["garage", "carWash", "parking", "serviceCenter", "researchCenter", "museum"],
    mix: "....ooooaasst",
  },
  {
    id: "automotive", stage: 4, letter: "A", cost: 600_000, scale: 4, ground: "#8fa77a", accent: "#818cf8",
    builds: ["garage", "partsFactory", "researchCenter", "logistics", "warehouse", "fleetPlant"],
    mix: "....iiisot",
  },
  {
    id: "luxury", stage: 5, letter: "L", cost: 2_500_000, scale: 7, ground: "#5fbf74", accent: "#facc15",
    builds: ["garage", "serviceCenter", "carWash", "parking", "hq", "museum"],
    mix: "....hhhttta",
  },
  {
    id: "supercar", stage: 6, letter: "S", cost: 10_000_000, scale: 12, ground: "#b9a46c", accent: "#fb923c",
    builds: ["garage", "researchCenter", "exportTerminal", "warehouse"],
    mix: "....iitto",
  },
  {
    id: "mega", stage: 7, letter: "M", cost: 40_000_000, scale: 20, ground: "#86a08a", accent: "#e879f9",
    builds: ["garage", "hq", "exportTerminal", "logistics", "truckDepot"],
    mix: "....ooooooaa",
  },
  {
    id: "global", stage: 8, letter: "G", cost: 150_000_000, scale: 35, ground: "#7aa2a8", accent: "#c084fc",
    builds: ["garage", "airport", "hq", "exportTerminal"],
    mix: "....oooost",
  },
];

/**
 * The world, block by block (10×10 blocks of 6×6 tiles between roads).
 * District letters as in ZONES; scenery: w sea, f forest, a farmland,
 * h hills; R the Racing District (the paddock block and the circuit, with
 * no roads between its blocks). A river runs down node column RIVER_LINE,
 * crossed by bridges.
 */
export const WORLD_BLOCKS = [
  "hfTTTIIRRR",
  "fTTTTIIIRR",
  "aaTDDILLRR",
  "aDDDDALLLh",
  "wDDAAAALww",
  "wwMAASSSww",
  "wMMMASSShw",
  "wMMGGGShhw",
  "wwGGGwwwww",
  "wwwwwwwwww",
];
/** The Racing District's paddock block (garage, pits, stands) — the rest of its blocks hold the circuit. */
export const RACING_PADDOCK_BLOCK: [number, number] = [7, 0];
export const RIVER_LINE = 5;

/** Special lots, as global cell coordinates (two cells per block). */
/** Where the Small Car Body Works stands on a new game. */
export const STARTER_CELL: [number, number] = [6, 2];
/** The Parts Market buys components; the Materials Depot sells raw material. */
export const MARKET_CELL: [number, number] = [9, 1];
export const DEPOT_CELL: [number, number] = [4, 2];
/** Industrial lots: a whole block each, for big plants (given as any cell of the block). */
export const BIG_LOTS: [number, number][] = [
  [12, 0],
  [12, 2],
  [4, 6],
  [10, 8],
  [14, 6],
  [12, 10],
  [14, 12],
  [4, 12],
  [8, 14],
];
export const DEALER_LOTS: Record<DealerId, [number, number]> = {
  local: [6, 3],
  city: [8, 2],
  premium: [6, 6],
  luxury: [8, 8],
  supercar: [12, 6],
  global: [10, 12],
};

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
