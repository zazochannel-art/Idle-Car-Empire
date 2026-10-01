// Read-only helpers that explain the game to the player: what to aim for next
// and why something is locked. They return data, not text — the UI words it
// in the player's language. Never mutate state.
import { CARS, type CarConfig } from "../config/cars";
import { FACTORIES, FACTORY_BY_ID } from "../config/factories";
import { MANAGERS } from "../config/managers";
import type { CarId, FactoryId, GameState, ManagerId } from "../types";
import { isFactoryAvailable, unlockedCarIds, upgradeCost, type EconomySnapshot } from "./economy";
import { canPrestige, pendingPoints } from "./prestige";
import { isManagerUnlocked } from "./actions";

export type Requirement =
  | { kind: "research"; research: string }
  | { kind: "buyFactory"; factory: FactoryId }
  | { kind: "technology"; factory: FactoryId; level: number }
  | { kind: "unavailable" };

export type Goal =
  | { kind: "build"; icon: string; factory: FactoryId }
  | { kind: "automate"; icon: string; cost: number; factory: FactoryId; manager: ManagerId }
  | { kind: "factory"; icon: string; cost: number; factory: FactoryId; requirement: Requirement | null }
  | { kind: "car"; icon: string; cost?: number; factory: FactoryId; car: CarId }
  | { kind: "manager"; icon: string; cost: number; manager: ManagerId }
  | { kind: "prestige"; icon: string; points: number };

/** Which factory, with how many Technology levels, could build this car. */
export function carUnlockPath(s: GameState, car: CarConfig): { factory: FactoryId; techNeeded: number; owned: boolean } | null {
  let best: { factory: FactoryId; techNeeded: number; owned: boolean } | null = null;
  for (const f of FACTORIES) {
    if (car.tier < f.baseTier || car.tier > f.maxTier) continue;
    const owned = s.factories[f.id].owned;
    const techNeeded = Math.max(0, car.tier - f.baseTier - s.factories[f.id].upgrades.technology);
    const candidate = { factory: f.id, techNeeded, owned };
    if (!best || (owned && !best.owned) || (owned === best.owned && techNeeded < best.techNeeded)) best = candidate;
    if (owned && techNeeded === 0) break;
  }
  return best;
}

/** Why a car is still locked, or null when it is unlocked. */
export function carRequirement(s: GameState, car: CarConfig, snap: EconomySnapshot): Requirement | null {
  if (car.requiresResearch && !snap.gm.unlockedCars.has(car.id)) return { kind: "research", research: car.requiresResearch };
  if (unlockedCarIds(s, snap.gm).has(car.id)) return null;
  const path = carUnlockPath(s, car);
  if (!path) return { kind: "unavailable" };
  if (!path.owned) return { kind: "buyFactory", factory: path.factory };
  return { kind: "technology", factory: path.factory, level: s.factories[path.factory].upgrades.technology + path.techNeeded };
}

export function factoryRequirement(snap: EconomySnapshot, id: FactoryId): Requirement | null {
  const cfg = FACTORY_BY_ID[id];
  if (isFactoryAvailable(snap.gm, id)) return null;
  return { kind: "research", research: cfg.requiresResearch! };
}

export function nextGoals(s: GameState, snap: EconomySnapshot, max = 3): Goal[] {
  const goals: Goal[] = [];
  const garage = snap.factories.garage;

  if (s.lifetime.carsProduced === 0) goals.push({ kind: "build", icon: "🔧", factory: "garage" });
  if (garage && !garage.automated && s.factories.garage.owned) {
    const mike = MANAGERS[0];
    goals.push({ kind: "automate", icon: mike.avatar, cost: mike.cost, factory: "garage", manager: mike.id });
  }

  const nextFactory = FACTORIES.find((f) => !s.factories[f.id].owned);
  if (nextFactory) {
    goals.push({ kind: "factory", icon: nextFactory.emoji, cost: nextFactory.cost, factory: nextFactory.id, requirement: factoryRequirement(snap, nextFactory.id) });
  }

  const unlocked = unlockedCarIds(s, snap.gm);
  const nextCar = CARS.find((c) => !unlocked.has(c.id));
  if (nextCar) {
    const path = carUnlockPath(s, nextCar);
    if (path?.owned && path.techNeeded > 0 && (!nextCar.requiresResearch || snap.gm.unlockedCars.has(nextCar.id))) {
      goals.push({ kind: "car", icon: nextCar.emoji, cost: upgradeCost(s, path.factory, "technology", snap.gm) ?? undefined, factory: path.factory, car: nextCar.id });
    }
  }

  const nextManager = MANAGERS.find((m) => !s.managers[m.id].hired && isManagerUnlocked(s, m.id));
  if (nextManager && goals.every((g) => g.kind !== "automate")) {
    goals.push({ kind: "manager", icon: nextManager.avatar, cost: nextManager.cost, manager: nextManager.id });
  }

  if (canPrestige(s)) goals.unshift({ kind: "prestige", icon: "⭐", points: pendingPoints(s) });
  return goals.slice(0, max);
}
