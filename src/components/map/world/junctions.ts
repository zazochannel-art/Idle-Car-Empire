// Roundabouts at the town's junctions. Where three or more roads meet and
// there is room (no lot, building or other roundabout in the way, no bridge
// at the junction), the junction becomes a small roundabout: a ring of
// asphalt round a grass island (roads.ts) that the traffic drives round
// anticlockwise, keeping right (traffic.ts). Pure geometry, shared by the
// roads, the scenery and the traffic so all three agree.
import type { World } from "@/game/city/layout";

/** Radius of the ring's driving line, of its asphalt and of its island (world units, about 10 m each). */
export const RING_LANE = 1.0;
export const RING_OUTER = 1.36;
export const RING_ISLAND = 0.64;
/** Room kept free round the asphalt. */
const LOT_MARGIN = 0.35;
const BUILDING_MARGIN = 0.12;

export interface Roundabout {
  node: number;
  x: number;
  z: number;
  /** Driving line, asphalt edge and island edge. */
  lane: number;
  outer: number;
  island: number;
}

/** A rectangle standing on the map: centre, size and turn (like the lots and the map's buildings). */
interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

/** Distance from a point to a turned rectangle (0 inside it). */
export function rectDistance(px: number, pz: number, r: Rect): number {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const dx = px - r.x;
  const dz = pz - r.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.hypot(Math.max(0, Math.abs(u) - r.w / 2), Math.max(0, Math.abs(v) - r.d / 2));
}

/** A building of the map (world.json): its centre and footprint. */
interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * The junctions of `world` that are roundabouts, by node. `buildings` are
 * the map's own buildings (world.json): kept clear too, each as the circle
 * round its footprint (whichever way it is turned).
 */
export function roundabouts(world: World, buildings: readonly Footprint[] = []): Map<number, Roundabout> {
  const N = world.nodes.length;
  const deg = new Array<number>(N).fill(0);
  const ring = new Array<boolean>(N).fill(false);
  const shortest = new Array<number>(N).fill(Infinity);
  const bridged = new Array<boolean>(N).fill(false);
  for (const r of world.roads) {
    for (const [k, atStart] of [
      [r.a, true],
      [r.b, false],
    ] as const) {
      deg[k]++;
      if (r.ring || r.oneway) ring[k] = true;
      shortest[k] = Math.min(shortest[k], r.len);
      // a bridge deck close to the junction: no room for a ring there
      for (const [d0, d1] of r.bridges) if (atStart ? d0 < RING_OUTER + 0.6 : d1 > r.len - RING_OUTER - 0.6) bridged[k] = true;
    }
  }
  const lots: Rect[] = world.plots.map((p) => ({ x: p.x, z: p.y, w: p.w, d: p.d, rot: p.rot }));
  const room = (x: number, z: number) => {
    let free = Infinity;
    for (const l of lots) free = Math.min(free, rectDistance(x, z, l) - LOT_MARGIN);
    for (const b of buildings) free = Math.min(free, Math.hypot(x - b.x, z - b.z) - Math.hypot(b.w, b.d) / 2 - BUILDING_MARGIN);
    return free;
  };
  const candidates: { node: number; deg: number; free: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (deg[i] < 3 || ring[i] || bridged[i]) continue;
    // every road out of it must be long enough to leave the ring and reach its next junction
    if (shortest[i] < RING_OUTER + 1.0) continue;
    const [x, z] = world.nodes[i];
    const free = room(x, z);
    if (free < RING_OUTER) continue;
    candidates.push({ node: i, deg: deg[i], free });
  }
  // the busiest junctions first; two rings never crowd each other
  candidates.sort((a, b) => b.deg - a.deg || b.free - a.free);
  const out = new Map<number, Roundabout>();
  for (const c of candidates) {
    const [x, z] = world.nodes[c.node];
    let near = false;
    for (const o of out.values()) if (Math.hypot(o.x - x, o.z - z) < 2 * RING_OUTER + 1.4) near = true;
    if (near) continue;
    out.set(c.node, { node: c.node, x, z, lane: RING_LANE, outer: RING_OUTER, island: RING_ISLAND });
  }
  return out;
}

/** Normalises an angle to (-π, π]. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The way round a roundabout from one road to another, keeping right: in
 * from `from` (a point on the incoming lane, outside the ring), anticlockwise
 * on screen (x east, z south) round the island, out to `to` (a point on the
 * outgoing lane). Points on the ground plane, `from` and `to` included.
 */
export function ringPath(rb: Roundabout, from: [number, number], to: [number, number]): [number, number][] {
  const a0 = Math.atan2(from[1] - rb.z, from[0] - rb.x);
  const a1 = Math.atan2(to[1] - rb.z, to[0] - rb.x);
  // join the ring a little past the incoming road, leave it a little before the outgoing one
  const lead = 0.5;
  const start = a0 - lead;
  let end = a1 + lead;
  // anticlockwise on screen is a falling angle here (z grows southward)
  let sweep = wrap(start - end);
  if (sweep <= 0.15) sweep += 2 * Math.PI;
  end = start - sweep;
  const pts: [number, number][] = [from];
  const steps = Math.max(3, Math.ceil(sweep / 0.22));
  for (let k = 0; k <= steps; k++) {
    const a = start - (sweep * k) / steps;
    pts.push([rb.x + Math.cos(a) * rb.lane, rb.z + Math.sin(a) * rb.lane]);
  }
  pts.push(to);
  return pts;
}

/**
 * A path on the ground with its roundabouts driven round: every stretch of
 * it inside a ring's asphalt is replaced by the way round the island. Used
 * for the trucks, whose routes are worked out road by road.
 */
export function aroundRings<P extends [number, number, number]>(path: P[], rings: Iterable<Roundabout>, lift: (x: number, z: number) => number): P[] {
  let out = path;
  for (const rb of rings) {
    const R = rb.outer + 0.05;
    const inside = (p: P) => Math.hypot(p[0] - rb.x, p[2] - rb.z) < R;
    if (!out.some(inside)) continue;
    const next: P[] = [];
    let i = 0;
    while (i < out.length) {
      if (!inside(out[i]) || i === 0) {
        next.push(out[i]);
        i++;
        continue;
      }
      // a run of points inside the ring: from the last point before it to the first after it
      let j = i;
      while (j < out.length && inside(out[j])) j++;
      if (j >= out.length) {
        for (; i < j; i++) next.push(out[i]);
        break;
      }
      const a = out[i - 1];
      const b = out[j];
      const enter = edgePoint(a, out[i], rb, R);
      const leave = edgePoint(b, out[j - 1], rb, R);
      for (const [x, z] of ringPath(rb, enter, leave)) next.push([x, lift(x, z), z] as P);
      i = j;
    }
    out = next;
  }
  return out;
}

/** Where the segment from `outside` to `inside` crosses the circle of radius R round the ring's centre. */
function edgePoint(outside: [number, number, number], inside: [number, number, number], rb: Roundabout, R: number): [number, number] {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 20; k++) {
    const m = (lo + hi) / 2;
    const x = outside[0] + (inside[0] - outside[0]) * m;
    const z = outside[2] + (inside[2] - outside[2]) * m;
    if (Math.hypot(x - rb.x, z - rb.z) < R) hi = m;
    else lo = m;
  }
  return [outside[0] + (inside[0] - outside[0]) * lo, outside[2] + (inside[2] - outside[2]) * lo];
}
