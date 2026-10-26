// Writes what the generator built: the game's map data (world-data format,
// read by city/layout.ts) and the 3D map's heights and scenery (world.json,
// read by components/map/world).
import fs from "node:fs";
import path from "node:path";
import { AREAS, AREA_IDS, GRID, SIZE, type AreaId } from "./design";
import type { Land } from "./land";
import { NODES } from "./network";
import { pointAt, resample, type P } from "./noise";
import { NODE_IDS, type BuiltRoad, type Lot } from "./roads";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Which areas a road runs through (its traffic starts once one of them is open). */
function roadAreas(land: Land, r: BuiltRoad): AreaId[] {
  const seen = new Map<AreaId, number>();
  for (let s = 0; s <= r.len; s += 0.5) {
    const p = pointAt(r.pts, s);
    const a = land.areaOf(p.x, p.y);
    if (a) seen.set(a, (seen.get(a) ?? 0) + 1);
  }
  return AREA_IDS.filter((a) => (seen.get(a) ?? 0) >= 2);
}

/** Each area's box over the land (and the sea near it). */
function areaBoxes(land: Land): Record<AreaId, { c: P; min: P; max: P }> {
  const [SX, SY] = SIZE;
  const box = AREA_IDS.map(() => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
  for (let j = 0; j < land.fh; j++)
    for (let i = 0; i < land.fw; i++) {
      const k = j * land.fw + i;
      const a = land.area[k];
      if (!a || land.depth[k] < 0) continue;
      const x = (i / (land.fw - 1) - 0.5) * SX;
      const y = (j / (land.fh - 1) - 0.5) * SY;
      const b = box[a - 1];
      b.x0 = Math.min(b.x0, x);
      b.y0 = Math.min(b.y0, y);
      b.x1 = Math.max(b.x1, x);
      b.y1 = Math.max(b.y1, y);
    }
  return Object.fromEntries(AREA_IDS.map((a, i) => [a, { c: AREAS[a].c, min: [r2(box[i].x0), r2(box[i].y0)] as P, max: [r2(box[i].x1), r2(box[i].y1)] as P }])) as Record<AreaId, { c: P; min: P; max: P }>;
}

export function worldData(land: Land, roads: BuiltRoad[], lots: Lot[], circuit: P[]) {
  return {
    size: SIZE,
    nodes: NODE_IDS.map((id) => NODES[id].map(r3)),
    edges: roads.map((r) => ({
      a: r.a,
      b: r.b,
      w: r.w,
      oneway: false,
      ring: false,
      fast: !r.spec.urban,
      len: r3(r.len),
      pts: resample(r.pts, 0.85).map(([x, y]) => [r2(x), r2(y)]),
      bridges: r.decks.map(([a, b]) => [r3(a), r3(b)]),
      areas: roadAreas(land, r),
    })),
    plots: lots.map((l) => ({
      zone: l.zone,
      kind: l.kind,
      x: r3(l.x),
      y: r3(l.y),
      w: l.w,
      d: l.d,
      rot: Math.round(l.rot * 10000) / 10000,
      edge: l.road,
      s: r2(l.s),
      drive: r3(l.drive),
      h: l.h,
      id: l.id,
      ...(l.dealer ? { dealer: l.dealer } : {}),
      ...(l.starter ? { starter: true } : {}),
      ...(l.big ? { big: true } : {}),
    })),
    areas: areaBoxes(land),
    circuit,
  };
}

export function heightsBin(land: Land): Buffer {
  const [GW, GH] = GRID;
  const out = new Uint16Array(GW * GH);
  for (let k = 0; k < out.length; k++) out[k] = Math.max(0, Math.min(65535, Math.round((land.heights[k] + 40) * 10)));
  return Buffer.from(out.buffer);
}

export function roadsJson(roads: BuiltRoad[]) {
  const degree = NODE_IDS.map(() => 0);
  for (const r of roads) {
    degree[r.a]++;
    degree[r.b]++;
  }
  return {
    noduri: NODE_IDS.map((id, i) => ({ id, p: NODES[id].map(r3), tip: degree[i] >= 3 ? "J" : "T", o: 1 })),
    muchii: roads.map((r) => ({
      a: r.a,
      b: r.b,
      nume: r.spec.name,
      l: r.w,
      u: false,
      inel: false,
      o: 1,
      urb: r.spec.urban ? 1 : 0,
      p: r.pts.map(([x, y]) => [r3(x), r3(y)]),
      pod: r.decks.map(([a, b, k]) => [r3(a), r3(b), k]),
      podet: [],
    })),
  };
}

export function write(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}
