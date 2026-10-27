// Circuit geometry: each track is a closed polygon of corner points in its
// own tile frame. Corners are rounded with quadratic curves (tight where the
// points are close, so hairpins stay hairpins), the path is sampled every
// few centimetres of tile, and a speed profile (brake into the corners,
// accelerate out of them) turns lap times into positions. Pure data — the
// map, the race viewer and the tests share it.
import { GRID_GAP, RACE_COUNTDOWN, RACE_TIME_SCALE, type TrackId } from "../config/racing";
import type { RaceEntrant, RaceRecord } from "../types";

export interface TrackLayout {
  /** Corner points of the racing line (closed), each with its own curve size when given (tiles). */
  points: ([number, number] | [number, number, number])[];
  /** How far before a corner its curve starts (tiles), for corners without their own. */
  radius: number;
  /** Height of the rolling ground the circuit runs over, in metres (the 3D viewer; 0: flat). */
  hills?: number;
  /** Asphalt width (tiles). */
  width: number;
  /** Where the start/finish line is, as a share of the lap from the first point. */
  start: number;
  /** Size of the frame the points live in. */
  w: number;
  d: number;
}

/**
 * The circuits. Each one starts on its main straight: the first point sits on it (the corners
 * before and after are the last and first of the lap), so the grid behind the start line, the
 * line itself and the pit lane on the infield side all lie on the straight. Corners carry their
 * own curve size where they differ from the circuit's; the race viewer draws the ground rolling
 * by `hills` metres. tracks.test.ts checks that every lap stays clear of itself and that the grid,
 * the start and the pit lane sit on the straight.
 */
