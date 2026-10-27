// Shapes the ground for what stands on it: each road gets an even profile
// (eased into its junctions) and the ground beside it follows; every lot is
// levelled at its road's height; the circuit and the runway lie flat.
import { GRID, SIZE } from "./design";
import { NODES } from "./network";
import { clamp, lerp, pointAt, smooth, type P } from "./noise";
import { NODE_IDS, type BuiltRoad, type Lot } from "./roads";
import type { Land } from "./land";

export interface Profiled {
  /** Height of the road's surface (metres), every `step` units from its start. */
  profile: Float32Array;
  step: number;
}

export function finishTerrain(land: Land, roads: BuiltRoad[], lots: Lot[], flats: { pts: P[]; core: number; fall: number }[]): Profiled[] {
  const [GW, GH] = GRID;
  const [SX, SY] = SIZE;
  const h = land.heights;
  const orig = new Float32Array(h);
  const ground = (x: number, y: number) => {
    const gx = clamp((x / SX + 0.5) * (GW - 1), 0, GW - 1);
    const gy = clamp((y / SY + 0.5) * (GH - 1), 0, GH - 1);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const i1 = Math.min(GW - 1, i0 + 1);
    const j1 = Math.min(GH - 1, j0 + 1);
    return lerp(lerp(orig[j0 * GW + i0], orig[j0 * GW + i1], gx - i0), lerp(orig[j1 * GW + i0], orig[j1 * GW + i1], gx - i0), gy - j0);
  };
  const around = (x: number, y: number, r: number) => {
    let a = 0;
    let n = 0;
    for (let dx = -r; dx <= r; dx += r / 2)
      for (let dy = -r; dy <= r; dy += r / 2) {
        a += Math.max(1.2, ground(x + dx, y + dy));
        n++;
      }
    return a / n;
  };
  const nodeH = NODE_IDS.map((id) => around(NODES[id][0], NODES[id][1], 1.5));

  // the roads' profiles
  const profiles: Profiled[] = roads.map((r) => {
    const n = Math.max(2, Math.ceil(r.len / 0.5) + 1);
    const step = r.len / (n - 1);
    const raw = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const s = k * step;
      const p = pointAt(r.pts, s);
      raw[k] = Math.max(1.2, ground(p.x, p.y));
    }
    // over water the deck runs straight between its ends
    for (const [a, b] of r.decks) {
      const ka = Math.max(0, Math.floor(a / step));
      const kb = Math.min(n - 1, Math.ceil(b / step));
      for (let k = ka; k <= kb; k++) raw[k] = lerp(raw[ka], raw[kb], (k - ka) / Math.max(1, kb - ka));
    }
    // a moving average over ±5 units
    const win = Math.max(1, Math.round(5 / step));
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let a = 0;
      let m = 0;
      for (let q = Math.max(0, k - win); q <= Math.min(n - 1, k + win); q++, m++) a += raw[q];
      out[k] = a / m;
    }
    // into the junctions
    for (let k = 0; k < n; k++) {
      const s = k * step;
      out[k] = lerp(nodeH[r.b], lerp(nodeH[r.a], out[k], smooth(0, 4, s)), 1 - smooth(0, 4, r.len - s));
    }
    return { profile: out, step };
  });

  // the ground beside the roads follows them
  const sumW = new Float32Array(GW * GH);
  const sumWH = new Float32Array(GW * GH);
  const maxW = new Float32Array(GW * GH);
  const du = SX / (GW - 1);
  const dv = SY / (GH - 1);
  const stamp = (x: number, y: number, core: number, fall: number, target: number) => {
    const i0 = Math.max(0, Math.floor(((x - fall) / SX + 0.5) * (GW - 1)));
    const i1 = Math.min(GW - 1, Math.ceil(((x + fall) / SX + 0.5) * (GW - 1)));
    const j0 = Math.max(0, Math.floor(((y - fall) / SY + 0.5) * (GH - 1)));
    const j1 = Math.min(GH - 1, Math.ceil(((y + fall) / SY + 0.5) * (GH - 1)));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cx = -SX / 2 + i * du;
        const cy = -SY / 2 + j * dv;
        const d = Math.hypot(cx - x, cy - y);
        if (d >= fall) continue;
        const w = d <= core ? 1 : 1 - smooth(core, fall, d);
        const k = j * GW + i;
        sumW[k] += w;
        sumWH[k] += w * target;
        if (w > maxW[k]) maxW[k] = w;
      }
  };
  roads.forEach((r, i) => {
    const { profile, step } = profiles[i];
    for (let k = 0; k < profile.length; k++) {
      const s = k * step;
      if (r.decks.some(([a, b]) => s > a + 0.3 && s < b - 0.3)) continue;
      const p = pointAt(r.pts, s);
      stamp(p.x, p.y, r.w / 2 + 0.7, r.w / 2 + 2.4, profile[k]);
    }
  });
  for (const f of flats) {
    const level = f.pts.reduce((a, [x, y]) => a + Math.max(1.6, ground(x, y)), 0) / f.pts.length;
    for (const [x, y] of f.pts) stamp(x, y, f.core, f.fall, level);
  }
  for (let k = 0; k < h.length; k++) if (maxW[k] > 0) h[k] = lerp(h[k], sumWH[k] / sumW[k], maxW[k]);

  // the lots: level at their road's height
  for (const l of lots) {
    const { profile, step } = profiles[l.road];
    const k = Math.min(profile.length - 1, Math.round(l.s / step));
    l.h = Math.round(Math.max(1.6, profile[k]) * 100) / 100;
    const c = Math.cos(l.rot);
    const s = Math.sin(l.rot);
    const margin = 1.6;
    const R = Math.hypot(l.w, l.d) / 2 + margin;
    const i0 = Math.max(0, Math.floor(((l.x - R) / SX + 0.5) * (GW - 1)));
    const i1 = Math.min(GW - 1, Math.ceil(((l.x + R) / SX + 0.5) * (GW - 1)));
    const j0 = Math.max(0, Math.floor(((l.y - R) / SY + 0.5) * (GH - 1)));
    const j1 = Math.min(GH - 1, Math.ceil(((l.y + R) / SY + 0.5) * (GH - 1)));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = -SX / 2 + i * du;
        const y = -SY / 2 + j * dv;
        const u = Math.abs((x - l.x) * c - (y - l.y) * s) - l.w / 2;
        const v = Math.abs((x - l.x) * s + (y - l.y) * c) - l.d / 2;
        const out = Math.hypot(Math.max(0, u), Math.max(0, v));
        if (out >= margin) continue;
        const e = out <= 0 ? 1 : 1 - smooth(0, margin, out);
        h[j * GW + i] = lerp(h[j * GW + i], l.h, e);
      }
  }
  // land stays above the sea
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = -SX / 2 + i * du;
      const y = -SY / 2 + j * dv;
      if (land.depthAt(x, y) > 0.2 && h[j * GW + i] < 0.4) h[j * GW + i] = 0.4;
    }
  return profiles;
}
