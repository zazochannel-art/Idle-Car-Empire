import { CARS, CAR_BY_ID, CAR_BY_TIER, CAR_MODEL, carProfit, type CarConfig } from "../config/cars";
import {
  DEALERS,
  DEALER_BY_ID,
  DEALER_CAP_PER_LEVEL,
  DEALER_MARKUP_PER_LEVEL,
  WHOLESALE_RATE,
} from "../config/dealerships";
import {
  FACTORIES,
  FACTORY_BY_ID,
  LEVEL_GROWTH,
  LEVEL_MILESTONES,
  LEVEL_VALUE_STEP,
  LINE_GROWTH,
} from "../config/factories";
import { MANAGER_BY_ID } from "../config/managers";
import {
  AUTOMATION_OFFLINE_PER_LEVEL,
  BUILD_SHARE,
  DELIVERY_SHARE,
  PREMIUM_CHANCE_MAX,
  PREMIUM_CHANCE_PER_LEVEL,
  UPGRADE_BY_ID,
  upgradeCurve,
} from "../config/upgrades";
import type { BuyAmount, CarId, DealerId, FactoryId, GameState, ManagerId, UpgradeCategory } from "../types";
import { computeFactoryMods, computeGlobalMods, managerAt, type GlobalMods } from "./modifiers";

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

export function nextLevelCost(s: GameState, id: FactoryId): number {
  const cfg = FACTORY_BY_ID[id];
  return cfg.levelCost * Math.pow(LEVEL_GROWTH, s.factories[id].level - 1);
}

/** Resolves the player's ×1/×10/×100/Max choice into a count and total price. */
export function levelPurchase(s: GameState, id: FactoryId, amount: BuyAmount): { count: number; cost: number } {
  const first = nextLevelCost(s, id);
  const count = amount === "max" ? Math.max(1, maxAffordable(first, LEVEL_GROWTH, s.cash)) : amount;
  return { count, cost: geometricCost(first, LEVEL_GROWTH, count) };
}

export function lineCost(s: GameState, id: FactoryId): number | null {
  const cfg = FACTORY_BY_ID[id];
  const f = s.factories[id];
  if (f.lines >= cfg.maxLines) return null;
  return cfg.lineCost * Math.pow(LINE_GROWTH, f.lines - cfg.baseLines);
}

export function upgradeCost(s: GameState, id: FactoryId, cat: UpgradeCategory, gm?: GlobalMods): number | null {
  const up = UPGRADE_BY_ID[cat];
  const lvl = s.factories[id].upgrades[cat];
  if (lvl >= up.maxLevel) return null;
  const mods = gm ?? computeGlobalMods(s);
  return FACTORY_BY_ID[id].upgradeBase * up.costFactor * upgradeCurve(lvl) * mods.costMult;
}

