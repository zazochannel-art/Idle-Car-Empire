// Nordheim's landmarks with a shape of their own: the Racing District's
// circuit, the airport's runway, the ore railway from the mines to its quay
// on the fjord, the ships' berths, the cable car up to the ski summit.
import { catmull, type P } from "./noise";

/** The circuit: a closed loop round these points (smoothed), then 240 points along it. */
const CIRCUIT_CTRL: P[] = [
  [-40, 15.5], [-42.5, 11], [-40.5, 5.5], [-35, 4], [-29.5, 5], [-26, 7.5], [-22, 5], [-17.5, 6], [-16, 10.5], [-19.5, 14.5], [-25.5, 14.8], [-31, 16.5], [-36, 17.2],
];

export function circuit(): P[] {
  const loop = [...CIRCUIT_CTRL, CIRCUIT_CTRL[0], CIRCUIT_CTRL[1]];
  const pts = catmull([CIRCUIT_CTRL[CIRCUIT_CTRL.length - 1], ...loop], 0.25);
  // keep one lap: from the first control point round to it again
  let i0 = 0;
  let i1 = pts.length - 1;
  let best0 = Infinity;
  let best1 = Infinity;
  const half = Math.floor(pts.length / 2);
  pts.forEach(([x, y], i) => {
    const d = Math.hypot(x - CIRCUIT_CTRL[0][0], y - CIRCUIT_CTRL[0][1]);
    if (i < half && d < best0) {
      best0 = d;
      i0 = i;
    }
    if (i >= half && d < best1) {
      best1 = d;
      i1 = i;
    }
  });
  const lap = pts.slice(i0, i1);
  // 240 points evenly along the lap
  const acc = [0];
  for (let i = 1; i < lap.length; i++) acc.push(acc[i - 1] + Math.hypot(lap[i][0] - lap[i - 1][0], lap[i][1] - lap[i - 1][1]));
  const L = acc[acc.length - 1] + Math.hypot(lap[0][0] - lap[lap.length - 1][0], lap[0][1] - lap[lap.length - 1][1]);
  const out: P[] = [];
  let j = 1;
  for (let k = 0; k < 240; k++) {
    const s = (L * k) / 240;
    while (j < lap.length - 1 && acc[j] < s) j++;
    if (s > acc[lap.length - 1]) {
      const t = (s - acc[lap.length - 1]) / (L - acc[lap.length - 1]);
      const a = lap[lap.length - 1];
      out.push([round(a[0] + (lap[0][0] - a[0]) * t), round(a[1] + (lap[0][1] - a[1]) * t)]);
      continue;
    }
    const t = (s - acc[j - 1]) / (acc[j] - acc[j - 1] || 1);
    out.push([round(lap[j - 1][0] + (lap[j][0] - lap[j - 1][0]) * t), round(lap[j - 1][1] + (lap[j][1] - lap[j - 1][1]) * t)]);
  }
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** The runway: its two ends (planes take off toward the second). */
export const RUNWAY: { a: P; b: P } = { a: [97, 53], b: [125, 41] };

/** The ore railway: from the mine's yard down to the loading quay on the fjord. */
export const RAIL: P[] = catmull([[-117, -27], [-112, -19], [-106, -10], [-101, -3]], 1.5).map(([x, y]) => [round(x), round(y)]);

/** Where ships moor: off the industrial harbour's quay and the ore quay. */
export const QUAYS: P[] = [[-86, 12.5], [-101, 1.5]];

/** The cable car: from the ski village up to the summit station. */
export const CABLE_CAR = { a: [-33, -33] as P, b: [-41, -55] as P };
