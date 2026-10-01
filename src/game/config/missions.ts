import type { MetricId, Reward } from "../types";

export interface MilestoneMission {
  id: string;
  title: string;
  metric: MetricId;
  target: number;
  reward: Reward;
}

/** Shown in order; the next unclaimed ones are always visible. Lifetime metrics. */
export const MILESTONES: MilestoneMission[] = [
  { id: "m_cars_10", title: "Produce 10 cars", metric: "carsProduced", target: 10, reward: { cash: 300 } },
  { id: "m_hire_1", title: "Hire a manager", metric: "managersHired", target: 1, reward: { cash: 500 } },
  { id: "m_earn_5k", title: "Earn $5,000", metric: "moneyEarned", target: 5_000, reward: { cash: 1_500 } },
  { id: "m_cars_100", title: "Produce 100 cars", metric: "carsProduced", target: 100, reward: { cash: 1_000 } },
  { id: "m_factory_2", title: "Own 2 factories", metric: "factoriesOwned", target: 2, reward: { rp: 10 } },
  { id: "m_level_10", title: "Upgrade a factory to level 10", metric: "maxFactoryLevel", target: 10, reward: { rp: 15 } },
  { id: "m_research_1", title: "Complete a research project", metric: "researchDone", target: 1, reward: { cash: 2_500 } },
  { id: "m_dealer_2", title: "Own 2 dealerships", metric: "dealersOwned", target: 2, reward: { cash: 5_000 } },
  { id: "m_earn_1m", title: "Earn $1M", metric: "moneyEarned", target: 1e6, reward: { cash: 100_000 } },
  { id: "m_cars_1000", title: "Produce 1,000 cars", metric: "carsProduced", target: 1_000, reward: { rp: 100 } },
  { id: "m_factory_3", title: "Own 3 factories", metric: "factoriesOwned", target: 3, reward: { cash: 50_000 } },
  { id: "m_upgrades_50", title: "Buy 50 upgrades", metric: "upgradesBought", target: 50, reward: { rp: 250 } },
  { id: "m_level_25", title: "Upgrade a factory to level 25", metric: "maxFactoryLevel", target: 25, reward: { cash: 25_000 } },
  { id: "m_hire_4", title: "Hire 4 managers", metric: "managersHired", target: 4, reward: { rp: 500 } },
  { id: "m_factory_4", title: "Own 4 factories", metric: "factoriesOwned", target: 4, reward: { cash: 2e6 } },
  { id: "m_earn_1b", title: "Earn $1B", metric: "moneyEarned", target: 1e9, reward: { cash: 5e7 } },
  { id: "m_research_10", title: "Complete 10 research projects", metric: "researchDone", target: 10, reward: { cash: 1e8 } },
  { id: "m_prestige_1", title: "Complete a Global Expansion", metric: "prestigeCount", target: 1, reward: { rp: 2_000 } },
  { id: "m_cars_100k", title: "Produce 100,000 cars", metric: "carsProduced", target: 100_000, reward: { rp: 10_000 } },
  { id: "m_factory_6", title: "Own 6 factories", metric: "factoriesOwned", target: 6, reward: { cash: 5e9 } },
  { id: "m_level_100", title: "Upgrade a factory to level 100", metric: "maxFactoryLevel", target: 100, reward: { cash: 1e9 } },
  { id: "m_earn_1t", title: "Earn $1T", metric: "moneyEarned", target: 1e12, reward: { rp: 50_000 } },
  { id: "m_factory_8", title: "Own 8 factories", metric: "factoriesOwned", target: 8, reward: { cash: 5e11 } },
  { id: "m_prestige_5", title: "Complete 5 Global Expansions", metric: "prestigeCount", target: 5, reward: { rp: 250_000 } },
  { id: "m_factory_10", title: "Own all 10 factories", metric: "factoriesOwned", target: 10, reward: { cash: 5e15 } },
];

/**
 * Daily missions are generated from these templates, scaled to the player's
 * current production so they are always reachable in a session.
 */
export type DailyTemplate =
  | { metric: "carsProduced"; title: string; seconds: number; min: number }
  | { metric: "moneyEarned"; title: string; seconds: number; min: number }
  | { metric: "levelsBought" | "upgradesBought" | "researchDone" | "managersHired"; title: string; amount: number };

export const DAILY_TEMPLATES: DailyTemplate[] = [
  { metric: "carsProduced", title: "Produce {n} cars", seconds: 900, min: 50 },
  { metric: "moneyEarned", title: "Earn {n}", seconds: 1_200, min: 5_000 },
  { metric: "levelsBought", title: "Buy {n} factory levels", amount: 25 },
  { metric: "upgradesBought", title: "Buy {n} upgrades", amount: 6 },
  { metric: "researchDone", title: "Complete {n} research project", amount: 1 },
];

export const DAILY_COUNT = 3;
/** Daily reward: this many seconds of income, plus RP. */
export const DAILY_REWARD_SECONDS = 900;
