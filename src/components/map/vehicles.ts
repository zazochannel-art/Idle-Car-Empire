import { sx, sy, type Painter } from "./iso";

/** 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
export type Dir = 0 | 1 | 2 | 3;

export const CAR_COLORS = ["#dc2626", "#2563eb", "#f1f5f9", "#facc15", "#16a34a", "#111827", "#ea580c", "#7c3aed", "#94a3b8", "#0891b2"];

/** Fictional car classes, from cheap to spectacular. */
export type CarModel = "city" | "sedan" | "suv" | "sports" | "muscle" | "luxury" | "supercar" | "hypercar" | "electric";
export const CAR_MODELS: CarModel[] = ["city", "sedan", "suv", "sports", "muscle", "luxury", "supercar", "hypercar", "electric"];

interface Spec {
  /** Length and width in tiles (at s = 1). */
  len: number;
  wid: number;
  /** Ground clearance, body height, cabin height (px at s = 1). */
  clear: number;
  body: number;
  cabin: number;
  /** Cabin length (share of the car) and its offset toward the rear. */
  cabinLen: number;
  cabinOff: number;
  /** Width of the glasshouse (share of the car). */
  cabinW: number;
  wheel: number;
  spoiler?: number;
  stripes?: boolean;
  chrome?: boolean;
  led?: boolean;
  rails?: boolean;
  scoop?: boolean;
}

const SPECS: Record<CarModel, Spec> = {
  city: { len: 0.44, wid: 0.26, clear: 1.5, body: 2.7, cabin: 2.9, cabinLen: 0.56, cabinOff: 0.02, cabinW: 0.84, wheel: 1.5 },
  sedan: { len: 0.56, wid: 0.27, clear: 1.5, body: 2.6, cabin: 2.4, cabinLen: 0.44, cabinOff: 0.04, cabinW: 0.82, wheel: 1.6 },
  suv: { len: 0.58, wid: 0.3, clear: 2.1, body: 3.4, cabin: 2.8, cabinLen: 0.6, cabinOff: 0.08, cabinW: 0.86, wheel: 2, rails: true },
  sports: { len: 0.56, wid: 0.29, clear: 1.2, body: 2.2, cabin: 1.8, cabinLen: 0.34, cabinOff: 0.06, cabinW: 0.76, wheel: 1.7, spoiler: 1 },
  muscle: { len: 0.6, wid: 0.3, clear: 1.4, body: 2.5, cabin: 1.9, cabinLen: 0.3, cabinOff: 0.12, cabinW: 0.8, wheel: 1.8, stripes: true, scoop: true },
  luxury: { len: 0.64, wid: 0.29, clear: 1.5, body: 2.6, cabin: 2.3, cabinLen: 0.44, cabinOff: 0.06, cabinW: 0.82, wheel: 1.8, chrome: true },
  supercar: { len: 0.6, wid: 0.32, clear: 1, body: 1.8, cabin: 1.6, cabinLen: 0.3, cabinOff: 0.02, cabinW: 0.7, wheel: 1.8, spoiler: 2 },
  hypercar: { len: 0.64, wid: 0.33, clear: 0.9, body: 1.7, cabin: 1.5, cabinLen: 0.26, cabinOff: 0, cabinW: 0.62, wheel: 1.9, spoiler: 3, led: true },
  electric: { len: 0.58, wid: 0.29, clear: 1.3, body: 2.3, cabin: 2, cabinLen: 0.5, cabinOff: 0.02, cabinW: 0.84, wheel: 1.7, led: true },
};

export interface CarOpts {
  /** Raise the whole car (lifts). */
  lift?: number;
  /** Brake lights on. */
  brake?: boolean;
  /** Headlights on (evening and night). */
  lights?: boolean;
  /** Skip the ground shadow (car on a deck). */
  noShadow?: boolean;
}

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

/** A wheel standing in a side plane: sheared ellipse with tyre, rim and hub. */
function wheel(p: Painter, wx: number, wy: number, z: number, r: number, ax: boolean, rimColor: string) {
  const c = p.ctx;
  c.save();
  c.transform(1, ax ? 0.5 : -0.5, 0, 1, sx(wx, wy), sy(wx, wy, z + r));
  c.beginPath();
  c.ellipse(0, 0, r * 0.62, r, 0, 0, Math.PI * 2);
  c.fillStyle = "#0b0f17";
  c.fill();
  c.beginPath();
  c.ellipse(0, 0, r * 0.4, r * 0.64, 0, 0, Math.PI * 2);
  c.fillStyle = p.col(rimColor);
  c.fill();
  c.beginPath();
  c.ellipse(0, 0, r * 0.14, r * 0.22, 0, 0, Math.PI * 2);
  c.fillStyle = "#1f2937";
  c.fill();
  c.restore();
}

