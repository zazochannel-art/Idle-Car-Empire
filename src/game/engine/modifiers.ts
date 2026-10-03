import { ACHIEVEMENT_INCOME_BONUS } from "../config/achievements";
import { CARS, CAR_MODEL } from "../config/cars";
import { MANAGERS, type ManagerConfig } from "../config/managers";
import { EMPIRE_PERKS, OFFLINE, PRESTIGE } from "../config/prestige";
import { BASE_MAX_LEVEL, PLANT_MAX_LEVEL } from "../config/chain";
import { REGIONS, regionIndex } from "../config/regions";
import { activeEvent } from "./events";
import { SEASON_BONUS, seasonAt } from "./season";
import { starMods } from "./imperium";
import { RESEARCH_BY_ID } from "../config/research";
import type { CarId, Effect, GameState, PlantType } from "../types";
import { cityEffects } from "./city";

export const MAX_TIER = 9;

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
  /** Highest plant level allowed: 10, plus one per region reached. */
  maxPlantLevel: number;
  unlockedCars: Set<CarId>;
  unlockedPlants: Set<PlantType>;
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
    case "unlockPlant":
      m.unlockedPlants.add(e.plant);
      break;
  }
}

/** Strength of a manager's bonus at its current level, as a multiplier. */
export function managerMult(cfg: ManagerConfig, level: number, power = 1): number {
  return 1 + cfg.bonus.pct * level * power;
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
    maxPlantLevel: Math.min(PLANT_MAX_LEVEL, BASE_MAX_LEVEL + regionIndex(s.prestigeCount)),
    unlockedCars: new Set(),
    unlockedPlants: new Set(),
  };

  for (const id of s.research) {
    const node = RESEARCH_BY_ID[id];
    if (node) node.effects.forEach((e) => applyEffect(m, e));
  }

  for (const perk of EMPIRE_PERKS) {
    if (s.empirePoints >= perk.points) perk.effects.forEach((e) => applyEffect(m, e));
  }

  // The region the empire has expanded to.
  REGIONS[regionIndex(s.prestigeCount)].effects.forEach((e) => applyEffect(m, e));

  // Seasons (Halloween, winter holidays) add a little income.
  if (seasonAt(s.lastActiveAt)) m.income *= 1 + SEASON_BONUS;

  // A limited-time market event (the clock is the last tick).
  activeEvent(s.lastActiveAt)?.event.effects.forEach((e) => applyEffect(m, e));

  // ⭐ Star upgrades from Reset Imperium.
  const star = starMods(s);
  m.speed *= star.speed;
  applyValue(m.value, star.value);
  m.offline += star.offline * OFFLINE.baseEfficiency;
  m.costMult *= star.cost;

  // Car model refinements (Cars tab).
  for (const car of CARS) {
    const lvl = s.carModels[car.id] ?? 0;
    if (lvl > 0) m.value[car.tier] *= Math.pow(CAR_MODEL.valuePerLevel, lvl);
  }

  // Global-scope managers work while assigned to any plant.
  for (const cfg of MANAGERS) {
    const st = s.managers[cfg.id];
    if (cfg.scope !== "global" || !st?.hired || !st.assignedTo) continue;
    const mult = managerMult(cfg, st.level, star.managers);
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
      case "cost":
        // −3% per level, never below half price
        m.costMult *= Math.max(0.5, 2 - mult);
        break;
      case "carValue":
        applyValue(m.value, mult);
        break;
    }
  }

  // Buildings on the Empire Map.
  const city = cityEffects(s);
  m.speed *= city.speed;
  m.delivery *= city.delivery;
  m.dealerCap *= city.dealerCap;
  m.rp *= city.rp;
  m.markup += city.markup;
  m.income *= city.income;

  m.income *= 1 + s.achievements.length * ACHIEVEMENT_INCOME_BONUS;
  m.income *= 1 + s.empirePoints * PRESTIGE.incomePerPoint;
  // permanent boosts from milestones
  m.income *= 1 + s.boost;
  return m;
}