export const TRACK_LAYOUTS: Record<TrackId, TrackLayout> = {
  // The home circuit: a club track with a long pit straight, a fast first corner into a pair of
  // esses, a tight hairpin, a flowing infield and a last corner onto the straight.
  small: {
    points: [
      [7, 2.5], [20.5, 2.5, 2], [22.5, 5, 1.4], [20.5, 7.5, 1.4], [22, 10, 1.4], [21, 12.8, 1],
      [17.5, 13, 1], [16, 10, 1.6], [12.5, 8.5, 1.8], [9.5, 11.5, 1.6], [6.5, 13, 1.6], [3.5, 11.5, 1.4],
      [2.5, 7.5, 1.6], [4.5, 5, 1.2], [2.5, 2.5, 1.2],
    ],
    radius: 1.4,
    width: 1.1,
    start: 0.0929,
    w: 25,
    d: 15.5,
  },
  // Between warehouses: square corners, a loop round a loading bay and a chicane on the back
  // straight.
  industrial: {
    points: [
      [7, 2.5], [23.5, 2.5, 1.2], [23.5, 8.5, 1.2], [18.5, 8.5, 1], [18.5, 11.5, 1], [23.5, 11.5, 1.2],
      [23.5, 15.5, 1.2], [14, 15.5, 1], [12.5, 14, 0.8], [10, 14, 0.8], [8.5, 15.5, 1], [3, 15.5, 1.2],
      [3, 10, 1.2], [6.5, 8.5, 1], [3, 6, 1.2], [2.5, 2.5, 1.2],
    ],
    radius: 1.2,
    width: 1.25,
    start: 0.0667,
    w: 26.5,
    d: 18,
  },
  // Over the hills: sweeping bends, switchbacks down into the valley and a climb back to the start.
  mountain: {
    points: [
      [7.5, 2.5], [20, 2.5, 2.4], [24, 5, 2], [24, 8.5, 2], [21, 10.5, 1.6], [23.5, 14, 1.4],
      [21, 17, 1.6], [16, 16, 2], [14, 12.5, 1.2], [11, 13.5, 1], [12.5, 17, 1.2], [8, 17.5, 1.6],
      [4, 15, 2], [5.5, 11, 1.6], [2.5, 7.5, 2], [3.5, 3, 1.6],
    ],
    radius: 1.8,
    width: 1.2,
    start: 0.0821,
    w: 26.5,
    d: 20,
    hills: 9,
  },
  // Along the shore: fast sweepers by the sea and a tight harbour hairpin.
  coastal: {
    points: [
      [9, 2.5], [22, 2.5, 3], [27, 4.5, 2.4], [27.5, 8, 2], [24, 10.5, 2.4], [18, 11, 2.4], [15, 8.5, 1.2],
      [12.5, 9, 1], [11, 11.5, 1.4], [6, 12, 2.4], [2.5, 9, 2.4], [2.5, 5, 2], [4.5, 2.5, 1.6],
    ],
    radius: 2.4,
    width: 1.3,
    start: 0.1014,
    w: 30,
    d: 18,
    hills: 3,
  },
  // Long flat-out straights through the dunes, fast bends and a twisty section at the far end.
  desert: {
    points: [
      [9, 2.5], [27, 2.5, 3], [30, 6, 2.6], [28, 10, 2], [22, 10.5, 2], [19, 13, 1.6], [22, 15.5, 1.6],
      [13, 16, 2.4], [8, 13.5, 2], [4, 15, 1.6], [2, 11, 2.4], [3, 6, 2.4], [4.5, 2.5, 1.8],
    ],
    radius: 2.4,
    width: 1.4,
    start: 0.0843,
    w: 32.5,
    d: 18.5,
    hills: 4,
  },
  // Through the city blocks at night: right-angle turns round the blocks, two loops and a long back
  // straight.
  nightCity: {
    points: [
      [6, 2.5], [18, 2.5, 1], [18, 6, 0.9], [21.5, 6, 0.9], [21.5, 2.5, 1], [25.5, 2.5, 1.2],
      [25.5, 10, 1], [21, 10, 0.9], [21, 13.5, 0.9], [25.5, 13.5, 1], [25.5, 17.5, 1.2], [13, 17.5, 1],
      [13, 13, 0.9], [8.5, 13, 0.9], [8.5, 17.5, 1], [2.5, 17.5, 1.2], [2.5, 2.5, 1.2],
    ],
    radius: 1,
    width: 1.2,
    start: 0.0531,
    w: 28,
    d: 20,
  },
  // The classic: a long straight into a hairpin, a chicane, a sweeping right-hander, a run of esses
  // and a stadium section.
  grandPrix: {
    points: [
      [8, 2.5], [25, 2.5, 1.4], [27, 5.5, 1.4], [24, 7, 1.2], [26, 9.5, 1.6], [29, 11, 2.2], [28.5, 16, 2],
      [24, 17.5, 2], [20, 15.5, 1.6], [16, 17.5, 1.6], [12, 15.5, 1.6], [8.5, 17.5, 1.4], [4, 16.5, 1.8],
      [2.5, 12, 2], [6, 9.5, 1], [6.5, 6.5, 1], [3, 5, 1.4], [2.5, 2.5, 1.2],
    ],
    radius: 1.6,
    width: 1.35,
    start: 0.0691,
    w: 31.5,
    d: 20,
  },
  // The longest: a straight of a kilometre and more, fast bends, a slow infield and every kind of
  // corner.
  international: {
    points: [
      [8, 2.5], [30, 2.5, 2.4], [33.5, 5.5, 2], [31, 9, 1.6], [33.5, 13, 2], [32, 18, 2.4],
      [27, 21.5, 2.4], [22, 19, 1.6], [22, 14.5, 1.2], [18, 13, 1.2], [14, 16, 1.6], [15.5, 20, 1.4],
      [11, 21.5, 2], [6, 19.5, 2], [3.5, 15, 2], [7, 11.5, 1.6], [11, 10, 1.2], [10, 6.5, 1.4],
      [5, 6, 1.4], [2.5, 3.5, 1.2],
    ],
    radius: 2,
    width: 1.4,
    start: 0.0563,
    w: 36,
    d: 24,
    hills: 3,
  },
};

export interface TrackSample {
  x: number;
  y: number;
  /** Distance from the first point. */
  s: number;
  yaw: number;
  /** Signed curvature (1/tiles): + turning toward +yaw. */
  k: number;
  /** Speed profile: 1 = flat out. */
  v: number;
  /** Time from the first point at the reference speed. */
  t: number;
}

export interface Track {
  id: TrackId;
  layout: TrackLayout;
  samples: TrackSample[];
  length: number;
  /** Lap time at the reference speed (profile units). */
  lapT: number;
  /** Distance of the start/finish line. */
  startS: number;
}

const STEP = 0.08;