/**
 * A detailed car. `model` sets the silhouette; `s` scales it (1 on the map,
 * ~3-4 inside a garage).
 */
export function drawModel(p: Painter, x: number, y: number, dir: Dir, model: CarModel, color: string, s = 1, opts: CarOpts = {}) {
  const sp = SPECS[model];
  const ax = dir === 0 || dir === 2;
  const sgn = dir === 0 || dir === 1 ? 1 : -1;
  const L = sp.len * s;
  const Wd = sp.wid * s;
  const lift = opts.lift ?? 0;
  const z0 = sp.clear * s + lift;
  const bodyH = sp.body * s;
  // level of detail: wheels, lights and trim only when big enough to see
  const detail = s * (p.zoom ?? 1) > 1.05;
  const rim = sp.chrome || model === "hypercar" ? "#e5e7eb" : model === "supercar" ? "#facc15" : "#9ca3af";

  if (!opts.noShadow) p.ellipse(x + 0.03 * s, y + 0.01 * s, 0, L * 30, "rgba(0,0,0,0.3)", 0.42);

  // wheels: far side first, near side after the body
  const wr = sp.wheel * s;
  const axles = [-0.31, 0.3];
  const wheelAt = (a: number, side: number): [number, number] => (ax ? [x + a * L, y + side * (Wd / 2)] : [x + side * (Wd / 2), y + a * L]);
  if (detail) for (const a of axles) wheel(p, ...wheelAt(a, -1), lift, wr, ax, rim);

  // body: a lower tub and a slightly narrower shoulder line
  along(p, x, y, dir, L, Wd, 0, z0, bodyH * 0.55, p.col(color, -0.08));
  along(p, x, y, dir, L * 0.97, Wd * 0.96, 0, z0 + bodyH * 0.55, bodyH * 0.45, color);

  // visible side and ends of the body box
  const x0 = ax ? x - L / 2 : x - Wd / 2;
  const y0 = ax ? y - Wd / 2 : y - L / 2;
  const sideStrip = (u0: number, u1: number, v0: number, v1: number, fill: string) => {
    // u in [0, 1] from rear to front
    const a = sgn > 0 ? u0 : 1 - u1;
    const b = sgn > 0 ? u1 : 1 - u0;
    if (ax) p.onLeft(x0, y0 + Wd, z0, a * L, b * L, v0, v1, fill);
    else p.onRight(x0 + Wd, y0, z0, a * L, b * L, v0, v1, fill);
  };
  const end = (front: boolean, u0: number, u1: number, v0: number, v1: number, fill: string) => {
    // the visible end face: right face for x-cars, left face for y-cars
    const visibleIsFront = dir === 0 || dir === 1;
    if (front !== visibleIsFront) return;
    if (ax) p.onRight(x0 + L, y0, z0, u0 * Wd, u1 * Wd, v0, v1, fill);
    else p.onLeft(x0, y0 + L, z0, u0 * Wd, u1 * Wd, v0, v1, fill);
  };

  if (detail) {
    // chrome / trim line and door seams
    sideStrip(0.04, 0.96, bodyH * 0.52, bodyH * 0.58, sp.chrome ? p.col("#e5e7eb") : "rgba(0,0,0,0.18)");
    sideStrip(0.47, 0.475, bodyH * 0.15, bodyH * 0.95, "rgba(0,0,0,0.22)");
    if (sp.stripes) sideStrip(0.05, 0.95, bodyH * 0.7, bodyH * 0.82, "rgba(255,255,255,0.75)");
    // grille, headlights and tail lights
    end(true, 0.25, 0.75, bodyH * 0.15, bodyH * 0.45, sp.led ? "#0f172a" : "#1f2937");
    const head = opts.lights ? "#fffbe6" : "#e2e8f0";
    if (sp.led) end(true, 0.06, 0.94, bodyH * 0.62, bodyH * 0.72, p.col("#a5f3fc"));
    else {
      end(true, 0.06, 0.24, bodyH * 0.5, bodyH * 0.72, head);
      end(true, 0.76, 0.94, bodyH * 0.5, bodyH * 0.72, head);
    }
    const tail = opts.brake ? "#ff3b3b" : "#b91c1c";
    if (sp.led) end(false, 0.06, 0.94, bodyH * 0.58, bodyH * 0.7, tail);
    else {
      end(false, 0.06, 0.26, bodyH * 0.5, bodyH * 0.74, tail);
      end(false, 0.74, 0.94, bodyH * 0.5, bodyH * 0.74, tail);
    }
    end(false, 0.3, 0.7, bodyH * 0.08, bodyH * 0.22, "rgba(0,0,0,0.35)");
  }

  // glasshouse: tinted glass with a body-coloured roof
  const cz = z0 + bodyH;
  const cabH = sp.cabin * s;
  const cl = L * sp.cabinLen;
  const co = -L * sp.cabinOff;
  // windscreen rake: a lower glass step in front of the cabin
  if (detail) along(p, x, y, dir, cl * 0.25, Wd * sp.cabinW * 0.98, co + cl * 0.55, cz, cabH * 0.5, "#1e3a5f", "#24476e");
  along(p, x, y, dir, cl, Wd * sp.cabinW, co, cz, cabH, "#1e3a5f", p.col(color, 0.06));
  if (detail) {
    // window frames on the visible side and a sky reflection on the glass
    const glassU0 = 0.5 + (co - cl / 2) / L;
    const glassU1 = 0.5 + (co + cl / 2) / L;
    sideStrip(Math.max(0, glassU0 + 0.02), Math.min(1, glassU1 - 0.02), bodyH + cabH * 0.15, bodyH + cabH * 0.75, "rgba(186,230,253,0.22)");
    sideStrip(0.5 + co / L - 0.006, 0.5 + co / L + 0.006, bodyH, bodyH + cabH, p.col(color, -0.2));
    // mirrors
    along(p, x, y, dir, 0.04 * s, Wd * 1.12, co + cl * 0.55, cz + cabH * 0.1, 1 * s, color);
    if (sp.rails) {
      along(p, x, y, dir, cl * 0.9, 0.025 * s, co, cz + cabH, 0.6 * s, "#334155");
    }
    if (sp.scoop) along(p, x, y, dir, L * 0.12, Wd * 0.3, L * 0.28, cz, 0.9 * s, "#111827");
  }
  // gloss: a soft highlight on the roof and bonnet
  along(p, x, y, dir, cl * 0.5, Wd * sp.cabinW * 0.4, co - cl * 0.1, cz + cabH, 0.01, "rgba(255,255,255,0.28)", "rgba(255,255,255,0.28)");
  if (sp.spoiler && detail) {
    const back = -L * 0.44;
    along(p, x, y, dir, 0.05 * s, Wd * 0.2, back, cz, (sp.spoiler + 0.6) * s, "#111827");
    along(p, x, y, dir, 0.1 * s, Wd * (0.85 + sp.spoiler * 0.05), back, cz + (sp.spoiler + 0.6) * s, 0.6 * s, model === "hypercar" ? "#111827" : p.col(color, -0.15));
  }
  if (detail) for (const a of axles) wheel(p, ...wheelAt(a, 1), lift, wr, ax, rim);

  // lights for the evening/night pass
  if (opts.lights || sp.led) {
    const fx = ax ? x + (L / 2) * sgn : x;
    const fy = ax ? y : y + (L / 2) * sgn;
    p.light(sx(fx, fy), sy(fx, fy, z0 + bodyH * 0.6), 14 * s, sp.led ? "#a5f3fc" : "#fff7d6", 0.8);
    const bx = ax ? x - (L / 2) * sgn : x;
    const by = ax ? y : y - (L / 2) * sgn;
    p.light(sx(bx, by), sy(bx, by, z0 + bodyH * 0.6), (opts.brake ? 10 : 6) * s, "#ff3b3b", opts.brake ? 0.9 : 0.5);
  }
}

