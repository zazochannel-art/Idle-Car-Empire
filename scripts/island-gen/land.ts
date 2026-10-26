// The land of Nordheim: how deep inland every point is (negative at sea),
// which district or territory it belongs to, and its height above the sea.
import { AREAS, AREA_IDS, BAYS, FJORDS, FOREST_BIAS, GRID, ISLANDS, LAKES, LAND, MASSIFS, SEED, SIZE, ZONE_IDS, type AreaId, type Ellipse } from "./design";
import { clamp, fbm, lerp, polylineDist, ridged, smax, smin, smooth } from "./noise";

/** Ellipse metric: 1 on its rim, 0 at its centre. */
function metric(e: Ellipse, x: number, y: number): number {
  const c = Math.cos(e.a ?? 0);
  const s = Math.sin(e.a ?? 0);
  const dx = x - e.c[0];
  const dy = y - e.c[1];
  const u = (dx * c + dy * s) / e.r[0];
  const v = (-dx * s + dy * c) / e.r[1];
  return Math.hypot(u, v);
}

/** Approximate signed distance into an ellipse (positive inside). */
const inside = (e: Ellipse, x: number, y: number) => (1 - metric(e, x, y)) * Math.min(e.r[0], e.r[1]);

/** How far inland a point is (map units, negative out at sea), coast ragged by noise. */
export function depth(x: number, y: number): number {
  let d = -1e9;
  for (const e of LAND) d = d === -1e9 ? inside(e, x, y) : smax(d, inside(e, x, y), 12);
  for (const f of FJORDS) {
    const { d: dist, s } = polylineDist(x, y, f.pts);
    let L = 0;
    for (let i = 1; i < f.pts.length; i++) L += Math.hypot(f.pts[i][0] - f.pts[i - 1][0], f.pts[i][1] - f.pts[i - 1][1]);
    const w = lerp(f.w[0], f.w[1], clamp(s / L));
    d = smin(d, dist - w / 2, 5);
  }
  for (const b of BAYS) d = smin(d, -inside(b, x, y), 6);
  // a rugged, fjordic coast: warped noise at several scales
  const wx = x + 4 * fbm(x / 16, y / 16, 2, SEED + 3);
  const wy = y + 4 * fbm(x / 16, y / 16, 2, SEED + 5);
  d += 7 * fbm(wx / 40, wy / 40, 4, SEED) + 3.2 * fbm(wx / 13, wy / 13, 3, SEED + 7) + 1.1 * fbm(wx / 4.6, wy / 4.6, 2, SEED + 13) + 0.3 * fbm(x / 1.7, y / 1.7, 2, SEED + 17);
  // the islands stay islands: no smooth join with the main island
  for (const e of ISLANDS) {
    const amp = clamp(Math.min(e.r[0], e.r[1]) / 6, 0.35, 1);
    d = Math.max(d, inside(e, x, y) + amp * (1.4 * fbm(x / 9, y / 9, 3, SEED + 21) + 0.35 * fbm(x / 3, y / 3, 2, SEED + 23)));
  }
  return d;
}

/** Inside a lake: how far (positive), else negative. */
export function lakeDepth(x: number, y: number): { d: number; ice: boolean } {
  let best = -1e9;
  let ice = false;
  for (const l of LAKES) {
    const v = inside(l, x, y) + 0.6 * fbm(x / 4, y / 4, 2, SEED + 31);
    if (v > best) {
      best = v;
      ice = !!l.ice;
    }
  }
  return { d: best, ice };
}

/** The area a point belongs to (index in AREA_IDS), by the nearest seed, borders warped. */
export function areaAt(x: number, y: number): number {
  const wx = x + 7 * fbm(x / 28, y / 28, 3, SEED + 41);
  const wy = y + 7 * fbm(x / 28, y / 28, 3, SEED + 43);
  let best = Infinity;
  let id = 0;
  AREA_IDS.forEach((a, i) => {
    const cfg = AREAS[a];
    for (const [sx, sy] of cfg.seeds) {
      const d = Math.hypot(wx - sx, wy - sy) / (cfg.weight ?? 1);
      if (d < best) {
        best = d;
        id = i;
      }
    }
  });
  return id;
}

