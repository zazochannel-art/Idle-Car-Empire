import type { MetricId, Reward } from "../types";

export interface MilestoneMission {
  id: string;
  title: string;
  metric: MetricId;
  target: number;
  reward: Reward;
}

/** The road from one small body shop to a car empire. Shown in order; lifetime metrics. */
export const MILESTONES: MilestoneMission[] = [
  { id: "m_bodies_100", title: "Produce 100 car bodies", metric: "bodiesProduced", target: 100, reward: { cash: 2_500 } },
  { id: "m_factory_2", title: "Build your second factory", metric: "factoriesOwned", target: 2, reward: { cash: 5_000 } },
  { id: "m_engine_1", title: "Produce your first engine", metric: "enginesProduced", target: 1, reward: { rp: 10 } },
  { id: "m_hire_1", title: "Hire a manager", metric: "managersHired", target: 1, reward: { cash: 10_000 } },
  { id: "m_transport_500", title: "Transport 500 components", metric: "deliveries", target: 500, reward: { incomeSeconds: 300 } },
  { id: "m_factory_4", title: "Own 4 factories", metric: "factoriesOwned", target: 4, reward: { rp: 50 } },
  { id: "m_research_1", title: "Complete a research project", metric: "researchDone", target: 1, reward: { incomeSeconds: 300 } },
  { id: "m_earn_10m", title: "Earn $10M", metric: "moneyEarned", target: 1e7, reward: { incomeSeconds: 600 } },
  { id: "m_assembly", title: "Build your first assembly factory", metric: "plantTypes", target: 4, reward: { rp: 300 } },
  { id: "m_car_1", title: "Complete your first car", metric: "carsProduced", target: 1, reward: { incomeSeconds: 600 } },
  { id: "m_dealer_1", title: "Build your first dealership", metric: "dealersOwned", target: 1, reward: { rp: 300 } },
  { id: "m_sold_1", title: "Sell your first car", metric: "carsSold", target: 1, reward: { incomeSeconds: 600 } },
  { id: "m_sold_100", title: "Sell 100 cars", metric: "carsSold", target: 100, reward: { rp: 1_000 } },
  { id: "m_factory_10", title: "Own 10 factories", metric: "factoriesOwned", target: 10, reward: { incomeSeconds: 900 } },
  { id: "m_earn_1b", title: "Earn $1B", metric: "moneyEarned", target: 1e9, reward: { incomeSeconds: 900 } },
  { id: "m_cars_1000", title: "Produce 1,000 complete cars", metric: "carsProduced", target: 1_000, reward: { rp: 5_000 } },
  { id: "m_research_10", title: "Complete 10 research projects", metric: "researchDone", target: 10, reward: { incomeSeconds: 900 } },
  { id: "m_empire", title: "Build your automotive empire", metric: "plantTypes", target: 10, reward: { rp: 50_000 } },
  { id: "m_prestige_1", title: "Complete a Global Expansion", metric: "prestigeCount", target: 1, reward: { rp: 2_000 } },
  { id: "m_cars_100k", title: "Produce 100,000 cars", metric: "carsProduced", target: 100_000, reward: { rp: 100_000 } },
  { id: "m_earn_1t", title: "Earn $1T", metric: "moneyEarned", target: 1e12, reward: { incomeSeconds: 1_800 } },
  { id: "m_prestige_5", title: "Complete 5 Global Expansions", metric: "prestigeCount", target: 5, reward: { rp: 250_000 } },
];

/**
 * Daily missions are generated from these templates, scaled to the player's
 * current production so they are always reachable in a session.
 */
export type DailyTemplate =
  | { metric: "carsProduced" | "moneyEarned" | "componentsProduced" | "deliveries"; title: string; seconds: number; min: number }
  | { metric: "levelsBought" | "upgradesBought" | "researchDone" | "managersHired"; title: string; amount: number };

export const DAILY_TEMPLATES: DailyTemplate[] = [
  { metric: "componentsProduced", title: "Produce {n} components", seconds: 900, min: 30 },
  { metric: "carsProduced", title: "Produce {n} cars", seconds: 900, min: 5 },
  { metric: "deliveries", title: "Deliver {n} loads", seconds: 900, min: 30 },
  { metric: "moneyEarned", title: "Earn {n}", seconds: 1_200, min: 2_000 },
  { metric: "levelsBought", title: "Buy {n} plant upgrades", amount: 15 },
  { metric: "upgradesBought", title: "Buy {n} upgrades", amount: 8 },
  { metric: "researchDone", title: "Complete {n} research project", amount: 1 },
];

export const DAILY_COUNT = 3;
/** Daily reward: this many seconds of income, plus RP. */
export const DAILY_REWARD_SECONDS = 900;
