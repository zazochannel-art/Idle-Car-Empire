import type { GameState } from "../types";
import { canOpenDealers } from "./actions";
import { hasPlant, plantLock } from "./chain";

export type TipId = "start" | "engine" | "market" | "dealers";

/**
 * The first-session coach: one short tip at a time, picked from where the
 * player is in the chain. A dismissed tip never comes back.
 */
export function currentTip(s: GameState): TipId | null {
  const open = (id: TipId) => !s.tips.includes(id);
  // veterans (and players back from an expansion) don't need the tour
  if (s.prestigeCount > 0 || s.lifetime.carsSold >= 50) return null;
  if (canOpenDealers(s)) return open("dealers") ? "dealers" : null;
  if (hasPlant(s, "engineFactory")) return open("market") && !hasPlant(s, "assemblyPlant") ? "market" : null;
  if (plantLock(s, "engineFactory") === null) return open("engine") ? "engine" : null;
  return open("start") ? "start" : null;
}
