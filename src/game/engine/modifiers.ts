import { ACHIEVEMENT_INCOME_BONUS } from "../config/achievements";
import { CARS, CAR_MODEL } from "../config/cars";
import { MANAGERS, type ManagerConfig } from "../config/managers";
import { EMPIRE_PERKS, OFFLINE, PRESTIGE } from "../config/prestige";
import { RESEARCH_BY_ID } from "../config/research";
import type { CarId, Effect, FactoryId, GameState } from "../types";

export const MAX_TIER = 8;

export interface GlobalMods {
  /** Value multiplier per car tier (index = tier). */
  value: number[];
  speed: number;
  delivery: number;
  income: number;
  /** Offline efficiency (0.6 = 60% of live production). */
  offline: number;
  offlineCapHours: number;
  dealerCap: number;
  markup: number;
  rp: number;
  costMult: number;
  unlockedCars: Set<CarId>;
  unlockedFactories: Set<FactoryId>;
}

export interface FactoryMods {
  value: number[];
  speed: number;
  delivery: number;
  offline: number;
}

const tierArray = () => Array.from({ length: MAX_TIER + 1 }, () => 1);

function applyValue(value: number[], mult: number, minTier = 1, maxTier = MAX_TIER) {
  for (let t = minTier; t <= maxTier; t++) value[t] *= mult;
}

export function applyEffect(m: GlobalMods, e: Effect) {
  switch (e.kind) {
    case "value":
      applyValue(m.value, e.mult, e.minTier, e.maxTier);
      break;
    case "speed":
      m.speed *= e.mult;
      break;
    case "delivery":
      m.delivery *= e.mult;
      break;
    case "income":
      m.income *= e.mult;
      break;
    case "offline":
      m.offline += e.add * OFFLINE.baseEfficiency;
      break;
    case "offlineCap":
      m.offlineCapHours += e.hours;
      break;
    case "dealerCap":
      m.dealerCap *= e.mult;
      break;
    case "markup":
      m.markup += e.add;
      break;
    case "rp":
      m.rp *= e.mult;
      break;
    case "costMult":
      m.costMult *= e.mult;
      break;
    case "unlockCar":
      m.unlockedCars.add(e.car);
      break;
    case "unlockFactory":
      m.unlockedFactories.add(e.factory);
      break;
  }
}

/** Strength of a manager's bonus at its current level, as a multiplier. */
export function managerMult(cfg: ManagerConfig, level: number): number {
  return 1 + cfg.bonus.pct * level;
}

export function computeGlobalMods(s: GameState): GlobalMods {
  const m: GlobalMods = {
    value: tierArray(),
    speed: 1,
    delivery: 1,
    income: 1,
    offline: OFFLINE.baseEfficiency,
    offlineCapHours: OFFLINE.baseCapHours,
    dealerCap: 1,
    markup: 0,
    rp: 1,
    costMult: 1,
    unlockedCars: new Set(),
    unlockedFactories: new Set(),
  };

  for (const id of s.research) {
    const node = RESEARCH_BY_ID[id];
    if (node) node.effects.forEach((e) => applyEffect(m, e));
  }

  for (const perk of EMPIRE_PERKS) {
    if (s.empirePoints >= perk.points) perk.effects.forEach((e) => applyEffect(m, e));
  }

  // Car model refinements (Cars tab).
  for (const car of CARS) {
    const lvl = s.carModels[car.id] ?? 0;
    if (lvl > 0) m.value[car.tier] *= Math.pow(CAR_MODEL.valuePerLevel, lvl);
  }

  // Global-scope managers work while assigned to any factory.
  for (const cfg of MANAGERS) {
    const st = s.managers[cfg.id];
    if (cfg.scope !== "global" || !st?.hired || !st.assignedTo) continue;
    const mult = managerMult(cfg, st.level);
    switch (cfg.bonus.stat) {
      case "income":
        m.income *= mult;
        break;
      case "rp":
        m.rp *= mult;
        break;
      case "dealerCap":
        m.dealerCap *= mult;
        break;
      case "speed":
        m.speed *= mult;
        break;
      case "delivery":
        m.delivery *= mult;
        break;
      case "value":
        applyValue(m.value, mult, cfg.bonus.minTier);
        break;
      case "offline":
        m.offline += (mult - 1) * OFFLINE.baseEfficiency;
        break;
    }
  }

  m.income *= 1 + s.achievements.length * ACHIEVEMENT_INCOME_BONUS;
  m.income *= 1 + s.empirePoints * PRESTIGE.incomePerPoint;
  return m;
}

/** Bonuses from the factory-scope manager assigned to this plant, if any. */
export function computeFactoryMods(s: GameState, factory: FactoryId): FactoryMods {
  const f: FactoryMods = { value: tierArray(), speed: 1, delivery: 1, offline: 0 };
  for (const cfg of MANAGERS) {
    const st = s.managers[cfg.id];
    if (cfg.scope !== "factory" || !st?.hired || st.assignedTo !== factory) continue;
    const mult = managerMult(cfg, st.level);
    switch (cfg.bonus.stat) {
      case "speed":
        f.speed *= mult;
        break;
      case "value":
        applyValue(f.value, mult, cfg.bonus.minTier);
        break;
      case "delivery":
        f.delivery *= mult;
        break;
      case "offline":
        f.offline += (mult - 1) * OFFLINE.baseEfficiency;
        break;
      default:
        break;
    }
  }
  return f;
}

export function managerAt(s: GameState, factory: FactoryId) {
  return MANAGERS.find((m) => s.managers[m.id]?.hired && s.managers[m.id].assignedTo === factory) ?? null;
}
