// Visiting another player's empire on the map: their public card says what
// stands on each lot of the island, which districts and territories are open,
// the dealerships they own and whether the Racing District is built
// (supabase/migrations/0018). From that the map draws their island as it
// draws the player's own, from a game state made for the visit alone (never
// saved, never ticked).
import { WORLD_MAP } from "../city/layout";
import { SPEC_BY_ID, STRUCTURE_BY_ID, TERRITORIES, ZONES, type TerritoryId } from "../config/city";
import { isPlantType } from "../config/chain";
import type { BuildingState, DealerId, GameState, Specialization, StructureType, ZoneId } from "../types";
import { newPlant } from "./chain";
import { createInitialState } from "./state";

export interface VisitMap {
  /** What stands on each lot: plot id, building type, level, a garage's specialization. */
  buildings: { plot: string; type: string; level: number; spec: string }[];
  zones: string[];
  territories: string[];
  dealers: string[];
  racing: boolean;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** The card's map (null: the card is older than visits in 3D, or has none). */
export function parseVisitMap(raw: unknown): VisitMap | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (!Array.isArray(m.b)) return null;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 32)).slice(0, max) : []);
  return {
    buildings: m.b
      .filter((x): x is unknown[] => Array.isArray(x) && x.length >= 3)
      .slice(0, 150)
      .map((x) => ({ plot: str(x[0], 32), type: str(x[1], 32), level: Math.max(1, Math.min(15, Math.floor(Number(x[2]) || 1))), spec: str(x[3], 16) })),
    zones: list(m.z, 20),
    territories: list(m.t, 20),
    dealers: list(m.d, 12),
    racing: m.r === true,
  };
}

/** A game state that shows the visited empire on the map (only what the card says). */
export function visitState(map: VisitMap, now: number): GameState {
  const s = createInitialState(now);
  const zones = new Set<string>(ZONES.map((z) => z.id));
  const territories = new Set<string>(TERRITORIES.map((t) => t.id));
  s.city.zones = ["town", ...map.zones.filter((z) => zones.has(z) && z !== "town")] as ZoneId[];
  s.city.territories = map.territories.filter((t) => territories.has(t)) as TerritoryId[];
  s.city.buildings = {};
  let garages = 0;
  for (const b of map.buildings) {
    const plot = WORLD_MAP.plotById[b.plot];
    if (!plot || plot.kind !== "plot" || !(b.type in STRUCTURE_BY_ID)) continue;
    const type = b.type as StructureType;
    const bs: BuildingState = { type, level: b.level };
    if (isPlantType(type)) bs.plant = newPlant();
    if (type === "garage") bs.garage = { no: ++garages, spec: (b.spec in SPEC_BY_ID ? b.spec : "repair") as Specialization, workers: 0, facilities: [], carry: 0, serviced: 0, earned: 0 };
    s.city.buildings[b.plot] = bs;
  }
  s.city.land = Object.keys(s.city.buildings);
  for (const id of map.dealers) if (id in s.dealers) s.dealers[id as DealerId].owned = true;
  s.racing.unlocked = map.racing;
  s.chain.firstCar = true;
  return s;
}
