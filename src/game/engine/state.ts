import { CARS } from "../config/cars";
import { DEALER_IDS } from "../config/dealerships";
import { FACTORIES } from "../config/factories";
import { MANAGER_IDS } from "../config/managers";
import { UPGRADE_IDS } from "../config/upgrades";
import type {
  CarId,
  DealerId,
  DealerState,
  FactoryId,
  FactoryState,
  GameState,
  ManagerId,
  ManagerState,
  Stats,
  UpgradeCategory,
} from "../types";

export const SAVE_VERSION = 1;

export function emptyUpgrades(): Record<UpgradeCategory, number> {
  return Object.fromEntries(UPGRADE_IDS.map((u) => [u, 0])) as Record<UpgradeCategory, number>;
}

export function createFactories(): Record<FactoryId, FactoryState> {
  return Object.fromEntries(
    FACTORIES.map((f) => [
      f.id,
      {
        owned: f.cost === 0,
        level: 1,
        lines: f.baseLines,
        upgrades: emptyUpgrades(),
        carId: null,
        progress: 0,
        running: false,
        produced: 0,
      } satisfies FactoryState,
    ]),
  ) as Record<FactoryId, FactoryState>;
}

export function createDealers(): Record<DealerId, DealerState> {
  return Object.fromEntries(
    DEALER_IDS.map((d) => [d, { owned: d === "local", level: 1 }]),
  ) as Record<DealerId, DealerState>;
}

export function createManagers(): Record<ManagerId, ManagerState> {
  return Object.fromEntries(
    MANAGER_IDS.map((m) => [m, { hired: false, level: 1, assignedTo: null }]),
  ) as Record<ManagerId, ManagerState>;
}

export function emptyCarCounts(): Record<CarId, number> {
  return Object.fromEntries(CARS.map((c) => [c.id, 0])) as Record<CarId, number>;
}

export function createStats(): Stats {
  return {
    carsProduced: 0,
    moneyEarned: 0,
    levelsBought: 0,
    upgradesBought: 0,
    researchDone: 0,
    managersHired: 0,
    offlineEarned: 0,
    playTime: 0,
    highestIncome: 0,
    carsByType: emptyCarCounts(),
  };
}

export function createInitialState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    cash: 0,
    rp: 0,
    empirePoints: 0,
    empirePointsEarned: 0,
    prestigeCount: 0,
    factories: createFactories(),
    dealers: createDealers(),
    managers: createManagers(),
    carModels: emptyCarCounts(),
    research: [],
    achievements: [],
    missions: { dailyDate: "", daily: [], milestonesClaimed: [] },
    run: createStats(),
    lifetime: createStats(),
    pendingOffline: null,
    settings: { buyAmount: 1 },
    createdAt: now,
    runStartedAt: now,
    lastActiveAt: now,
  };
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}
