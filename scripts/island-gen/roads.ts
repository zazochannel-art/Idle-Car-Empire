// Nordheim's roads as curves over the land (with their bridges), and the lots
// along them: each lot faces its road across a short driveway, on dry, level
// ground, clear of every other road and lot, inside a district.
import { ZONE_IDS, type AreaId } from "./design";
import { lakeDepth, type Land } from "./land";
import { LOT_TARGET, NODES, ROADS, SPECIAL_LOTS, STARTER_NEAR, WIDTH, type RoadSpec } from "./network";
import { catmull, fbm, lengthOf, pointAt, polylineDist, type P } from "./noise";

export interface BuiltRoad {
  spec: RoadSpec;
  a: number;
  b: number;
  /** Centre line, a point every 0.2 units. */
  pts: P[];
  w: number;
  len: number;
  /** Stretches over water: [from, to, kind] (1 over the sea: an arched bridge). */
  decks: [number, number, number][];
}

export interface Lot {
  id: string;
  kind: "plot" | "dealer" | "market" | "depot" | "racing";
  zone: AreaId;
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
  h: number;
  road: number;
  s: number;
  drive: number;
  big?: boolean;
  dealer?: string;
  starter?: boolean;
}

export const NODE_IDS = Object.keys(NODES);

export function buildRoads(land: Land): BuiltRoad[] {
  return ROADS.map((spec, i) => {
    const A = NODES[spec.a];
    const B = NODES[spec.b];
    const ctrl: P[] = [A, ...(spec.via ?? []), B];
    // country roads wander a little
    if (!spec.via && !spec.urban) {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const k = fbm(i * 3.7, 1.3, 2, 99) * 0.08 * L;
      const nx = -(B[1] - A[1]) / L;
      const ny = (B[0] - A[0]) / L;
      ctrl.splice(1, 0, [(A[0] + B[0]) / 2 + nx * k, (A[1] + B[1]) / 2 + ny * k]);
    }
    const pts = catmull(ctrl, 0.2);
    pts[0] = [...A] as P;
    pts[pts.length - 1] = [...B] as P;
    const len = lengthOf(pts);
    // over water: bridge decks (arched over the sea, flat over lakes and streams)
    const decks: [number, number, number][] = [];
    let start = -1;
    let sea = false;
    for (let k = 0; k < pts.length; k++) {
      const [x, y] = pts[k];
      const wet = land.depthAt(x, y) < 0.4 || lakeDepth(x, y).d > -0.3;
      const s = k * (len / (pts.length - 1));
      if (wet && start < 0) {
        start = s;
        sea = land.depthAt(x, y) < 0.4;
      }
      if ((!wet || k === pts.length - 1) && start >= 0) {
        decks.push([Math.max(0, start - 0.6), Math.min(len, s + 0.6), sea ? 1 : 0]);
        start = -1;
      }
    }
    return { spec, a: NODE_IDS.indexOf(spec.a), b: NODE_IDS.indexOf(spec.b), pts, w: WIDTH[spec.cls], len, decks };
  });
}

/** Corners of a lot (its front edge, +z after the turn, faces the road). */
export function corners(l: { x: number; y: number; w: number; d: number; rot: number }, grow = 0): P[] {
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  const w = l.w / 2 + grow;
  const d = l.d / 2 + grow;
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([u, v]) => [l.x + u * c + v * s, l.y - u * s + v * c] as P);
}

/** Two convex polygons overlap (separating axes). */
function overlap(a: P[], b: P[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const nx = y2 - y1;
      const ny = x1 - x2;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, y] of a) {
        const v = x * nx + y * ny;
        amin = Math.min(amin, v);
        amax = Math.max(amax, v);
      }
      for (const [x, y] of b) {
        const v = x * nx + y * ny;
        bmin = Math.min(bmin, v);
        bmax = Math.max(bmax, v);
      }
      if (amax < bmin || bmax < amin) return false;
    }
  return true;
}

/** Points round a rectangle's edge (every ~0.5) and its centre. */
function outline(cs: P[]): P[] {
  const out: P[] = [[(cs[0][0] + cs[2][0]) / 2, (cs[0][1] + cs[2][1]) / 2]];
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = cs[i];
    const [x2, y2] = cs[(i + 1) % 4];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.5));
    for (let k = 0; k < n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
  }
  return out;
}

export interface Placed {
  lots: Lot[];
  report: string[];
}

