import type { CarId, ComponentId } from "../types";

export interface CarConfig {
  id: CarId;
  tier: number;
  name: string;
  emoji: string;
  /** Lowest component grade every part must have (see config/chain.ts). */
  grade: number;
  /** Extra components on top of body, engine, interior, glass, tyres, paint. */
  extras: ComponentId[];
  /** Sale price = value of the parts × this. */
  markup: number;
  /** Seconds on the assembly line at Level 1. */
  time: number;
  /** Research points per car built. */
  rp: number;
  /** Research node that must be completed first. */
  requiresResearch?: string;
  color: string;
  tagline: string;
}

export const CARS: CarConfig[] = [
  { id: "city", tier: 1, name: "City Car", emoji: "🚗", grade: 1, extras: [], markup: 1.46, time: 60, rp: 1, color: "#60a5fa", tagline: "Cheap, cheerful, everywhere." },
  { id: "sedan", tier: 2, name: "Sedan", emoji: "🚘", grade: 1, extras: [], markup: 1.7, time: 70, rp: 2, color: "#38bdf8", tagline: "The family favourite." },
  { id: "suv", tier: 3, name: "SUV", emoji: "🚙", grade: 2, extras: [], markup: 1.8, time: 80, rp: 5, color: "#22d3ee", tagline: "Big, tall, profitable." },
  { id: "sports", tier: 4, name: "Sports Car", emoji: "🏎️", grade: 2, extras: ["electronics"], markup: 1.95, time: 90, rp: 12, color: "#f87171", tagline: "Weekend thrills, weekday margins." },
  { id: "luxury", tier: 5, name: "Luxury Sedan", emoji: "🚖", grade: 3, extras: ["electronics"], markup: 2.1, time: 100, rp: 30, color: "#e2e8f0", tagline: "Quiet, soft and very expensive." },
  { id: "perfSuv", tier: 6, name: "Performance SUV", emoji: "🛻", grade: 3, extras: ["electronics"], markup: 2.25, time: 110, rp: 60, color: "#a78bfa", tagline: "Two tonnes, three seconds to 100." },
  { id: "supercar", tier: 7, name: "Supercar", emoji: "🏁", grade: 4, extras: ["electronics"], markup: 2.45, time: 130, rp: 150, color: "#fb923c", tagline: "Carbon, noise and waiting lists." },
  { id: "hypercar", tier: 8, name: "Hypercar", emoji: "💎", grade: 5, extras: ["electronics"], markup: 2.7, time: 150, rp: 400, color: "#facc15", tagline: "Limited run. Unlimited price." },
  { id: "electric", tier: 9, name: "Electric Performance", emoji: "⚡", grade: 5, extras: ["electronics", "battery"], markup: 3, time: 140, rp: 1_000, requiresResearch: "electric_motors", color: "#a3e635", tagline: "Silent. Brutal. Expensive." },
];

export const CAR_BY_ID: Record<CarId, CarConfig> = Object.fromEntries(CARS.map((c) => [c.id, c])) as Record<CarId, CarConfig>;
export const CAR_IDS = CARS.map((c) => c.id);

/** Model refinement (Cars tab): global per-model value upgrades. */
export const CAR_MODEL = {
  /** Cost of the first refinement, in multiples of one car's value. */
  baseCostCars: 25,
  costGrowth: 4,
  valuePerLevel: 1.1,
  maxLevel: 10,
};
