// Hand-drawn pieces of the hall that don't need a 3D model: brick and plank
// textures laid onto the iso planes, and the seasonal decorations
// (pumpkins, cobwebs, bats, a Christmas tree, strings of lights, flowers, bunting, a parasol).
import { sx, sy, type Painter } from "../../map/iso";

/** A fixed pseudo-random number in [0, 1) for an index. */
export const hash = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

type Plane = "left" | "right" | "floor";

/**
 * A repeating texture laid onto an iso plane: the back wall (left face,
 * reading along +x), the side wall (right face, along +y) or the floor.
 * One texture pixel is one world pixel along the wall and one pixel of height.
 */
function onPlane(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, plane: Plane, tileW: number): CanvasPattern | null {
  const pat = ctx.createPattern(cv, "repeat");
  if (!pat || typeof DOMMatrix === "undefined") return pat;
  // texture pixels → world pixels: the wall planes shear by half a pixel per pixel
  const u = 32 / tileW;
  const m =
    plane === "left" ? new DOMMatrix([u, u / 2, 0, 1, 0, 0]) : plane === "right" ? new DOMMatrix([-u, u / 2, 0, 1, 0, 0]) : new DOMMatrix([u, u / 2, -u, u / 2, 0, 0]);
  pat.setTransform(m);
  return pat;
}

const cache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>();
function cached(ctx: CanvasRenderingContext2D, key: string, make: () => CanvasPattern | null) {
  let m = cache.get(ctx);
  if (!m) cache.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key) ?? null;
}

/** Old red brick in lime mortar, a little uneven, for a wall plane. */
export function brick(ctx: CanvasRenderingContext2D, plane: "left" | "right") {
  return cached(ctx, `brick|${plane}`, () => {
    const W = 32;
    const H = 24;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#cdbca6";
    g.fillRect(0, 0, W, H);
    for (let row = 0; row < 6; row++) {
      const off = row % 2 ? 4 : 0;
      for (let k = -1; k < 4; k++) {
        const v = hash(row * 7 + k * 3 + 1);
        g.fillStyle = `rgb(${150 + v * 40},${76 + v * 22},${56 + v * 14})`;
        g.fillRect(k * 8 + off + 0.5, row * 4 + 0.5, 7, 3);
      }
    }
    return onPlane(ctx, cv, plane, W);
  });
}

/** Worn wooden floorboards running along the line, for the floor. */
export function planks(ctx: CanvasRenderingContext2D) {
  return cached(ctx, "planks", () => {
    const N = 64;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const g = cv.getContext("2d");
    if (!g) return null;
    const rows = 5;
    const h = N / rows;
    for (let r = 0; r < rows; r++) {
      const v = hash(r + 11);
      g.fillStyle = `rgb(${142 + v * 26},${102 + v * 18},${66 + v * 12})`;
      g.fillRect(0, r * h, N, h);
      // grain, and the joint where two boards meet
      g.fillStyle = "rgba(60,36,18,0.18)";
      for (let k = 0; k < 4; k++) g.fillRect(0, r * h + 2 + hash(r * 5 + k) * (h - 4), N, 0.6);
      g.fillStyle = "rgba(40,24,12,0.45)";
      g.fillRect(0, r * h, N, 0.8);
      g.fillRect(Math.round(hash(r * 3 + 2) * N), r * h, 0.8, h);
    }
    return onPlane(ctx, cv, "floor", N);
  });
}

/** Anti-static cleanroom tiles: a fine grid, every tile a touch different. */
export function tiles(ctx: CanvasRenderingContext2D) {
  return cached(ctx, "tiles", () => {
    const N = 32;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, 0, N, N);
    g.strokeStyle = "rgba(100,116,139,0.22)";
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, N - 1, N - 1);
    return onPlane(ctx, cv, "floor", N);
  });
}

// ───────────────────────── Halloween ─────────────────────────

