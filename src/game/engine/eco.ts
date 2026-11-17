// The environment (the Economy screen): the city's plants pollute, more as they grow, and from
// ECO.fromEarned the city sets a limit that rises slowly as the company grows. Under the limit the
// company carries a green label (more income); over it, a fine that grows with the excess, up to
// ECO.maxFine. The eco programme (filters, heat recovery, solar roofs…) cuts the pollution a tenth
// a level. The clean plants (batteries, software, hydrogen, sensors) pollute half as much.
import type { GameState, PlantType } from "../types";
import { plantsOf } from "./plants";

export const ECO = {
  fromEarned: 10e6,
  /** The limit at fromEarned, and how much it rises for every tenfold earned since. */
  limitBase: 30,
  limitPerDecade: 10,
  maxLevel: 8,
  cutPerLevel: 0.1,
  /** Under the limit: income bonus. Over it: fine per 100% over, never more than maxFine. */
  greenBonus: 0.03,
  finePerOver: 0.1,
  maxFine: 0.1,
  /** The programme's next level costs this many seconds of steady income, × growth per level. */
  costSeconds: 900,
  costGrowth: 1.8,
  clean: ["batteryFactory", "softwareStudio", "hydrogenWorks", "mobilityHub"] as PlantType[],
};

/** True once the city watches the company's pollution. */
export const ecoActive = (s: Pick<GameState, "lifetime">) => s.lifetime.moneyEarned >= ECO.fromEarned;

export const ecoLevel = (s: Pick<GameState, "eco">) => Math.max(0, Math.min(ECO.maxLevel, Math.floor(s.eco ?? 0)));

/** The city's plants' pollution now: their levels added up (clean plants count half), less the programme's cut. */
export function pollution(s: GameState): number {
  let raw = 0;
  for (const [, b] of plantsOf(s)) raw += b.level * (ECO.clean.includes(b.type as PlantType) ? 0.5 : 1);
  return raw * Math.max(0.2, 1 - ECO.cutPerLevel * ecoLevel(s));
}

/** The city's limit for a company that has earned this much. */
export function pollutionLimit(earned: number): number {
  return ECO.limitBase + ECO.limitPerDecade * Math.log10(Math.max(1, earned / ECO.fromEarned));
}

/** What the environment does to income: ×(1 + green bonus) under the limit, × (1 − fine) over it, ×1 before it applies. */
export function ecoIncomeMult(s: GameState): number {
  if (!ecoActive(s)) return 1;
  const over = pollution(s) / pollutionLimit(s.lifetime.moneyEarned) - 1;
  if (over <= 0) return 1 + ECO.greenBonus;
  return 1 - Math.min(ECO.maxFine, over * ECO.finePerOver);
}

/** The next programme level's price (null at the top), from the company's steady income ($/s). */
export function ecoCost(s: Pick<GameState, "eco">, incomePerSec: number): number | null {
  const lv = ecoLevel(s);
  if (lv >= ECO.maxLevel) return null;
  return Math.round(Math.max(1000, incomePerSec * ECO.costSeconds) * ECO.costGrowth ** lv);
}

export function buyEco(s: GameState, incomePerSec: number): boolean {
  if (!ecoActive(s)) return false;
  const cost = ecoCost(s, incomePerSec);
  if (cost === null || !(s.cash >= cost)) return false;
  s.cash -= cost;
  s.eco = ecoLevel(s) + 1;
  return true;
}
