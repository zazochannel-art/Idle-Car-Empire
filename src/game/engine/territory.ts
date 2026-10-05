// Territories (config/city.ts TERRITORIES): the land around the districts,
// bought as the empire grows. Each has a price and requirements (a district,
// racing reputation, Empire Points) and an effect on the whole business.
import { BUYABLE_TERRITORIES, LEGACY_OFFSET, TERRITORY_BY_ID, type TerritoryId } from "../config/city";
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

// ───────────────────────────── saves from the first map ─────────────────────────────

const shift = (id: string): string => {
  const c = /^c:(\d+):(\d+)$/.exec(id);
  if (c) return `c:${+c[1] + LEGACY_OFFSET * 2}:${+c[2] + LEGACY_OFFSET * 2}`;
  const b = /^b:(\d+):(\d+)$/.exec(id);
  if (b) return `b:${+b[1] + LEGACY_OFFSET}:${+b[2] + LEGACY_OFFSET}`;
  return id;
};

/**
 * A save from the first map (10×10 blocks): that map is the middle of this
 * one, so every lot moves by the same offset and keeps its neighbours, roads
 * and distances. Rewrites the plot ids in the raw save before it is read.
 */
export function remapLegacyPlots(raw: Record<string, unknown>) {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const city = raw.city;
  if (isObj(city) && isObj(city.buildings)) city.buildings = Object.fromEntries(Object.entries(city.buildings).map(([id, b]) => [shift(id), b]));
  if (isObj(raw.managers))
    for (const m of Object.values(raw.managers)) if (isObj(m) && typeof m.assignedTo === "string") m.assignedTo = shift(m.assignedTo);
  const chain = raw.chain;
  if (isObj(chain) && Array.isArray(chain.shipments))
    for (const sh of chain.shipments)
      if (isObj(sh)) {
        if (typeof sh.from === "string") sh.from = shift(sh.from);
        if (typeof sh.to === "string") sh.to = shift(sh.to);
      }
  const racing = raw.racing;
  if (isObj(racing) && Array.isArray(racing.cars)) for (const c of racing.cars) if (isObj(c) && typeof c.home === "string") c.home = shift(c.home);
}
