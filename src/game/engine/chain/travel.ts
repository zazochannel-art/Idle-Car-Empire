// Travel times and starting a shipment.
import { DOCK_TIME, TRAFFIC_ALLOWANCE } from "../../config/chain";
import type { GameState, Shipment } from "../../types";
import { WORLD_MAP, plotOf, roadRoute } from "../../city/layout";

// ───────────────────────────── travel ─────────────────────────────

/** Road distances between lots on each city's map (a map never changes: each pair is worked out once). */
const DISTANCES = new WeakMap<object, Map<string, number>>();
/** Road distance between two lots, in tiles: the route the trucks drive on the map. */
export function distance(from: string, to: string): number {
  let known = DISTANCES.get(WORLD_MAP);
  if (!known) DISTANCES.set(WORLD_MAP, (known = new Map()));
  const key = `${from}>${to}`;
  let d = known.get(key);
  if (d === undefined) {
    const a = plotOf(from)?.entry;
    const b = plotOf(to)?.entry;
    d = !a || !b ? 20 : roadRoute(a, b).length;
    known.set(key, d);
  }
  return d;
}

export function legTime(from: string, to: string, pace: number, dock = 1) {
  return DOCK_TIME * dock + distance(from, to) * pace * (1 + TRAFFIC_ALLOWANCE);
}

export function incoming(s: GameState, to: string, item: Shipment["item"]): number {
  // a plain loop: the offline settlement asks this for every plant on every step
  let n = 0;
  for (const sh of s.chain.shipments) if (!sh.back && sh.to === to && sh.item === item) n += sh.qty;
  return n;
}


export function ship(s: GameState, sh: Omit<Shipment, "id" | "t" | "back">) {
  s.chain.shipments.push({ ...sh, id: s.chain.nextShip++, t: 0, back: false });
}
