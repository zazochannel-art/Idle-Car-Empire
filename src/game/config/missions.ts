import type { MetricId, Reward } from "../types";

/** Metrics counted in dollars (shown as money). */
export const isMoneyMetric = (m: MetricId) => m === "moneyEarned" || m === "carRevenue" || m === "netProfit";

export interface MilestoneMission {
  id: string;
  title: string;
  metric: MetricId;
  target: number;
  reward: Reward;
}

/** The road from one small body shop to a car empire. Shown in order; lifetime metrics. */
export const MILESTONES: MilestoneMission[] = [
  // the manufacturing road first: parts, the second plant, the first cars, the first real profit
  { id: "m_parts_30", title: "Produce 30 components", metric: "componentsProduced", target: 30, reward: { cash: 1_500 } },
  { id: "m_bodies_100", title: "Produce 100 car bodies", metric: "bodiesProduced", target: 100, reward: { cash: 2_500 } },
  { id: "m_engine_plant", title: "Build an Engine Factory", metric: "plantTypes", target: 2, reward: { cash: 2_500 } },
  { id: "m_engine_50", title: "Produce 50 engines", metric: "enginesProduced", target: 50, reward: { cash: 10_000 } },
  { id: "m_hire_1", title: "Hire a manager", metric: "managersHired", target: 1, reward: { cash: 10_000 } },
  { id: "m_earn_100k", title: "Earn $100K", metric: "moneyEarned", target: 1e5, reward: { incomeSeconds: 300 } },
  { id: "m_car_1", title: "Assemble your first car", metric: "carsProduced", target: 1, reward: { incomeSeconds: 600 } },
  { id: "m_cars_5", title: "Produce 5 cars", metric: "carsProduced", target: 5, reward: { incomeSeconds: 300 } },
  { id: "m_ship_5", title: "Ship 5 cars to a dealer", metric: "carsShipped", target: 5, reward: { incomeSeconds: 300 } },
  { id: "m_dealer_1", title: "Build your first dealership", metric: "dealersOwned", target: 1, reward: { rp: 300 } },
  { id: "m_sold_10", title: "Sell 10 cars", metric: "carsSold", target: 10, reward: { incomeSeconds: 600 } },
  { id: "m_profit_10k", title: "Reach $10,000 net profit", metric: "netProfit", target: 10_000, reward: { incomeSeconds: 600 } },
  { id: "m_full_chain", title: "Run the whole chain: bodies, engines, tyres, assembly", metric: "fullChain", target: 1, reward: { rp: 500 } },
  { id: "m_transport_500", title: "Transport 500 components", metric: "deliveries", target: 500, reward: { incomeSeconds: 300 } },
  { id: "m_earn_1m", title: "Earn $1M", metric: "moneyEarned", target: 1e6, reward: { boost: 0.02 } },
  { id: "m_carmoney_100k", title: "Earn $100,000 from cars", metric: "carRevenue", target: 1e5, reward: { boost: 0.02 } },
  { id: "m_factory_5", title: "Build 5 factories", metric: "factoriesOwned", target: 5, reward: { rp: 200 } },
  { id: "m_cars_100", title: "Produce 100 cars", metric: "carsProduced", target: 100, reward: { incomeSeconds: 900 } },
  { id: "m_bodies_1000", title: "Produce 1,000 car bodies", metric: "bodiesProduced", target: 1_000, reward: { incomeSeconds: 600 } },
  { id: "m_research_1", title: "Complete a research project", metric: "researchDone", target: 1, reward: { incomeSeconds: 300 } },
  { id: "m_earn_10m", title: "Earn $10M", metric: "moneyEarned", target: 1e7, reward: { boost: 0.03 } },
  { id: "m_sport", title: "Unlock your first Sport car", metric: "sportUnlocked", target: 1, reward: { stars: 1 } },
  { id: "m_sold_100", title: "Sell 100 cars", metric: "carsSold", target: 100, reward: { rp: 1_000 } },
  { id: "m_earn_100m", title: "Earn $100M", metric: "moneyEarned", target: 1e8, reward: { boost: 0.03 } },
  { id: "m_cars_1000", title: "Produce 1,000 cars", metric: "carsProduced", target: 1_000, reward: { stars: 1 } },
  { id: "m_bodies_10000", title: "Produce 10,000 car bodies", metric: "bodiesProduced", target: 10_000, reward: { boost: 0.03 } },
  { id: "m_factory_10", title: "Own 10 factories", metric: "factoriesOwned", target: 10, reward: { incomeSeconds: 900 } },
  { id: "m_earn_1b", title: "Earn $1B", metric: "moneyEarned", target: 1e9, reward: { stars: 2 } },
  { id: "m_research_10", title: "Complete 10 research projects", metric: "researchDone", target: 10, reward: { incomeSeconds: 900 } },
  { id: "m_cars_10000", title: "Produce 10,000 cars", metric: "carsProduced", target: 10_000, reward: { stars: 2 } },
  { id: "m_empire", title: "Build your automotive empire", metric: "plantTypes", target: 10, reward: { rp: 50_000 } },
  { id: "m_bodies_100000", title: "Produce 100,000 car bodies", metric: "bodiesProduced", target: 100_000, reward: { boost: 0.05 } },
  { id: "m_prestige_1", title: "Complete a Global Expansion", metric: "prestigeCount", target: 1, reward: { stars: 3 } },
  { id: "m_cars_100k", title: "Produce 100,000 cars", metric: "carsProduced", target: 100_000, reward: { stars: 5 } },
  { id: "m_earn_1t", title: "Earn $10B", metric: "moneyEarned", target: 1e10, reward: { boost: 0.1 } },
  { id: "m_prestige_5", title: "Complete 5 Global Expansions", metric: "prestigeCount", target: 5, reward: { stars: 10 } },
];

/**
 * Daily missions are generated from these templates, scaled to the player's
 * current production so they are always reachable in a session.
 */
export type DailyTemplate =
  | { metric: "carsProduced" | "carsSold" | "moneyEarned" | "componentsProduced" | "deliveries" | "netProfit"; title: string; seconds: number; min: number }
  | { metric: "levelsBought" | "upgradesBought" | "researchDone" | "managersHired"; title: string; amount: number };

export const DAILY_TEMPLATES: DailyTemplate[] = [
  { metric: "componentsProduced", title: "Produce {n} components", seconds: 900, min: 30 },
  { metric: "carsProduced", title: "Produce {n} cars", seconds: 900, min: 5 },
  { metric: "deliveries", title: "Deliver {n} loads", seconds: 900, min: 30 },
  { metric: "moneyEarned", title: "Earn {n}", seconds: 1_200, min: 2_000 },
  { metric: "netProfit", title: "Make {n} net profit", seconds: 1_200, min: 2_000 },
  { metric: "carsSold", title: "Sell {n} cars", seconds: 900, min: 3 },
  { metric: "researchDone", title: "Complete {n} research project", amount: 1 },
];

export const DAILY_COUNT = 3;
/** Daily reward: this many seconds of income, plus RP. */
export const DAILY_REWARD_SECONDS = 900;
