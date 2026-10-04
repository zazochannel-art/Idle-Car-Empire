// What things cost to make. A plant pays wages, energy and maintenance for
// every second it runs; its units cost those plus the materials they use.
// Prices are set from the *standard* cost (a Level 1, manual plant buying at
// list price), so upgrades that make a plant cheaper to run widen the margin
// instead of changing the price.
import { CARRIER_CAPACITY, GRADES, PLANT_BY_ID } from "../config/chain";
import type { CarConfig } from "../config/cars";
import {
  ASSEMBLY_TIME,
  CLASS_MARGIN,
  COMPONENT_TIME,
  CREW,
  DEALER_FEE,
  DELIVERY_FEE,
  MAINTENANCE,
  MATERIAL_BY_ID,
  PARTS_MARGIN,
  POWER,
  POWER_SYSTEM,
  ROBOTS_PER_LINE,
  SALES_TAX,
  TRIP_FEE,
  WAGE,
  WORKERS_PER_LINE,
  type MaterialId,
} from "../config/economy";
import type { ComponentId, PlantType } from "../types";
import { unitMaterials } from "./materials";

export interface OpRates {
  /** $/s while the plant runs. */
  labor: number;
  energy: number;
  maintenance: number;
  workers: number;
  robots: number;
  kw: number;
}

/** Running costs of a plant per second of work. */
export function opRates(type: PlantType, level: number, automation: number, lines: number, power: number, speed = 1): OpRates {
  const tier = Math.max(0, Math.min(WORKERS_PER_LINE.length - 1, automation));
  const crew = CREW[type] ?? 1;
  const workers = lines * WORKERS_PER_LINE[tier] * crew;
  const robots = lines * ROBOTS_PER_LINE[tier];
  const booth = type === "paintFactory" || type === "assemblyPlant" ? POWER.paintBooth * lines : 0;
  const kw = POWER.plant + POWER.line * lines + POWER.robot * robots + booth;
  const cut = Math.max(0, 1 - POWER_SYSTEM.cut * Math.min(POWER_SYSTEM.max, power));
  return {
    workers,
    robots,
    kw,
    labor: workers * WAGE,
    // faster machines draw more power and wear faster
    energy: ((kw * POWER.pricePerKwMin) / 60) * cut * speed,
    maintenance: MAINTENANCE.base * (1 + MAINTENANCE.perLevel * (level - 1)) * Math.sqrt(speed),
  };
}

export const opTotal = (r: OpRates) => r.labor + r.energy + r.maintenance;

/** Seconds to make one component unit at Level 1 (grade slows it). */
export function componentTime(c: ComponentId, grade: number): number {
  return COMPONENT_TIME[c] * GRADES[Math.max(0, Math.min(GRADES.length - 1, grade - 1))].time;
}

/** Seconds on the final assembly line and in quality control for one car, at Level 1. */
export function assemblyTime(car: CarConfig): number {
  return (ASSEMBLY_TIME.assembly + ASSEMBLY_TIME.qc) * (car.time / 60);
}

/** Materials of one unit at list price. */
export function materialsCost(type: PlantType, grade: number): number {
  let c = 0;
  for (const [m, n] of Object.entries(unitMaterials(type, grade)) as [MaterialId, number][]) c += n * (MATERIAL_BY_ID[m].price + DELIVERY_FEE);
  return c;
}

const makerOf = (c: ComponentId): PlantType => (Object.values(PLANT_BY_ID).find((p) => p.item === c)!.id);

/** Standard cost of one component: list-price materials and a Level 1 manual plant's running cost. */
export function componentStdCost(c: ComponentId, grade: number): number {
  const type = makerOf(c);
  const run = opTotal(opRates(type, 1, 0, 1, 0)) * componentTime(c, grade);
  return materialsCost(type, grade) + run;
}

/**
 * What the Parts Market pays for a component: a thin margin over its cost,
 * grossed up for tax. Bonuses (research, managers, prestige…) multiply the
 * margin, never the cost: they make a business more profitable without
 * making money out of nothing.
 */
export function componentPrice(c: ComponentId, grade: number, marginMult = 1): number {
  return (componentStdCost(c, grade) * (1 + PARTS_MARGIN * marginMult)) / (1 - SALES_TAX);
}

/** Standard cost of a car: its parts, final assembly and QC, and the trip to the dealer. */
export function carStdCost(car: CarConfig, parts: ComponentId[]): number {
  const comps = parts.reduce((a, c) => a + componentStdCost(c, car.grade), 0);
  const line = opTotal(opRates("assemblyPlant", 1, 0, 1, 0)) * assemblyTime(car);
  const trip = TRIP_FEE.carrier / CARRIER_CAPACITY[0];
  return comps + line + trip;
}

/** List price of a car at the dealer (before dealer markup): cost × (1 + its class margin × bonuses), grossed up for fees and tax. */
export function carListPrice(car: CarConfig, parts: ComponentId[], marginMult = 1): number {
  return (carStdCost(car, parts) * (1 + CLASS_MARGIN[car.class] * marginMult)) / (1 - DEALER_FEE - SALES_TAX);
}
