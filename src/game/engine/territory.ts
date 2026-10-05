// Territories (config/city.ts TERRITORIES): the land around the districts,
// bought as the empire grows. Each has a price and requirements (a district,
// racing reputation, Empire Points) and an effect on the whole business.
import { BUYABLE_TERRITORIES, TERRITORY_BY_ID, type TerritoryId } from "../config/city";
import type { GameState, ZoneId } from "../types";

/** Everything open on the map: districts, bought territories, the campus with its district, racing once built. */
export function unlockedAreas(s: GameState): Set<string> {
  const out = new Set<string>([...s.city.zones, ...(s.city.territories ?? [])]);
  if (s.city.zones.includes("automotive")) out.add("campus");
  if (s.racing.unlocked) out.add("racing");
  return out;
}

export const isTerritoryOpen = (s: GameState, id: TerritoryId) => unlockedAreas(s).has(id);

export type TerritoryLock = { kind: "zone"; zone: ZoneId } | { kind: "rep"; need: number } | { kind: "ep"; need: number } | { kind: "cash"; cost: number } | null;

/** What stands between the player and a territory (null: it can be bought now). */
export function territoryLock(s: GameState, id: TerritoryId): TerritoryLock {
  const t = TERRITORY_BY_ID[id];
  if (t.zone && !s.city.zones.includes(t.zone)) return { kind: "zone", zone: t.zone };
  if (t.rep && s.racing.rep < t.rep) return { kind: "rep", need: t.rep };
  if (t.ep && s.empirePointsEarned < t.ep) return { kind: "ep", need: t.ep };
  if (s.cash < t.cost) return { kind: "cash", cost: t.cost };
  return null;
}

export function unlockTerritory(s: GameState, id: TerritoryId): boolean {
  if (!BUYABLE_TERRITORIES.some((t) => t.id === id) || isTerritoryOpen(s, id) || territoryLock(s, id)) return false;
  s.cash -= TERRITORY_BY_ID[id].cost;
  (s.city.territories ??= []).push(id);
  return true;
}

/** The next territory to aim for: the cheapest one not open yet. */
export function nextTerritory(s: GameState) {
  return BUYABLE_TERRITORIES.filter((t) => !isTerritoryOpen(s, t.id)).sort((a, b) => a.cost - b.cost)[0] ?? null;
}
