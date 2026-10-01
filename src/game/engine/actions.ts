// Player actions. Each mutates the state it is given and returns whether it
// happened, so the store can clone → act → commit.
import { DEALER_BY_ID } from "../config/dealerships";
import { FACTORY_BY_ID, LEVEL_GROWTH } from "../config/factories";
import { MANAGER_BY_ID } from "../config/managers";
import { RESEARCH_BY_ID } from "../config/research";
import type { BuyAmount, CarId, DealerId, FactoryId, GameState, ManagerId, UpgradeCategory } from "../types";
import {
  buildableCars,
  carModelCost,
  dealerUpgradeCost,
  geometricCost,
  isAutomated,
  isFactoryAvailable,
  lineCost,
  managerUpgradeCost,
  maxAffordable,
  nextLevelCost,
  upgradeCost,
} from "./economy";
import { computeGlobalMods } from "./modifiers";

function spend(s: GameState, cost: number | null): boolean {
  if (cost === null || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  return true;
}

export function startProduction(s: GameState, id: FactoryId): boolean {
  const f = s.factories[id];
  if (!f.owned || f.running || isAutomated(s, id)) return false;
  f.running = true;
  return true;
}

/** Tapping a running manual line pushes it forward. */
export function rush(s: GameState, id: FactoryId, amount = 0.08): boolean {
  const f = s.factories[id];
  if (!f.owned || isAutomated(s, id)) return false;
  if (!f.running) f.running = true;
  f.progress = Math.min(0.999, f.progress + amount);
  return true;
}

export function buyFactory(s: GameState, id: FactoryId): boolean {
  const f = s.factories[id];
  if (f.owned) return false;
  if (!isFactoryAvailable(computeGlobalMods(s), id)) return false;
  if (!spend(s, FACTORY_BY_ID[id].cost)) return false;
  f.owned = true;
  f.progress = 0;
  return true;
}

export function buyLevels(s: GameState, id: FactoryId, amount: BuyAmount): number {
  const f = s.factories[id];
  if (!f.owned) return 0;
  const first = nextLevelCost(s, id);
  const count = amount === "max" ? maxAffordable(first, LEVEL_GROWTH, s.cash) : amount;
  if (count <= 0) return 0;
  if (!spend(s, geometricCost(first, LEVEL_GROWTH, count))) return 0;
  f.level += count;
  s.run.levelsBought += count;
  s.lifetime.levelsBought += count;
  return count;
}

export function buyLine(s: GameState, id: FactoryId): boolean {
  const f = s.factories[id];
  if (!f.owned || !spend(s, lineCost(s, id))) return false;
  f.lines += 1;
  return true;
}

export function buyUpgrade(s: GameState, id: FactoryId, cat: UpgradeCategory): boolean {
  const f = s.factories[id];
  if (!f.owned || !spend(s, upgradeCost(s, id, cat))) return false;
  f.upgrades[cat] += 1;
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  return true;
}

export function selectCar(s: GameState, id: FactoryId, car: CarId | null): boolean {
  const f = s.factories[id];
  if (car && !buildableCars(s, id, computeGlobalMods(s)).some((c) => c.id === car)) return false;
  f.carId = car;
  f.progress = 0;
  return true;
}

export function isManagerUnlocked(s: GameState, id: ManagerId): boolean {
  return s.lifetime.moneyEarned >= MANAGER_BY_ID[id].unlockAt;
}

export function hireManager(s: GameState, id: ManagerId, assignTo?: FactoryId): boolean {
  const st = s.managers[id];
  if (st.hired || !isManagerUnlocked(s, id)) return false;
  if (!spend(s, MANAGER_BY_ID[id].cost)) return false;
  st.hired = true;
  s.run.managersHired += 1;
  s.lifetime.managersHired += 1;
  if (assignTo) assignManager(s, id, assignTo);
  return true;
}

export function upgradeManager(s: GameState, id: ManagerId): boolean {
  const st = s.managers[id];
  if (!st.hired || !spend(s, managerUpgradeCost(s, id))) return false;
  st.level += 1;
  return true;
}

/** One manager per factory: assigning swaps out whoever was there. */
export function assignManager(s: GameState, id: ManagerId, factory: FactoryId | null): boolean {
  const st = s.managers[id];
  if (!st.hired) return false;
  if (factory) {
    if (!s.factories[factory].owned) return false;
    for (const other of Object.values(s.managers)) if (other.assignedTo === factory) other.assignedTo = null;
  }
  st.assignedTo = factory;
  return true;
}

export function buyDealer(s: GameState, id: DealerId): boolean {
  const d = s.dealers[id];
  if (d.owned || !spend(s, DEALER_BY_ID[id].cost)) return false;
  d.owned = true;
  return true;
}

export function upgradeDealer(s: GameState, id: DealerId): boolean {
  const d = s.dealers[id];
  if (!d.owned || !spend(s, dealerUpgradeCost(s, id))) return false;
  d.level += 1;
  return true;
}

export function upgradeCarModel(s: GameState, id: CarId): boolean {
  if (!spend(s, carModelCost(s, id))) return false;
  s.carModels[id] = (s.carModels[id] ?? 0) + 1;
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  return true;
}

export function canResearch(s: GameState, id: string): boolean {
  const node = RESEARCH_BY_ID[id];
  if (!node || s.research.includes(id)) return false;
  return node.requires.every((r) => s.research.includes(r));
}

export function doResearch(s: GameState, id: string): boolean {
  const node = RESEARCH_BY_ID[id];
  if (!canResearch(s, id) || s.rp < node.cost) return false;
  s.rp -= node.cost;
  s.research.push(id);
  s.run.researchDone += 1;
  s.lifetime.researchDone += 1;
  return true;
}