/** Rounds every corner with a quadratic curve and samples the closed path. */
function sampleLayout(L: TrackLayout): { x: number; y: number }[] {
  const pts = L.points;
  const n = pts.length;
  const out: { x: number; y: number }[] = [];
  const corner = (i: number) => {
    const [px, py] = pts[(i - 1 + n) % n];
    const [cx, cy, own] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    const lin = Math.hypot(cx - px, cy - py);
    const lout = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(own ?? L.radius, lin * 0.48, lout * 0.48);
    return {
      a: [cx + ((px - cx) / lin) * r, cy + ((py - cy) / lin) * r] as [number, number],
      c: [cx, cy] as [number, number],
      b: [cx + ((nx - cx) / lout) * r, cy + ((ny - cy) / lout) * r] as [number, number],
    };
  };
  const corners = pts.map((_, i) => corner(i));
  for (let i = 0; i < n; i++) {
    const { a, c, b } = corners[i];
    // the curve through the corner
    const segs = 12;
    for (let j = 0; j < segs; j++) {
      const u = j / segs;
      const x = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0];
      const y = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1];
      out.push({ x, y });
    }
    // the straight to the next corner
    const next = corners[(i + 1) % n].a;
    const len = Math.hypot(next[0] - b[0], next[1] - b[1]);
    const m = Math.max(1, Math.round(len / 0.5));
    for (let j = 0; j < m; j++) out.push({ x: b[0] + ((next[0] - b[0]) * j) / m, y: b[1] + ((next[1] - b[1]) * j) / m });
  }
  return out;
}

/** Re-samples a closed polyline at even steps. */
function resample(raw: { x: number; y: number }[]): { x: number; y: number; s: number }[] {
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i % raw.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[raw.length];
  const n = Math.max(8, Math.round(total / STEP));
  const out: { x: number; y: number; s: number }[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i * total) / n;
    while (cum[j + 1] < s) j++;
    const a = raw[j];
    const b = raw[(j + 1) % raw.length];
    const u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, s });
  }
  return out;
}

/** Corner speed: v ≤ √(grip / |k|); then acceleration and braking limits along the lap. */
const GRIP = 0.12;
const ACCEL = 0.12;
const BRAKE = 0.3;

const cache = new Map<TrackId, Track>();

export function trackOf(id: TrackId): Track {
  const hit = cache.get(id);
  if (hit) return hit;
  const layout = TRACK_LAYOUTS[id];
  const pts = resample(sampleLayout(layout));
  const n = pts.length;
  const length = (pts[n - 1].s + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y)) || 1;
  const yaw = pts.map((p, i) => {
    const a = pts[(i - 2 + n) % n];
    const b = pts[(i + 2) % n];
    return Math.atan2(b.y - a.y, b.x - a.x);
  });
  const samples: TrackSample[] = pts.map((p, i) => {
    let dy = yaw[(i + 3) % n] - yaw[(i - 3 + n) % n];
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    const k = dy / (6 * STEP);
    return { x: p.x, y: p.y, s: p.s, yaw: yaw[i], k, v: Math.min(1, Math.sqrt(GRIP / Math.max(1e-4, Math.abs(k)))), t: 0 };
  });
  // braking before corners (backwards) and accelerating out of them (forwards), twice round for the wrap
  for (let pass = 0; pass < 2; pass++)
    for (let i = 2 * n - 1; i >= 0; i--) {
      const a = samples[i % n];
      const b = samples[(i + 1) % n];
      a.v = Math.min(a.v, Math.sqrt(b.v * b.v + 2 * BRAKE * STEP));
    }
  for (let pass = 0; pass < 2; pass++)
    for (let i = 1; i <= 2 * n; i++) {
      const a = samples[(i - 1) % n];
      const b = samples[i % n];
      b.v = Math.min(b.v, Math.sqrt(a.v * a.v + 2 * ACCEL * STEP));
    }
  let t = 0;
  for (let i = 0; i < n; i++) {
    samples[i].t = t;
    const ds = (i + 1 < n ? samples[i + 1].s : length) - samples[i].s;
    t += ds / Math.max(0.05, (samples[i].v + samples[(i + 1) % n].v) / 2);
  }
  const track: Track = { id, layout, samples, length, lapT: t, startS: layout.start * length };
  cache.set(id, track);
  return track;
}

// ───────────────────────────── along the track ─────────────────────────────

const mod = (a: number, m: number) => ((a % m) + m) % m;

function indexAt(tr: Track, s: number): [number, number] {
  const u = mod(s, tr.length) / STEP;
  const n = tr.samples.length;
  const i = Math.floor(u) % n;
  return [i, u - Math.floor(u)];
}

export interface TrackPoint {
  x: number;
  y: number;
  yaw: number;
  k: number;
  v: number;
}

