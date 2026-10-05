// The region's fast links, laid over the street grid: a motorway ring round
// the core districts with spurs to the port, the airport and the racing
// complex, and a railway inside the ring with sidings to the rail yard, the
// raw-material basin and the industrial district. Pure geometry: the legs
// are axis-aligned, run through fields, woods and access roads (never over
// a plot), climb onto viaducts over streets, the river and the railway, and
// go into a tunnel through the northern ridge. Drawing is in
// components/map/network.ts; nothing here touches the economy.
import type { TerritoryId } from "../config/city";
import { RIVER, ROAD_STEP, blockKind, hasRoad } from "./layout";

export type Pt = [number, number];
export type WayKind = "highway" | "rail";

export interface Crossing {
  /** Distance along the way. */
  s: number;
  kind: "street" | "river" | "rail";
}

export interface Way {
  id: string;
  kind: WayKind;
  /** Centreline corners (tiles); a loop closes back to the first. */
  pts: Pt[];
  loop: boolean;
  /** Dimmed (and without traffic) while this territory is locked. */
  area?: TerritoryId;
  /** Sign at the junction where a spur leaves the ring. */
  sign?: string;
  len: number;
  /** Cumulative length at each corner. */
  acc: number[];
  crossings: Crossing[];
  /** [from, to] along the way, inside a mountain. */
  tunnels: [number, number][];
}

/** Centre of a block, in tiles. */
const C = (b: number) => b * ROAD_STEP + 4;
/** Motorway half width (two lanes each way and a central barrier). */
export const HIGHWAY_HALF = 1.5;
/** The railway runs this far inside the motorway ring. */
const RAIL_INSET = 2.3;
/** Ring corners (tiles): north arm on block row 5, east on column 17, south on row 17, west on column 6. */
export const RING = { x0: C(6), y0: C(5), x1: C(17), y1: C(17) };
/** Deck height over a street, the river or the railway. */
export const DECK = 16;
/** Flat deck either side of a crossing, then the ramp down to the ground. */
const FLAT = 1.4;
const RAMP = 3.6;

function make(id: string, kind: WayKind, pts: Pt[], loop: boolean, extra: Partial<Way> = {}): Way {
  const acc = [0];
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    acc.push(acc[i] + Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]));
  }
  return { id, kind, pts, loop, len: acc[acc.length - 1], acc, crossings: [], tunnels: [], ...extra };
}

export function legs(w: Way): { a: Pt; b: Pt; s0: number }[] {
  const out: { a: Pt; b: Pt; s0: number }[] = [];
  const n = w.loop ? w.pts.length : w.pts.length - 1;
  for (let i = 0; i < n; i++) out.push({ a: w.pts[i], b: w.pts[(i + 1) % w.pts.length], s0: w.acc[i] });
  return out;
}

/** Streets, the river and mountains met along each leg. */
function survey(w: Way) {
  for (const { a, b, s0 } of legs(w)) {
    const horiz = a[1] === b[1];
    const fixed = horiz ? a[1] : a[0];
    const lo = Math.min(horiz ? a[0] : a[1], horiz ? b[0] : b[1]);
    const hi = Math.max(horiz ? a[0] : a[1], horiz ? b[0] : b[1]);
    const sign = (horiz ? b[0] - a[0] : b[1] - a[1]) > 0 ? 1 : -1;
    const along = (v: number) => s0 + (sign > 0 ? v - (horiz ? a[0] : a[1]) : (horiz ? a[0] : a[1]) - v);
    const band = Math.floor(fixed / ROAD_STEP);
    // crossing node lines: a street (or the river) under the way
    for (let line = Math.ceil(lo / ROAD_STEP); line * ROAD_STEP <= hi; line++) {
      const c = line * ROAD_STEP + 0.5;
      if (c < lo + 0.6 || c > hi - 0.6) continue;
      if (horiz && line === RIVER) w.crossings.push({ s: along(c + 0.2), kind: "river" });
      else if (hasRoad(horiz ? "y" : "x", line, band)) w.crossings.push({ s: along(c), kind: "street" });
    }
    // mountain blocks: a tunnel
    for (let blk = Math.floor(lo / ROAD_STEP); blk * ROAD_STEP <= hi; blk++) {
      const kind = horiz ? blockKind(blk, band) : blockKind(band, blk);
      if (kind !== "mountains") continue;
      const from = Math.max(lo, blk * ROAD_STEP + 0.4);
      const to = Math.min(hi, blk * ROAD_STEP + ROAD_STEP + 0.6);
      const [p, q] = [along(from), along(to)].sort((x, y) => x - y);
      const last = w.tunnels[w.tunnels.length - 1];
      if (last && p - last[1] < 1.5) last[1] = q;
      else w.tunnels.push([p, q]);
    }
  }
  w.crossings.sort((x, y) => x.s - y.s);
}