export interface Land {
  /** Fine field: inland depth and area, `FINE` samples per unit. */
  fw: number;
  fh: number;
  depth: Float32Array;
  area: Uint8Array;
  /** Heights (metres) on the game's grid. */
  heights: Float32Array;
  /** Metres at a point (bilinear on the grid). */
  height(x: number, y: number): number;
  depthAt(x: number, y: number): number;
  areaOf(x: number, y: number): AreaId | null;
  /** How much a spot is in a district (blended across borders), and how wooded its area is. */
  zoneAt(x: number, y: number): number;
  biasAt(x: number, y: number): number;
}

export const FINE = Number(process.env.ISLAND_FINE ?? 4);

const isZone = (i: number) => ZONE_IDS.includes(AREA_IDS[i]);

export function buildLand(): Land {
  const [SX, SY] = SIZE;
  const fw = Math.round(SX * FINE) + 1;
  const fh = Math.round(SY * FINE) + 1;
  const dep = new Float32Array(fw * fh);
  const area = new Uint8Array(fw * fh);
  for (let j = 0; j < fh; j++)
    for (let i = 0; i < fw; i++) {
      const x = (i / (fw - 1) - 0.5) * SX;
      const y = (j / (fh - 1) - 0.5) * SY;
      const d = depth(x, y);
      dep[j * fw + i] = d;
      // the sea near a coast belongs to its area too (the locked haze covers it)
      area[j * fw + i] = d > -5 ? areaAt(x, y) + 1 : 0;
    }
  const sample = (arr: Float32Array, x: number, y: number) => {
    const gx = clamp((x / SX + 0.5) * (fw - 1), 0, fw - 1);
    const gy = clamp((y / SY + 0.5) * (fh - 1), 0, fh - 1);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const i1 = Math.min(fw - 1, i0 + 1);
    const j1 = Math.min(fh - 1, j0 + 1);
    const fx = gx - i0;
    const fy = gy - j0;
    return lerp(lerp(arr[j0 * fw + i0], arr[j0 * fw + i1], fx), lerp(arr[j1 * fw + i0], arr[j1 * fw + i1], fx), fy);
  };
  const areaOf = (x: number, y: number): AreaId | null => {
    const i = Math.round(clamp((x / SX + 0.5) * (fw - 1), 0, fw - 1));
    const j = Math.round(clamp((y / SY + 0.5) * (fh - 1), 0, fh - 1));
    const a = area[j * fw + i];
    return a ? AREA_IDS[a - 1] : null;
  };
  // how urban each point is: the districts are flat, the territories keep their relief
  const [GW, GH] = GRID;
  const urban = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = (i / (GW - 1) - 0.5) * SX;
      const y = (j / (GH - 1) - 0.5) * SY;
      const a = areaOf(x, y);
      urban[j * GW + i] = a && isZone(AREA_IDS.indexOf(a)) ? 1 : a === "campus" || a === "racing" || a === "boulevard" || a === "airport" || a === "suburbs" ? 0.75 : 0;
    }
  const soft = blur(blur(urban, GW, GH, 6), GW, GH, 4);
  const zoneRaw = new Float32Array(GW * GH);
  const biasRaw = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const a = areaOf((i / (GW - 1) - 0.5) * SX, (j / (GH - 1) - 0.5) * SY);
      zoneRaw[j * GW + i] = a && ZONE_IDS.includes(a) ? 1 : 0;
      biasRaw[j * GW + i] = a ? (FOREST_BIAS[a] ?? 0) : 0;
    }
  const zoneSoft = blur(blur(zoneRaw, GW, GH, 5), GW, GH, 4);
  const biasSoft = blur(blur(blur(biasRaw, GW, GH, 18), GW, GH, 14), GW, GH, 10);
  const heights = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = (i / (GW - 1) - 0.5) * SX;
      const y = (j / (GH - 1) - 0.5) * SY;
      const d = sample(dep, x, y);
      let h: number;
      if (d < 0) {
        h = -1.2 - 30 * smooth(0, 24, -d) + 1.5 * fbm(x / 20, y / 20, 2, SEED + 51);
      } else {
        h = 1.4 + 7 * smooth(0, 16, d) + 2.6 * fbm(x / 18, y / 18, 3, SEED + 53) * smooth(0, 8, d);
        for (const m of MASSIFS) {
          const e = metric(m, x, y);
          if (e >= 1.15) continue;
          const f = smooth(1.15, 0.2, e);
          h += m.h * f * (0.4 + 0.8 * ridged(x / 24 + m.c[0], y / 24 + m.c[1], 5, SEED + 61));
        }
        // the districts are level ground (gently rolling)
        const flat = 5.6 + 1.6 * fbm(x / 60, y / 60, 2, SEED + 71);
        h = lerp(h, Math.min(h, flat + Math.min(2.5, d * 0.4)), 0.92 * soft[j * GW + i]);
        // lakes lie level
        const lk = lakeDepth(x, y);
        if (lk.d > -1.2) h = lerp(h, Math.max(1.2, h - 1.2), smooth(-1.2, 0.5, lk.d));
        // beaches and shores rise gently from the water
        h = Math.min(h, 0.6 + d * 1.3);
      }
      heights[j * GW + i] = h;
    }
  const onGrid = (arr: Float32Array, x: number, y: number) => {
    const gx = clamp((x / SX + 0.5) * (GW - 1), 0, GW - 1);
    const gy = clamp((y / SY + 0.5) * (GH - 1), 0, GH - 1);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const i1 = Math.min(GW - 1, i0 + 1);
    const j1 = Math.min(GH - 1, j0 + 1);
    return lerp(lerp(arr[j0 * GW + i0], arr[j0 * GW + i1], gx - i0), lerp(arr[j1 * GW + i0], arr[j1 * GW + i1], gx - i0), gy - j0);
  };
  const height = (x: number, y: number) => {
    const gx = clamp((x / SX + 0.5) * (GW - 1), 0, GW - 1);
    const gy = clamp((y / SY + 0.5) * (GH - 1), 0, GH - 1);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const i1 = Math.min(GW - 1, i0 + 1);
    const j1 = Math.min(GH - 1, j0 + 1);
    const fx = gx - i0;
    const fy = gy - j0;
    return lerp(lerp(heights[j0 * GW + i0], heights[j0 * GW + i1], fx), lerp(heights[j1 * GW + i0], heights[j1 * GW + i1], fx), fy);
  };
  return { fw, fh, depth: dep, area, heights, height, depthAt: (x, y) => sample(dep, x, y), areaOf, zoneAt: (x, y) => onGrid(zoneSoft, x, y), biasAt: (x, y) => onGrid(biasSoft, x, y) };
}

/** A separable box blur (radius r), on a W × H grid. */
export function blur(a: Float32Array, W: number, H: number, r: number): Float32Array {
  const t = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  for (let j = 0; j < H; j++) {
    let acc = 0;
    let n = 0;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < W) {
      acc += a[j * W + i];
      n++;
    }
    for (let i = 0; i < W; i++) {
      t[j * W + i] = acc / n;
      const add = i + r + 1;
      const rem = i - r;
      if (add < W) {
        acc += a[j * W + add];
        n++;
      }
      if (rem >= 0) {
        acc -= a[j * W + rem];
        n--;
      }
    }
  }
  for (let i = 0; i < W; i++) {
    let acc = 0;
    let n = 0;
    for (let j = -r; j <= r; j++) if (j >= 0 && j < H) {
      acc += t[j * W + i];
      n++;
    }
    for (let j = 0; j < H; j++) {
      out[j * W + i] = acc / n;
      const add = j + r + 1;
      const rem = j - r;
      if (add < H) {
        acc += t[add * W + i];
        n++;
      }
      if (rem >= 0) {
        acc -= t[rem * W + i];
        n--;
      }
    }
  }
  return out;
}
