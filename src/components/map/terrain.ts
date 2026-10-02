// The island's natural coastline: land extends a noisy distance beyond the
// last road into the sea, traced with marching squares and smoothed, so the
// shore curves instead of following the block grid. Computed once.
import { BLOCKS, ROAD_STEP, WORLD, blockKind, hash } from "@/game/city/layout";

type Pt = [number, number];

const STEP = 0.5;
const MARGIN = 9;

function smoothNoise(x: number, y: number, scale: number, seed: number) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const v = (a: number, b: number) => hash(a * 31 + seed, b * 17 - seed);
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * s(tx);
  const bot = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * s(tx);
  return top + (bot - top) * s(ty);
}

/** Fractal noise in [0, 1]. */
export function noise(x: number, y: number, seed = 7) {
  return smoothNoise(x, y, 14, seed) * 0.6 + smoothNoise(x, y, 6, seed + 11) * 0.3 + smoothNoise(x, y, 2.5, seed + 23) * 0.1;
}

/** Distance (tiles) from a point to the nearest land block, roads included. */
function landDistance(x: number, y: number) {
  let best = Infinity;
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      if (blockKind(bx, by) === "sea") continue;
      const x0 = bx * ROAD_STEP;
      const y0 = by * ROAD_STEP;
      const dx = Math.max(x0 - x, 0, x - (x0 + ROAD_STEP + 1));
      const dy = Math.max(y0 - y, 0, y - (y0 + ROAD_STEP + 1));
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
  return best;
}

/** How far into the sea the land reaches here. */
const reach = (x: number, y: number) => 1.1 + Math.pow(noise(x, y), 1.6) * 9 + smoothNoise(x, y, 3, 41) * 1.2;

export function isLand(x: number, y: number) {
  return landDistance(x, y) < reach(x, y);
}

/** Closed coastline loops in tile coordinates (marching squares + Chaikin). */
function traceCoast(): Pt[][] {
  const n = Math.round((WORLD + MARGIN * 2) / STEP);
  const at = (i: number, j: number): Pt => [i * STEP - MARGIN, j * STEP - MARGIN];
  const field: number[][] = [];
  for (let j = 0; j <= n; j++) {
    const row: number[] = [];
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(i, j);
      row.push(reach(x, y) - landDistance(x, y));
    }
    field.push(row);
  }
  // Edges keyed by their start point; each cell contributes up to 2 segments.
  const key = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const next = new Map<string, Pt>();
  const lerp = (a: Pt, b: Pt, va: number, vb: number): Pt => {
    const t = va / (va - vb);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = [field[j][i], field[j][i + 1], field[j + 1][i + 1], field[j + 1][i]];
      const p = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const idx = (v[0] > 0 ? 1 : 0) | (v[1] > 0 ? 2 : 0) | (v[2] > 0 ? 4 : 0) | (v[3] > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const e = (k: number) => lerp(p[k], p[(k + 1) % 4], v[k], v[(k + 1) % 4]);
      // land on the left of each segment (consistent winding)
      const segs: [number, number][] = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [1, 0]], 6: [[0, 2]], 7: [[3, 2]],
        8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [2, 1]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
      }[idx] as [number, number][];
      for (const [a, b] of segs) next.set(key(e(a)), e(b));
    }
  const loops: Pt[][] = [];
  const seen = new Set<string>();
  for (const [k0, p1] of next) {
    if (seen.has(k0)) continue;
    const loop: Pt[] = [];
    let k = k0;
    let p = p1;
    while (!seen.has(k)) {
      seen.add(k);
      loop.push(p);
      k = key(p);
      const q = next.get(k);
      if (!q) break;
      p = q;
    }
    if (loop.length > 8) loops.push(chaikin(chaikin(loop)));
  }
  return loops;
}

function chaikin(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

let coast: Pt[][] | null = null;
/** Coastline loops, computed on first use. */
export function coastline(): Pt[][] {
  if (!coast) coast = traceCoast();
  return coast;
}
