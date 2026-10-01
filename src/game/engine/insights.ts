// Read-only helpers that explain the game to the player: what to aim for next
// and why something is locked. Used by the UI, never mutate state.
import { CARS, type CarConfig } from "../config/cars";
import { FACTORIES, FACTORY_BY_ID } from "../config/factories";
import { MANAGERS } from "../config/managers";
import { RESEARCH_BY_ID } from "../config/research";
import type { FactoryId, GameState } from "../types";
import { isFactoryAvailable, unlockedCarIds, upgradeCost, type EconomySnapshot } from "./economy";
import { canPrestige, pendingPoints } from "./prestige";
import { isManagerUnlocked } from "./actions";

export type GoalKind = "build" | "automate" | "factory" | "car" | "manager" | "prestige";

export interface Goal {
  kind: GoalKind;
  title: string;
  detail: string;
  icon: string;
  cost?: number;
  factory?: FactoryId;
  target?: string;
}

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

export function carRequirement(s: GameState, car: CarConfig, snap: EconomySnapshot): string | null {
  if (car.requiresResearch && !snap.gm.unlockedCars.has(car.id)) {
    return `Research ${RESEARCH_BY_ID[car.requiresResearch]?.name ?? car.requiresResearch}`;
  }
  if (unlockedCarIds(s, snap.gm).has(car.id)) return null;
  const path = carUnlockPath(s, car);
  if (!path) return "Not buildable yet";
  const f = FACTORY_BY_ID[path.factory];
  if (!path.owned) return `Buy the ${f.name}`;
  return `Technology Lv ${s.factories[path.factory].upgrades.technology + path.techNeeded} in ${f.name}`;
}

export function factoryRequirement(snap: EconomySnapshot, id: FactoryId): string | null {
  const cfg = FACTORY_BY_ID[id];
  if (isFactoryAvailable(snap.gm, id)) return null;
  return `Research ${RESEARCH_BY_ID[cfg.requiresResearch!]?.name}`;
}

export function nextGoals(s: GameState, snap: EconomySnapshot, max = 3): Goal[] {
  const goals: Goal[] = [];
  const garage = snap.factories.garage;

  if (s.lifetime.carsProduced === 0) {
    goals.push({ kind: "build", icon: "🔧", title: "Build your first car", detail: "Tap BUILD on the Small Garage. Each City Compact earns $50.", factory: "garage" });
  }
  if (garage && !garage.automated && s.factories.garage.owned) {
    const mike = MANAGERS[0];
    goals.push({ kind: "automate", icon: mike.avatar, title: "Automate the garage", detail: `Hire ${mike.name} so cars keep rolling without tapping — even offline.`, cost: mike.cost, factory: "garage", target: mike.id });
  }

  const nextFactory = FACTORIES.find((f) => !s.factories[f.id].owned);
  if (nextFactory) {
    const req = factoryRequirement(snap, nextFactory.id);
    goals.push({
      kind: "factory",
      icon: nextFactory.emoji,
      title: `Open the ${nextFactory.name}`,
      detail: req ? `Needs: ${req}` : `${nextFactory.city} · ${nextFactory.baseLines} lines · ×${nextFactory.valueMult} value`,
      cost: nextFactory.cost,
      factory: nextFactory.id,
    });
  }

  const unlocked = unlockedCarIds(s, snap.gm);
  const nextCar = CARS.find((c) => !unlocked.has(c.id));
  if (nextCar) {
    const path = carUnlockPath(s, nextCar);
    if (path?.owned && path.techNeeded > 0 && (!nextCar.requiresResearch || snap.gm.unlockedCars.has(nextCar.id))) {
      goals.push({
        kind: "car",
        icon: nextCar.emoji,
        title: `Unlock the ${nextCar.name}`,
        detail: `Technology upgrade in ${FACTORY_BY_ID[path.factory].name}`,
        cost: upgradeCost(s, path.factory, "technology", snap.gm) ?? undefined,
        factory: path.factory,
      });
    }
  }

  const nextManager = MANAGERS.find((m) => !s.managers[m.id].hired && isManagerUnlocked(s, m.id));
  if (nextManager && goals.every((g) => g.kind !== "automate")) {
    goals.push({ kind: "manager", icon: nextManager.avatar, title: `Hire ${nextManager.name}`, detail: nextManager.role, cost: nextManager.cost, target: nextManager.id });
  }

  if (canPrestige(s)) {
    goals.unshift({ kind: "prestige", icon: "⭐", title: `Global Expansion ready: +${pendingPoints(s)} EP`, detail: "Reset for permanent Empire Points." });
  }
  return goals.slice(0, max);
}
