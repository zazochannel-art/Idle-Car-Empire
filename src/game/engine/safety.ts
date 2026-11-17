// Crash tests (the Models screen): the company sends a model to the crash lab, pays for the test,
// and five minutes later it has a safety rating, 1 to 5 stars, from the quality of the parts it is
// built with, the safety research done and the kind of car, with a little luck on the day. The
// stars move what buyers pay for that model (carValue, chain/cars.ts). A model can be tested
// again: the newest result counts. Real time (`now`, ms) drives the test.
import type { CarConfig } from "../config/cars";
import type { CarId, GameState } from "../types";

export interface SafetyState {
  /** The stars each tested model earned (its newest test). */
  stars: Partial<Record<CarId, number>>;
  /** The model in the crash lab now, the quality it was built with, and when its result is out. */
  test: { car: CarId; quality: number; until: number } | null;
  tests: number;
}

export const SAFETY = {
  /** The test costs this many times the model's sale value before its options. */
  costValue: 3,
  minutes: 5,
  /** What each star above or below 3 does to the model's price. */
  perStar: 0.03,
  /** Research that makes cars safer, and how much each adds to the score (0–100). */
  research: { regen_braking: 6, sensor_fusion: 10, self_driving: 8, predictive_maintenance: 4 } as Record<string, number>,
  /** Big, heavy bodies do better in a crash; small light ones worse. */
  body: { suv: 6, sedan: 4, wagon: 4, coupe: -2, hatchback: -2, supercar: -4 } as Record<string, number>,
  /** The day's luck: ± this many points. */
  luck: 6,
};

export const createSafety = (): SafetyState => ({ stars: {}, test: null, tests: 0 });

/** The stars a model's price counts (null: never tested). */
export const safetyStars = (s: Pick<GameState, "safety">, car: CarId): number | null => s.safety?.stars[car] ?? null;

/** What the model's safety rating does to its price (×1 untested, 3★). */
export function safetyMult(s: Pick<GameState, "safety">, car: CarId): number {
  const st = safetyStars(s, car);
  return st === null ? 1 : 1 + SAFETY.perStar * (st - 3);
}

/** The crash score (0–100) a model would get, before the day's luck. `quality`: modelStats(…).quality. */
export function safetyScore(s: Pick<GameState, "research">, car: CarConfig, quality: number): number {
  const research = s.research.reduce((a, id) => a + (SAFETY.research[id] ?? 0), 0);
  return Math.max(0, Math.min(100, quality * 0.7 + research + (SAFETY.body[car.body] ?? 0)));
}

/** Stars from a score: 1 below 25, then one more every 15 points, 5 from 70 (a top-grade model). */
export const starsFor = (score: number) => Math.max(1, Math.min(5, 1 + Math.floor((score - 10) / 15)));

/** What testing a model costs, from its sale value before the Design studio's options. */
export const testCost = (baseValue: number) => Math.round(Math.max(0, baseValue) * SAFETY.costValue);

/** Sends a model to the crash lab (one at a time, a model the company has built). */
export function startCrashTest(s: GameState, car: CarId, quality: number, cost: number, now: number): boolean {
  const sf = (s.safety ??= createSafety());
  if (sf.test || !(s.lifetime.carsByType[car] > 0) || !(cost >= 0) || s.cash < cost) return false;
  s.cash -= cost;
  sf.test = { car, quality, until: now + SAFETY.minutes * 60_000 };
  return true;
}

/** Finishes a test whose time is up: the model's new stars (null: nothing finished). */
export function crashTestTick(s: GameState, cars: Record<CarId, CarConfig>, now: number, rand: () => number = Math.random): { car: CarId; stars: number } | null {
  const sf = s.safety;
  const t = sf?.test;
  if (!sf || !t || now < t.until) return null;
  const score = safetyScore(s, cars[t.car], t.quality) + (rand() * 2 - 1) * SAFETY.luck;
  const stars = starsFor(score);
  sf.stars = { ...sf.stars, [t.car]: stars };
  sf.test = null;
  sf.tests++;
  return { car: t.car, stars };
}

export function migrateSafety(raw: unknown, isCar: (id: string) => boolean): SafetyState {
  const out = createSafety();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  if (r.stars && typeof r.stars === "object") {
    for (const [k, v] of Object.entries(r.stars as Record<string, unknown>)) if (isCar(k) && num(v) >= 1) out.stars[k as CarId] = Math.min(5, Math.round(num(v)));
  }
  const t = r.test as Record<string, unknown> | null | undefined;
  if (t && typeof t === "object" && typeof t.car === "string" && isCar(t.car)) out.test = { car: t.car as CarId, quality: Math.max(0, Math.min(100, num(t.quality))), until: Math.max(0, num(t.until)) };
  out.tests = Math.max(0, Math.floor(num(r.tests)));
  return out;
}