/** Where two ways cross (one horizontal leg, one vertical), as distances along each. */
function intersections(h: Way, r: Way): [number, number][] {
  const out: [number, number][] = [];
  for (const L of legs(h))
    for (const M of legs(r)) {
      const lh = L.a[1] === L.b[1];
      const mh = M.a[1] === M.b[1];
      if (lh === mh) continue;
      const [H, V] = lh ? [L, M] : [M, L];
      const x = V.a[0];
      const y = H.a[1];
      const inH = x > Math.min(H.a[0], H.b[0]) + 0.5 && x < Math.max(H.a[0], H.b[0]) - 0.5;
      const inV = y > Math.min(V.a[1], V.b[1]) + 0.5 && y < Math.max(V.a[1], V.b[1]) - 0.5;
      if (!inH || !inV) continue;
      const sL = L.s0 + Math.abs(lh ? x - L.a[0] : y - L.a[1]);
      const sM = M.s0 + Math.abs(mh ? x - M.a[0] : y - M.a[1]);
      out.push([sL, sM]);
    }
  return out;
}

function build() {
  const { x0, y0, x1, y1 } = RING;
  const highway: Way[] = [
    make("ring", "highway", [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true),
    make("port", "highway", [[x0 - HIGHWAY_HALF, C(9)], [30, C(9)]], false, { area: "port", sign: "⚓" }),
    make("airport", "highway", [[x1 + HIGHWAY_HALF, C(13)], [132, C(13)]], false, { area: "airport", sign: "✈️" }),
    make("racing", "highway", [[x1 + HIGHWAY_HALF, y1], [129.5, y1], [129.5, 125.2]], false, { sign: "🏁" }),
  ];
  const i = RAIL_INSET;
  const rail: Way[] = [
    make("rail", "rail", [[x0 + i, y0 + i], [x1 - i, y0 + i], [x1 - i, y1 - i], [x0 + i, y1 - i]], true),
    make("yard", "rail", [[x0 + i, C(10) - 0.5], [38.5, C(10) - 0.5]], false, { area: "port" }),
    make("quarry", "rail", [[x0 + i, y1 - i], [33, y1 - i]], false, { area: "raw" }),
    make("works", "rail", [[C(13), y0 + i], [C(13), 47.6]], false),
  ];
  for (const w of [...highway, ...rail]) survey(w);
  // the motorway bridges the railway wherever they cross
  for (const h of highway)
    for (const r of rail) for (const [sh, sr] of intersections(h, r)) {
      h.crossings.push({ s: sh, kind: "rail" });
      r.crossings.push({ s: sr, kind: "rail" });
    }
  for (const w of [...highway, ...rail]) w.crossings.sort((a, b) => a.s - b.s);
  return { highway, rail };
}

export const NETWORK = build();
export const WAYS: Way[] = [...NETWORK.highway, ...NETWORK.rail];

/** Point at distance s along a way, and its heading (0 +x, 1 +y, 2 −x, 3 −y). */
export function pointAt(w: Way, s: number): { x: number; y: number; dir: 0 | 1 | 2 | 3 } {
  if (w.loop) s = ((s % w.len) + w.len) % w.len;
  else s = Math.max(0, Math.min(w.len, s));
  let i = 0;
  while (i < w.acc.length - 2 && w.acc[i + 1] < s) i++;
  const a = w.pts[i];
  const b = w.pts[(i + 1) % w.pts.length];
  const f = s - w.acc[i];
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const dir = dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
  return { x: a[0] + dx * f, y: a[1] + dy * f, dir };
}

/** Wrapped distance between two positions along a way. */
function gap(w: Way, a: number, b: number) {
  const d = Math.abs(a - b);
  return w.loop ? Math.min(d, w.len - d) : d;
}

/** Deck height at s: raised over crossings (the railway itself stays on the ground). */
export function heightAt(w: Way, s: number): number {
  if (w.kind === "rail") return 0;
  let z = 0;
  for (const c of w.crossings) {
    const d = gap(w, s, c.s) - (c.kind === "river" ? FLAT + 0.6 : FLAT);
    if (d <= 0) return DECK;
    if (d < RAMP) {
      const k = 1 - d / RAMP;
      z = Math.max(z, DECK * k * k * (3 - 2 * k));
    }
  }
  return z;
}

export function inTunnel(w: Way, s: number): boolean {
  if (w.loop) s = ((s % w.len) + w.len) % w.len;
  return w.tunnels.some(([a, b]) => s > a && s < b);
}

/** Rectangles (x0, y0, x1, y1) the ways cover, with a verge: no trees or farms there. */
export function corridors(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const w of WAYS) {
    const half = w.kind === "highway" ? HIGHWAY_HALF + 0.7 : 0.9;
    for (const { a, b } of legs(w))
      out.push([Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half]);
  }
  return out;
}
