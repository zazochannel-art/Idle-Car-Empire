// Paints Nordheim's ground textures (3 × 2 tiles of 2048 px, the same frame as
// the first map's), its areas raster and its minimap: the sea fading from the
// shallows to the deep, gravel shores, cool meadows, fir forests, heath, bare
// rock and snow up high (and more of it in the north), frozen lakes, paving in
// the districts, farm fields, the mines' pits, ski runs; then the roads with
// their markings, the lots and their driveways, the circuit, the runway, the
// railway, the quays and the parking lots.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AREA_IDS, SIZE, ZONE_IDS } from "./design";
import { QUAYS, RAIL, RUNWAY } from "./features";
import { lakeDepth, type Land } from "./land";
import { clamp, fbm, hash2, lerp, smooth, type P } from "./noise";
import type { BuiltRoad, Lot } from "./roads";
import type { SceneryOut } from "./scenery";

const TILE = Number(process.env.ISLAND_TILE ?? 2048);
const NTX = 3;
const NTY = 2;
type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const C = {
  deep: hex("#1d5ea8"),
  sea: hex("#2f86cc"),
  shallow: hex("#5ec3e6"),
  foam: hex("#bfe9f4"),
  gravel: hex("#d8cfb6"),
  stones: hex("#aaa49a"),
  meadow: hex("#9cc47a"),
  meadow2: hex("#82b268"),
  heath: hex("#aaa47e"),
  forest: hex("#3f6d3c"),
  forest2: hex("#4d7c45"),
  forestSnow: hex("#bccbc4"),
  rock: hex("#8e8880"),
  rock2: hex("#a29c93"),
  snow: hex("#f1f5f8"),
  snowShade: hex("#d5e1ea"),
  ice: hex("#dbe9f2"),
  iceCrack: hex("#b5cddc"),
  lake: hex("#4aa6d6"),
  paving: hex("#cfcbc4"),
  pavingLine: hex("#bdb9b2"),
  asphalt: hex("#4b4f56"),
  sidewalk: hex("#dad6ce"),
  line: hex("#f1f1ec"),
  lot: hex("#d9d1c6"),
  lotEdge: hex("#6c6964"),
  kerbRed: hex("#d63a32"),
  track: hex("#3e4146"),
  runway: hex("#5a5e64"),
  ballast: hex("#8d8173"),
  rail: hex("#4a4440"),
  concrete: hex("#bdb8ae"),
  pit: hex("#9b8a74"),
  pit2: hex("#7d6e5c"),
};
const FIELD_TONES: [RGB, RGB][] = [
  [hex("#c9c08a"), hex("#b9ae74")],
  [hex("#a98e6a"), hex("#957b58")],
  [hex("#e9eef0"), hex("#d3dde4")],
  [hex("#b4c47e"), hex("#a1b26c")],
];

interface Masks {
  lake: Float32Array;
  ice: Float32Array;
  forest: Float32Array;
  n0: Float32Array;
  n1: Float32Array;
  n2: Float32Array;
  urban: Float32Array;
}

/** Fields on the land's fine grid, sampled bilinearly while painting. */
function masks(land: Land, roads: BuiltRoad[]): Masks {
  const { fw, fh } = land;
  const [SX, SY] = SIZE;
  const n = fw * fh;
  const m: Masks = { lake: new Float32Array(n), ice: new Float32Array(n), forest: new Float32Array(n), n0: new Float32Array(n), n1: new Float32Array(n), n2: new Float32Array(n), urban: new Float32Array(n).fill(99) };
  for (let j = 0; j < fh; j++)
    for (let i = 0; i < fw; i++) {
      const k = j * fw + i;
      const x = (i / (fw - 1) - 0.5) * SX;
      const y = (j / (fh - 1) - 0.5) * SY;
      const lk = lakeDepth(x, y);
      m.lake[k] = lk.d;
      m.ice[k] = lk.ice ? 1 : 0;
      m.forest[k] = forestAt(land, x, y);
      m.n0[k] = fbm(x / 40, y / 40, 3, 505);
      m.n1[k] = fbm(x / 9, y / 9, 3, 501);
      m.n2[k] = fbm(x / 2.6, y / 2.6, 2, 503);
    }
  // how far from an urban road (beyond its half width), for the paving
  for (const r of roads) {
    if (!r.spec.urban) continue;
    for (let q = 0; q < r.pts.length; q += 2) {
      const [x, y] = r.pts[q];
      const R = 6;
      const i0 = Math.max(0, Math.floor(((x - R) / SX + 0.5) * (fw - 1)));
      const i1 = Math.min(fw - 1, Math.ceil(((x + R) / SX + 0.5) * (fw - 1)));
      const j0 = Math.max(0, Math.floor(((y - R) / SY + 0.5) * (fh - 1)));
      const j1 = Math.min(fh - 1, Math.ceil(((y + R) / SY + 0.5) * (fh - 1)));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const cx = (i / (fw - 1) - 0.5) * SX;
          const cy = (j / (fh - 1) - 0.5) * SY;
          const d = Math.hypot(cx - x, cy - y) - r.w / 2;
          const k = j * fw + i;
          if (d < m.urban[k]) m.urban[k] = d;
        }
    }
  }
  return m;
}

