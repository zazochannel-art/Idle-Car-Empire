// Core type definitions shared by the config, the engine and the UI.

export type CarId =
  | "compact"
  | "sedan"
  | "suv"
  | "sports"
  | "supercar"
  | "hypercar"
  | "electric"
  | "future";

export type FactoryId =
  | "garage"
  | "local"
  | "european"
  | "american"
  | "asian"
  | "luxury"
  | "supercarFactory"
  | "electricFactory"
  | "hypercarFactory"
  | "mega";

export type DealerId = "local" | "city" | "premium" | "luxury" | "supercar" | "global";

export type ManagerId =
  | "mike"
  | "sarah"
  | "alex"
  | "daniel"
  | "elena"
  | "hiro"
  | "marco"
  | "priya"
  | "viktor"
  | "lena";

export type UpgradeCategory =
  | "production"
  | "quality"
  | "automation"
  | "marketing"
  | "logistics"
  | "technology";

export type Continent =
  | "Europe"
  | "North America"
  | "South America"
  | "Asia"
  | "Africa"
  | "Oceania";

export type ResearchCategory =
  | "engineering"
  | "automation"
  | "electric"
  | "ai"
  | "design"
  | "performance"
  | "green";

/**
 * A single modifier. Research, managers, achievements and empire perks all
 * describe their bonuses with these, so the economy has one place that
 * aggregates them (engine/modifiers.ts).
 */
export type Effect =
  | { kind: "value"; mult: number; minTier?: number; maxTier?: number }
  | { kind: "speed"; mult: number }
  | { kind: "delivery"; mult: number }
  | { kind: "income"; mult: number }
  | { kind: "offline"; add: number }
  | { kind: "offlineCap"; hours: number }
  | { kind: "dealerCap"; mult: number }
  | { kind: "markup"; add: number }
  | { kind: "rp"; mult: number }
  | { kind: "costMult"; mult: number }
  | { kind: "unlockCar"; car: CarId }
  | { kind: "unlockFactory"; factory: FactoryId };

export interface Reward {
  cash?: number;
  /** Cash expressed as N seconds of current income (scales with progress). */
  incomeSeconds?: number;
  rp?: number;
}

export interface FactoryState {
  owned: boolean;
  level: number;
  lines: number;
  upgrades: Record<UpgradeCategory, number>;
  /** null = automatically build the best car this factory can make. */
  carId: CarId | null;
  /** Progress of the current batch, 0..1. */
  progress: number;
  /** Only meaningful for factories that are not automated (manual start). */
  running: boolean;
  produced: number;
}

export interface DealerState {
  owned: boolean;
  level: number;
}

export interface ManagerState {
  hired: boolean;
  level: number;
  assignedTo: FactoryId | null;
}

export type MetricId =
  | "carsProduced"
  | "moneyEarned"
  | "levelsBought"
  | "upgradesBought"
  | "researchDone"
  | "managersHired"
  | "factoriesOwned"
  | "dealersOwned"
  | "maxFactoryLevel"
  | "prestigeCount"
  | "carsUnlocked";

export interface MissionState {
  id: string;
  title: string;
  metric: MetricId;
  target: number;
  /** Metric value when the mission was handed out (daily missions count from here). */
  start: number;
  reward: Reward;
  claimed: boolean;
}

export interface Stats {
  carsProduced: number;
  moneyEarned: number;
  levelsBought: number;
  upgradesBought: number;
  researchDone: number;
  managersHired: number;
  offlineEarned: number;
  playTime: number;
  highestIncome: number;
  carsByType: Record<CarId, number>;
}

export interface OfflineReport {
  seconds: number;
  cappedSeconds: number;
  cars: number;
  money: number;
  rp: number;
  carsByType: Partial<Record<CarId, number>>;
}

export type BuyAmount = 1 | 10 | 100 | "max";

export interface GameState {
  version: number;
  cash: number;
  rp: number;
  empirePoints: number;
  /** Total empire points ever earned — the prestige formula subtracts it. */
  empirePointsEarned: number;
  prestigeCount: number;
  factories: Record<FactoryId, FactoryState>;
  dealers: Record<DealerId, DealerState>;
  managers: Record<ManagerId, ManagerState>;
  carModels: Record<CarId, number>;
  research: string[];
  achievements: string[];
  missions: {
    dailyDate: string;
    daily: MissionState[];
    milestonesClaimed: string[];
  };
  run: Stats;
  lifetime: Stats;
  pendingOffline: OfflineReport | null;
  settings: { buyAmount: BuyAmount };
  createdAt: number;
  runStartedAt: number;
  lastActiveAt: number;
}

/** Things that happened during a tick — consumed by the UI for juice. */
export type GameEvent =
  | { type: "sale"; factory: FactoryId; car: CarId; count: number; amount: number; premium: boolean }
  | { type: "achievement"; id: string }
  | { type: "carUnlocked"; car: CarId };
