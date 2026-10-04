import { CAR_BY_ID, CAR_MODEL } from "../config/cars";
import { DEALER_BY_ID } from "../config/dealerships";
import { MANAGER_BY_ID } from "../config/managers";
import type { CarId, DealerId, GameState, ManagerId } from "../types";
import { availableCars, carValue, chainSnapshot, type ChainSnapshot } from "./chain";
import { citySnapshot, type CitySnapshot } from "./city";
import { computeGlobalMods, type GlobalMods } from "./modifiers";

// ───────────────────────────── costs ─────────────────────────────

/** Sum of a geometric series: cost of buying `n` items starting at `first`. */
export function geometricCost(first: number, growth: number, n: number): number {
  if (n <= 0) return 0;
  return (first * (Math.pow(growth, n) - 1)) / (growth - 1);
}

/** How many items starting at `first` can be bought with `cash`. */
export function maxAffordable(first: number, growth: number, cash: number): number {
  if (cash < first) return 0;
  return Math.floor(Math.log((cash * (growth - 1)) / first + 1) / Math.log(growth));
}

export function dealerUpgradeCost(s: GameState, id: DealerId): number {
  const cfg = DEALER_BY_ID[id];
  return cfg.upgradeCost * Math.pow(cfg.upgradeGrowth, s.dealers[id].level - 1);
}

export function managerUpgradeCost(s: GameState, id: ManagerId): number | null {
  const cfg = MANAGER_BY_ID[id];
  const st = s.managers[id];
  if (st.level >= cfg.maxLevel) return null;
  return cfg.cost * Math.pow(cfg.upgradeGrowth, st.level);
}

export function carModelCost(s: GameState, id: CarId, gm?: GlobalMods): number | null {
  const lvl = s.carModels[id] ?? 0;
  if (lvl >= CAR_MODEL.maxLevel) return null;
  const mods = gm ?? computeGlobalMods(s);
  const car = CAR_BY_ID[id];
  // priced on the unrefined car so refining doesn't make itself dearer twice
  const value = carValue(s, car, mods) / Math.pow(CAR_MODEL.valuePerLevel, lvl);
  return value * CAR_MODEL.baseCostCars * Math.pow(CAR_MODEL.costGrowth, lvl) * mods.costMult;
}

/** Car models the assembly plants can build right now. */
export function unlockedCarIds(s: GameState, gm: GlobalMods): Set<CarId> {
  return new Set(availableCars(s, gm).map((c) => c.id));
}

// ───────────────────────────── totals ─────────────────────────────

export interface EconomySnapshot {
  gm: GlobalMods;
  chain: ChainSnapshot;
  carsPerSec: number;
  /** Net income per second: chain sales minus materials (measured), plus the Empire Map. */
  incomePerSec: number;
  /** The same, averaged over ~10 minutes (rewards are sized on it). */
  steadyIncomePerSec: number;
  rpPerSec: number;
  city: CitySnapshot;
}

/** Everything the UI and the tick need, computed once. */
export function snapshot(s: GameState): EconomySnapshot {
  const gm = computeGlobalMods(s);
  const chain = chainSnapshot(s, gm);
  const city = citySnapshot(s, gm.income);
  let rpPerSec = 0;
  for (const p of Object.values(chain.plants)) rpPerSec += p.unitsPerSec * p.rp;
  return {
    gm,
    chain,
    carsPerSec: chain.carsPerSec,
    incomePerSec: Math.max(0, s.chain.rate) + city.incomePerSec,
    steadyIncomePerSec: Math.max(0, s.chain.steady ?? s.chain.rate) + city.incomePerSec,
    rpPerSec,
    city,
  };
}

/** Income that keeps running on its own — used to size rewards (averaged, so timing a claim doesn't pay). */
export function passiveIncome(snap: EconomySnapshot): number {
  return snap.steadyIncomePerSec;
}