function bilinear(land: Land, arr: Float32Array, x: number, y: number): number {
  const { fw, fh } = land;
  const gx = clamp((x / SIZE[0] + 0.5) * (fw - 1), 0, fw - 1);
  const gy = clamp((y / SIZE[1] + 0.5) * (fh - 1), 0, fh - 1);
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const i1 = Math.min(fw - 1, i0 + 1);
  const j1 = Math.min(fh - 1, j0 + 1);
  const fx = gx - i0;
  const fy = gy - j0;
  return lerp(lerp(arr[j0 * fw + i0], arr[j0 * fw + i1], fx), lerp(arr[j1 * fw + i0], arr[j1 * fw + i1], fx), fy);
}

/** A segment of something drawn along a line, with the distance along it at its start. */
interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  s0: number;
  owner: number;
}

function segments(pts: P[], owner: number, skip?: (s: number) => boolean, closed = false): Seg[] {
  const out: Seg[] = [];
  let s = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!skip || !skip(s + L / 2)) out.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], s0: s, owner });
    s += L;
  }
  return out;
}

/** Nearest segment for every pixel near the lines: distance (units), distance along, owner. */
function distanceField(segs: Seg[], reach: number, tile: { x0: number; y0: number; ppu: number; W: number; H: number }) {
  const { x0, y0, ppu, W, H } = tile;
  const dist = new Float32Array(W * H).fill(Infinity);
  const along = new Float32Array(W * H);
  const owner = new Int32Array(W * H).fill(-1);
  for (const g of segs) {
    const minx = Math.min(g.ax, g.bx) - reach;
    const maxx = Math.max(g.ax, g.bx) + reach;
    const miny = Math.min(g.ay, g.by) - reach;
    const maxy = Math.max(g.ay, g.by) + reach;
    const i0 = Math.max(0, Math.floor((minx - x0) * ppu));
    const i1 = Math.min(W - 1, Math.ceil((maxx - x0) * ppu));
    const j0 = Math.max(0, Math.floor((miny - y0) * ppu));
    const j1 = Math.min(H - 1, Math.ceil((maxy - y0) * ppu));
    if (i0 > i1 || j0 > j1) continue;
    const dx = g.bx - g.ax;
    const dy = g.by - g.ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const L = Math.sqrt(L2);
    for (let j = j0; j <= j1; j++) {
      const y = y0 + (j + 0.5) / ppu;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) / ppu;
        const t = clamp(((x - g.ax) * dx + (y - g.ay) * dy) / L2);
        const d = Math.hypot(x - g.ax - dx * t, y - g.ay - dy * t);
        const k = j * W + i;
        if (d < dist[k]) {
          dist[k] = d;
          along[k] = g.s0 + t * L;
          owner[k] = g.owner;
        }
      }
    }
  }
  return { dist, along, owner };
}

/** Signed distance to a rotated rectangle (negative inside), in its own frame. */
function rectSd(x: number, y: number, r: { x: number; y: number; w: number; d: number; rot: number }) {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const u = Math.abs((x - r.x) * c - (y - r.y) * s) - r.w / 2;
  const v = Math.abs((x - r.x) * s + (y - r.y) * c) - r.d / 2;
  return Math.hypot(Math.max(0, u), Math.max(0, v)) + Math.min(0, Math.max(u, v));
}

