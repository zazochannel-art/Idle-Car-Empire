import type { CarId, ComponentId } from "../types";

export type CarClass = "economy" | "sport" | "premium" | "luxury" | "supercar" | "hypercar";
export type BodyType = "hatchback" | "sedan" | "wagon" | "coupe" | "suv" | "supercar";

export interface CarConfig {
  id: CarId;
  tier: number;
  name: string;
  emoji: string;
  /** Lowest component grade every part must have (see config/chain.ts). */
  grade: number;
  /** Extra components on top of body, engine and tyres. */
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
  /** What kind of car it is: shown in the Design studio and used by dealers. */
  class: CarClass;
  body: BodyType;
  /** Base engine, horsepower, comfort and design (0–100) before options. */
  engine: string;
  hp: number;
  comfort: number;
  design: number;
  /** Default name of the player's model on this platform. */
  modelName: string;
}

export const CARS: CarConfig[] = [
  { id: "city", tier: 1, name: "City Car", emoji: "🚗", grade: 1, extras: [], markup: 1.46, time: 60, rp: 1, color: "#60a5fa", tagline: "Cheap, cheerful, everywhere.", class: "economy", body: "hatchback", engine: "1.4", hp: 100, comfort: 45, design: 50, modelName: "MC-01" },
  { id: "sedan", tier: 2, name: "Sedan", emoji: "🚘", grade: 1, extras: ["interior", "suspension", "transmission", "wheels", "brakes"], markup: 1.7, time: 70, rp: 2, color: "#38bdf8", tagline: "The family favourite.", class: "economy", body: "sedan", engine: "2.0", hp: 150, comfort: 62, design: 55, modelName: "MC-02 Family" },
  { id: "suv", tier: 3, name: "SUV", emoji: "🚙", grade: 2, extras: ["interior", "suspension", "glass", "transmission", "wheels", "brakes"], markup: 1.8, time: 80, rp: 5, color: "#22d3ee", tagline: "Big, tall, profitable.", class: "premium", body: "suv", engine: "2.5 Turbo", hp: 220, comfort: 70, design: 60, modelName: "MC Terra" },
  { id: "sports", tier: 4, name: "Sports Car", emoji: "🏎️", grade: 2, extras: ["interior", "suspension", "glass", "paint", "transmission", "wheels", "brakes"], markup: 1.95, time: 90, rp: 12, color: "#f87171", tagline: "Weekend thrills, weekday margins.", class: "sport", body: "coupe", engine: "3.0 Flat-6", hp: 300, comfort: 50, design: 75, modelName: "MC Sport" },
  { id: "luxury", tier: 5, name: "Luxury Coupe", emoji: "🥂", grade: 3, extras: ["interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 2.1, time: 100, rp: 30, color: "#e2e8f0", tagline: "Quiet, soft and very expensive.", class: "luxury", body: "coupe", engine: "V8", hp: 320, comfort: 85, design: 80, modelName: "MC Luxury" },
  { id: "perfSuv", tier: 6, name: "Tuner GT", emoji: "🔥", grade: 3, extras: ["interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 2.25, time: 110, rp: 60, color: "#a78bfa", tagline: "Straight six, twin turbos, endless tuning.", class: "sport", body: "coupe", engine: "V8 5.0", hp: 450, comfort: 55, design: 76, modelName: "MC GT" },
  { id: "supercar", tier: 7, name: "Supercar", emoji: "🏁", grade: 4, extras: ["interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 2.45, time: 130, rp: 150, color: "#fb923c", tagline: "Carbon, noise and waiting lists.", class: "supercar", body: "coupe", engine: "4.0 Flat-6", hp: 520, comfort: 50, design: 88, modelName: "MC RS" },
  { id: "hypercar", tier: 8, name: "Hypercar", emoji: "💎", grade: 5, extras: ["interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 2.7, time: 150, rp: 400, color: "#facc15", tagline: "Limited run. Unlimited price.", class: "hypercar", body: "supercar", engine: "V8 Twin Turbo", hp: 800, comfort: 55, design: 95, modelName: "MC Hyper" },
  { id: "electric", tier: 9, name: "Electric Performance", emoji: "⚡", grade: 5, extras: ["interior", "suspension", "glass", "paint", "electronics", "battery", "transmission", "wheels", "brakes"], markup: 3, time: 140, rp: 1_000, requiresResearch: "electric_motors", color: "#a3e635", tagline: "Silent. Brutal. Expensive.", class: "hypercar", body: "coupe", engine: "Electric", hp: 1000, comfort: 72, design: 92, modelName: "MC E-Volt" },
];

export const CAR_BY_ID: Record<CarId, CarConfig> = Object.fromEntries(CARS.map((c) => [c.id, c])) as Record<CarId, CarConfig>;
export const CAR_IDS = CARS.map((c) => c.id);

/**
 * Design studio: each platform carries the player's own model. Four options
 * are developed level by level (R&D costs money): each level adds value and
 * a little assembly time, and improves the model's stats.
 */
export type DesignOption = "engine" | "interior" | "rims" | "paint";
export const DESIGN_OPTIONS: { id: DesignOption; value: number; time: number; emoji: string }[] = [
  { id: "engine", value: 0.08, time: 0.05, emoji: "⚙️" },
  { id: "interior", value: 0.06, time: 0.03, emoji: "💺" },
  { id: "rims", value: 0.04, time: 0.01, emoji: "🛞" },
  { id: "paint", value: 0.05, time: 0.02, emoji: "🎨" },
];
export const DESIGN_MAX = 3;
/** R&D price of each option level, in multiples of one car's value. */
export const DESIGN_COST = [8, 40, 200];
/** Paint colours the player can pick for a model ("" = factory colour). */
export const DESIGN_COLORS = ["", "#c3141b", "#f2681c", "#f3c014", "#1c9a3c", "#1b46b8", "#6a2fd6", "#f2f2ef", "#b3b9c0", "#121418"];

/** Model refinement (Cars tab): global per-model value upgrades. */
export const CAR_MODEL = {
  /** Cost of the first refinement, in multiples of one car's value. */
  baseCostCars: 25,
  costGrowth: 4,
  valuePerLevel: 1.1,
  maxLevel: 10,
};
