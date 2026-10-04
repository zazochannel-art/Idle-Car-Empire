import type { CarId, MetricId, Reward } from "../types";

/** Declarative conditions — evaluated by engine/progress.ts. */
export type Condition =
  | { type: "metric"; metric: MetricId; target: number }
  | { type: "carType"; car: CarId; target: number }
  | { type: "income"; target: number }
  | { type: "empirePoints"; target: number };

export interface AchievementConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: Condition;
  reward: Reward;
}

/** Every unlocked achievement adds this much global income, forever. */
export const ACHIEVEMENT_INCOME_BONUS = 0.02;

export const ACHIEVEMENTS: AchievementConfig[] = [
  { id: "first_body", name: "First Body", description: "Produce your first car body.", icon: "🚙", condition: { type: "metric", metric: "bodiesProduced", target: 1 }, reward: { cash: 100 } },
  { id: "panel_beater", name: "Panel Beater", description: "Produce 100 car bodies.", icon: "🔨", condition: { type: "metric", metric: "bodiesProduced", target: 100 }, reward: { cash: 2_000 } },
  { id: "second_factory", name: "Second Factory", description: "Own 2 factories.", icon: "🏭", condition: { type: "metric", metric: "factoriesOwned", target: 2 }, reward: { cash: 5_000 } },
  { id: "first_engine", name: "It Runs!", description: "Produce your first engine.", icon: "⚙️", condition: { type: "metric", metric: "enginesProduced", target: 1 }, reward: { rp: 5 } },
  { id: "first_hire", name: "First Hire", description: "Hire your first manager.", icon: "🤝", condition: { type: "metric", metric: "managersHired", target: 1 }, reward: { cash: 1_000 } },
  { id: "logistics", name: "On the Road", description: "Transport 500 components.", icon: "🚚", condition: { type: "metric", metric: "deliveries", target: 500 }, reward: { cash: 25_000 } },
  { id: "scientist", name: "Scientist", description: "Complete 3 research projects.", icon: "🔬", condition: { type: "metric", metric: "researchDone", target: 3 }, reward: { rp: 25 } },
  { id: "millionaire", name: "Millionaire", description: "Earn $1,000,000.", icon: "💰", condition: { type: "metric", metric: "moneyEarned", target: 1e6 }, reward: { cash: 100_000 } },
  { id: "supply_chain", name: "Supply Chain", description: "Own 6 different kinds of plant.", icon: "🔗", condition: { type: "metric", metric: "plantTypes", target: 6 }, reward: { rp: 100 } },
  { id: "first_car", name: "First Car", description: "Complete your first car.", icon: "🚗", condition: { type: "metric", metric: "carsProduced", target: 1 }, reward: { rp: 200 } },
  { id: "first_customer", name: "First Customer", description: "Sell your first car.", icon: "🤝", condition: { type: "metric", metric: "carsSold", target: 1 }, reward: { incomeSeconds: 120 } },
  { id: "showroom", name: "Showroom Floor", description: "Sell 100 cars.", icon: "🏪", condition: { type: "metric", metric: "carsSold", target: 100 }, reward: { incomeSeconds: 600 } },
  { id: "mega_factory", name: "Mega Factory", description: "Upgrade a plant to Mega Factory (Level 8).", icon: "🏗️", condition: { type: "metric", metric: "maxFactoryLevel", target: 8 }, reward: { rp: 500 } },
  { id: "dealer_network", name: "Dealer Network", description: "Own 3 dealerships.", icon: "🏬", condition: { type: "metric", metric: "dealersOwned", target: 3 }, reward: { incomeSeconds: 900 } },
  { id: "ten_factories", name: "Industrial District", description: "Own 10 factories.", icon: "🌆", condition: { type: "metric", metric: "factoriesOwned", target: 10 }, reward: { rp: 1_000 } },
  { id: "tycoon", name: "Tycoon", description: "Earn $1B.", icon: "🎩", condition: { type: "metric", metric: "moneyEarned", target: 1e9 }, reward: { incomeSeconds: 900 } },
  { id: "mass_production", name: "Mass Production", description: "Produce 1,000 complete cars.", icon: "📦", condition: { type: "metric", metric: "carsProduced", target: 1_000 }, reward: { rp: 2_000 } },
  { id: "sports_debut", name: "Sports Debut", description: "Build your first sports car.", icon: "🏎️", condition: { type: "carType", car: "sports", target: 1 }, reward: { rp: 300 } },
  { id: "luxury_debut", name: "First Class", description: "Build your first luxury sedan.", icon: "🚖", condition: { type: "carType", car: "luxury", target: 1 }, reward: { rp: 1_000 } },
  { id: "supercar_maker", name: "Supercar Manufacturer", description: "Build your first supercar.", icon: "🏁", condition: { type: "carType", car: "supercar", target: 1 }, reward: { rp: 5_000 } },
  { id: "money_printer", name: "Money Printer", description: "Reach $10K profit per second.", icon: "📈", condition: { type: "income", target: 1e4 }, reward: { incomeSeconds: 300 } },
  { id: "hypercar_first", name: "Hypercar Maker", description: "Build your first hypercar.", icon: "💎", condition: { type: "carType", car: "hypercar", target: 1 }, reward: { rp: 20_000 } },
  { id: "first_expansion", name: "Going Global", description: "Complete your first Global Expansion.", icon: "🌍", condition: { type: "metric", metric: "prestigeCount", target: 1 }, reward: { rp: 1_000 } },
  { id: "automotive_empire", name: "Automotive Empire", description: "Own every kind of plant.", icon: "👑", condition: { type: "metric", metric: "plantTypes", target: 9 }, reward: { rp: 50_000 } },
  { id: "trillionaire", name: "Ten-Billionaire", description: "Earn $10B.", icon: "🏦", condition: { type: "metric", metric: "moneyEarned", target: 1e10 }, reward: { incomeSeconds: 900 } },
  { id: "electric_era", name: "Electric Era", description: "Build an Electric Performance car.", icon: "⚡", condition: { type: "carType", car: "electric", target: 1 }, reward: { rp: 100_000 } },
  { id: "hypercar_legend", name: "Hypercar Legend", description: "Build 1,000 hypercars.", icon: "🏆", condition: { type: "carType", car: "hypercar", target: 1_000 }, reward: { rp: 250_000 } },
  { id: "empire_100", name: "Dynasty", description: "Hold 100 Empire Points.", icon: "⭐", condition: { type: "empirePoints", target: 100 }, reward: { rp: 100_000 } },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementConfig> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