/** Point on the racing line `lat` tiles to the left (+) or right (−) of the centre. */
export function pointAt(tr: Track, s: number, lat = 0): TrackPoint {
  const [i, f] = indexAt(tr, s);
  const a = tr.samples[i];
  const b = tr.samples[(i + 1) % tr.samples.length];
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  const yaw = a.yaw + dy * f;
  const x = a.x + (b.x - a.x) * f + Math.sin(yaw) * lat;
  const y = a.y + (b.y - a.y) * f - Math.cos(yaw) * lat;
  return { x, y, yaw, k: a.k + (b.k - a.k) * f, v: a.v + (b.v - a.v) * f };
}

/** Reference time to reach distance `s` (unwrapped: laps add up). */
export function timeAt(tr: Track, s: number): number {
  const laps = Math.floor(s / tr.length);
  const [i, f] = indexAt(tr, s);
  const a = tr.samples[i].t;
  const b = i + 1 < tr.samples.length ? tr.samples[i + 1].t : tr.lapT;
  return laps * tr.lapT + a + (b - a) * f;
}

/** Distance reached at reference time `t` (the inverse of timeAt). */
export function distanceAt(tr: Track, t: number): number {
  const laps = Math.floor(t / tr.lapT);
  const r = t - laps * tr.lapT;
  const S = tr.samples;
  let lo = 0;
  let hi = S.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S[mid].t <= r) lo = mid;
    else hi = mid - 1;
  }
  const a = S[lo];
  const tb = lo + 1 < S.length ? S[lo + 1].t : tr.lapT;
  const sb = lo + 1 < S.length ? S[lo + 1].s : tr.length;
  const f = (r - a.t) / Math.max(1e-9, tb - a.t);
  return laps * tr.length + a.s + (sb - a.s) * f;
}

// ───────────────────────────── replaying a race ─────────────────────────────

/** Space between grid slots (tiles). */
export const GRID_SPACING = 0.75;

export interface CarOnTrack {
  id: string;
  /** Distance travelled along the track (unwrapped, from the first point). */
  s: number;
  /** Laps completed. */
  lap: number;
  finished: boolean;
  /** Shown race time so far (seconds). */
  time: number;
  /** The speed profile here (1 = flat out) and whether the car is braking. */
  v: number;
  braking: boolean;
  /** Grid slot: odd slots stand to the right. */
  grid: number;
}

/** Where every car is `elapsed` real seconds after the countdown began. */
export function raceState(rec: RaceRecord, tr: Track, elapsed: number): CarOnTrack[] {
  const d = Math.max(0, (elapsed - RACE_COUNTDOWN) * RACE_TIME_SCALE);
  return rec.entrants.map((e) => carAt(e, tr, rec.laps, d));
}

function carAt(e: RaceEntrant, tr: Track, laps: number, d: number): CarOnTrack {
  const L = tr.length;
  const gridS = tr.startS - (e.grid + 1) * GRID_SPACING;
  const delay = e.grid * GRID_GAP * RACE_TIME_SCALE;
  const base = { id: e.id, grid: e.grid };
  if (d <= delay) return { ...base, s: gridS, lap: 0, finished: false, time: d, v: 0, braking: false };
  let t0 = delay;
  for (let lap = 0; lap < laps; lap++) {
    const dur = e.laps[lap];
    if (d < t0 + dur) {
      const sa = lap === 0 ? gridS : tr.startS + lap * L;
      const sb = tr.startS + (lap + 1) * L;
      const u = (d - t0) / dur;
      const ta = timeAt(tr, sa + L * 4);
      const tb = timeAt(tr, sb + L * 4);
      const s = distanceAt(tr, ta + (tb - ta) * u) - L * 4;
      const p = pointAt(tr, s);
      const ahead = pointAt(tr, s + 0.6);
      return { ...base, s, lap, finished: false, time: d, v: p.v, braking: ahead.v < p.v - 0.02 };
    }
    t0 += dur;
  }
  // after the flag: a slow lap, then the car stops in the pit lane
  const over = d - e.total;
  const finishS = tr.startS + laps * L;
  const cool = Math.min(L * 0.92, (over / (e.laps[laps - 1] || 1)) * L * 0.45);
  return { ...base, s: finishS + cool, lap: laps, finished: true, time: e.total, v: cool < L * 0.92 ? 0.45 : 0, braking: false };
}

/** Running order: finished cars by finishing order, the rest by distance covered. */
export function runningOrder(rec: RaceRecord, cars: CarOnTrack[]): CarOnTrack[] {
  const fin = new Map(rec.order.map((id, i) => [id, i]));
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return (fin.get(a.id) ?? 0) - (fin.get(b.id) ?? 0);
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.s - a.s;
  });
}

/** Formats a shown race time: 2:34.821. */
export function raceClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}
