import type { CarId, CityId, ComponentId } from "../types";
import type { TerritoryId } from "./city";

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
  /**
   * A landmark works' line (config/landmarks.ts): the territory whose works makes its part.
   * An assembly plant builds it only when chosen (it is never picked on its own).
   */
  line?: TerritoryId;
  /** Built only in this city (the landmark works' lines, Nordheim's flagship). */
  city?: CityId;
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
  // the landmark works' lines, one in each territory (config/landmarks.ts): each needs its works' part
  { id: "pickup", tier: 2, name: "Workhorse Pickup", emoji: "🛻", grade: 1, extras: ["frame", "interior", "suspension", "transmission", "wheels", "brakes"], markup: 1.88, time: 70, rp: 3, city: "home", line: "raw", color: "#a16207", tagline: "Built on a frame from our own steel works.", class: "economy", body: "suv", engine: "2.8 Diesel", hp: 190, comfort: 52, design: 58, modelName: "MC Workhorse" },
  { id: "minivan", tier: 3, name: "Family Minivan", emoji: "🚐", grade: 2, extras: ["seats", "interior", "suspension", "glass", "transmission", "wheels", "brakes"], markup: 1.86, time: 80, rp: 6, city: "home", line: "suburbs", color: "#0ea5e9", tagline: "Seven seats that fold flat in one move.", class: "premium", body: "wagon", engine: "2.0 Hybrid", hp: 180, comfort: 82, design: 60, modelName: "MC Familia" },
  { id: "offroad", tier: 4, name: "Trail 4x4", emoji: "🏔️", grade: 2, extras: ["drive4x4", "interior", "suspension", "glass", "paint", "transmission", "wheels", "brakes"], markup: 2.02, time: 95, rp: 14, city: "home", line: "mountain", color: "#65a30d", tagline: "Locking differentials, real low range, no excuses.", class: "premium", body: "suv", engine: "3.0 Twin Turbo", hp: 340, comfort: 66, design: 72, modelName: "MC Summit" },
  { id: "estate", tier: 6, name: "Shooting Brake", emoji: "🧳", grade: 3, extras: ["coachwork", "interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 2.3, time: 115, rp: 70, city: "home", line: "boulevard", color: "#b45309", tagline: "A coupé's lines, a hound's boot, a coachbuilder's hands.", class: "luxury", body: "wagon", engine: "V12", hp: 560, comfort: 88, design: 90, modelName: "MC Royale" },
  { id: "hotHatch", tier: 7, name: "Export Hot Hatch", emoji: "🚤", grade: 4, extras: ["rustproof", "interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 3.1, time: 125, rp: 160, city: "home", line: "port", color: "#0f766e", tagline: "Sealed against salt air and sold on every coast.", class: "supercar", body: "hatchback", engine: "2.0 Turbo Rally", hp: 420, comfort: 60, design: 84, modelName: "MC Harbour R" },
  { id: "autonomous", tier: 10, name: "Autonomous Lounge", emoji: "🤖", grade: 5, extras: ["interior", "suspension", "glass", "paint", "electronics", "battery", "software", "transmission", "wheels", "brakes"], markup: 3.2, time: 150, rp: 2_500, requiresResearch: "self_driving", color: "#2dd4bf", tagline: "No wheel, no driver, no traffic jam it can't work through.", class: "luxury", body: "sedan", engine: "Dual Electric", hp: 650, comfort: 96, design: 90, modelName: "MC Pilot" },
  { id: "shuttle", tier: 10, name: "Robotaxi Shuttle", emoji: "🚕", grade: 5, extras: ["lidar", "interior", "suspension", "glass", "paint", "electronics", "battery", "software", "transmission", "wheels", "brakes"], markup: 3.45, time: 155, rp: 2_800, requiresResearch: "self_driving", city: "home", line: "airport", color: "#7c3aed", tagline: "Eight seats, no driver, a city's worth of rides.", class: "luxury", body: "sedan", engine: "Quad Electric", hp: 500, comfort: 94, design: 86, modelName: "MC Skyline" },
  // Nordheim's lines on its own landmark works, one in each territory (config/landmarks.ts): built only there
  { id: "oreHauler", tier: 3, name: "Ore Hauler", emoji: "⛏️", grade: 2, extras: ["frame", "interior", "suspension", "transmission", "wheels", "brakes"], markup: 1.95, time: 65, rp: 5, city: "north", line: "raw", color: "#57534e", tagline: "A mine truck's frame under a cab you can live in.", class: "economy", body: "suv", engine: "3.2 Diesel", hp: 230, comfort: 55, design: 56, modelName: "MC Malm" },
  { id: "fjordWagon", tier: 4, name: "Fjord Wagon", emoji: "🛶", grade: 2, extras: ["seats", "interior", "suspension", "glass", "paint", "transmission", "wheels", "brakes"], markup: 1.98, time: 85, rp: 13, city: "north", line: "suburbs", color: "#0369a1", tagline: "Heated seats for seven and room for the skis.", class: "premium", body: "wagon", engine: "2.0 Hybrid AWD", hp: 210, comfort: 84, design: 64, modelName: "MC Fjord" },
  { id: "snowCrawler", tier: 5, name: "Snow Crawler", emoji: "🏂", grade: 3, extras: ["drive4x4", "interior", "suspension", "glass", "paint", "transmission", "wheels", "brakes"], markup: 2.12, time: 90, rp: 32, city: "north", line: "mountain", color: "#e2e8f0", tagline: "Studded tyres, locking axles, and a heater that never gives up.", class: "luxury", body: "suv", engine: "3.0 Twin Turbo AWD", hp: 360, comfort: 68, design: 70, modelName: "MC Fjell" },
  { id: "auroraGt", tier: 7, name: "Aurora GT", emoji: "🌌", grade: 4, extras: ["coachwork", "interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 2.4, time: 120, rp: 160, city: "north", line: "boulevard", color: "#14b8a6", tagline: "Hand-shaped panels that shimmer like the northern sky.", class: "luxury", body: "coupe", engine: "V12 AWD", hp: 610, comfort: 86, design: 93, modelName: "MC Nordlys" },
  { id: "iceRally", tier: 8, name: "Ice Rally", emoji: "❄️", grade: 5, extras: ["rustproof", "drive4x4", "interior", "suspension", "glass", "paint", "electronics", "transmission", "wheels", "brakes"], markup: 3.2, time: 135, rp: 420, city: "north", line: "port", color: "#38bdf8", tagline: "Sealed against salt and snow, sideways on every frozen lake.", class: "supercar", body: "hatchback", engine: "1.6 Turbo Rally AWD", hp: 480, comfort: 58, design: 86, modelName: "MC Polar R" },
  { id: "polarShuttle", tier: 10, name: "Polar Shuttle", emoji: "🚡", grade: 5, extras: ["lidar", "drive4x4", "interior", "suspension", "glass", "paint", "electronics", "battery", "software", "transmission", "wheels", "brakes"], markup: 3.55, time: 160, rp: 3_000, requiresResearch: "self_driving", city: "north", line: "airport", color: "#6366f1", tagline: "Drives itself through the polar night, chains on.", class: "luxury", body: "sedan", engine: "Quad Electric AWD", hp: 540, comfort: 95, design: 88, modelName: "MC Tundra" },
  // Nordheim's flagship: parts from its mountain and port works, built only there
  { id: "northernLights", tier: 11, name: "Northern Lights", emoji: "🌠", grade: 5, extras: ["drive4x4", "rustproof", "interior", "suspension", "glass", "paint", "electronics", "battery", "transmission", "wheels", "brakes"], markup: 3.6, time: 145, rp: 3_500, requiresResearch: "electric_motors", city: "north", color: "#a855f7", tagline: "Four motors, all-wheel drive and a glass roof for the aurora.", class: "hypercar", body: "coupe", engine: "Quad Electric AWD", hp: 1_250, comfort: 78, design: 97, modelName: "MC Aurora" },
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

/**
 * The Nordic package: heated seats, studded tyres and cold-start kit for a model.
 * Developed once (in multiples of one car's value); Nordheim's buyers pay this much more for it.
 */
export const NORDIC = { cost: 30, value: 0.12, time: 0.03 };

/** Model refinement (Cars tab): global per-model value upgrades. */
export const CAR_MODEL = {
  /** Cost of the first refinement, in multiples of one car's value. */
  baseCostCars: 25,
  costGrowth: 4,
  valuePerLevel: 1.1,
  maxLevel: 10,
};
