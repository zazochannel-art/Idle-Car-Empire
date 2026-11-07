// The used-car lot: now and then a few worn cars of the models the company makes come up for
// sale. Buy one, refurbish it in the garage bay (it takes a while, and costs more the worse it
// is), and sell it on for more than both. One car in the bay at a time; prices are set when the
// lot comes in (a share of the company's income), so they don't move while a car waits.
import type { CarId, GameState } from "../types";
import { passiveIncome, unlockedCarIds, type EconomySnapshot } from "./economy";
import { book } from "./ledger";

export interface UsedCar {
  id: number;
  car: CarId;
  /** Condition, 0–1 (lower: cheaper, but a longer and dearer refurbishment). */
  cond: number;
  buy: number;
  fix: number;
  sell: number;
  /** Minutes the refurbishment takes. */
  minutes: number;
}

export interface UsedCarsState {
  lot: UsedCar[];
  /** When the lot last came in (0: never). */
  lotAt: number;
  /** The car in the garage bay, and when its refurbishment is done (0: not started). */
  bay: UsedCar | null;
  readyAt: number;
  sold: number;
  /** Profit made on the cars sold (sale minus purchase and refurbishment). */
  profit: number;
}

export const createUsedCars = (): UsedCarsState => ({ lot: [], lotAt: 0, bay: null, readyAt: 0, sold: 0, profit: 0 });

export const USED = {
  /** A new lot every this many ms, of this many cars. */
  every: 4 * 3_600_000,
  cars: 3,
  /** A car's worth: seconds of the company's income (at least `min`). */
  worthSeconds: 25 * 60,
  min: 2_000,
  /** Shares of its worth: buying (more for a better car), refurbishing (more for a worse one) and selling. */
  buyBase: 0.25,
  buyPerCond: 0.3,
  fixPerWear: 0.35,
  sell: 0.85,
  /** Refurbishment: minutes for a car in perfect condition, plus this many for a wreck. */
  minutesBase: 10,
  minutesPerWear: 40,
};

/** When the next lot comes in. */
export const nextLotAt = (s: GameState) => s.usedCars.lotAt + USED.every;

/** Brings in a new lot when the last one is old enough (once the company sells cars). */
export function refreshUsedLot(s: GameState, now: number, snap: EconomySnapshot): boolean {
  const u = s.usedCars;
  if (u.lotAt && now < nextLotAt(s)) return false;
  // a new company with no income yet still gets cars, at the floor price
  const income = Math.max(0, passiveIncome(snap) || 0);
  // before the first assembly plant, the lot has the basic city car
  const own = [...unlockedCarIds(s, snap.gm)];
  const cars: CarId[] = own.length ? own : ["city"];
  let seed = Math.floor(now / 60_000) ^ Math.floor(s.createdAt / 1000) ^ 0x5eed;
  const next = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const worth = Math.max(USED.min, income * USED.worthSeconds);
  u.lot = Array.from({ length: USED.cars }, (_, i) => {
    const cond = Math.round((0.3 + next() * 0.5) * 100) / 100;
    const w = worth * (0.8 + next() * 0.4);
    return {
      id: now + i,
      car: cars[Math.floor(next() * cars.length)],
      cond,
      buy: Math.round(w * (USED.buyBase + USED.buyPerCond * cond)),
      fix: Math.round(w * USED.fixPerWear * (1 - cond)),
      sell: Math.round(w * USED.sell),
      minutes: Math.round(USED.minutesBase + USED.minutesPerWear * (1 - cond)),
    };
  });
  u.lotAt = now;
  return true;
}

export type UsedBlock = "bay" | "cash" | "gone" | null;

export function buyBlock(s: GameState, id: number): UsedBlock {
  const c = s.usedCars.lot.find((x) => x.id === id);
  if (!c) return "gone";
  if (s.usedCars.bay) return "bay";
  return s.cash < c.buy ? "cash" : null;
}

/** Buys a car off the lot into the garage bay. */
export function buyUsed(s: GameState, id: number): boolean {
  if (buyBlock(s, id)) return false;
  const u = s.usedCars;
  const c = u.lot.find((x) => x.id === id)!;
  s.cash -= c.buy;
  u.lot = u.lot.filter((x) => x.id !== id);
  u.bay = c;
  u.readyAt = 0;
  return true;
}

/** Starts the refurbishment of the car in the bay (paid now). */
export function refurbishUsed(s: GameState, now: number): boolean {
  const u = s.usedCars;
  if (!u.bay || u.readyAt || s.cash < u.bay.fix) return false;
  s.cash -= u.bay.fix;
  book(s, "repairs", u.bay.fix);
  u.readyAt = now + u.bay.minutes * 60_000;
  return true;
}

export const usedReady = (s: GameState, now: number) => !!s.usedCars.bay && s.usedCars.readyAt > 0 && now >= s.usedCars.readyAt;

/** Sells the refurbished car. Returns the price (null: not ready). */
export function sellUsed(s: GameState, now: number): number | null {
  const u = s.usedCars;
  if (!usedReady(s, now) || !u.bay) return null;
  const c = u.bay;
  s.cash += c.sell;
  s.run.moneyEarned += c.sell;
  s.lifetime.moneyEarned += c.sell;
  book(s, "services", c.sell);
  u.sold += 1;
  u.profit += c.sell - c.buy - c.fix;
  u.bay = null;
  u.readyAt = 0;
  return c.sell;
}

/** The used cars of a save, checked. */
export function migrateUsedCars(raw: unknown, isCar: (id: string) => boolean): UsedCarsState {
  const out = createUsedCars();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const car = (x: unknown): UsedCar | null => {
    if (!x || typeof x !== "object") return null;
    const c = x as Record<string, unknown>;
    if (typeof c.car !== "string" || !isCar(c.car)) return null;
    return { id: pos(c.id), car: c.car as CarId, cond: Math.min(1, pos(c.cond)), buy: pos(c.buy), fix: pos(c.fix), sell: pos(c.sell), minutes: Math.min(24 * 60, pos(c.minutes)) };
  };
  out.lot = Array.isArray(r.lot) ? r.lot.map(car).filter((c): c is UsedCar => !!c).slice(0, USED.cars) : [];
  out.lotAt = pos(r.lotAt);
  out.bay = car(r.bay);
  out.readyAt = out.bay ? pos(r.readyAt) : 0;
  out.sold = Math.floor(pos(r.sold));
  out.profit = typeof r.profit === "number" && Number.isFinite(r.profit) ? r.profit : 0;
  return out;
}
