import { CARS } from "../config/cars";
import { COMPONENTS } from "../config/chain";
import { DEALER_IDS } from "../config/dealerships";
import { MANAGER_IDS } from "../config/managers";
import { START_CASH } from "../config/economy";
import { createChain } from "./chain";
import { createCity } from "./city";
import { createLogistics } from "./logistics";
import type { CarDesign, CarId, ComponentId, DealerId, DealerState, GameState, ManagerId, ManagerState, Stats } from "../types";

/** v3: the supply-chain economy (older saves start a new company). */
export const SAVE_VERSION = 3;

export function createDealers(): Record<DealerId, DealerState> {
  return Object.fromEntries(DEALER_IDS.map((d) => [d, { owned: false, level: 1 }])) as Record<DealerId, DealerState>;
}

export function createManagers(): Record<ManagerId, ManagerState> {
  return Object.fromEntries(
    MANAGER_IDS.map((m) => [m, { hired: false, level: 1, assignedTo: null }]),
  ) as Record<ManagerId, ManagerState>;
}

export function emptyCarCounts(): Record<CarId, number> {
  return Object.fromEntries(CARS.map((c) => [c.id, 0])) as Record<CarId, number>;
}

export function emptyParts(): Record<ComponentId, number> {
  return Object.fromEntries(COMPONENTS.map((c) => [c.id, 0])) as Record<ComponentId, number>;
}

/** Every platform starts with its default model name and no options. */
export function createDesigns(): Record<CarId, CarDesign> {
  return Object.fromEntries(CARS.map((c) => [c.id, { name: c.modelName, engine: 0, interior: 0, rims: 0, paint: 0, color: "" }])) as Record<CarId, CarDesign>;
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
    parts: emptyParts(),
    deliveries: 0,
    carsSold: 0,
    carRevenue: 0,
  };
}

export function createInitialState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    // starting capital: materials, the first upgrades, saving for the next plant
    cash: START_CASH,
    rp: 0,
    empirePoints: 0,
    empirePointsEarned: 0,
    prestigeCount: 0,
    dealers: createDealers(),
    managers: createManagers(),
    carModels: emptyCarCounts(),
    designs: createDesigns(),
    boost: 0,
    stars: 0,
    starUpgrades: {},
    imperiumCount: 0,
    epBase: 0,
    history: [],
    tips: [],
    login: { day: "", streak: 0, claimed: true },
    rivalsBeaten: [],
    contracts: { offer: null, active: null, nextAt: 0, done: 0 },
    logistics: createLogistics(),
    market: { t: 0, bought: 0 },
    research: [],
    achievements: [],
    missions: { dailyDate: "", daily: [], milestonesClaimed: [] },
    run: createStats(),
    lifetime: createStats(),
    city: createCity(),
    chain: createChain(),
    pendingOffline: null,
    settings: { buyAmount: 1, lang: "en", lowGraphics: false, sound: true, haptics: true },
    createdAt: now,
    runStartedAt: now,
    lastActiveAt: now,
  };
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}