/** Compatibility wrapper: sedan by default, a sports car when `sporty`. */
export function drawCar(p: Painter, x: number, y: number, dir: Dir, color: string, s = 1, lift = 0, sporty = false) {
  drawModel(p, x, y, dir, sporty ? "sports" : "sedan", color, s, { lift, lights: p.night > 0.35 });
}

export function drawTruck(p: Painter, x: number, y: number, dir: Dir, cargo: string, s = 1, brake = false) {
  const ax = dir === 0 || dir === 2;
  const sgn = dir === 0 || dir === 1 ? 1 : -1;
  p.ellipse(x, y, 0, 24 * s, "rgba(0,0,0,0.3)", 0.42);
  const back = -0.12 * s;
  const front = 0.3 * s;
  const cx = (o: number) => (ax ? x + o * sgn : x);
  const cy = (o: number) => (ax ? y : y + o * sgn);
  const r = 1.8 * s;
  const wheelAt = (o: number, side: number): [number, number] => (ax ? [cx(o), y + side * 0.15 * s] : [x + side * 0.15 * s, cy(o)]);
  for (const o of [-0.32, -0.08, 0.32]) wheel(p, ...wheelAt(o * s, -1), 0, r, ax, "#9ca3af");
  const drawCargo = () => {
    along(p, cx(back), cy(back), dir, 0.62 * s, 0.3 * s, 0, 2 * s, 9 * s, cargo, "#f1f5f9");
    // ribbed side panels
    for (let i = 1; i < 6; i++) along(p, cx(back - 0.31 * s + i * 0.1 * s), cy(back - 0.31 * s + i * 0.1 * s), dir, 0.008 * s, 0.305 * s, 0, 2.5 * s, 8 * s, "rgba(0,0,0,0.12)");
  };
  const drawCab = () => {
    along(p, cx(front), cy(front), dir, 0.2 * s, 0.28 * s, 0, 2 * s, 7.5 * s, "#e2e8f0", "#cbd5e1");
    along(p, cx(front + 0.02 * s), cy(front + 0.02 * s), dir, 0.17 * s, 0.29 * s, 0, 6 * s, 2.5 * s, "#1e3a5f");
  };
  if (sgn > 0) {
    drawCargo();
    drawCab();
  } else {
    drawCab();
    drawCargo();
  }
  for (const o of [-0.32, -0.08, 0.32]) wheel(p, ...wheelAt(o * s, 1), 0, r, ax, "#9ca3af");
  if (p.night > 0.35) {
    const fx = cx(front + 0.1 * s);
    const fy = cy(front + 0.1 * s);
    p.light(sx(fx, fy), sy(fx, fy, 4 * s), 16 * s, "#fff7d6", 0.8);
  }
  if (brake) {
    const bx = cx(back - 0.31 * s);
    const by = cy(back - 0.31 * s);
    p.light(sx(bx, by), sy(bx, by, 3 * s), 9 * s, "#ff3b3b", 0.8);
  }
}