export function factoryCost(id: FactoryId): number {
  return FACTORY_BY_ID[id].cost;
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

export function carModelCost(s: GameState, id: CarId): number | null {
  const lvl = s.carModels[id] ?? 0;
  if (lvl >= CAR_MODEL.maxLevel) return null;
  return carProfit(CAR_BY_ID[id]) * CAR_MODEL.baseCostProfits * Math.pow(CAR_MODEL.costGrowth, lvl);
}

// ───────────────────────────── unlocks ─────────────────────────────

export function isCarResearched(gm: GlobalMods, car: CarConfig): boolean {
  return !car.requiresResearch || gm.unlockedCars.has(car.id);
}

export function isFactoryAvailable(gm: GlobalMods, id: FactoryId): boolean {
  const cfg = FACTORY_BY_ID[id];
  return !cfg.requiresResearch || gm.unlockedFactories.has(id);
}

/** Highest tier a factory can currently build (Technology unlocks tiers). */
export function factoryTierCap(s: GameState, id: FactoryId): number {
  const cfg = FACTORY_BY_ID[id];
  return Math.min(cfg.maxTier, cfg.baseTier + s.factories[id].upgrades.technology);
}

/** Cars this factory can build right now, best last. */
export function buildableCars(s: GameState, id: FactoryId, gm: GlobalMods): CarConfig[] {
  const cfg = FACTORY_BY_ID[id];
  const cap = factoryTierCap(s, id);
  return CARS.filter((c) => c.tier >= cfg.baseTier && c.tier <= cap && isCarResearched(gm, c));
}

export function activeCar(s: GameState, id: FactoryId, gm: GlobalMods): CarConfig {
  const list = buildableCars(s, id, gm);
  const chosen = s.factories[id].carId;
  if (chosen) {
    const found = list.find((c) => c.id === chosen);
    if (found) return found;
  }
  return list[list.length - 1] ?? CAR_BY_TIER[FACTORY_BY_ID[id].baseTier];
}

/** A car is "unlocked" for the player once any owned factory can build it. */
export function unlockedCarIds(s: GameState, gm: GlobalMods): Set<CarId> {
  const out = new Set<CarId>();
  for (const f of FACTORIES) {
    if (!s.factories[f.id].owned) continue;
    buildableCars(s, f.id, gm).forEach((c) => out.add(c.id));
  }
  return out;
}

// ───────────────────────────── production ─────────────────────────────

export function isAutomated(s: GameState, id: FactoryId): boolean {
  const cfg = FACTORY_BY_ID[id];
  if (!cfg.manual) return true;
  return s.factories[id].upgrades.automation > 0 || managerAt(s, id) !== null;
}

export function milestoneCount(level: number): number {
  return LEVEL_MILESTONES.filter((m) => level >= m).length;
}

export function nextMilestone(level: number): number | null {
  return LEVEL_MILESTONES.find((m) => level < m) ?? null;
}

export interface FactoryStats {
  car: CarConfig;
  buildTime: number;
  deliveryTime: number;
  cycleTime: number;
  carsPerCycle: number;
  /** Value of one car before dealer markup (includes global income multipliers). */
  valuePerCar: number;
  premiumChance: number;
  /** Expected cars per second, if running continuously. */
  carsPerSec: number;
  /** Expected $/s before the dealer multiplier. */
  incomeBeforeDealers: number;
  offlineEfficiency: number;
  automated: boolean;
}

export function factoryStats(s: GameState, id: FactoryId, gm: GlobalMods): FactoryStats {
  const cfg = FACTORY_BY_ID[id];
  const f = s.factories[id];
  const fm = computeFactoryMods(s, id);
  const car = activeCar(s, id, gm);
  const up = f.upgrades;

  const speed =
    cfg.speedMult *
    Math.pow(UPGRADE_BY_ID.production.perLevel, up.production) *
    Math.pow(UPGRADE_BY_ID.automation.perLevel, up.automation) *
    Math.pow(2, milestoneCount(f.level)) *
    gm.speed *
    fm.speed;
  const delivery = Math.pow(UPGRADE_BY_ID.logistics.perLevel, up.logistics) * gm.delivery * fm.delivery;

  const buildTime = (car.time * BUILD_SHARE) / speed;
  const deliveryTime = (car.time * DELIVERY_SHARE) / delivery;
  const cycleTime = buildTime + deliveryTime;

  // Technology levels beyond what unlocks this car's tier add value.
  const techBonusLevels = Math.max(0, up.technology - Math.max(0, car.tier - cfg.baseTier));
  const premiumChance = Math.min(PREMIUM_CHANCE_MAX, up.marketing * PREMIUM_CHANCE_PER_LEVEL);

  const valuePerCar =
    carProfit(car) *
    (1 + LEVEL_VALUE_STEP * (f.level - 1)) *
    cfg.valueMult *
    Math.pow(UPGRADE_BY_ID.quality.perLevel, up.quality) *
    Math.pow(UPGRADE_BY_ID.marketing.perLevel, up.marketing) *
    Math.pow(UPGRADE_BY_ID.technology.perLevel, techBonusLevels) *
    gm.value[car.tier] *
    fm.value[car.tier] *
    gm.income;

  const carsPerCycle = f.lines;
  const carsPerSec = carsPerCycle / cycleTime;
  return {
    car,
    buildTime,
    deliveryTime,
    cycleTime,
    carsPerCycle,
    valuePerCar,
    premiumChance,
    carsPerSec,
    incomeBeforeDealers: carsPerSec * valuePerCar * (1 + premiumChance),
    offlineEfficiency: gm.offline + up.automation * AUTOMATION_OFFLINE_PER_LEVEL + fm.offline,
    automated: isAutomated(s, id),
  };
}

// ───────────────────────────── dealers ─────────────────────────────

export interface DealerSlot {
  id: DealerId;
  capacity: number;
  markup: number;
  /** Cars/s actually sold here. */
  sold: number;
}

export interface DealerAllocation {
  slots: DealerSlot[];
  capacity: number;
  wholesale: number;
  /** Average multiplier applied to every sale (markup + wholesale). */
  multiplier: number;
}

export function dealerCapacity(s: GameState, id: DealerId, gm: GlobalMods): number {
  const cfg = DEALER_BY_ID[id];
  return cfg.capacity * (1 + DEALER_CAP_PER_LEVEL * (s.dealers[id].level - 1)) * gm.dealerCap;
}

export function dealerMarkup(s: GameState, id: DealerId, gm: GlobalMods): number {
  const cfg = DEALER_BY_ID[id];
  return cfg.markup + DEALER_MARKUP_PER_LEVEL * (s.dealers[id].level - 1) + gm.markup;
}

/**
 * Production flows to the highest-markup dealers first. Anything beyond total
 * dealer capacity goes to wholesale at a loss.
 */
export function allocateDealers(s: GameState, carsPerSec: number, gm: GlobalMods): DealerAllocation {
  const slots: DealerSlot[] = DEALERS.filter((d) => s.dealers[d.id].owned)
    .map((d) => ({ id: d.id, capacity: dealerCapacity(s, d.id, gm), markup: dealerMarkup(s, d.id, gm), sold: 0 }))
    .sort((a, b) => b.markup - a.markup);
  let remaining = carsPerSec;
  let weighted = 0;
  for (const slot of slots) {
    slot.sold = Math.min(remaining, slot.capacity);
    remaining -= slot.sold;
    weighted += slot.sold * (1 + slot.markup);
  }
  const capacity = slots.reduce((a, b) => a + b.capacity, 0);
  weighted += remaining * WHOLESALE_RATE;
  const multiplier = carsPerSec > 0 ? weighted / carsPerSec : 1 + (slots[0]?.markup ?? 0);
  return { slots, capacity, wholesale: remaining, multiplier };
}

// ───────────────────────────── totals ─────────────────────────────

export interface EconomySnapshot {
  gm: GlobalMods;
  factories: Partial<Record<FactoryId, FactoryStats>>;
  dealers: DealerAllocation;
  carsPerSec: number;
  /** Income per second from automated production. */
  incomePerSec: number;
  rpPerSec: number;
}

/**
 * Everything the UI and the tick need, computed once. Manual factories count
 * only while a batch is running.
 */
export function snapshot(s: GameState): EconomySnapshot {
  const gm = computeGlobalMods(s);
  const factories: Partial<Record<FactoryId, FactoryStats>> = {};
  let carsPerSec = 0;
  let before = 0;
  let rpPerSec = 0;
  for (const cfg of FACTORIES) {
    const f = s.factories[cfg.id];
    if (!f.owned) continue;
    const st = factoryStats(s, cfg.id, gm);
    factories[cfg.id] = st;
    if (st.automated || f.running) {
      carsPerSec += st.carsPerSec;
      before += st.incomeBeforeDealers;
      rpPerSec += st.carsPerSec * st.car.rp * gm.rp;
    }
  }
  const dealers = allocateDealers(s, carsPerSec, gm);
  return { gm, factories, dealers, carsPerSec, incomePerSec: before * dealers.multiplier, rpPerSec };
}

/** Automated-only income — what keeps running while you are away. */
export function passiveIncome(snap: EconomySnapshot): number {
  let total = 0;
  for (const st of Object.values(snap.factories)) {
    if (st && st.automated) total += st.incomeBeforeDealers;
  }
  return total * snap.dealers.multiplier;
}
