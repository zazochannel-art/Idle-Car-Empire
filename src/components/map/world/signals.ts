// Traffic lights: at the town's plain junctions (the roundabouts need none)
// and at the pedestrian crossings along the longer town streets. Each
// junction's ways in are paired into phases (straight across from each
// other go together) and the lights give one phase green at a time, then
// amber, then a moment of red all round; a crossing has two phases, the
// cars' and the walkers'. They answer the traffic: a phase
// keeps green while nobody waits elsewhere, and a waiting truck (a real
// shipment, on the clock) or a pedestrian at the crossing calls the change
// early. Pure logic, shared by the traffic, the pedestrians and the lamps.
import { along, type World } from "@/game/city/layout";
import type { Roundabout } from "./junctions";

/** Seconds of green at least and at most (while others wait), of amber, and of red all round. */
export const GREEN_MIN = 2.5;
export const GREEN_MAX = 7;
export const AMBER = 1.2;
export const ALL_RED = 0.7;

export type Light = "green" | "amber" | "red";

/** One way into a junction: the road, the way along it into the junction, and its heading there. */
export interface Arm {
  road: number;
  /** +1 when the road ends at the junction (driving along it toward b), −1 when it starts there. */
  dir: 1 | -1;
  /** Direction of travel into the junction (ground plane, x east and z south). */
  tx: number;
  tz: number;
  phase: number;
}

export interface Signal {
  /** The junction (−1 at a crossing along a street). */
  node: number;
  x: number;
  z: number;
  arms: Arm[];
  phases: number;
  /** The phase with right of way (green or amber), and the light it shows; "red" between two phases. */
  phase: number;
  state: Light;
  /** Seconds in this state. */
  t: number;
  /** Who waits at each phase this frame (set by the traffic and the pedestrians, cleared by update). */
  demand: boolean[];
  urgent: boolean[];
}

/** The plain junctions that get lights: three roads or more, no roundabout, off the old ring, in town. */
export function signalJunctions(world: World, rings: ReadonlyMap<number, Roundabout>, urban: (road: number) => boolean = () => true): Signal[] {
  const N = world.nodes.length;
  const deg = new Array<number>(N).fill(0);
  const ring = new Array<boolean>(N).fill(false);
  const town = new Array<number>(N).fill(0);
  world.roads.forEach((r, i) => {
    for (const k of [r.a, r.b]) {
      deg[k]++;
      if (r.ring || r.oneway) ring[k] = true;
      if (urban(i)) town[k]++;
    }
  });
  const out: Signal[] = [];
  for (let n = 0; n < N; n++) {
    if (deg[n] < 3 || ring[n] || rings.has(n) || town[n] < 2) continue;
    const arms: Arm[] = [];
    world.roads.forEach((r, i) => {
      if (r.a === r.b || (r.a !== n && r.b !== n)) return;
      const dir: 1 | -1 = r.b === n ? 1 : -1;
      // the heading a little way out, so a bend right at the junction doesn't skew it
      const back = Math.min(0.8, r.len / 2);
      const p = along(r.pts, r.acc, dir > 0 ? r.len - back : back);
      const [nx, nz] = world.nodes[n];
      const L = Math.hypot(nx - p.x, nz - p.y) || 1;
      arms.push({ road: i, dir, tx: (nx - p.x) / L, tz: (nz - p.y) / L, phase: -1 });
    });
    // ways in straight across from each other share a phase
    let phases = 0;
    for (const a of arms) {
      if (a.phase >= 0) continue;
      a.phase = phases;
      let best: Arm | null = null;
      let bestDot = -0.75;
      for (const b of arms) {
        if (b.phase >= 0) continue;
        const dot = a.tx * b.tx + a.tz * b.tz;
        if (dot < bestDot) {
          bestDot = dot;
          best = b;
        }
      }
      if (best) best.phase = phases;
      phases++;
    }
    if (phases < 2) continue;
    const [x, z] = world.nodes[n];
    // junctions start at different points of their cycle, so the town's lights don't all change together
    const phase = n % phases;
    out.push({ node: n, x, z, arms, phases, phase, state: "green", t: ((n * 7919) % 50) / 10, demand: new Array(phases).fill(false), urgent: new Array(phases).fill(false) });
  }
  return out;
}

/** A crossing with lights along a street: its road, where along it (share of its length) and its lights. */
export interface Crossing {
  road: number;
  f: number;
  signal: Signal;
}

/** What the crossings need to know of a road beyond the layout: in town, on the old ring, its bridge decks (shares of its length). */
export interface RoadInfo {
  urban: boolean;
  ring: boolean;
  decks: [number, number][];
}

/** Streets at least this long get a crossing with lights; this far at least from either end, from a lot's drive and from a bridge. */
const CROSS_MIN_LEN = 12;
const CROSS_END_ROOM = 3.2;
const CROSS_DRIVE_ROOM = 1.3;
const CROSS_DECK_ROOM = 1.2;