/** Car carrier: cab plus a two-deck trailer with real cars on it. */
export function drawCarrier(p: Painter, x: number, y: number, dir: Dir, colors: [string, string], s = 1, models: [CarModel, CarModel] = ["sedan", "sports"]) {
  const ax = dir === 0 || dir === 2;
  const sgn = dir === 0 || dir === 1 ? 1 : -1;
  const pos = (o: number): [number, number] => [ax ? x + o * sgn : x, ax ? y : y + o * sgn];
  p.ellipse(x, y, 0, 30 * s, "rgba(0,0,0,0.3)", 0.4);
  const parts: [number, () => void][] = [
    [0.42, () => {
      along(p, ...pos(0.42 * s), dir, 0.2 * s, 0.28 * s, 0, 2 * s, 7.5 * s, "#f59e0b", "#fbbf24");
      along(p, ...pos(0.44 * s), dir, 0.16 * s, 0.29 * s, 0, 6 * s, 2.5 * s, "#1e3a5f");
    }],
    [0, () => {
      along(p, ...pos(-0.05 * s), dir, 0.82 * s, 0.3 * s, 0, 2 * s, 1.6 * s, "#475569");
      along(p, ...pos(-0.05 * s), dir, 0.82 * s, 0.03 * s, 0, 3.6 * s, 0.6 * s, "#94a3b8");
    }],
    [0.12, () => drawModel(p, ...pos(0.14 * s), dir, models[0], colors[0], s * 0.62, { lift: 3.6 * s, noShadow: true })],
    [-0.25, () => drawModel(p, ...pos(-0.27 * s), dir, models[1], colors[1], s * 0.62, { lift: 3.6 * s, noShadow: true })],
  ];
  parts.sort((a, b) => a[0] * sgn - b[0] * sgn);
  for (const [, draw] of parts) draw();
}
