// Player actions. Each mutates the state it is given and returns whether it
// happened, so the store can clone → act → commit. Plant actions live in
// engine/chain.ts, map buildings in engine/city.ts.
import { DEALER_BY_ID } from "../config/dealerships";
import { MANAGER_BY_ID } from "../config/managers";
import { RESEARCH_BY_ID } from "../config/research";
import type { CarId, DealerId, GameState, ManagerId } from "../types";
import { dealerPlot } from "../city/layout";
import { emptyDealerStock } from "./chain";
import { isPlotUnlocked } from "./city";
import { carModelCost, dealerUpgradeCost, managerUpgradeCost } from "./economy";

function spend(s: GameState, cost: number | null): boolean {
  if (cost === null || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  return true;
}

export function isManagerUnlocked(s: GameState, id: ManagerId): boolean {
  return s.lifetime.moneyEarned >= MANAGER_BY_ID[id].unlockAt;
}

export function hireManager(s: GameState, id: ManagerId, assignTo?: string): boolean {
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

/** One manager per plant: assigning swaps out whoever was there. */
export function assignManager(s: GameState, id: ManagerId, plot: string | null): boolean {
  const st = s.managers[id];
  if (!st.hired) return false;
  if (plot) {
    if (!s.city.buildings[plot]?.plant) return false;
    for (const other of Object.values(s.managers)) if (other.assignedTo === plot) other.assignedTo = null;
  }
  st.assignedTo = plot;
  return true;
}

/** Dealerships open once the first car has rolled off an assembly line. */
export function canOpenDealers(s: GameState): boolean {
  return s.lifetime.carsProduced > 0 || s.chain.firstCar;
}

export function buyDealer(s: GameState, id: DealerId): boolean {
  const d = s.dealers[id];
  if (d.owned || !canOpenDealers(s) || !isPlotUnlocked(s, dealerPlot(id))) return false;
  if (!spend(s, DEALER_BY_ID[id].cost)) return false;
  d.owned = true;
  s.chain.dealers[id] = emptyDealerStock();
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
