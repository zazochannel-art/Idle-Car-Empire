import { liveryOf } from "../three/livery";
import { CAR_LENGTH } from "../three/car-models";
import type { CarId } from "@/game/types";
import { sprites3d, tierFor, type SpriteSize } from "../three/sprites";
import { shade, sx, sy, type Painter } from "./iso";

/** 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
export type Dir = 0 | 1 | 2 | 3;

export const CAR_COLORS = ["#dc2626", "#2563eb", "#f1f5f9", "#facc15", "#16a34a", "#111827", "#ea580c", "#7c3aed", "#94a3b8", "#0891b2"];

/** Fictional car classes, from cheap to spectacular. */
export type CarModel = "city" | "sedan" | "suv" | "sports" | "muscle" | "luxury" | "supercar" | "hypercar" | "electric" | "compact" | "minivan" | "offroad" | "pickup" | "wagon";
export const CAR_MODELS: CarModel[] = ["city", "sedan", "suv", "sports", "muscle", "luxury", "supercar", "hypercar", "electric", "compact", "minivan", "offroad", "pickup", "wagon"];


export interface CarOpts {
  /** Heading in radians on the map (0 = +x, π/2 = +y); overrides `dir` for smooth turns. */
  yaw?: number;
  /** Front wheels: -1 left, 0 straight, 1 right. */
  steer?: number;
  /** Distance driven (tiles), turns the wheels. */
  odo?: number;
  /** Assembly-line stage 0…8 (8 = finished car). */
  stage?: number;
  /** Raise the whole car (lifts). */
  lift?: number;
  /** Brake lights on. */
  brake?: boolean;
  /** Headlights on (evening and night). */
  lights?: boolean;
  /** Skip the ground shadow (car on a deck). */
  noShadow?: boolean;
  /** Keep the given colour (race liveries) instead of the model's factory colour. */
  paint?: boolean;
  /** The parts this car really got (Car DNA): paint, rims, engine, brakes. */
  build?: import("../three/car-models").BuildLook;
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
 * A car: its ready-made 3D model, drawn from the sprite cache; `s` scales it
 * (1 on the map, ~3-4 inside a garage). Faded areas show it see-through.
 * Until its sprite is made (a frame or two) nothing is drawn.
 */
export function drawModel(p: Painter, x: number, y: number, dir: Dir, model: CarModel, color: string, s = 1, opts: CarOpts = {}) {
  // finished cars wear their model's factory colour
  if ((opts.stage ?? 8) >= 6 && !opts.paint) color = liveryOf(model).color;
  const c = p.ctx;
  const alpha = c.globalAlpha;
  if (p.dim) c.globalAlpha = alpha * 0.5;
  drawCarSprite(p, x, y, opts.yaw ?? DIR_YAW[dir], model, color, s, opts);
  c.globalAlpha = alpha;
}

/** Compatibility wrapper: sedan by default, a sports car when `sporty`. */
export function drawCar(p: Painter, x: number, y: number, dir: Dir, color: string, s = 1, lift = 0, sporty = false) {
  drawModel(p, x, y, dir, sporty ? "sports" : "sedan", color, s, { lift, lights: p.night > 0.35 });
}

export function drawTruck(p: Painter, x: number, y: number, dir: Dir, cargo: string, s = 1, brake = false, look: TruckSpriteOpts = {}) {
  if (!p.dim && drawTruckSprite(p, x, y, look.yaw ?? DIR_YAW[dir], cargo, s, look)) {
    if (brake || p.night > 0.35) truckGlows(p, x, y, look.yaw ?? DIR_YAW[dir], s, brake);
    return;
  }
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
    const rib = shade(cargo, -0.14);
    for (let i = 1; i < 6; i++) along(p, cx(back - 0.31 * s + i * 0.1 * s), cy(back - 0.31 * s + i * 0.1 * s), dir, 0.008 * s, 0.305 * s, 0, 2.5 * s, 8 * s, rib, rib);
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
export function drawCarrier(p: Painter, x: number, y: number, dir: Dir, colors: [string, string], s = 1, models: [CarModel, CarModel] = ["sedan", "sports"], look: TruckSpriteOpts = {}) {
  if (!p.dim && drawCarrierSprite(p, x, y, look.yaw ?? DIR_YAW[dir], colors, models, s, look)) {
    if (p.night > 0.35) truckGlows(p, x, y, look.yaw ?? DIR_YAW[dir], s, false);
    return;
  }
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

/** How each car model of the game looks on the map. */
export const CAR_MODEL_FOR: Record<CarId, CarModel> = {
  city: "city",
  sedan: "sedan",
  suv: "suv",
  sports: "sports",
  luxury: "luxury",
  perfSuv: "muscle",
  supercar: "supercar",
  hypercar: "hypercar",
  electric: "electric",
};


// ───────────────────────────── 3D sprites ─────────────────────────────

/** Map heading of each axis direction. */
export const DIR_YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/** Headings per full turn: fine enough that a bend looks like a smooth sweep. */
const YAW_STEPS = 32;
/** Tiles per metre: a 4.8 m sedan is ~0.57 tiles long. */
const CAR_TPM = 0.118;
const CAR_SIZE: SpriteSize = { w: 50, h: 38, ax: 25, ay: 23 };
const SOLID = new Set(["#f1f5f9", "#facc15", "#ea580c", "#16a34a"]);

const yawIndex = (yaw: number) => ((Math.round(yaw / ((Math.PI * 2) / YAW_STEPS)) % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;

/**
 * The sprite for heading `yi`; while it is still being rendered, the nearest
 * heading already made stands in (so a car never drops back to the flat
 * vector drawing in the middle of a bend).
 */
function yawSprite(keyOf: (yi: number) => string, size: SpriteSize, k: number, yi: number, build: (yi: number) => Parameters<typeof sprites3d.get>[3], shadow = true) {
  const spr = sprites3d.get(keyOf(yi), size, k, build(yi), shadow);
  if (spr) return spr;
  for (let d = 1; d <= YAW_STEPS / 4; d++)
    for (const s of [d, -d]) {
      const near = sprites3d.peek(keyOf((yi + s + YAW_STEPS) % YAW_STEPS), k, shadow);
      if (near) return near;
    }
  return null;
}

/**
 * Draws a car from its 3D model. Returns false while the sprite is not
 * ready yet (or without WebGL); the caller then draws the vector car.
 */
export function drawCarSprite(p: Painter, x: number, y: number, yaw: number, model: CarModel, color: string, s: number, opts: CarOpts): boolean {
  const k = tierFor((p.zoom ?? 1) * (p.dpr ?? 1) * s);
  const yi = yawIndex(yaw);
  const steer = opts.steer ? Math.sign(opts.steer) : 0;
  // the wheels visibly turn only when the car is big on screen
  const spins = k >= 4 ? 3 : 1;
  const spokes = 5;
  const phase = spins > 1 && opts.odo ? Math.floor((opts.odo / 0.05) % spins) : 0;
  const stage = opts.stage ?? 8;
  const shadow = !opts.noShadow;
  const paint = opts.paint ? color : liveryOf(model).color;
  const b = opts.build;
  const bkey = b ? `${b.color ?? ""}:${b.rims ?? ""}:${b.rimScale ?? 1}:${b.engine ?? 1}:${b.brakes ?? 1}:${b.aero ? "a" : ""}${b.carbon ? "c" : ""}` : "";
  const keyOf = (yi: number) => `car|${model}|${paint}|${yi}|${steer}|${phase}|${stage}|${bkey}`;
  const spr = yawSprite(
    keyOf,
    CAR_SIZE,
    k,
    yi,
    (yi) => (T, { kit, models }) => {
      const g = new T.Group();
      const car = models.buildCar(T, {
        model,
        color,
        finish: SOLID.has(color) ? "gloss" : "metallic",
        steer: steer * 0.42,
        spin: (phase * (Math.PI * 2)) / spokes / spins,
        stage: { station: stage },
        build: b,
      });
      car.scale.setScalar(CAR_TPM);
      car.rotation.y = -(yi * Math.PI * 2) / YAW_STEPS;
      g.add(car);
      return g;
    },
    shadow,
  );
  if (!spr) return false;
  const X = sx(x, y);
  const Y = sy(x, y, opts.lift ?? 0);
  const { w, h, ax, ay } = spr.size;
  p.ctx.drawImage(spr.img, X - ax * s, Y - ay * s, w * s, h * s);
  // glows for the evening/night pass
  if (opts.lights || opts.brake) {
    const a = (yi * Math.PI * 2) / YAW_STEPS;
    const half = CAR_LENGTH[model] * 0.064 * s;
    const fx = x + Math.cos(a) * half;
    const fy = y + Math.sin(a) * half;
    if (opts.lights) p.light(sx(fx, fy), sy(fx, fy, 3 * s + (opts.lift ?? 0)), 14 * s, "#fff7d6", 0.8);
    const bx = x - Math.cos(a) * half;
    const by = y - Math.sin(a) * half;
    p.light(sx(bx, by), sy(bx, by, 3 * s + (opts.lift ?? 0)), (opts.brake ? 10 : 6) * s, "#ff3b3b", opts.brake ? 0.9 : 0.5);
  }
  return true;
}

export interface TruckSpriteOpts {
  yaw?: number;
  /** Which truck: van, box truck, semi or road train. */
  kind?: "van" | "truck" | "semi" | "trailer";
  empty?: boolean;
  odo?: number;
}

const TRUCK_SIZE: SpriteSize = { w: 84, h: 64, ax: 42, ay: 40 };
/** Trucks are a little compressed so they fit the lanes (real trucks are long). */
const TRUCK_TPM = { van: 0.11, truck: 0.095, semi: 0.082, trailer: 0.074 };

function drawTruckSprite(p: Painter, x: number, y: number, yaw: number, cargo: string, s: number, o: TruckSpriteOpts): boolean {
  const kind = o.kind ?? (s < 0.9 ? "van" : s > 1.2 ? "trailer" : s > 1.05 ? "semi" : "truck");
  const k = tierFor((p.zoom ?? 1) * (p.dpr ?? 1));
  const yi = yawIndex(yaw);
  const empty = !!o.empty;
  const spr = yawSprite((yi) => `truck|${kind}|${empty ? "e" : cargo}|${yi}`, TRUCK_SIZE, k, yi, (yi) => (T, { kit, models }) => {
    const g = models.buildTruck(T, kit, { kind, cargo, empty });
    g.scale.setScalar(TRUCK_TPM[kind]);
    g.rotation.y = -(yi * Math.PI * 2) / YAW_STEPS;
    const w = new T.Group();
    w.add(g);
    return w;
  });
  if (!spr) return false;
  const { w, h, ax, ay } = spr.size;
  p.ctx.drawImage(spr.img, sx(x, y) - ax, sy(x, y) - ay, w, h);
  return true;
}

function drawCarrierSprite(p: Painter, x: number, y: number, yaw: number, colors: [string, string], models: [CarModel, CarModel], s: number, o: TruckSpriteOpts): boolean {
  const k = tierFor((p.zoom ?? 1) * (p.dpr ?? 1));
  const yi = yawIndex(yaw);
  const empty = !!o.empty;
  const keyOf = (yi: number) => `carrier|${empty ? "e" : models.map((m) => `${m}:${liveryOf(m).color}`).join(",")}|${yi}`;
  const spr = yawSprite(keyOf, TRUCK_SIZE, k, yi, (yi) => (T, ctx) => {
    const cars = empty
      ? []
      : [0, 1, 2, 3].map((i) => ({ model: models[i % 2], color: colors[i % 2], finish: "metallic" as const }));
    const g = ctx.models.buildCarrier(T, ctx.kit, cars);
    g.scale.setScalar(0.074);
    g.rotation.y = -(yi * Math.PI * 2) / YAW_STEPS;
    const w = new T.Group();
    w.add(g);
    return w;
  });
  if (!spr) return false;
  const { w, h, ax, ay } = spr.size;
  p.ctx.drawImage(spr.img, sx(x, y) - ax * s, sy(x, y) - ay * s, w * s, h * s);
  return true;
}

function truckGlows(p: Painter, x: number, y: number, yaw: number, s: number, brake: boolean) {
  const a = (yawIndex(yaw) * Math.PI * 2) / YAW_STEPS;
  const half = 0.4 * s;
  if (p.night > 0.35) p.light(sx(x + Math.cos(a) * half, y + Math.sin(a) * half), sy(x + Math.cos(a) * half, y + Math.sin(a) * half, 5), 16 * s, "#fff7d6", 0.8);
  if (brake) p.light(sx(x - Math.cos(a) * half, y - Math.sin(a) * half), sy(x - Math.cos(a) * half, y - Math.sin(a) * half, 4), 9 * s, "#ff3b3b", 0.8);
}
