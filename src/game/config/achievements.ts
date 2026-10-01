import type { CarId, MetricId, Reward } from "../types";

/** Declarative conditions — evaluated by engine/progress.ts. */
export type Condition =
  | { type: "metric"; metric: MetricId; target: number }
  | { type: "carType"; car: CarId; target: number }
  | { type: "continents"; target: number }
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
  { id: "first_car", name: "First Car", description: "Produce your first car.", icon: "🚗", condition: { type: "metric", metric: "carsProduced", target: 1 }, reward: { cash: 50 } },
  { id: "assembly_line", name: "Assembly Line", description: "Produce 100 cars.", icon: "🔩", condition: { type: "metric", metric: "carsProduced", target: 100 }, reward: { cash: 500 } },
  { id: "car_factory", name: "Car Factory", description: "Build your first factory.", icon: "🏭", condition: { type: "metric", metric: "factoriesOwned", target: 2 }, reward: { cash: 2_000 } },
  { id: "first_hire", name: "First Hire", description: "Hire your first manager.", icon: "🤝", condition: { type: "metric", metric: "managersHired", target: 1 }, reward: { cash: 500 } },
  { id: "new_model", name: "New Model", description: "Unlock a second car model.", icon: "🚘", condition: { type: "metric", metric: "carsUnlocked", target: 2 }, reward: { cash: 1_500 } },
  { id: "scientist", name: "Scientist", description: "Complete 3 research projects.", icon: "🔬", condition: { type: "metric", metric: "researchDone", target: 3 }, reward: { rp: 25 } },
  { id: "millionaire", name: "Millionaire", description: "Earn $1,000,000.", icon: "💰", condition: { type: "metric", metric: "moneyEarned", target: 1e6 }, reward: { cash: 100_000 } },
  { id: "level_10", name: "Tuned Up", description: "Upgrade a factory to level 10.", icon: "⚙️", condition: { type: "metric", metric: "maxFactoryLevel", target: 10 }, reward: { cash: 1_000 } },
  { id: "dealer_network", name: "Dealer Network", description: "Own 3 dealerships.", icon: "🏬", condition: { type: "metric", metric: "dealersOwned", target: 3 }, reward: { cash: 25_000 } },
  { id: "mass_production", name: "Mass Production", description: "Produce 10,000 cars.", icon: "📦", condition: { type: "metric", metric: "carsProduced", target: 10_000 }, reward: { cash: 250_000 } },
  { id: "sports_debut", name: "Sports Debut", description: "Produce your first sports car.", icon: "🏎️", condition: { type: "carType", car: "sports", target: 1 }, reward: { rp: 100 } },
  { id: "supercar_maker", name: "Supercar Manufacturer", description: "Produce your first supercar.", icon: "🏁", condition: { type: "carType", car: "supercar", target: 1 }, reward: { rp: 500 } },
  { id: "billion_rate", name: "Money Printer", description: "Reach $1M profit per second.", icon: "📈", condition: { type: "income", target: 1e6 }, reward: { cash: 5e7 } },
  { id: "tycoon", name: "Tycoon", description: "Earn $1B.", icon: "🎩", condition: { type: "metric", metric: "moneyEarned", target: 1e9 }, reward: { cash: 5e7 } },
  { id: "level_100", name: "Centurion", description: "Upgrade a factory to level 100.", icon: "💯", condition: { type: "metric", metric: "maxFactoryLevel", target: 100 }, reward: { cash: 5e8 } },
  { id: "first_expansion", name: "Going Global", description: "Complete your first Global Expansion.", icon: "🌍", condition: { type: "metric", metric: "prestigeCount", target: 1 }, reward: { rp: 1_000 } },
  { id: "hypercar_first", name: "Hypercar Maker", description: "Produce your first hypercar.", icon: "💎", condition: { type: "carType", car: "hypercar", target: 1 }, reward: { rp: 2_500 } },
  { id: "global_empire", name: "Global Empire", description: "Own factories on every continent.", icon: "🗺️", condition: { type: "continents", target: 6 }, reward: { cash: 1e12 } },
  { id: "trillionaire", name: "Trillionaire", description: "Earn $1T.", icon: "🏦", condition: { type: "metric", metric: "moneyEarned", target: 1e12 }, reward: { cash: 5e10 } },
  { id: "electric_era", name: "Electric Era", description: "Produce an Electric Performance car.", icon: "⚡", condition: { type: "carType", car: "electric", target: 1 }, reward: { rp: 20_000 } },
  { id: "hypercar_legend", name: "Hypercar Legend", description: "Produce 1,000 hypercars.", icon: "👑", condition: { type: "carType", car: "hypercar", target: 1_000 }, reward: { rp: 50_000 } },
  { id: "empire_100", name: "Dynasty", description: "Hold 100 Empire Points.", icon: "⭐", condition: { type: "empirePoints", target: 100 }, reward: { rp: 100_000 } },
  { id: "future_now", name: "The Future Is Now", description: "Produce a Future Car.", icon: "🚀", condition: { type: "carType", car: "future", target: 1 }, reward: { rp: 1_000_000 } },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementConfig> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
