// World geometry of the Empire Map, read once from world-data.json.
//
// The world is the island map: a main island (the first districts) and five
// regions round it, joined by bridges. Its roads are a graph of junctions and
// curved road sections; the lots stand along those roads, each with its front
// (and driveway) on one road section. Every district (ZONES) and territory
// (TERRITORIES) is an area of the map. world-data.json is generated from the
// map's sources (heights, roads, lots) and holds positions in world units:
// x grows to the east, y to the south, the origin is the centre of the map,
// one unit is about 10 m. Pure data — shared by the engine (plot rules,
// delivery times) and the renderer.
import DATA from "./world-data.json";
import { PLOT_USES, ZONES, plotSizeOf, type PlotSize, type TerritoryId } from "../config/city";
import type { DealerId, StructureType, ZoneId } from "../types";

/** Plot ids of the Parts Market, the Materials Depot and the Racing District's paddock. */
export const MARKET = "m:market";
export const DEPOT = "s:depot";
export const RACING = "r:paddock";

export type PlotKind = "plot" | "dealer" | "market" | "depot" | "racing";
/** What a part of the map belongs to for unlocking: a district or a territory. */
export type AreaId = ZoneId | TerritoryId;
export type Pt = [number, number];

/** Where a lot meets its road. */
export interface Entry {
  /** Road section (index in WORLD_MAP.roads) and distance along it from its first junction. */
  edge: number;
  s: number;
  /** That point on the road's centre line. */
  x: number;
  y: number;
  /** Driveway from the road's centre line to the lot's front edge. */
  drive: number;
}

export interface Plot {
  id: string;
  zone: ZoneId;
  kind: PlotKind;
  /** Centre of the lot, its size (along its road × away from it) and its heading: the lot's front faces the road along +z after a turn of `rot` radians about the vertical. */
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
  /** Ground height of the levelled lot (metres). */
  h: number;
  dealer?: DealerId;
  starter?: boolean;
  /** A big industrial lot. */
  big?: boolean;
  /** What may be built here (plots only): each plot is zoned for one kind of building. */
  use?: StructureType;
  /** Size class (plots only). */
  size?: PlotSize;
  /** Order in which plots are offered: earlier districts first, nearest first. */
  rank?: number;
  entry: Entry;
}

export interface Road {
  /** Junctions at either end (indices in WORLD_MAP.nodes). */
  a: number;
  b: number;
  /** Carriageway width. */
  w: number;
  /** One-way from a to b (the roundabout). */
  oneway: boolean;
  /** Part of the roundabout's ring. */
  ring: boolean;
  /** A country road or a bridge between the islands: trucks drive it faster than town streets. */
  fast: boolean;
  len: number;
  /** Centre line from a to b, and the distance along it at each point. */
  pts: Pt[];
  acc: number[];
  /** [from, to] along the road: bridge decks. */
  bridges: [number, number][];
  /** Districts and territories the road runs through: it carries traffic once one of them is open. */
  areas: AreaId[];
}

export interface AreaInfo {
  /** Where its name goes and where the camera looks. */
  c: Pt;
  /** Its bounding box. */
  min: Pt;
  max: Pt;
}

export interface World {
  /** Width and depth of the map. */
  size: Pt;
  nodes: Pt[];
  roads: Road[];
  plots: Plot[];
  plotById: Record<string, Plot>;
  areas: Record<AreaId, AreaInfo>;
  /** The Racing District's circuit (closed loop). */
  circuit: Pt[];
}

interface RawPlot {
  id: string;
  zone: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
  h: number;
  edge: number;
  s: number;
  drive: number;
  dealer?: string;
  starter?: boolean;
  big?: boolean;
}

interface RawRoad {
  a: number;
  b: number;
  w: number;
  oneway: boolean;
  ring: boolean;
  fast: boolean;
  len: number;
  pts: number[][];
  bridges: number[][];
  areas: string[];
}

