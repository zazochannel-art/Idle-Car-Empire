// Market trends, build quality, reputation and recalls (config/market.ts).
import { CAR_BY_ID, type CarClass } from "../config/cars";
import { MATERIAL_IDS, type MaterialId } from "../config/economy";
import { HOT_CLASS, MATERIAL_SWING, QUALITY_MODES, RECALL, REP_DRIFT_PER_MIN, REP_PRICE_PER_POINT, TREND_CLASSES, TREND_SEC } from "../config/market";
import type { CarId, GameState, PlantData, QualityMode, QualityState } from "../types";

export interface Trend {
  /** Index of the trend (changes every TREND_SEC of market time). */
  block: number;
  /** null before the market is open to the company (no trends before its first car). */
  hot: CarClass | null;
  material: MaterialId;
  /** Price multiplier of that material (shortage > 1, glut < 1). */
  materialMult: number;
  /** Market seconds left until the next trend. */
  left: number;
}

/** Small seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The trend at market time `t` (each company has its own sequence). */
export function trendAt(t: number, seed = 0): Trend {
  const block = Math.floor(Math.max(0, t) / TREND_SEC);
  const r = rng(block * 2654435761 + seed);
  return {
    block,
    hot: TREND_CLASSES[Math.floor(r() * TREND_CLASSES.length)],
    material: MATERIAL_IDS[Math.floor(r() * MATERIAL_IDS.length)],
    materialMult: r() < 0.5 ? MATERIAL_SWING.shortage : MATERIAL_SWING.glut,
    left: (block + 1) * TREND_SEC - Math.max(0, t),
  };
}

/** The company's trend now: none until its first car (a beginner doesn't need a steel shortage). */
export function trendOf(s: GameState): Trend {
  const tr = trendAt(s.market.t, Math.abs(s.createdAt | 0) % 100_000);
  return s.chain.firstCar ? tr : { ...tr, hot: null, materialMult: 1 };
}

/** The trend's effect on a material's price. */
export function materialTrendMult(s: GameState, m: MaterialId): number {
  const tr = trendOf(s);
  return tr.material === m ? tr.materialMult : 1;
}

export const qualityOf = (p: PlantData): QualityMode => p.mode ?? "balanced";

/** Price multiplier from reputation (0.9 … 1.1) and a running scandal. */
export function repPriceMult(s: GameState): number {
  const q = s.quality;
  const scandal = s.market.t < q.scandalUntil ? 1 - RECALL.scandalPrice : 1;
  return (1 + (q.rep - 50) * REP_PRICE_PER_POINT) * scandal;
}

/** What a dealer gets for a car today: the class in fashion pays more. */
export function carPriceMult(s: GameState, car: CarId | undefined): number {
  const hot = car && CAR_BY_ID[car].class === trendOf(s).hot ? 1 + HOT_CLASS.price : 1;
  return hot * repPriceMult(s);
}

/** How much faster customers come for a car (the class in fashion). */
export function carDemandMult(s: GameState, car: CarId | undefined): number {
  return car && CAR_BY_ID[car].class === trendOf(s).hot ? HOT_CLASS.demand : 1;
}

const clampRep = (r: number) => Math.max(0, Math.min(100, r));

/** Defect chance of a car from this assembly plant: its own mode, plus 1% for each part made in fast mode. */
export function defectRate(s: GameState, assembly: PlantData, partModes: QualityMode[]): number {
  return QUALITY_MODES[qualityOf(assembly)].defects + partModes.filter((m) => m === "fast").length * 0.01;
}

/** A car built: its defect chance adds up towards a recall, its plant's quality moves the reputation. */
export function onCarBuilt(s: GameState, car: CarId, defectRate: number, mode: QualityMode) {
  const q = s.quality;
  q.defects += defectRate;
  q.rep = clampRep(q.rep + QUALITY_MODES[mode].rep / 100);
  if (!q.recall && q.defects >= RECALL.threshold - 1e-9) {
    const cars = Math.floor(q.defects + 1e-9);
    q.defects = Math.max(0, q.defects - cars);
    q.recall = { car, cars };
  }
}

/** Reputation slowly returns to neutral. */
export function qualityTick(s: GameState, dt: number) {
  const q = s.quality;
  const step = (REP_DRIFT_PER_MIN * dt) / 60;
  q.rep = q.rep > 50 ? Math.max(50, q.rep - step) : Math.min(50, q.rep + step);
}

/** The price of fixing every car in the pending recall. */
export function recallCost(s: GameState, carValue: number): number {
  const r = s.quality.recall;
  return r ? r.cars * carValue * RECALL.costShare : 0;
}

/** Recall the cars: pay for the repairs, earn trust. */
export function payRecall(s: GameState, cost: number): boolean {
  const q = s.quality;
  if (!q.recall || s.cash < cost) return false;
  s.cash -= cost;
  q.rep = clampRep(q.rep + RECALL.repPaid);
  q.recall = null;
  q.recalls += 1;
  return true;
}

/** Hope nobody notices. `roll` in [0,1): below the scandal chance it hits the news. */
export function ignoreRecall(s: GameState, roll = Math.random()): "scandal" | "quiet" | null {
  const q = s.quality;
  if (!q.recall) return null;
  q.recall = null;
  q.recalls += 1;
  if (roll < RECALL.scandalChance) {
    q.rep = clampRep(q.rep + RECALL.repScandal);
    q.scandalUntil = s.market.t + RECALL.scandalSec;
    return "scandal";
  }
  q.rep = clampRep(q.rep + RECALL.repIgnored);
  return "quiet";
}

export function migrateQuality(raw: unknown): QualityState {
  const q: QualityState = { rep: 50, defects: 0, recall: null, scandalUntil: 0, recalls: 0 };
  if (typeof raw !== "object" || raw === null) return q;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  q.rep = clampRep(num(r.rep, 50));
  q.defects = Math.max(0, num(r.defects, 0));
  q.scandalUntil = Math.max(0, num(r.scandalUntil, 0));
  q.recalls = Math.max(0, Math.floor(num(r.recalls, 0)));
  const rc = r.recall as Record<string, unknown> | null;
  if (rc && typeof rc === "object" && typeof rc.car === "string" && rc.car in CAR_BY_ID) q.recall = { car: rc.car as CarId, cars: Math.max(1, Math.floor(num(rc.cars, 1))) };
  return q;
}
