// Read-only helpers that explain the game to the player: what to aim for next
// and why something is locked. They return data, not text — the UI words it
// in the player's language. Never mutate state.
import { CARS, type CarConfig } from "../config/cars";
import { FACTORIES, FACTORY_BY_ID } from "../config/factories";
import { MANAGERS } from "../config/managers";
import { ZONE_BY_ID } from "../config/city";
import { dealerPlot, factoryPlot, STARTER_PLOT } from "../city/layout";
import type { CarId, DealerId, FactoryId, GameState, ManagerId, ZoneId } from "../types";
import { isPlotUnlocked, nextZone, zoneBlocker } from "./city";
import { isFactoryAvailable, unlockedCarIds, upgradeCost, type EconomySnapshot } from "./economy";
import { canPrestige, pendingPoints } from "./prestige";
import { isManagerUnlocked } from "./actions";

export type Requirement =
  | { kind: "research"; research: string }
  | { kind: "buyFactory"; factory: FactoryId }
  | { kind: "technology"; factory: FactoryId; level: number }
  | { kind: "zone"; zone: ZoneId }
  | { kind: "unavailable" };

export type Goal =
  | { kind: "build"; icon: string; factory: FactoryId }
  | { kind: "automate"; icon: string; cost: number; factory: FactoryId; manager: ManagerId }
  | { kind: "factory"; icon: string; cost: number; factory: FactoryId; requirement: Requirement | null }
  | { kind: "car"; icon: string; cost?: number; factory: FactoryId; car: CarId }
  | { kind: "manager"; icon: string; cost: number; manager: ManagerId }
  | { kind: "prestige"; icon: string; points: number }
  | { kind: "facility"; icon: string; plot: string }
  | { kind: "worker"; icon: string; plot: string; idle: number }
  | { kind: "zone"; icon: string; cost: number; zone: ZoneId };

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

export function factoryRequirement(s: GameState, snap: EconomySnapshot, id: FactoryId): Requirement | null {
  const cfg = FACTORY_BY_ID[id];
  if (!isFactoryAvailable(snap.gm, id)) return { kind: "research", research: cfg.requiresResearch! };
  const plot = factoryPlot(id);
  if (plot && !isPlotUnlocked(s, plot)) return { kind: "zone", zone: plot.zone };
  return null;
}

export function dealerRequirement(s: GameState, id: DealerId): Requirement | null {
  const plot = dealerPlot(id);
  return plot && !isPlotUnlocked(s, plot) ? { kind: "zone", zone: plot.zone } : null;
}

export function nextGoals(s: GameState, snap: EconomySnapshot, max = 3): Goal[] {
  const goals: Goal[] = [];
  const garage = snap.factories.garage;

  // First car by hand (earns the money for the first service bay), then
  // get Garage #01 running.
  if (s.lifetime.carsProduced === 0) goals.push({ kind: "build", icon: "🔧", factory: "garage" });
  const starter = s.city.buildings[STARTER_PLOT]?.garage;
  if (starter && starter.facilities.length === 0) goals.push({ kind: "facility", icon: "🛠️", plot: STARTER_PLOT });
  for (const [plot, st] of Object.entries(snap.city.garages)) {
    if (st.workstations > st.staffed && st.workers < st.workerCap) {
      goals.push({ kind: "worker", icon: "👷", plot, idle: st.workstations - st.staffed });
      break;
    }
  }

  if (garage && !garage.automated && s.factories.garage.owned) {
    const mike = MANAGERS[0];
    goals.push({ kind: "automate", icon: mike.avatar, cost: mike.cost, factory: "garage", manager: mike.id });
  }

  const nextFactory = FACTORIES.find((f) => !s.factories[f.id].owned);
  if (nextFactory) {
    const req = factoryRequirement(s, snap, nextFactory.id);
    if (req?.kind === "zone") {
      const z = nextZone(s);
      if (z && !zoneBlocker(s, z.id)) goals.push({ kind: "zone", icon: "🗺️", cost: ZONE_BY_ID[z.id].cost, zone: z.id });
    } else {
      goals.push({ kind: "factory", icon: nextFactory.emoji, cost: nextFactory.cost, factory: nextFactory.id, requirement: req });
    }
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
