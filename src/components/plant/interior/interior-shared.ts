// Sizes, timings and small helpers shared by the factory interior's engine and its drawing (interior-hall.ts, interior-line.ts).

import { type SpriteSize, tierFor } from "../../three/sprites";

/** Seconds per transfer without a real batch to follow; the parts glide for about MOVE, then the stations work. */
export const CYCLE = 2.8;
export const MOVE = 0.9;
/** Faster transfers than this are unreadable: the line then runs at this pace (and no longer follows the batch). */
export const MIN_TRANSFER = 0.7;
export const STATION_SIZE: SpriteSize = { w: 230, h: 230, ax: 115, ay: 150 };
export const PERSON_SIZE: SpriteSize = { w: 34, h: 44, ax: 17, ay: 36 };
export const PROP_SIZE: SpriteSize = { w: 56, h: 50, ax: 28, ay: 32 };
export const VEHICLE_SIZE: SpriteSize = { w: 44, h: 40, ax: 22, ay: 26 };
export const PART_SIZE: SpriteSize = { w: 40, h: 30, ax: 20, ay: 18 };
export const ROBOT_SIZE: SpriteSize = { w: 90, h: 100, ax: 45, ay: 76 };
/** A pallet of the plant's stock, stacked along the walls. */
export const STACK_SIZE: SpriteSize = { w: 76, h: 84, ax: 38, ay: 58 };
/** How many poses each animated machine has. */
export const POSES: Record<string, number> = { laserCutter: 4, press: 3, bodyJig: 2, furnace: 2, cnc: 4, curing: 2, filler: 4 };
/** At most one "+N" per line this often (fast lines sum their units up). */
export const POP_EVERY = 1.4;
/** How long a "+N" rises before it is gone. */
export const POP_LIFE = 1.7;

export const smooth = (u: number) => u * u * (3 - 2 * u);
/** Overshoots a little, then settles (a label popping in). */
export const backOut = (u: number) => 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
/** A fixed pseudo-random number in [0, 1) for an index (stains stay put). */
export const hash = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The grain of power-floated concrete: fine speckle and soft clouds, as a repeating pattern. */
export const grains = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
export function floorGrain(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  let pat = grains.get(ctx);
  if (pat) return pat;
  const N = 160;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d");
  if (!g) return "rgba(0,0,0,0)";
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = hash(i + 7);
    const dark = v < 0.5;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = dark ? 40 : 255;
    img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 18);
  }
  g.putImageData(img, 0, 0);
  // soft lighter and darker clouds (trowel marks)
  for (let k = 0; k < 14; k++) {
    const x = hash(k * 5 + 1) * N;
    const y = hash(k * 5 + 2) * N;
    const r = 20 + hash(k * 5 + 3) * 40;
    const light = k % 2 === 0;
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      rg.addColorStop(0, light ? "rgba(255,255,255,0.06)" : "rgba(30,30,30,0.05)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  pat = ctx.createPattern(cv, "repeat") ?? undefined;
  if (!pat) return "rgba(0,0,0,0)";
  grains.set(ctx, pat);
  return pat;
}
/** A soft round glow in one colour (drawn once, then scaled for every light of that colour). */
export const glows = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let cv = glows.get(color);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + "00");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glows.set(color, cv);
  }
  return cv;
}

/** Interior sprites are big: cap their resolution (memory on phones). */
export const tierCap = (scale: number) => Math.min(3, tierFor(scale));

/** Position along a closed route at u (0..1), its heading in quarter turns, and whether it carries a load. */
export function along(pts: [number, number][], u: number, inbound: boolean): [number, number, number, boolean] {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  let d = u * total;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.abs(bx - ax) + Math.abs(by - ay);
    if (d <= len || i === pts.length - 1) {
      const t = len ? Math.min(1, d / len) : 0;
      const yaw = bx > ax ? 0 : bx < ax ? 2 : by > ay ? 1 : 3;
      // loaded on the way in (raw material to the line) or out (goods to the dock)
      const half = i <= 2;
      return [ax + (bx - ax) * t, ay + (by - ay) * t, yaw, inbound ? half : !half];
    }
    d -= len;
  }
  return [pts[0][0], pts[0][1], 0, false];
}
