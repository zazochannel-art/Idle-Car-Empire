import { sx, sy, type Painter } from "./iso";

/** 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
export type Dir = 0 | 1 | 2 | 3;

export const CAR_COLORS = ["#ef4444", "#3b82f6", "#f8fafc", "#facc15", "#22c55e", "#0f172a", "#f97316", "#a855f7", "#94a3b8", "#06b6d4"];

/** Axis-aligned box centred on (x, y), long along the travel direction. */
function along(p: Painter, x: number, y: number, dir: Dir, len: number, wid: number, off: number, z: number, h: number, color: string, top?: string) {
  const ax = dir === 0 || dir === 2;
  const sgn = dir === 0 || dir === 1 ? 1 : -1;
  const cx = ax ? x + off * sgn : x;
  const cy = ax ? y : y + off * sgn;
  const w = ax ? len : wid;
  const d = ax ? wid : len;
  p.box(cx - w / 2, cy - d / 2, w, d, z, h, color, top, false);
}

function wheels(p: Painter, x: number, y: number, dir: Dir, len: number, wid: number, r: number, lift: number) {
  const ax = dir === 0 || dir === 2;
  const c = p.ctx;
  c.fillStyle = "#0b1220";
  for (const a of [-0.32, 0.32])
    for (const b of [-0.5, 0.5]) {
      const wx = ax ? x + a * len : x + b * wid;
      const wy = ax ? y + b * wid : y + a * len;
      c.beginPath();
      c.ellipse(sx(wx, wy), sy(wx, wy, r + lift), r * 0.9, r, 0, 0, Math.PI * 2);
      c.fill();
    }
}

/** A car; `s` scales it (1 on the map, ~4 inside a garage). `lift` raises it. */
export function drawCar(p: Painter, x: number, y: number, dir: Dir, color: string, s = 1, lift = 0, sporty = false) {
  const len = 0.52 * s;
  const wid = 0.27 * s;
  const z0 = 1.6 * s + lift;
  p.ellipse(x + 0.04 * s, y, 0, len * 26, "rgba(0,0,0,0.28)", 0.42);
  if (s >= 2) wheels(p, x, y, dir, len, wid, 1.7 * s, lift);
  const body = (sporty ? 2.6 : 3.2) * s;
  along(p, x, y, dir, len, wid, 0, z0, body, color);
  // glasshouse: tinted windows with a body-coloured roof
  along(p, x, y, dir, len * (sporty ? 0.4 : 0.48), wid * 0.8, -len * 0.05, z0 + body, (sporty ? 2 : 2.7) * s, "#1e3a5f", p.col(color, 0.08));
  if (s >= 2) {
    // headlights
    const ax = dir === 0 || dir === 2;
    const sgn = dir === 0 || dir === 1 ? 1 : -1;
    const hx = ax ? x + (len / 2) * sgn : x;
    const hy = ax ? y : y + (len / 2) * sgn;
    p.circle(hx, hy, z0 + 2.4 * s, 1.1 * s, "#fef9c3");
  }
}

export function drawTruck(p: Painter, x: number, y: number, dir: Dir, cargo: string, s = 1) {
  const ax = dir === 0 || dir === 2;
  const sgn = dir === 0 || dir === 1 ? 1 : -1;
  p.ellipse(x, y, 0, 22 * s, "rgba(0,0,0,0.28)", 0.42);
  // cargo box behind, cab in front
  const back = -0.12 * s;
  const front = 0.3 * s;
  const cx = (o: number) => (ax ? x + o * sgn : x);
  const cy = (o: number) => (ax ? y : y + o * sgn);
  const drawCargo = () => along(p, cx(back), cy(back), dir, 0.62 * s, 0.3 * s, 0, 2 * s, 9 * s, cargo, "#f1f5f9");
  const drawCab = () => along(p, cx(front), cy(front), dir, 0.2 * s, 0.28 * s, 0, 2 * s, 7 * s, "#e2e8f0", "#cbd5e1");
  // Draw whichever is further from the viewer first.
  if (sgn > 0) {
    drawCargo();
    drawCab();
  } else {
    drawCab();
    drawCargo();
  }
}

/** Car carrier: cab plus a two-car deck. */
export function drawCarrier(p: Painter, x: number, y: number, dir: Dir, colors: [string, string], s = 1) {
  const ax = dir === 0 || dir === 2;
  const sgn = dir === 0 || dir === 1 ? 1 : -1;
  const pos = (o: number): [number, number] => [ax ? x + o * sgn : x, ax ? y : y + o * sgn];
  p.ellipse(x, y, 0, 28 * s, "rgba(0,0,0,0.28)", 0.4);
  const parts: [number, () => void][] = [
    [0.42, () => along(p, ...pos(0.42 * s), dir, 0.2 * s, 0.28 * s, 0, 2 * s, 7 * s, "#f59e0b", "#fbbf24")],
    [0, () => along(p, ...pos(-0.05 * s), dir, 0.82 * s, 0.3 * s, 0, 2 * s, 1.6 * s, "#475569")],
    [0.12, () => drawCarOn(p, ...pos(0.14 * s), dir, colors[0], s, 3.6 * s)],
    [-0.25, () => drawCarOn(p, ...pos(-0.27 * s), dir, colors[1], s, 3.6 * s)],
  ];
  parts.sort((a, b) => a[0] * sgn - b[0] * sgn);
  for (const [, draw] of parts) draw();
}

function drawCarOn(p: Painter, x: number, y: number, dir: Dir, color: string, s: number, z: number) {
  const len = 0.34 * s;
  const wid = 0.24 * s;
  along(p, x, y, dir, len, wid, 0, z, 3 * s, color);
  along(p, x, y, dir, len * 0.5, wid * 0.84, 0, z + 3 * s, 2.4 * s, "#1e293b");
}
