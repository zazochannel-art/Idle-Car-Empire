// The Design studio: the player's own model on each car platform. Options
// (engine, interior, rims, paint) are developed with money and change the
// model's stats, its sale value and its time on the assembly line.
import { CAR_BY_ID, DESIGN_COLORS, DESIGN_COST, DESIGN_MAX, DESIGN_OPTIONS, type CarConfig, type DesignOption } from "../config/cars";
import type { CarDesign, CarId, GameState } from "../types";

export interface DesignStats {
  hp: number;
  comfort: number;
  quality: number;
  design: number;
  /** Multipliers applied to the car's sale value and assembly time. */
  valueMult: number;
  timeMult: number;
}

export const designOf = (s: GameState, id: CarId): CarDesign => s.designs[id];

/**
 * Stats of a model. Quality comes from the grade of its components (better
 * parts, better car) plus interior and paint work; it also lifts the price.
 */
export function designStats(car: CarConfig, d: CarDesign, grade = car.grade): DesignStats {
  let valueMult = 1;
  let timeMult = 1;
  for (const o of DESIGN_OPTIONS) {
    valueMult *= 1 + o.value * d[o.id];
    timeMult *= 1 + o.time * d[o.id];
  }
  const quality = Math.min(100, Math.round(35 + 13 * grade + 3 * d.interior + 2 * d.paint));
  valueMult *= 0.9 + quality / 500;
  return {
    hp: Math.round(car.hp * (1 + 0.15 * d.engine)),
    comfort: Math.min(100, car.comfort + 8 * d.interior),
    quality,
    design: Math.min(100, car.design + 4 * d.rims + 4 * d.paint),
    valueMult,
    timeMult,
  };
}

/** R&D price of the next level of an option, from the model's base value. */
export function developCost(baseValue: number, d: CarDesign, option: DesignOption): number | null {
  const lvl = d[option];
  if (lvl >= DESIGN_MAX) return null;
  return baseValue * DESIGN_COST[lvl];
}

export function develop(s: GameState, id: CarId, option: DesignOption, cost: number | null): boolean {
  const d = s.designs[id];
  if (cost === null || !Number.isFinite(cost) || s.cash < cost || d[option] >= DESIGN_MAX) return false;
  s.cash -= cost;
  d[option] += 1;
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  return true;
}

export function renameDesign(s: GameState, id: CarId, name: string): boolean {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 24);
  s.designs[id].name = clean || CAR_BY_ID[id].modelName;
  return true;
}

export function setDesignColor(s: GameState, id: CarId, color: string): boolean {
  if (!DESIGN_COLORS.includes(color)) return false;
  s.designs[id].color = color;
  return true;
}

/** Global Expansion keeps names and colours but the developed options start over. */
export function resetDesignLevels(s: GameState) {
  for (const d of Object.values(s.designs)) d.engine = d.interior = d.rims = d.paint = 0;
}