/** How wooded a spot is: over 0.18 a forest (the trees and the painted ground agree). */
export function forestAt(land: Land, x: number, y: number): number {
  return fbm(x / 26, y / 26, 4, 77) * 0.8 + fbm(x / 7, y / 7, 2, 79) * 0.22 + land.biasAt(x, y);
}

export async function paint(land: Land, roads: BuiltRoad[], lots: Lot[], circuit: P[], scenery: SceneryOut, out: string) {
  const t0 = Date.now();
  const M = masks(land, roads);
  console.log(`  masks ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const [SX, SY] = SIZE;
  const ppu = (TILE * NTX) / SX;
  const roadSegs = roads.flatMap((r, i) => segments(r.pts, i, (s) => r.decks.some(([a, b]) => s > a + 0.3 && s < b - 0.3)));
  const circuitSegs = segments(circuit, 0, undefined, true);
  const railSegs = segments(RAIL, 0);
  const runSegs = scenery.runs.flatMap((r, i) => segments(r, i));
  const runwayRect = { x: (RUNWAY.a[0] + RUNWAY.b[0]) / 2, y: (RUNWAY.a[1] + RUNWAY.b[1]) / 2, w: Math.hypot(RUNWAY.b[0] - RUNWAY.a[0], RUNWAY.b[1] - RUNWAY.a[1]) + 4, d: 2.3, rot: -Math.atan2(RUNWAY.b[1] - RUNWAY.a[1], RUNWAY.b[0] - RUNWAY.a[0]) };
  const quays = [
    { x: QUAYS[0][0], y: QUAYS[0][1] + 2.6, w: 20, d: 4.6, rot: -0.06 },
    { x: QUAYS[1][0], y: QUAYS[1][1] - 2.2, w: 6, d: 3, rot: -0.1 },
  ];
  const drives = lots.map((l) => {
    const fx = Math.sin(l.rot);
    const fy = Math.cos(l.rot);
    const a: P = [l.x + fx * (l.d / 2), l.y + fy * (l.d / 2)];
    const b: P = [l.x + fx * (l.d / 2 + l.drive), l.y + fy * (l.d / 2 + l.drive)];
    return { a, b };
  });
  const driveSegs = drives.map((d, i) => ({ ax: d.a[0], ay: d.a[1], bx: d.b[0], by: d.b[1], s0: 0, owner: i }));
  const tiles: Buffer[] = [];
  for (let ty = 0; ty < NTY; ty++)
    for (let tx = 0; tx < NTX; tx++) {
      const W = TILE;
      const H = TILE;
      const x0 = -SX / 2 + (tx * SX) / NTX;
      const y0 = -SY / 2 + (ty * SY) / NTY;
      const tile = { x0, y0, ppu, W, H };
      const img = new Float32Array(W * H * 3);
      // ── the ground
      for (let j = 0; j < H; j++) {
        const y = y0 + (j + 0.5) / ppu;
        for (let i = 0; i < W; i++) {
          const x = x0 + (i + 0.5) / ppu;
          const n2 = bilinear(land, M.n2, x, y);
          const n1 = bilinear(land, M.n1, x, y);
          const grain = hash2(i + tx * W, j + ty * H, 9) - 0.5;
          const d = land.depthAt(x, y) + n2 * 0.18;
          let col: RGB;
          if (d < 0) {
            const t = smooth(0, 24, -d);
            col = mix(mix(C.shallow, C.sea, smooth(0, 0.22, t + n1 * 0.05)), C.deep, smooth(0.2, 1, t));
            col = mix(col, C.foam, (1 - smooth(0.05, 0.45, -d)) * 0.75);
            const v = 1 + n1 * 0.04;
            col = [col[0] * v, col[1] * v, col[2] * v];
          } else {
            const h = land.height(x, y);
            const n0 = bilinear(land, M.n0, x, y);
            const area = land.areaOf(x, y);
            const zone = area !== null && ZONE_IDS.includes(area);
            // snow: higher up, further north, less where the towns have cleared it
            let snow = smooth(12, 48, h) + smooth(35, -45, y) * 0.48 + n0 * 0.28 + n1 * 0.12;
            snow *= 1 - land.zoneAt(x, y) * 0.45;
            const meadow = mix(C.meadow, C.meadow2, clamp(0.5 + n1 * 0.9));
            col = mix(meadow, C.heath, smooth(16, 44, h) * 0.85);
            const f = bilinear(land, M.forest, x, y) + n2 * 0.06;
            const forestAmt = smooth(0.12, 0.24, f) * (1 - smooth(70, 95, h));
            const fcol = mix(mix(C.forest, C.forest2, clamp(0.5 + n2 * 1.6)), C.forestSnow, smooth(0.3, 0.8, snow + n2 * 0.25) * 0.85);
            col = mix(col, fcol, forestAmt);
            const e = 0.6;
            const slope = Math.hypot(land.height(x + e, y) - land.height(x - e, y), land.height(x, y + e) - land.height(x, y - e)) / (2 * e);
            const rock = clamp(smooth(55, 80, h + n1 * 12) + smooth(5, 9, slope + n2 * 2));
            col = mix(col, mix(C.rock, C.rock2, clamp(0.5 + n2 * 1.4)), rock);
            const snowAmt = smooth(0.5, 0.72, snow + n2 * 0.3) * (1 - smooth(7, 11, slope) * 0.7);
            col = mix(col, mix(C.snow, C.snowShade, clamp(0.4 - n2 * 1.2)), snowAmt * (1 - forestAmt * 0.6));
            // the shore: gravel in the south, stones in the north
            const shore = 1 - smooth(0.25, 0.8, d);
            col = mix(col, mix(C.gravel, C.stones, smooth(10, -25, y)), shore * 0.95);
            // lakes
            const lk = bilinear(land, M.lake, x, y) + n2 * 0.1;
            if (lk > -0.08) {
              const ice = bilinear(land, M.ice, x, y) > 0.5;
              let lc = ice ? C.ice : C.lake;
              if (ice && Math.abs(fbm(x / 1.6, y / 1.6, 2, 611)) < 0.025) lc = C.iceCrack;
              col = mix(col, lc, smooth(-0.08, 0.08, lk));
            }
            // paving along the districts' streets, fuller in the centres
            if (zone) {
              const u = bilinear(land, M.urban, x, y);
              const core = area === "downtown" || area === "global" ? 7 : area === "town" ? 5.5 : 5;
              const park = smooth(0.25, 0.4, n0 + n1 * 0.3);
              const pave = (1 - smooth(core - 0.6, core + 0.2, u + n1 * 2.2 + n2 * 0.6)) * (1 - park * smooth(2.2, 3.2, u));
              if (pave > 0) {
                const gx = x - Math.floor(x);
                const gy = y - Math.floor(y);
                const pc = gx < 0.04 || gy < 0.04 ? C.pavingLine : C.paving;
                col = mix(col, pc, pave);
              }
            }
            // farm fields
            for (const fl of scenery.fields) {
              if (Math.abs(x - fl.c[0]) > fl.w + fl.d || Math.abs(y - fl.c[1]) > fl.w + fl.d) continue;
              const sd = rectSd(x, y, { x: fl.c[0], y: fl.c[1], w: fl.w, d: fl.d, rot: fl.a });
              if (sd > 0.1) continue;
              const [a, b] = FIELD_TONES[fl.tone % FIELD_TONES.length];
              const u = (x - fl.c[0]) * Math.cos(fl.a) - (y - fl.c[1]) * Math.sin(fl.a);
              const fc = Math.sin(u * 9) > 0.2 ? b : a;
              col = mix(col, fc, smooth(0.1, -0.1, sd));
            }
            // the mines' pits: terraces round a dark floor
            for (const p of scenery.pits) {
              const r = Math.hypot(x - p.c[0], y - p.c[1]) + n2 * 0.6;
              if (r > p.r) continue;
              const ring = Math.floor((r / p.r) * 5);
              col = mix(col, ring % 2 ? C.pit : C.pit2, smooth(p.r, p.r - 0.4, r));
            }
            const v = 1 + n1 * 0.035 + grain * 0.03;
            col = [col[0] * v, col[1] * v, col[2] * v];
          }
          const o = (j * W + i) * 3;
          img[o] = col[0];
          img[o + 1] = col[1];
          img[o + 2] = col[2];
        }
      }
      const put = (k: number, c: RGB, a: number) => {
        if (a <= 0) return;
        const o = k * 3;
        const t = Math.min(1, a);
        img[o] += (c[0] - img[o]) * t;
        img[o + 1] += (c[1] - img[o + 1]) * t;
        img[o + 2] += (c[2] - img[o + 2]) * t;
      };
      const cover = (edge: number, d: number) => clamp((edge - d) * ppu + 0.5);
      // ── ski runs
      {
        const f = distanceField(runSegs, 2, tile);
        for (let k = 0; k < W * H; k++) if (f.dist[k] < 1.2) put(k, C.snow, cover(0.85, f.dist[k]) * 0.85);
      }
      // ── quays and the runway's apron
      for (const q of quays) {
        const minx = q.x - q.w;
        const maxx = q.x + q.w;
        const miny = q.y - q.w;
        const maxy = q.y + q.w;
        for (let j = Math.max(0, Math.floor((miny - y0) * ppu)); j <= Math.min(H - 1, Math.ceil((maxy - y0) * ppu)); j++)
          for (let i = Math.max(0, Math.floor((minx - x0) * ppu)); i <= Math.min(W - 1, Math.ceil((maxx - x0) * ppu)); i++) {
            const x = x0 + (i + 0.5) / ppu;
            const y = y0 + (j + 0.5) / ppu;
            const sd = rectSd(x, y, q);
            if (sd < 0.1 && land.depthAt(x, y) > -0.6) put(j * W + i, C.concrete, cover(0, sd));
          }
      }
      // ── the runway
      {
        const r = runwayRect;
        const L = r.w / 2;
        for (let j = 0; j < H; j++) {
          const y = y0 + (j + 0.5) / ppu;
          if (Math.abs(y - r.y) > L + 2) continue;
          for (let i = 0; i < W; i++) {
            const x = x0 + (i + 0.5) / ppu;
            if (Math.abs(x - r.x) > L + 2) continue;
            const sd = rectSd(x, y, r);
            if (sd > 0.1) continue;
            const c = Math.cos(r.rot);
            const s = Math.sin(r.rot);
            const u = (x - r.x) * c - (y - r.y) * s;
            const v = (x - r.x) * s + (y - r.y) * c;
            let col = C.runway;
            if (Math.abs(v) < 0.05 && ((u + 100) % 2.2) < 1.1 && Math.abs(u) < L - 3) col = C.line;
            if (Math.abs(Math.abs(v) - 1.0) < 0.04) col = C.line;
            if (Math.abs(u) > L - 2.6 && Math.abs(u) < L - 1.6 && Math.abs(v) < 0.9 && ((v + 10) % 0.3) < 0.15) col = C.line;
            put(j * W + i, col, cover(0, sd));
          }
        }
      }
      // ── the railway
      {
        const f = distanceField(railSegs, 0.6, tile);
        for (let k = 0; k < W * H; k++) {
          const d = f.dist[k];
          if (d > 0.5) continue;
          put(k, C.ballast, cover(0.32, d));
          if (Math.abs(d - 0.13) < 0.03) put(k, C.rail, 0.9);
        }
      }
      // ── the roads: sidewalks, asphalt, edge lines, dashed centre lines
      {
        const f = distanceField(roadSegs, 1.3, tile);
        for (let k = 0; k < W * H; k++) {
          const d = f.dist[k];
          if (d > 1.2) continue;
          const r = roads[f.owner[k]];
          const hw = r.w / 2;
          if (r.spec.urban) put(k, C.sidewalk, cover(hw + 0.2, d));
          else put(k, C.gravel, cover(hw + 0.12, d) * 0.7);
          const i = k % W;
          const j = (k - i) / W;
          const grain = hash2(i + tx * W, j + ty * H, 21) - 0.5;
          const a = C.asphalt;
          put(k, [a[0] + grain * 10, a[1] + grain * 10, a[2] + grain * 10], cover(hw, d));
          if (r.w >= 0.6 && Math.abs(d - (hw - 0.08)) < 0.035) put(k, C.line, 0.85 * cover(hw, d));
          const s = f.along[k];
          const nearEnd = s < 1.2 || s > r.len - 1.2;
          if (!nearEnd && d < 0.03 && s % 0.9 < 0.38) put(k, C.line, 0.9);
        }
      }
      // ── driveways and lots
      {
        const f = distanceField(driveSegs, 0.5, tile);
        for (let k = 0; k < W * H; k++) if (f.dist[k] < 0.4) put(k, C.asphalt, cover(0.3, f.dist[k]));
        for (const l of lots) {
          const R = Math.hypot(l.w, l.d) / 2 + 0.2;
          const i0 = Math.max(0, Math.floor((l.x - R - x0) * ppu));
          const i1 = Math.min(W - 1, Math.ceil((l.x + R - x0) * ppu));
          const j0 = Math.max(0, Math.floor((l.y - R - y0) * ppu));
          const j1 = Math.min(H - 1, Math.ceil((l.y + R - y0) * ppu));
          for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++) {
              const sd = rectSd(x0 + (i + 0.5) / ppu, y0 + (j + 0.5) / ppu, l);
              if (sd > 0.1) continue;
              const k = j * W + i;
              put(k, C.lotEdge, cover(0, sd));
              put(k, C.lot, cover(-0.07, sd));
            }
        }
      }
      // ── parking lots: asphalt and bay lines
      for (const pk of scenery.parcari) {
        const rect = { x: pk.c[0], y: pk.c[1], w: pk.L, d: pk.W, rot: -Math.atan2(pk.t[1], pk.t[0]) };
        const R = Math.hypot(pk.L, pk.W) / 2 + 0.2;
        for (let j = Math.max(0, Math.floor((rect.y - R - y0) * ppu)); j <= Math.min(H - 1, Math.ceil((rect.y + R - y0) * ppu)); j++)
          for (let i = Math.max(0, Math.floor((rect.x - R - x0) * ppu)); i <= Math.min(W - 1, Math.ceil((rect.x + R - x0) * ppu)); i++) {
            const x = x0 + (i + 0.5) / ppu;
            const y = y0 + (j + 0.5) / ppu;
            const sd = rectSd(x, y, rect);
            if (sd > 0.1) continue;
            const u = (x - rect.x) * Math.cos(rect.rot) - (y - rect.y) * Math.sin(rect.rot);
            put(j * W + i, Math.abs(((u + 50) % 0.34) - 0.17) > 0.15 ? C.line : C.asphalt, cover(0, sd));
          }
      }
      // ── the circuit: asphalt, red and white kerbs, the chequered line
      {
        const f = distanceField(circuitSegs, 1.2, tile);
        for (let k = 0; k < W * H; k++) {
          const d = f.dist[k];
          if (d > 0.9) continue;
          const s = f.along[k];
          const kerb = Math.floor(s / 0.42) % 2 ? C.kerbRed : C.line;
          put(k, kerb, cover(0.72, d));
          put(k, C.track, cover(0.56, d));
          if (s < 0.42) {
            const i = k % W;
            const j = (k - i) / W;
            const cq = (Math.floor(i / 4) + Math.floor(j / 4)) % 2 ? C.line : hex("#1a1a1a");
            put(k, cq, cover(0.56, d));
          }
        }
      }
      // to bytes
      const bytes = Buffer.alloc(W * H * 3);
      for (let k = 0; k < bytes.length; k++) bytes[k] = Math.max(0, Math.min(255, Math.round(img[k])));
      tiles.push(bytes);
      fs.mkdirSync(path.join(out, "t"), { recursive: true });
      await sharp(bytes, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 80 }).toFile(path.join(out, "t", `${tx}_${ty}.webp`));
      console.log(`  tile ${tx}_${ty} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  // ── the minimap: the whole island at 768 × 512
  {
    const parts = await Promise.all(
      tiles.map(async (b, i) => ({
        input: await sharp(b, { raw: { width: TILE, height: TILE, channels: 3 } }).resize(256, 256, { kernel: "lanczos3" }).png().toBuffer(),
        left: (i % NTX) * 256,
        top: Math.floor(i / NTX) * 256,
      })),
    );
    await sharp({ create: { width: 768, height: 512, channels: 3, background: "#1d5ea8" } }).composite(parts).webp({ quality: 85 }).toFile(path.join(out, "minimap.webp"));
  }
  // ── the areas raster: each spot's district or territory (index + 1), the sea 0
  {
    const W = 768;
    const H = 512;
    const buf = Buffer.alloc(W * H);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const x = ((i + 0.5) / W - 0.5) * SX;
        const y = ((j + 0.5) / H - 0.5) * SY;
        const a = land.depthAt(x, y) > -5 ? land.areaOf(x, y) : null;
        buf[j * W + i] = a ? AREA_IDS.indexOf(a) + 1 : 0;
      }
    await sharp(buf, { raw: { width: W, height: H, channels: 1 } }).png().toFile(path.join(out, "areas.png"));
  }
}
