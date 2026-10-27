// Seeded randomness and smooth noise for the island generator: the same seed
// always gives the same island.

/** A seeded random number generator (mulberry32): numbers in [0, 1). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hash of two integers and a seed, in [0, 1). */
export function hash2(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Gradient noise in about [-1, 1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const g = (a: number, b: number, dx: number, dy: number) => {
    const ang = hash2(a, b, seed) * Math.PI * 2;
    return Math.cos(ang) * dx + Math.sin(ang) * dy;
  };
  const u = fade(fx);
  const v = fade(fy);
  const n00 = g(i, j, fx, fy);
  const n10 = g(i + 1, j, fx - 1, fy);
  const n01 = g(i, j + 1, fx, fy - 1);
  const n11 = g(i + 1, j + 1, fx - 1, fy - 1);
  return 1.41 * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v);
}

/** Fractal noise: `octaves` layers, each twice as fine and half as strong; about [-1, 1]. */
export function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let a = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    a += amp * noise2(x * f, y * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return a / norm;
}

/** Ridged noise for mountain crests, in [0, 1]. */
export function ridged(x: number, y: number, octaves = 5, seed = 0): number {
  let a = 0;
  let amp = 0.5;
  let f = 1;
  let w = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise2(x * f, y * f, seed + o * 37));
    n *= n;
    n *= w;
    w = Math.min(1, Math.max(0, n * 2));
    a += n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return a / norm;
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A smooth maximum (polynomial, blending within `k`). */
export function smax(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (a - b)) / k);
  return lerp(b, a, h) + k * h * (1 - h);
}

/** A smooth minimum (polynomial, blending within `k`). */
export function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

export type P = [number, number];

/** Distance from a point to a polyline, and where along it (distance from its start) the nearest point is. */
export function polylineDist(x: number, y: number, pts: P[]): { d: number; s: number; i: number; t: number } {
  let best = Infinity;
  let bs = 0;
  let bi = 0;
  let bt = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2);
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    const L = Math.sqrt(L2);
    if (d < best) {
      best = d;
      bs = acc + L * t;
      bi = i - 1;
      bt = t;
    }
    acc += L;
  }
  return { d: best, s: bs, i: bi, t: bt };
}

/** A Catmull–Rom curve through the points, sampled every `step` units (ends kept exactly). */
export function catmull(pts: P[], step: number): P[] {
  if (pts.length < 3) {
    const [a, b] = pts;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / step));
    return Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as P);
  }
  const out: P[] = [];
  const ext: P[] = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(L / (step * 0.5)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([...pts[pts.length - 1]] as P);
  return resample(out, step);
}

/** Points every `step` along a polyline (its ends kept). */
export function resample(pts: P[], step: number): P[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = acc[acc.length - 1];
  const n = Math.max(1, Math.round(L / step));
  const out: P[] = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n;
    while (j < pts.length - 1 && acc[j] < s) j++;
    const t = (s - acc[j - 1]) / (acc[j] - acc[j - 1] || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t]);
  }
  out[0] = [...pts[0]] as P;
  out[out.length - 1] = [...pts[pts.length - 1]] as P;
  return out;
}

export const lengthOf = (pts: P[]) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};

/** Point and unit direction at distance s along a polyline. */
export function pointAt(pts: P[], s: number): { x: number; y: number; tx: number; ty: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L ? clamp((s - acc) / L) : 0;
      const tx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
      const ty = (pts[i][1] - pts[i - 1][1]) / (L || 1);
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, tx, ty };
    }
    acc += L;
  }
  return { x: pts[0][0], y: pts[0][1], tx: 1, ty: 0 };
}
