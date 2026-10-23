// Unlock moments: a new car model or a new kind of plant becoming available
// is celebrated with a card and a one-off cash bonus (once per run).
import { PLANT_TYPES } from "../config/chain";
import type { GameState, PlantType } from "../types";
import { hasPlant, plantLock } from "./chain";
import { payReward } from "./materials";

/** The bonus is this many seconds of steady income… */
export const UNLOCK_BONUS_SECONDS = 120;
/** …and never less than this. */
export const UNLOCK_BONUS_MIN = 1_500;

export type UnlockKind = "car" | "plant";
export const unlockKey = (kind: UnlockKind, id: string) => `${kind}:${id}`;

/** Cash paid for celebrating an unlock now. */
export function unlockBonus(s: GameState): number {
  return Math.max(UNLOCK_BONUS_MIN, Math.max(0, s.chain.steady ?? s.chain.rate) * UNLOCK_BONUS_SECONDS);
}

/** Plant types that can be built now and have never been built (the new ones on the menu). */
export function openPlantTypes(s: GameState): Set<PlantType> {
  return new Set(PLANT_TYPES.filter((t) => !hasPlant(s, t) && plantLock(s, t) === null));
}

/** Pays the bonus for an unlock once per run. Returns the amount (0 if already claimed). */
export function claimUnlock(s: GameState, kind: UnlockKind, id: string): number {
  const key = unlockKey(kind, id);
  if (s.unlocks.includes(key)) return 0;
  const bonus = unlockBonus(s);
  s.unlocks.push(key);
  payReward(s, bonus);
  return bonus;
}
