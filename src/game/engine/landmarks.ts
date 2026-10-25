// The landmark works (config/landmarks.ts): their levels, what the territory's
// buyers pay for its line, the first car's reward, and each territory's
// specialty: cheaper materials (raw), leasing (suburbs), race prizes
// (mountain), limited editions sooner (boulevard), exports (port) and the
// robotaxi fleet (airport).
import { LANDMARK, LANDMARKS, LANDMARK_BY_CAR, LANDMARK_BY_TERRITORY, type LandmarkConfig } from "../config/landmarks";
import type { TerritoryId } from "../config/city";
import type { CarConfig } from "../config/cars";
import type { CarId, GameState } from "../types";
import { hasPlant } from "./chain";
import { book, payReward } from "./materials";

export interface LandmarksState {
  /** Leasing: rent still to come in (suburbs). */
  lease: number;
  /** Shuttles in the robotaxi fleet and the price they sold for (airport). */
  fleet: number;
  fleetValue: number;
  /** Territories whose line's first-car reward was paid. */
  rewarded: TerritoryId[];
  /** The level last announced for each territory (for the level-up toast). */
  levels: Partial<Record<TerritoryId, number>>;
}

export const createLandmarks = (): LandmarksState => ({ lease: 0, fleet: 0, fleetValue: 0, rewarded: [], levels: {} });

/** The works stands (restored). */
export const restored = (s: GameState, l: LandmarkConfig) => hasPlant(s, l.works);

/** Cars of the line built in total. */
export const lineBuilt = (s: GameState, l: LandmarkConfig) => Math.floor(s.lifetime.carsByType[l.car] ?? 0);

/** The territory's level: 0 until its works is restored, then 1–5 with the cars of its line. */
export function landmarkLevel(s: GameState, l: LandmarkConfig): number {
  if (!restored(s, l)) return 0;
  const built = lineBuilt(s, l);
  return 1 + LANDMARK.levels.filter((n) => built >= n).length;
}

/** Cars of the line needed for the next level (null at the top level or before the restoration). */
export function nextLevelAt(s: GameState, l: LandmarkConfig): number | null {
  const lv = landmarkLevel(s, l);
  return lv >= 1 && lv < LANDMARK.maxLevel ? LANDMARK.levels[lv - 1] : null;
}

const levelOf = (s: GameState, t: TerritoryId) => {
  const l = LANDMARK_BY_TERRITORY[t];
  return l ? landmarkLevel(s, l) : 0;
};

/** What the territory's buyers add to its line's car (1: not a line car). */
export function localValueMult(s: GameState, car: CarConfig): number {
  const l = car.line ? LANDMARK_BY_TERRITORY[car.line] : undefined;
  return l ? 1 + LANDMARK.localPerLevel * landmarkLevel(s, l) : 1;
}

/** Raw: materials from the island's own steel works cost this much less (0–0.2). */
export const materialDiscount = (s: GameState) => LANDMARK.raw.materials * levelOf(s, "raw");
/** Mountain: race prizes and reputation multiplier. */
export const raceMult = (s: GameState) => 1 + LANDMARK.mountain.race * levelOf(s, "mountain");
/** Boulevard: limited editions come this much sooner (0–0.5). */
export const editionsSooner = (s: GameState) => LANDMARK.boulevard.editions * levelOf(s, "boulevard");
/** Port: what exports pay, multiplier. */
export const exportBonus = (s: GameState) => 1 + LANDMARK.port.exports * levelOf(s, "port");
/** Airport: shuttles the fleet keeps on the road. */
export const fleetMax = (s: GameState) => LANDMARK.airport.fleetPerLevel * levelOf(s, "airport");

/** Robotaxi fleet income now ($/s). */
export function fleetIncome(s: GameState): number {
  const L = s.landmarks;
  return (Math.min(L.fleet, fleetMax(s)) * L.fleetValue * LANDMARK.airport.earn) / 3600;
}

/** A car sold at a dealership: a minivan starts a lease, a shuttle joins the fleet. */
export function landmarkSale(s: GameState, model: CarId | undefined, price: number) {
  if (!model || !(price > 0)) return;
  const L = s.landmarks;
  if (model === "minivan") L.lease += price * LANDMARK.suburbs.lease * levelOf(s, "suburbs");
  if (model === "shuttle") {
    const max = fleetMax(s);
    if (max > 0) {
      // the fleet's shuttles are worth what they sold for, on average
      L.fleetValue = L.fleet > 0 ? L.fleetValue + (price - L.fleetValue) / Math.min(L.fleet + 1, 20) : price;
      L.fleet = Math.min(max, L.fleet + 1);
    }
  }
}

/** Rent and rides coming in over `dt` seconds (also while away): what was earned. */
export function landmarkTick(s: GameState, dt: number, earn: (amount: number) => void): number {
  const L = s.landmarks;
  let total = 0;
  if (L.lease > 0) {
    const rent = L.lease * Math.min(1, dt / LANDMARK.suburbs.seconds);
    L.lease = L.lease - rent < 1 ? 0 : L.lease - rent;
    if (rent > 0) {
      earn(rent);
      book(s, "carSales", rent);
      total += rent;
    }
  }
  const rides = fleetIncome(s) * dt;
  if (rides > 0) {
    earn(rides);
    book(s, "services", rides);
    total += rides;
  }
  return total;
}

export interface LandmarkNews {
  firstCar: { territory: TerritoryId; car: CarId; cash: number; stars: number }[];
  levelUp: { territory: TerritoryId; level: number }[];
}

/**
 * After a tick: the line's first car pays its reward (once), and a new level
 * is announced (once). What happened, for the toasts.
 */
export function landmarkNews(s: GameState): LandmarkNews {
  const news: LandmarkNews = { firstCar: [], levelUp: [] };
  const L = s.landmarks;
  for (const l of LANDMARKS) {
    if (!L.rewarded.includes(l.territory) && lineBuilt(s, l) > 0) {
      const R = LANDMARK.firstCar;
      const cash = Math.max(R.minCash, Math.max(0, s.chain.steady ?? s.chain.rate) * R.incomeSeconds);
      payReward(s, cash);
      s.stars += R.stars;
      L.rewarded.push(l.territory);
      news.firstCar.push({ territory: l.territory, car: l.car, cash, stars: R.stars });
    }
    const lv = landmarkLevel(s, l);
    const was = L.levels[l.territory] ?? 0;
    if (lv > was) {
      L.levels[l.territory] = lv;
      // the restoration itself (level 1) has its own toast (construction done)
      if (lv > 1) news.levelUp.push({ territory: l.territory, level: lv });
    }
  }
  return news;
}

/** The landmark state of a save, within bounds. */
export function migrateLandmarks(raw: unknown): LandmarksState {
  const out = createLandmarks();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
  out.lease = num(r.lease, 1e18);
  out.fleet = Math.floor(num(r.fleet, LANDMARK.airport.fleetPerLevel * LANDMARK.maxLevel));
  out.fleetValue = num(r.fleetValue, 1e18);
  const known = new Set<string>(LANDMARKS.map((l) => l.territory));
  out.rewarded = Array.isArray(r.rewarded) ? [...new Set(r.rewarded.filter((t): t is TerritoryId => typeof t === "string" && known.has(t)))] : [];
  if (typeof r.levels === "object" && r.levels !== null)
    for (const [t, v] of Object.entries(r.levels as Record<string, unknown>)) if (known.has(t)) out.levels[t as TerritoryId] = Math.floor(num(v, LANDMARK.maxLevel));
  return out;
}

export { LANDMARK_BY_CAR };