export function placeLots(land: Land, roads: BuiltRoad[], keepOut: { pts: P[]; r: number }[] = []): Placed {
  const lots: Lot[] = [];
  const report: string[] = [];
  const clear = (l: Omit<Lot, "id" | "zone" | "h">, own: number): string | null => {
    const cs = corners(l);
    for (const [x, y] of outline(cs)) {
      if (land.depthAt(x, y) < 1.3) return "water";
      if (lakeDepth(x, y).d > -0.8) return "lake";
    }
    const rim = outline(corners(l, 0.25));
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      for (const [x, y] of rim) {
        const { d } = polylineDist(x, y, r.pts);
        if (d < r.w / 2 + (i === own ? 0.15 : 0.45)) return `road ${r.spec.name}`;
      }
    }
    for (const k of keepOut) for (const [x, y] of rim) if (polylineDist(x, y, k.pts).d < k.r) return "kept out";
    const grown = corners(l, 0.35);
    for (const o of lots) if (overlap(grown, corners(o))) return `lot ${o.id}`;
    return null;
  };
  const make = (road: number, s: number, side: 1 | -1, w: number, d: number) => {
    const r = roads[road];
    const p = pointAt(r.pts, s);
    // the side's normal; the lot's front faces back across it to the road
    const nx = -p.ty * side;
    const ny = p.tx * side;
    const drive = r.w / 2 + 0.69;
    const x = p.x + nx * (drive + d / 2);
    const y = p.y + ny * (drive + d / 2);
    const rot = Math.atan2(-nx, -ny);
    return { kind: "plot" as Lot["kind"], x, y, w, d, rot, road, s, drive };
  };
  const roadOf = (a: string, b: string) => roads.findIndex((r) => (r.spec.a === a && r.spec.b === b) || (r.spec.a === b && r.spec.b === a));
  const level = (l: { x: number; y: number }) => Math.round(Math.max(2.2, land.height(l.x, l.y)) * 100) / 100;

  // the special lots first: the market, the depot, the dealers, the paddock
  for (const sp of SPECIAL_LOTS) {
    const road = roadOf(sp.road[0], sp.road[1]);
    if (road < 0) {
      report.push(`!! ${sp.id}: no road ${sp.road.join("-")}`);
      continue;
    }
    const size = sp.size ?? 3;
    const s = roads[road].spec.a === sp.road[0] ? sp.s : roads[road].len - sp.s;
    const side = (roads[road].spec.a === sp.road[0] ? sp.side : -sp.side) as 1 | -1;
    const l = make(road, s, side, size, size + 0.001);
    const why = clear(l, road);
    if (why) report.push(`!! ${sp.id}: ${why}`);
    const zone = land.areaOf(l.x, l.y) ?? "town";
    lots.push({ ...l, kind: sp.kind, id: sp.id, zone: sp.kind === "racing" ? "town" : zone, h: level(l), ...(sp.dealer ? { dealer: sp.dealer } : {}) });
  }

  // big lots where the network asks for them, then the cells
  const count: Record<string, { cells: number; big: number }> = {};
  for (const z of ZONE_IDS) count[z] = { cells: 0, big: 0 };
  roads.forEach((r, road) => {
    for (const b of r.spec.lots?.big ?? []) {
      const l = make(road, b.s, b.side, 6, 6.002);
      const zone = land.areaOf(l.x, l.y);
      const why = clear(l, road) ?? (!zone || !ZONE_IDS.includes(zone) ? `not in a district (${zone})` : null);
      if (why) {
        report.push(`!! big lot on ${r.spec.name} (${r.spec.a}-${r.spec.b}) at ${b.s}: ${why}`);
        continue;
      }
      count[zone!].big++;
      lots.push({ ...l, id: `b:${zone}:${count[zone!].big - 1}`, zone: zone!, h: level(l), big: true });
    }
  });
  const why: Record<string, Record<string, number>> = {};
  roads.forEach((r, road) => {
    const spec = r.spec.lots;
    if (!spec) return;
    const tally = (why[`${r.spec.name} ${r.spec.a}-${r.spec.b}`] ??= {});
    const margin = spec.margin ?? 2;
    const every = spec.every ?? 4;
    for (const side of spec.sides)
      for (let s = margin + 1.5; s <= r.len - margin - 1.5; s += every) {
        const l = make(road, s, side, 3, 3.001);
        const zone = land.areaOf(l.x, l.y);
        if (!zone || !ZONE_IDS.includes(zone)) {
          tally[`in ${zone}`] = (tally[`in ${zone}`] ?? 0) + 1;
          continue;
        }
        if (count[zone].cells >= LOT_TARGET[zone].cells) {
          tally[`${zone} full`] = (tally[`${zone} full`] ?? 0) + 1;
          continue;
        }
        const no = clear(l, road);
        if (no) {
          const k = no.startsWith("lot") ? "lot" : no;
          tally[k] = (tally[k] ?? 0) + 1;
          continue;
        }
        tally[`ok ${zone}`] = (tally[`ok ${zone}`] ?? 0) + 1;
        count[zone].cells++;
        lots.push({ ...l, id: `c:${zone}:${count[zone].cells - 1}`, zone, h: level(l) });
      }
  });
  if (process.env.ISLAND_WHY) for (const [k, v] of Object.entries(why)) report.push(`   ${k}: ${JSON.stringify(v)}`);
  // the first plant: the town lot nearest the depot and the market
  const town = lots.filter((l) => l.kind === "plot" && l.zone === "town" && !l.big);
  town.sort((a, b) => Math.hypot(a.x - STARTER_NEAR[0], a.y - STARTER_NEAR[1]) - Math.hypot(b.x - STARTER_NEAR[0], b.y - STARTER_NEAR[1]));
  if (town[0]) town[0].starter = true;
  for (const z of ZONE_IDS) {
    const t = LOT_TARGET[z];
    const c = count[z];
    report.push(`${z.padEnd(11)} cells ${c.cells}/${t.cells}  big ${c.big}/${t.big}${c.cells < t.cells || c.big < t.big ? "  << short" : ""}`);
  }
  return { lots, report };
}