/** A carved pumpkin on the floor; its face glows (and flickers) from inside. */
export function pumpkin(p: Painter, x: number, y: number, s: number, t: number) {
  const c = p.ctx;
  const [px, py] = [sx(x, y), sy(x, y)];
  c.fillStyle = "rgba(15,23,42,0.25)";
  c.beginPath();
  c.ellipse(px, py + 1, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
  c.fill();
  for (const [dx, w, col] of [[-4, 6, "#c2410c"], [4, 6, "#c2410c"], [0, 7, "#ea580c"]] as const) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(px + dx * s, py - 6 * s, w * s, 6.5 * s, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#3f6212";
  c.fillRect(px - 1 * s, py - 14.5 * s, 2 * s, 3.5 * s);
  const f = 0.75 + 0.25 * Math.sin(t * 9 + x * 3) * Math.sin(t * 5.3 + y);
  c.fillStyle = `rgba(253,224,71,${f})`;
  c.beginPath();
  // eyes and a jagged grin
  c.moveTo(px - 4 * s, py - 8 * s);
  c.lineTo(px - 1.5 * s, py - 8 * s);
  c.lineTo(px - 2.7 * s, py - 10.5 * s);
  c.moveTo(px + 1.5 * s, py - 8 * s);
  c.lineTo(px + 4 * s, py - 8 * s);
  c.lineTo(px + 2.7 * s, py - 10.5 * s);
  c.moveTo(px - 4.5 * s, py - 5 * s);
  for (let k = 0; k <= 6; k++) c.lineTo(px - 4.5 * s + k * 1.5 * s, py - (k % 2 ? 3 : 4.6) * s);
  c.lineTo(px + 4.5 * s, py - 5 * s);
  c.fill();
  p.light(px, py - 6 * s, 26 * s, "#fb923c", 0.5 * f);
}

/** A cobweb across the corner of two walls, high up (in the still layer). */
export function cobweb(c: CanvasRenderingContext2D, x: number, y: number, z: number, r: number, flip = false) {
  const [px, py] = [sx(x, y), sy(x, y, z)];
  const dir = flip ? -1 : 1;
  c.strokeStyle = "rgba(241,245,249,0.55)";
  c.lineWidth = 0.6;
  c.beginPath();
  const spokes = 5;
  for (let k = 0; k <= spokes; k++) {
    const a = (k / spokes) * (Math.PI / 2);
    c.moveTo(px, py);
    c.lineTo(px + Math.cos(a) * r * dir, py + Math.sin(a) * r);
  }
  for (let ring = 1; ring <= 3; ring++) {
    const rr = (ring / 3) * r;
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * (Math.PI / 2);
      const a1 = ((k + 1) / spokes) * (Math.PI / 2);
      const [x0, y0] = [px + Math.cos(a0) * rr * dir, py + Math.sin(a0) * rr];
      const [x1, y1] = [px + Math.cos(a1) * rr * dir, py + Math.sin(a1) * rr];
      c.moveTo(x0, y0);
      c.quadraticCurveTo((x0 + x1) / 2 + (px - (x0 + x1) / 2) * 0.12, (y0 + y1) / 2 + (py - (y0 + y1) / 2) * 0.12, x1, y1);
    }
  }
  c.stroke();
}

/** A bat flapping across under the roof. */
export function bat(c: CanvasRenderingContext2D, px: number, py: number, t: number, s = 1) {
  const flap = Math.sin(t * 14) * 4 * s;
  c.fillStyle = "#111827";
  c.beginPath();
  c.moveTo(px, py);
  c.quadraticCurveTo(px - 4 * s, py - 3 * s - flap, px - 9 * s, py - flap);
  c.quadraticCurveTo(px - 5 * s, py + 1 * s, px, py + 2 * s);
  c.quadraticCurveTo(px + 5 * s, py + 1 * s, px + 9 * s, py - flap);
  c.quadraticCurveTo(px + 4 * s, py - 3 * s - flap, px, py);
  c.fill();
}

// ───────────────────────── winter ─────────────────────────

/** A Christmas tree with twinkling lights, a star and presents underneath. */
export function christmasTree(p: Painter, x: number, y: number, t: number) {
  const c = p.ctx;
  const [px, py] = [sx(x, y), sy(x, y)];
  c.fillStyle = "rgba(15,23,42,0.28)";
  c.beginPath();
  c.ellipse(px, py + 2, 22, 8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#78350f";
  c.fillRect(px - 2.5, py - 8, 5, 8);
  const tiers: [number, number, string][] = [
    [20, 14, "#166534"],
    [16, 28, "#15803d"],
    [12, 41, "#16a34a"],
    [8, 52, "#22c55e"],
  ];
  for (const [w, h, col] of tiers) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(px - w, py - h + 12);
    c.lineTo(px, py - h - 12);
    c.lineTo(px + w, py - h + 12);
    c.closePath();
    c.fill();
  }
  const cols = ["#ef4444", "#facc15", "#3b82f6", "#f472b6", "#f8fafc"];
  for (let k = 0; k < 16; k++) {
    const lv = hash(k * 3 + 1);
    const h = 6 + lv * 50;
    const half = 18 * (1 - h / 66);
    const lx = px + (hash(k * 3 + 2) * 2 - 1) * half * 0.85;
    const ly = py - h;
    const on = Math.sin(t * 3 + k * 1.7) > -0.2;
    c.fillStyle = on ? cols[k % cols.length] : "#334155";
    c.beginPath();
    c.arc(lx, ly, 1.6, 0, Math.PI * 2);
    c.fill();
    if (on && k % 3 === 0) p.light(lx, ly, 10, cols[k % cols.length], 0.5);
  }
  // the star
  c.fillStyle = "#fde047";
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? 2.4 : 6;
    c.lineTo(px + Math.cos(a) * r, py - 66 + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  p.light(px, py - 66, 30, "#fde047", 0.6 + 0.2 * Math.sin(t * 2));
  // presents
  const gifts: [number, number, string, string][] = [
    [0.55, 0.3, "#dc2626", "#fde047"],
    [-0.35, 0.45, "#2563eb", "#f8fafc"],
    [0.2, 0.62, "#16a34a", "#ef4444"],
  ];
  for (const [dx, dy, col, ribbon] of gifts) {
    p.box(x + dx - 0.15, y + dy - 0.15, 0.3, 0.3, 0, 8, col);
    p.line(x + dx, y + dy - 0.15, x + dx, y + dy + 0.15, ribbon, 1.5, 8);
  }
}

/** A string of coloured (or orange and purple) bulbs along the back wall; they twinkle. */
export function stringLights(p: Painter, w: number, d: number, z: number, t: number, colors: string[]) {
  const c = p.ctx;
  // the wire sags between hooks
  c.strokeStyle = "rgba(30,41,59,0.8)";
  c.lineWidth = 0.8;
  c.beginPath();
  const step = 0.9;
  const sag = (u: number) => Math.sin(((u % (step * 3)) / (step * 3)) * Math.PI) * 5;
  for (let u = 0.3; u < w - 0.3; u += 0.15) {
    const [qx, qy] = [sx(u, 0.12), sy(u, 0.12, z) + sag(u)];
    if (u === 0.3) c.moveTo(qx, qy);
    else c.lineTo(qx, qy);
  }
  for (let v = 0.3; v < d - 4.5; v += 0.15) {
    const [qx, qy] = [sx(0.12, v), sy(0.12, v, z) + sag(v)];
    if (v === 0.3) c.moveTo(qx, qy);
    else c.lineTo(qx, qy);
  }
  c.stroke();
  let k = 0;
  const bulb = (qx: number, qy: number) => {
    const col = colors[k % colors.length];
    const on = Math.sin(t * 2.2 + k * 2.3) > -0.4;
    c.fillStyle = on ? col : "#334155";
    c.beginPath();
    c.arc(qx, qy + 2, 1.7, 0, Math.PI * 2);
    c.fill();
    if (on && k % 2 === 0) p.light(qx, qy + 2, 12, col, 0.55);
    k++;
  };
  for (let u = 0.3 + step / 2; u < w - 0.3; u += step / 2) bulb(sx(u, 0.12), sy(u, 0.12, z) + sag(u));
  for (let v = 0.3 + step / 2; v < d - 4.5; v += step / 2) bulb(sx(0.12, v), sy(0.12, v, z) + sag(v));
}

/** A green garland with red bows hung along the back wall (in the still layer). */
export function garland(p: Painter, w: number, z: number) {
  const c = p.ctx;
  c.strokeStyle = "#166534";
  c.lineWidth = 3;
  c.beginPath();
  for (let u = 0.3; u < w - 0.3; u += 0.1) {
    const dip = Math.sin(((u % 2.4) / 2.4) * Math.PI) * 7;
    const [qx, qy] = [sx(u, 0.1), sy(u, 0.1, z) + dip];
    if (u === 0.3) c.moveTo(qx, qy);
    else c.lineTo(qx, qy);
  }
  c.stroke();
  for (let u = 0.3; u < w - 0.3; u += 2.4) {
    const [qx, qy] = [sx(u, 0.1), sy(u, 0.1, z)];
    c.fillStyle = "#dc2626";
    c.beginPath();
    c.ellipse(qx - 2.5, qy, 2.5, 1.6, -0.4, 0, Math.PI * 2);
    c.ellipse(qx + 2.5, qy, 2.5, 1.6, 0.4, 0, Math.PI * 2);
    c.fill();
  }
}

// ───────────────────────── spring and summer ─────────────────────────

/** A pot of flowers on the floor (spring: tulips; summer: sunflowers); they sway a little. */
export function flowerPot(p: Painter, x: number, y: number, s: number, t: number, kind: "spring" | "summer") {
  const c = p.ctx;
  const [px, py] = [sx(x, y), sy(x, y)];
  c.fillStyle = "rgba(15,23,42,0.25)";
  c.beginPath();
  c.ellipse(px, py + 1, 8 * s, 3 * s, 0, 0, Math.PI * 2);
  c.fill();
  // the pot: a terracotta cup with a rim
  c.fillStyle = "#c2410c";
  c.beginPath();
  c.moveTo(px - 5 * s, py - 8 * s);
  c.lineTo(px + 5 * s, py - 8 * s);
  c.lineTo(px + 3.6 * s, py);
  c.lineTo(px - 3.6 * s, py);
  c.closePath();
  c.fill();
  c.fillStyle = "#ea580c";
  c.fillRect(px - 5.6 * s, py - 9.6 * s, 11.2 * s, 2.2 * s);
  const cols = kind === "spring" ? ["#f472b6", "#facc15", "#f8fafc", "#a855f7"] : ["#facc15", "#fbbf24", "#f59e0b"];
  const stems = kind === "spring" ? 5 : 3;
  for (let k = 0; k < stems; k++) {
    const sway = Math.sin(t * 1.3 + k * 1.9 + x) * 1.2 * s;
    const bx = px + (k - (stems - 1) / 2) * 2.6 * s;
    const h = (kind === "spring" ? 13 : 19) * s + hash(k + x * 7) * 4 * s;
    c.strokeStyle = "#15803d";
    c.lineWidth = 1.2 * s;
    c.beginPath();
    c.moveTo(bx, py - 9 * s);
    c.quadraticCurveTo(bx + sway * 0.5, py - 9 * s - h / 2, bx + sway, py - 9 * s - h);
    c.stroke();
    const [fx, fy] = [bx + sway, py - 9 * s - h];
    c.fillStyle = cols[k % cols.length];
    if (kind === "spring") {
      // a tulip: a cup of three petals
      c.beginPath();
      c.ellipse(fx, fy, 2.2 * s, 3 * s, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(fx - 2.2 * s, fy - 1 * s);
      c.lineTo(fx - 1.1 * s, fy - 4.2 * s);
      c.lineTo(fx, fy - 1.6 * s);
      c.lineTo(fx + 1.1 * s, fy - 4.2 * s);
      c.lineTo(fx + 2.2 * s, fy - 1 * s);
      c.fill();
    } else {
      // a sunflower: yellow petals round a brown heart
      for (let k2 = 0; k2 < 10; k2++) {
        const a = (k2 * Math.PI) / 5;
        c.beginPath();
        c.ellipse(fx + Math.cos(a) * 3 * s, fy + Math.sin(a) * 3 * s, 1.9 * s, 1 * s, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#78350f";
      c.beginPath();
      c.arc(fx, fy, 2.2 * s, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/** Bunting: little triangular flags hung along the back wall (in the still layer). */
export function bunting(p: Painter, w: number, z: number, colors: string[]) {
  const c = p.ctx;
  c.strokeStyle = "rgba(30,41,59,0.7)";
  c.lineWidth = 0.8;
  c.beginPath();
  const dip = (u: number) => Math.sin(((u % 3) / 3) * Math.PI) * 6;
  for (let u = 0.3; u < w - 0.3; u += 0.1) {
    const [qx, qy] = [sx(u, 0.1), sy(u, 0.1, z) + dip(u)];
    if (u === 0.3) c.moveTo(qx, qy);
    else c.lineTo(qx, qy);
  }
  c.stroke();
  let k = 0;
  for (let u = 0.55; u < w - 0.4; u += 0.5) {
    const [qx, qy] = [sx(u, 0.1), sy(u, 0.1, z) + dip(u)];
    c.fillStyle = colors[k++ % colors.length];
    c.beginPath();
    c.moveTo(qx - 3.2, qy - 1.6);
    c.lineTo(qx + 3.2, qy + 1.6);
    c.lineTo(qx - 0.4, qy + 7);
    c.closePath();
    c.fill();
  }
}

/** A striped beach parasol over a cool box, for the crew's summer break. */
export function parasol(p: Painter, x: number, y: number, t: number) {
  const c = p.ctx;
  const [px, py] = [sx(x, y), sy(x, y)];
  c.fillStyle = "rgba(15,23,42,0.22)";
  c.beginPath();
  c.ellipse(px, py + 1, 20, 7, 0, 0, Math.PI * 2);
  c.fill();
  p.box(x + 0.25, y + 0.2, 0.5, 0.35, 0, 7, "#38bdf8", "#e0f2fe");
  c.strokeStyle = "#e2e8f0";
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - 44);
  c.stroke();
  const sway = Math.sin(t * 0.8 + x) * 0.04;
  const cols = ["#ef4444", "#f8fafc"];
  for (let k = 0; k < 8; k++) {
    const a0 = Math.PI + (k / 8) * Math.PI + sway;
    const a1 = Math.PI + ((k + 1) / 8) * Math.PI + sway;
    c.fillStyle = cols[k % 2];
    c.beginPath();
    c.moveTo(px, py - 52);
    c.lineTo(px + Math.cos(a0) * 24, py - 40 + Math.sin(a0) * -6);
    c.lineTo(px + Math.cos(a1) * 24, py - 40 + Math.sin(a1) * -6);
    c.closePath();
    c.fill();
  }
}
