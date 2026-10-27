// The delivery flow, for the map's flow view: where each plant sends its
// loads (the trucks on the road say where they go now; with none out, where
// the next load would go) and whether that link runs, piles up at the plant,
// or is stuck because the plant can't make anything.
import { MARKET } from "../city/layout";
import { PLANT_BY_ID } from "../config/chain";
import type { ComponentId, GameState, PlantData, PlantType } from "../types";
import { plantsOf, recipe, type ChainSnapshot } from "./chain";

export type FlowState = "ok" | "slow" | "stuck";

export interface FlowLink {
  /** Plot ids: a plant, and a plant, a dealership ("d:<id>") or the Parts Market. */
  from: string;
  to: string;
  item: ComponentId | "car";
  state: FlowState;
}

/** A plant that makes nothing now is stuck; one whose loads wait for room downstream piles up. */
function stateOf(p: PlantData): FlowState {
  if (p.broken || p.status === "noRaw" || p.status === "noParts" || p.status === "noCash" || p.status === "noModel" || p.status === "suspended") return "stuck";
  return p.status === "full" ? "slow" : "ok";
}

export function flowLinks(s: GameState, snap: ChainSnapshot): FlowLink[] {
  const out: FlowLink[] = [];
  const seen = new Set<string>();
  // where loads are going now
  const going = new Map<string, string[]>();
  for (const sh of s.chain.shipments) {
    if (sh.back || sh.item === "raw") continue;
    const list = going.get(sh.from) ?? [];
    if (!list.includes(sh.to)) list.push(sh.to);
    going.set(sh.from, list);
  }
  const plants = plantsOf(s);
  for (const [id, b] of plants) {
    const cfg = PLANT_BY_ID[b.type as PlantType];
    const item = cfg.item ?? "car";
    let to = going.get(id) ?? [];
    if (!to.length) {
      if (snap.plants[id]?.combine) to = [MARKET];
      else if (cfg.item) {
        // the assembly plants whose car needs this part, or else the market
        to = plants.filter(([oid, o]) => o.type === "assemblyPlant" && oid !== id && !!snap.plants[oid]?.car && recipe(snap.plants[oid]!.car!).includes(cfg.item!)).map(([oid]) => oid);
        if (!to.length) to = [MARKET];
      } else to = Object.entries(s.dealers).filter(([, d]) => d.owned).map(([d]) => `d:${d}`);
    }
    const state = stateOf(b.plant);
    for (const t of to) {
      const key = `${id}>${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: id, to: t, item, state });
    }
  }
  return out;
}
