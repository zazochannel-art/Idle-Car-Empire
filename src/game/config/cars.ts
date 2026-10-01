import type { CarId } from "../types";

export interface CarConfig {
  id: CarId;
  tier: number;
  name: string;
  emoji: string;
  /** Production cost per car (shown to the player; profit is what is credited). */
  cost: number;
  /** Base selling price per car. */
  price: number;
  /** Base seconds for one batch (build + delivery). */
  time: number;
  /** Research points generated per car produced. */
  rp: number;
  /** Research node that must be completed before any factory can build it. */
  requiresResearch?: string;
  color: string;
  tagline: string;
}

export const CARS: CarConfig[] = [
  { id: "compact", tier: 1, name: "City Compact", emoji: "🚗", cost: 100, price: 150, time: 10, rp: 0.1, color: "#60a5fa", tagline: "Cheap, cheerful, everywhere." },
  { id: "sedan", tier: 2, name: "Sedan", emoji: "🚘", cost: 1_000, price: 1_500, time: 20, rp: 0.4, color: "#38bdf8", tagline: "The family favourite." },
  { id: "suv", tier: 3, name: "SUV", emoji: "🚙", cost: 6_000, price: 10_000, time: 32, rp: 1.5, color: "#22d3ee", tagline: "Big, tall, profitable." },
  { id: "sports", tier: 4, name: "Sports Car", emoji: "🏎️", cost: 50_000, price: 80_000, time: 45, rp: 5, color: "#f87171", tagline: "Weekend thrills, weekday margins." },
  { id: "supercar", tier: 5, name: "Supercar", emoji: "🏁", cost: 400_000, price: 650_000, time: 70, rp: 20, color: "#fb923c", tagline: "Carbon, noise and waiting lists." },
  { id: "hypercar", tier: 6, name: "Hypercar", emoji: "💎", cost: 3_000_000, price: 5_000_000, time: 100, rp: 80, color: "#facc15", tagline: "Limited run. Unlimited price." },
  { id: "electric", tier: 7, name: "Electric Performance", emoji: "⚡", cost: 20_000_000, price: 35_000_000, time: 120, rp: 300, requiresResearch: "electric_motors", color: "#a3e635", tagline: "Silent. Brutal. Expensive." },
  { id: "future", tier: 8, name: "Future Car", emoji: "🚀", cost: 150_000_000, price: 250_000_000, time: 140, rp: 1_200, requiresResearch: "neural_design", color: "#c084fc", tagline: "Designed by AI, built by robots." },
];

export const CAR_BY_ID: Record<CarId, CarConfig> = Object.fromEntries(
  CARS.map((c) => [c.id, c]),
) as Record<CarId, CarConfig>;

export const CAR_BY_TIER: Record<number, CarConfig> = Object.fromEntries(
  CARS.map((c) => [c.tier, c]),
);

export const carProfit = (c: CarConfig) => c.price - c.cost;

/** Model refinement (Cars tab): global per-model value upgrades. */
export const CAR_MODEL = {
  /** Cost of the first refinement, in multiples of one car's base profit. */
  baseCostProfits: 40,
  costGrowth: 4,
  valuePerLevel: 1.1,
  maxLevel: 10,
};