/** Where the town's streets get a crossing with lights (one per long street, two on the longest). */
export function crossingSpots(world: World, info: (road: number) => RoadInfo): { road: number; f: number }[] {
  const out: { road: number; f: number }[] = [];
  world.roads.forEach((r, i) => {
    const ri = info(i);
    if (!ri.urban || ri.ring || r.ring || r.oneway || r.len < CROSS_MIN_LEN) return;
    const drives = world.plots.filter((p) => p.entry.edge === i).map((p) => p.entry.s);
    const wanted = r.len >= 30 ? [1 / 3, 2 / 3] : [1 / 2];
    for (const f0 of wanted) {
      // the spot itself, or a little either side of it, clear of drives and bridges
      for (const df of [0, 0.06, -0.06, 0.12, -0.12]) {
        const f = f0 + df;
        const s = f * r.len;
        if (s < CROSS_END_ROOM || s > r.len - CROSS_END_ROOM) continue;
        if (drives.some((d) => Math.abs(d - s) < CROSS_DRIVE_ROOM)) continue;
        if (ri.decks.some(([a, b]) => s > a * r.len - CROSS_DECK_ROOM && s < b * r.len + CROSS_DECK_ROOM)) continue;
        out.push({ road: i, f });
        break;
      }
    }
  });
  return out;
}

export class Signals {
  /** Junction lights, then every crossing's. */
  readonly list: Signal[];
  readonly crossings: Crossing[];
  private byNode = new Map<number, Signal>();
  private byRoad = new Map<number, Crossing[]>();

  constructor(world: World, rings: ReadonlyMap<number, Roundabout>, info?: (road: number) => RoadInfo) {
    const junctions = signalJunctions(world, rings, info ? (i) => info(i).urban : undefined);
    for (const s of junctions) this.byNode.set(s.node, s);
    this.crossings = info
      ? crossingSpots(world, info).map(({ road, f }, k) => {
          const r = world.roads[road];
          const p = along(r.pts, r.acc, f * r.len);
          const arms: Arm[] = [
            { road, dir: 1, tx: p.tx, tz: p.ty, phase: 0 },
            { road, dir: -1, tx: -p.tx, tz: -p.ty, phase: 0 },
          ];
          const signal: Signal = { node: -1, x: p.x, z: p.y, arms, phases: 2, phase: 0, state: "green", t: (k % 5) * 0.7, demand: [false, false], urgent: [false, false] };
          return { road, f, signal };
        })
      : [];
    for (const c of this.crossings) {
      const l = this.byRoad.get(c.road) ?? [];
      l.push(c);
      this.byRoad.set(c.road, l);
    }
    this.list = [...junctions, ...this.crossings.map((c) => c.signal)];
  }

  /** The crossings with lights along a road. */
  crossingsOn(road: number): readonly Crossing[] {
    return this.byRoad.get(road) ?? [];
  }

  /** May walkers cross `road` at these lights now (its cars have red, and another phase has its green)? */
  walk(s: Signal, road: number): boolean {
    const a = s.arms.find((x) => x.road === road);
    return !!a && s.phase !== a.phase && s.state === "green";
  }

  /** What an arm of a signal shows. */
  show(s: Signal, a: Arm): Light {
    return a.phase === s.phase && s.state !== "red" ? s.state : "red";
  }

  at(node: number): Signal | undefined {
    return this.byNode.get(node);
  }

  arm(node: number, road: number): Arm | undefined {
    return this.byNode.get(node)?.arms.find((a) => a.road === road);
  }

  /** The light a road shows at a junction (green where there is none). */
  light(node: number, road: number): Light {
    const s = this.byNode.get(node);
    if (!s) return "green";
    const a = s.arms.find((x) => x.road === road);
    if (!a) return "green";
    return this.show(s, a);
  }

  /** Someone waits at an arm of a signal (a truck: `urgent`, it is on the clock). */
  call(s: Signal, a: Arm, urgent = false) {
    s.demand[a.phase] = true;
    if (urgent) s.urgent[a.phase] = true;
  }

  /** A pedestrian waits to cross `road` (or is on the crossing): every other phase is called (its own must stay red). */
  callCrossing(s: Signal, road: number) {
    const a = s.arms.find((x) => x.road === road);
    if (!a) return;
    for (let p = 0; p < s.phases; p++) if (p !== a.phase) s.demand[p] = true;
  }

  update(dt: number) {
    for (const s of this.list) {
      step(s, dt);
      s.demand.fill(false);
      s.urgent.fill(false);
    }
  }
}

/** One junction's lights, `dt` seconds on. */
export function step(s: Signal, dt: number) {
  s.t += dt;
  if (s.state === "green") {
    let other = false;
    let urgent = false;
    for (let p = 0; p < s.phases; p++)
      if (p !== s.phase && s.demand[p]) {
        other = true;
        if (s.urgent[p]) urgent = true;
      }
    const mine = s.demand[s.phase];
    if (other && ((s.t >= GREEN_MIN && (!mine || urgent)) || s.t >= GREEN_MAX)) {
      s.state = "amber";
      s.t = 0;
    }
  } else if (s.state === "amber") {
    if (s.t >= AMBER) {
      s.state = "red";
      s.t = 0;
    }
  } else if (s.t >= ALL_RED) {
    // on to the next phase someone waits at (the next in turn if nobody does)
    let next = (s.phase + 1) % s.phases;
    for (let k = 1; k <= s.phases; k++) {
      const p = (s.phase + k) % s.phases;
      if (s.demand[p] && p !== s.phase) {
        next = p;
        break;
      }
    }
    s.phase = next;
    s.state = "green";
    s.t = 0;
  }
}