/** Point at distance s along a polyline with cumulative lengths `acc`, and its direction. */
export function along(pts: Pt[], acc: number[], s: number): { x: number; y: number; tx: number; ty: number } {
  const n = pts.length;
  s = Math.max(0, Math.min(acc[n - 1], s));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (acc[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = acc[hi] - acc[lo] || 1;
  const f = (s - acc[lo]) / seg;
  const tx = (b[0] - a[0]) / seg;
  const ty = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, tx, ty };
}

function cumulative(pts: Pt[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}

function build(): World {
  const raw = DATA as unknown as { size: number[]; nodes: number[][]; edges: RawRoad[]; plots: RawPlot[]; areas: Record<string, { c: number[]; min: number[]; max: number[] }>; circuit: number[][] };
  const nodes = raw.nodes.map((p) => [p[0], p[1]] as Pt);
  const roads: Road[] = raw.edges.map((e) => {
    const pts = e.pts.map((p) => [p[0], p[1]] as Pt);
    // the road's ends sit exactly on its junctions
    pts[0] = [...nodes[e.a]] as Pt;
    pts[pts.length - 1] = [...nodes[e.b]] as Pt;
    const acc = cumulative(pts);
    const k = acc[acc.length - 1] / (e.len || acc[acc.length - 1]);
    return { a: e.a, b: e.b, w: e.w, oneway: e.oneway, ring: e.ring, fast: !!e.fast, len: acc[acc.length - 1], pts, acc, bridges: e.bridges.map((q) => [q[0] * k, q[1] * k] as [number, number]), areas: e.areas as AreaId[] };
  });
  const plots: Plot[] = raw.plots.map((p) => {
    const road = roads[p.edge];
    const at = along(road.pts, road.acc, p.s);
    return {
      id: p.id,
      zone: p.zone as ZoneId,
      kind: p.kind as PlotKind,
      x: p.x,
      y: p.y,
      w: p.w,
      d: p.d,
      rot: p.rot,
      h: p.h,
      ...(p.dealer ? { dealer: p.dealer as DealerId } : {}),
      ...(p.starter ? { starter: true } : {}),
      ...(p.big ? { big: true } : {}),
      entry: { edge: p.edge, s: Math.min(p.s, road.len), x: at.x, y: at.y, drive: Math.max(0.3, p.drive) },
    };
  });

  const areas = Object.fromEntries(Object.entries(raw.areas).map(([id, a]) => [id, { c: [a.c[0], a.c[1]] as Pt, min: [a.min[0], a.min[1]] as Pt, max: [a.max[0], a.max[1]] as Pt }])) as Record<AreaId, AreaInfo>;

  // Zone every plot for one kind of building, nearest first: the starting town from the first plant, the others from their centre.
  const starter = plots.find((p) => p.starter);
  let rank = 0;
  for (const z of [...ZONES].sort((a, b) => a.stage - b.stage)) {
    const anchor = z.id === "town" && starter ? { x: starter.x, y: starter.y } : { x: areas[z.id].c[0], y: areas[z.id].c[1] };
    const near = (p: Plot) => Math.hypot(p.x - anchor.x, p.y - anchor.y) + (p.x + p.y) * 1e-4;
    const mine = plots.filter((p) => p.zone === z.id && p.kind === "plot").sort((a, b) => (a.starter ? -1 : b.starter ? 1 : near(a) - near(b)));
    let ci = 0;
    let bi = 0;
    const uses = PLOT_USES[z.id];
    for (const p of mine) {
      p.rank = rank++;
      p.size = plotSizeOf(z.id, !!p.big);
      if (p.starter) p.use = "bodyWorks";
      else if (p.big) p.use = uses.big[bi++ % uses.big.length];
      else p.use = uses.cells[ci++ % uses.cells.length];
    }
  }

  const plotById = Object.fromEntries(plots.map((p) => [p.id, p]));
  return { size: [raw.size[0], raw.size[1]], nodes, roads, plots, plotById, areas, circuit: raw.circuit.map((p) => [p[0], p[1]] as Pt) };
}

export const WORLD_MAP: World = build();

export const STARTER_PLOT = WORLD_MAP.plots.find((p) => p.starter)!.id;

export function plotOf(id: string): Plot | undefined {
  return WORLD_MAP.plotById[id];
}

export function dealerPlot(id: DealerId): Plot | undefined {
  return WORLD_MAP.plotById[`d:${id}`];
}

/** Centre of a district (where its name goes). */
export function zoneCenterTile(zone: ZoneId): { x: number; y: number } {
  const c = WORLD_MAP.areas[zone].c;
  return { x: c[0], y: c[1] };
}

/** Centre of a territory. */
export function territoryCenterTile(t: TerritoryId): { x: number; y: number } {
  const c = WORLD_MAP.areas[t].c;
  return { x: c[0], y: c[1] };
}

/** A road carries traffic once a district or territory it runs through is open. */
export function roadOpen(i: number, unlocked: ReadonlySet<string>): boolean {
  return WORLD_MAP.roads[i].areas.some((a) => unlocked.has(a));
}

// ───────────────────────────── routes ─────────────────────────────

/**
 * Delivery times are calibrated on the first map's distances: this many map
 * units of town street count as one "tile" of road for the engine (the main
 * island's lots sit about as far apart as the first map's did). Country
 * roads and bridges count less (FAST_ROAD): the regions beyond the bridges
 * are further away, but trucks drive faster out there.
 */
export const UNITS_PER_TILE = 2;
export const FAST_ROAD = 0.4;
/** Time-weighted length of part of a road. */
const cost = (i: number, units: number) => (WORLD_MAP.roads[i].fast ? units * FAST_ROAD : units);
/** Length of a driveway in tiles, counted at both ends of a trip. */
export const DRIVEWAY = 0.6;

const N = WORLD_MAP.nodes.length;
/** Shortest distances between junctions (respecting one-way roads) and the road taken first. */
const DIST: Float64Array = new Float64Array(N * N).fill(Infinity);
const NEXT: Int32Array = new Int32Array(N * N).fill(-1);
{
  for (let i = 0; i < N; i++) DIST[i * N + i] = 0;
  WORLD_MAP.roads.forEach((r, i) => {
    const c = cost(i, r.len);
    if (c < DIST[r.a * N + r.b]) {
      DIST[r.a * N + r.b] = c;
      NEXT[r.a * N + r.b] = i;
    }
    if (!r.oneway && c < DIST[r.b * N + r.a]) {
      DIST[r.b * N + r.a] = c;
      NEXT[r.b * N + r.a] = i;
    }
  });
  // Floyd–Warshall; NEXT holds the first road of the best way from i to j
  for (let k = 0; k < N; k++)
    for (let i = 0; i < N; i++) {
      const dik = DIST[i * N + k];
      if (dik === Infinity) continue;
      for (let j = 0; j < N; j++) {
        const d = dik + DIST[k * N + j];
        if (d < DIST[i * N + j] - 1e-9) {
          DIST[i * N + j] = d;
          NEXT[i * N + j] = NEXT[i * N + k];
        }
      }
    }
}

/** Ways to leave a lot's road: [junction, weighted distance to it]; the way toward `a` only on two-way roads. */
function exits(e: Entry): [number, number][] {
  const r = WORLD_MAP.roads[e.edge];
  const out: [number, number][] = [[r.b, cost(e.edge, r.len - e.s)]];
  if (!r.oneway) out.push([r.a, cost(e.edge, e.s)]);
  return out;
}

/** Ways to reach a lot from a junction: [junction, weighted distance from it]. */
function arrivals(e: Entry): [number, number][] {
  const r = WORLD_MAP.roads[e.edge];
  const out: [number, number][] = [[r.a, cost(e.edge, e.s)]];
  if (!r.oneway) out.push([r.b, cost(e.edge, r.len - e.s)]);
  return out;
}

export interface RoadRoute {
  /** Total length in tiles (engine units), driveways included. */
  length: number;
  /** Junctions where the route leaves the first road and joins the last one; null when both lots share a road section. */
  from: number | null;
  to: number | null;
}

function bestRoute(a: Entry, b: Entry): { units: number; from: number | null; to: number | null } {
  const ra = WORLD_MAP.roads[a.edge];
  let best = { units: Infinity, from: null as number | null, to: null as number | null };
  if (a.edge === b.edge && (!ra.oneway || b.s >= a.s)) best = { units: cost(a.edge, Math.abs(b.s - a.s)), from: null, to: null };
  for (const [n1, d1] of exits(a))
    for (const [n2, d2] of arrivals(b)) {
      const u = d1 + DIST[n1 * N + n2] + d2;
      if (u < best.units - 1e-9) best = { units: u, from: n1, to: n2 };
    }
  return best;
}

/**
 * The shortest way by road from one lot to another: out of the driveway,
 * along the roads (one-way round the roundabout) and into the other
 * driveway. The engine times deliveries with its length and the map drives
 * trucks along it, so both always agree.
 */
export function roadRoute(a: Entry, b: Entry): RoadRoute {
  const r = bestRoute(a, b);
  return { length: r.units / UNITS_PER_TILE + 2 * DRIVEWAY, from: r.from, to: r.to };
}

/** The roads between two junctions, in order (empty when they are the same). */
export function roadsBetween(from: number, to: number): { road: number; forward: boolean }[] {
  const out: { road: number; forward: boolean }[] = [];
  let at = from;
  for (let guard = 0; at !== to && guard < N + 2; guard++) {
    const i = NEXT[at * N + to];
    if (i < 0) break;
    const r = WORLD_MAP.roads[i];
    const forward = r.a === at;
    out.push({ road: i, forward });
    at = forward ? r.b : r.a;
  }
  return out;
}

/** The centre line of the route between two lots (road points only, from entry to entry). */
export function routeLine(a: Entry, b: Entry): Pt[] {
  const r = bestRoute(a, b);
  const roads = WORLD_MAP.roads;
  const slice = (i: number, s0: number, s1: number): Pt[] => {
    const rd = roads[i];
    const out: Pt[] = [];
    const p0 = along(rd.pts, rd.acc, s0);
    out.push([p0.x, p0.y]);
    if (s1 > s0) {
      for (let k = 0; k < rd.pts.length; k++) if (rd.acc[k] > s0 + 1e-6 && rd.acc[k] < s1 - 1e-6) out.push(rd.pts[k]);
    } else {
      for (let k = rd.pts.length - 1; k >= 0; k--) if (rd.acc[k] < s0 - 1e-6 && rd.acc[k] > s1 + 1e-6) out.push(rd.pts[k]);
    }
    const p1 = along(rd.pts, rd.acc, s1);
    out.push([p1.x, p1.y]);
    return out;
  };
  if (r.from === null || r.to === null) return slice(a.edge, a.s, b.s);
  const ra = roads[a.edge];
  const rb = roads[b.edge];
  const line: Pt[] = slice(a.edge, a.s, r.from === ra.b ? ra.len : 0);
  for (const { road, forward } of roadsBetween(r.from, r.to)) line.push(...slice(road, forward ? 0 : roads[road].len, forward ? roads[road].len : 0).slice(1));
  line.push(...slice(b.edge, r.to === rb.a ? 0 : rb.len, b.s).slice(1));
  return line;
}

/** The Racing District: its paddock lot and the circuit. */
export const RACING_AREA = {
  paddock: WORLD_MAP.plotById[RACING],
  circuit: WORLD_MAP.circuit,
};
