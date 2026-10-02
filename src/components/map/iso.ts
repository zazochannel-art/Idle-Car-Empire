// Isometric drawing primitives on a 2D canvas. World coordinates are tiles
// (x grows to the lower right, y to the lower left); `z` is height in pixels.
// Everything here draws in "world pixels"; the camera transform is applied by
// the caller with ctx.setTransform.

export const TW = 64;
export const TH = 32;
const HW = TW / 2;
const HH = TH / 2;

export const sx = (x: number, y: number) => (x - y) * HW;
export const sy = (x: number, y: number, z = 0) => (x + y) * HH - z;

/** Screen (world px) → tile coordinates on the ground plane. */
export function toTile(px: number, py: number) {
  const a = px / HW;
  const b = py / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// ───────────────────────────── colours ─────────────────────────────

function parse(hex: string): [number, number, number] {
  const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : hex;
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** k > 0 lightens toward white, k < 0 darkens toward black. */
export function shade(hex: string, k: number): string {
  return k >= 0 ? mix(hex, "#ffffff", k) : mix(hex, "#000000", -k);
}

const FOG = "#1c2433";

// ───────────────────────────── painter ─────────────────────────────

export class Painter {
  ctx: CanvasRenderingContext2D;
  /** Locked zones are drawn in muted, foggy colours. */
  dim = false;
  /** Seconds since start, for animations. */
  t = 0;
  /**
   * When set (label pass), labels are drawn in screen pixels at this
   * projection, so they keep a readable size at any zoom.
   */
  proj: ((x: number, y: number, z: number) => [number, number]) | null = null;
  /** Camera zoom, for level of detail. */
  zoom = 1;
  /** Device pixel ratio, to pick the resolution of 3D sprites. */
  dpr = 1;
  /** 0 = full day … 1 = deep night; lights only show when it's dark. */
  night = 0;
  /** Light sources collected while drawing (world px), lit after the scene. */
  lights: { x: number; y: number; r: number; color: string; a: number }[] = [];
  private cache = new Map<string, string>();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** Registers a glow at a world-pixel point (shown in the evening and at night). */
  light(x: number, y: number, r: number, color: string, a = 1) {
    if (this.night < 0.05 || this.dim) return;
    this.lights.push({ x, y, r, color, a });
  }

  col(hex: string, k = 0): string {
    const key = `${hex}|${k}|${this.dim ? 1 : 0}`;
    let c = this.cache.get(key);
    if (!c) {
      c = k ? shade(hex, k) : hex;
      if (this.dim) c = mix(mix(c, "#8a94a6", 0.45), FOG, 0.45);
      this.cache.set(key, c);
    }
    return c;
  }

  /** Ground-level (or raised) rectangle in tile space. */
  quad(x: number, y: number, w: number, d: number, fill: string | CanvasGradient, z = 0) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx(x, y), sy(x, y, z));
    c.lineTo(sx(x + w, y), sy(x + w, y, z));
    c.lineTo(sx(x + w, y + d), sy(x + w, y + d, z));
    c.lineTo(sx(x, y + d), sy(x, y + d, z));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  quadStroke(x: number, y: number, w: number, d: number, stroke: string, width = 1, dash?: number[], z = 0) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx(x, y), sy(x, y, z));
    c.lineTo(sx(x + w, y), sy(x + w, y, z));
    c.lineTo(sx(x + w, y + d), sy(x + w, y + d, z));
    c.lineTo(sx(x, y + d), sy(x, y + d, z));
    c.closePath();
    c.strokeStyle = stroke;
    c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.stroke();
    if (dash) c.setLineDash([]);
  }

  line(x0: number, y0: number, x1: number, y1: number, stroke: string, width = 1, z = 0, dash?: number[]) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx(x0, y0), sy(x0, y0, z));
    c.lineTo(sx(x1, y1), sy(x1, y1, z));
    c.strokeStyle = stroke;
    c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.stroke();
    if (dash) c.setLineDash([]);
  }

  /** Soft shadow cast toward the lower right by a box of height h. */
  shadow(x: number, y: number, w: number, d: number, h: number, alpha = 0.22) {
    const o = Math.min(2.2, h / 38);
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx(x, y), sy(x, y));
    c.lineTo(sx(x + o, y - o * 0.5), sy(x + o, y - o * 0.5));
    c.lineTo(sx(x + w + o, y - o * 0.5), sy(x + w + o, y - o * 0.5));
    c.lineTo(sx(x + w + o, y + d - o * 0.5), sy(x + w + o, y + d - o * 0.5));
    c.lineTo(sx(x + w, y + d), sy(x + w, y + d));
    c.lineTo(sx(x, y + d), sy(x, y + d));
    c.closePath();
    c.fillStyle = `rgba(10,20,30,${this.dim ? alpha * 0.5 : alpha})`;
    c.fill();
  }

  /**
   * A box: left face (the y+d side), right face (the x+w side) and top.
   * `top` overrides the roof colour.
   */
  box(x: number, y: number, w: number, d: number, z: number, h: number, color: string, top?: string, edge = true) {
    const c = this.ctx;
    const x1 = x + w;
    const y1 = y + d;
    // left face
    c.beginPath();
    c.moveTo(sx(x, y1), sy(x, y1, z));
    c.lineTo(sx(x1, y1), sy(x1, y1, z));
    c.lineTo(sx(x1, y1), sy(x1, y1, z + h));
    c.lineTo(sx(x, y1), sy(x, y1, z + h));
    c.closePath();
    c.fillStyle = this.col(color, -0.06);
    c.fill();
    // right face
    c.beginPath();
    c.moveTo(sx(x1, y), sy(x1, y, z));
    c.lineTo(sx(x1, y1), sy(x1, y1, z));
    c.lineTo(sx(x1, y1), sy(x1, y1, z + h));
    c.lineTo(sx(x1, y), sy(x1, y, z + h));
    c.closePath();
    c.fillStyle = this.col(color, -0.24);
    c.fill();
    // ambient occlusion: walls darken toward the ground
    if (h > 9 && this.zoom > 0.6) {
      const ao = Math.min(9, h * 0.3);
      this.onLeft(x, y1, z, 0, w, 0, ao, "rgba(15,23,42,0.13)");
      this.onLeft(x, y1, z, 0, w, 0, ao * 0.45, "rgba(15,23,42,0.1)");
      this.onRight(x1, y, z, 0, d, 0, ao, "rgba(15,23,42,0.13)");
      this.onRight(x1, y, z, 0, d, 0, ao * 0.45, "rgba(15,23,42,0.1)");
      // sunlight catching the upper part of the lit wall
      this.onLeft(x, y1, z, 0, w, h * 0.7, h, "rgba(255,247,230,0.06)");
    }
    // top
    this.quad(x, y, w, d, top ? this.col(top) : this.col(color, 0.1), z + h);
    if (edge) {
      c.beginPath();
      c.moveTo(sx(x, y1), sy(x, y1, z + h));
      c.lineTo(sx(x1, y1), sy(x1, y1, z + h));
      c.lineTo(sx(x1, y), sy(x1, y, z + h));
      c.moveTo(sx(x1, y1), sy(x1, y1, z + h));
      c.lineTo(sx(x1, y1), sy(x1, y1, z));
      c.strokeStyle = "rgba(255,255,255,0.18)";
      c.lineWidth = 1;
      c.stroke();
    }
  }

  /** Rectangle drawn on the left face (y = y1 plane): u along x, v up. */
  onLeft(x: number, y1: number, z: number, u0: number, u1: number, v0: number, v1: number, fill: string) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx(x + u0, y1), sy(x + u0, y1, z + v0));
    c.lineTo(sx(x + u1, y1), sy(x + u1, y1, z + v0));
    c.lineTo(sx(x + u1, y1), sy(x + u1, y1, z + v1));
    c.lineTo(sx(x + u0, y1), sy(x + u0, y1, z + v1));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  /** Rectangle on the right face (x = x1 plane): u along y, v up. */
  onRight(x1: number, y: number, z: number, u0: number, u1: number, v0: number, v1: number, fill: string) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx(x1, y + u0), sy(x1, y + u0, z + v0));
    c.lineTo(sx(x1, y + u1), sy(x1, y + u1, z + v0));
    c.lineTo(sx(x1, y + u1), sy(x1, y + u1, z + v1));
    c.lineTo(sx(x1, y + u0), sy(x1, y + u0, z + v1));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  /** Rows of windows on both visible faces of a box. */
  windows(x: number, y: number, w: number, d: number, z: number, h: number, floors: number, color: string, lit = 0) {
    const fh = h / floors;
    // at night most offices keep a few floors lit
    const litN = this.night > 0.3 ? Math.max(lit, 3) : lit;
    const panes = this.zoom > 0.8;
    for (let f = 0; f < floors; f++) {
      const v0 = f * fh + fh * 0.3;
      const v1 = f * fh + fh * 0.78;
      const on = litN > 0 && (f * 7 + Math.floor(x * 3 + y)) % 5 < litN;
      // glass gets lighter toward the top: sky reflected in it
      const sky = 0.06 * (f / floors);
      const lc = on ? this.col("#fde68a") : this.col(color, sky);
      const rc = on ? this.col("#fcd34d", -0.1) : this.col(color, sky - 0.18);
      this.onLeft(x, y + d, z, 0.12, w - 0.12, v0, v1, lc);
      this.onRight(x + w, y, z, 0.12, d - 0.12, v0, v1, rc);
      if (on && this.night > 0.3 && f % 2 === 0) {
        this.light(sx(x + w / 2, y + d), sy(x + w / 2, y + d, z + (v0 + v1) / 2), 10 + w * 8, "#fde68a", 0.35);
      }
    }
    if (panes) {
      // mullions split the bands into panes: one full-height strip each
      const mul = this.col(color, -0.35);
      for (let u = 0.42; u < w - 0.15; u += 0.3) this.onLeft(x, y + d, z, u - 0.015, u + 0.015, fh * 0.3, h, mul);
      for (let u = 0.42; u < d - 0.15; u += 0.3) this.onRight(x + w, y, z, u - 0.015, u + 0.015, fh * 0.3, h, mul);
    }
  }

  /** Gabled roof along x (ridge parallel to x) on top of a box at height z. */
  gable(x: number, y: number, w: number, d: number, z: number, rise: number, color: string) {
    const c = this.ctx;
    const ym = y + d / 2;
    // back slope (toward -y) is mostly hidden; draw front slope and gable end
    c.beginPath();
    c.moveTo(sx(x, ym), sy(x, ym, z + rise));
    c.lineTo(sx(x + w, ym), sy(x + w, ym, z + rise));
    c.lineTo(sx(x + w, y + d), sy(x + w, y + d, z));
    c.lineTo(sx(x, y + d), sy(x, y + d, z));
    c.closePath();
    c.fillStyle = this.col(color, -0.05);
    c.fill();
    c.beginPath();
    c.moveTo(sx(x, y), sy(x, y, z));
    c.lineTo(sx(x + w, y), sy(x + w, y, z));
    c.lineTo(sx(x + w, ym), sy(x + w, ym, z + rise));
    c.lineTo(sx(x, ym), sy(x, ym, z + rise));
    c.closePath();
    c.fillStyle = this.col(color, 0.12);
    c.fill();
    // gable end on the right face
    c.beginPath();
    c.moveTo(sx(x + w, y), sy(x + w, y, z));
    c.lineTo(sx(x + w, ym), sy(x + w, ym, z + rise));
    c.lineTo(sx(x + w, y + d), sy(x + w, y + d, z));
    c.closePath();
    c.fillStyle = this.col("#e7dccb", -0.25);
    c.fill();
    c.beginPath();
    c.moveTo(sx(x, ym), sy(x, ym, z + rise));
    c.lineTo(sx(x + w, ym), sy(x + w, ym, z + rise));
    c.strokeStyle = this.col(color, -0.35);
    c.lineWidth = 1.2;
    c.stroke();
  }

  /** Sawtooth factory roof: a row of north-light ridges along x. */
  sawtooth(x: number, y: number, w: number, d: number, z: number, teeth: number, rise: number, color: string) {
    const c = this.ctx;
    const step = d / teeth;
    for (let i = 0; i < teeth; i++) {
      const y0 = y + i * step;
      const y1 = y0 + step;
      // glass (steep) side faces -y, sloped roof faces +y
      c.beginPath();
      c.moveTo(sx(x, y0), sy(x, y0, z + rise));
      c.lineTo(sx(x + w, y0), sy(x + w, y0, z + rise));
      c.lineTo(sx(x + w, y1), sy(x + w, y1, z));
      c.lineTo(sx(x, y1), sy(x, y1, z));
      c.closePath();
      c.fillStyle = this.col(color, i % 2 ? 0.02 : 0.08);
      c.fill();
      c.beginPath();
      c.moveTo(sx(x + w, y0), sy(x + w, y0, z));
      c.lineTo(sx(x + w, y0), sy(x + w, y0, z + rise));
      c.lineTo(sx(x + w, y1), sy(x + w, y1, z));
      c.closePath();
      c.fillStyle = this.col(color, -0.3);
      c.fill();
    }
  }

  ellipse(x: number, y: number, z: number, r: number, fill: string, flat = 0.5) {
    const c = this.ctx;
    c.beginPath();
    c.ellipse(sx(x, y), sy(x, y, z), r, r * flat, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  }

  circle(x: number, y: number, z: number, r: number, fill: string) {
    const c = this.ctx;
    c.beginPath();
    c.arc(sx(x, y), sy(x, y, z), r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  }

  tree(x: number, y: number, size: number, seed: number, autumn = false) {
    const greens = autumn ? ["#d97706", "#b45309", "#ca8a04"] : ["#2f9e44", "#37b24d", "#2b8a3e", "#40c057", "#4d7c0f"];
    const g = greens[Math.floor(seed * greens.length) % greens.length];
    // cast shadow toward the lower right
    this.ellipse(x + 0.22, y - 0.08, 0, 9 * size, "rgba(10,30,20,0.22)", 0.45);
    const c = this.ctx;
    const bx = sx(x, y);
    const by = sy(x, y);
    c.fillStyle = this.col("#6b3f1d");
    c.fillRect(bx - 1.3 * size, by - 10 * size, 2.6 * size, 10 * size);
    c.fillStyle = this.col("#4a2a12");
    c.fillRect(bx + 0.2 * size, by - 10 * size, 1.1 * size, 10 * size);
    // layered crown: dark base, mid lobes, sunlit top-left (fewer when far)
    const blob = (dx: number, dz: number, r: number, k: number) => {
      c.beginPath();
      c.arc(bx + dx * size, by - dz * size, r * size, 0, Math.PI * 2);
      c.fillStyle = this.col(g, k);
      c.fill();
    };
    blob(0, 14, 9.5, -0.22);
    if (this.zoom < 0.8) {
      blob(-1.5, 19, 6.5, 0.05);
      return;
    }
    blob(-4.5, 17, 6.5, -0.08);
    blob(4, 16, 6.8, -0.14);
    blob(0, 20, 7, 0);
    blob(-2.5, 22, 4.5, 0.14);
    blob(-3.5, 23.5, 2.2, 0.3);
  }

  pine(x: number, y: number, size: number) {
    const c = this.ctx;
    this.ellipse(x + 0.1, y - 0.03, 0, 6 * size, "rgba(10,30,20,0.25)");
    const bx = sx(x, y);
    const by = sy(x, y);
    c.fillStyle = this.col("#6b3f1d");
    c.fillRect(bx - 1, by - 5 * size, 2, 5 * size);
    for (let i = 0; i < 3; i++) {
      const base = by - (4 + i * 7) * size;
      const half = (9 - i * 2.4) * size;
      c.beginPath();
      c.moveTo(bx - half, base);
      c.lineTo(bx, base - 11 * size);
      c.lineTo(bx + half, base);
      c.closePath();
      c.fillStyle = this.col(i === 2 ? "#3f9d55" : "#2e7d46", 0);
      c.fill();
    }
  }

  person(x: number, y: number, shirt: string, phase: number) {
    const c = this.ctx;
    const px = sx(x, y);
    const py = sy(x, y);
    const bob = Math.abs(Math.sin(phase)) * 0.8;
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(px, py, 2.4, 1.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = this.col("#1f2937");
    c.fillRect(px - 1.3, py - 3.5 - bob, 1, 3.5);
    c.fillRect(px + 0.3, py - 3.5 + bob * 0.5 - 0.4, 1, 3.5);
    c.fillStyle = this.col(shirt);
    c.fillRect(px - 1.6, py - 7.5 - bob, 3.2, 4.2);
    c.fillStyle = this.col("#f1c27d");
    c.beginPath();
    c.arc(px, py - 9 - bob, 1.6, 0, Math.PI * 2);
    c.fill();
  }

  /** Text painted onto the left face (reads along +x). */
  textLeft(text: string, x: number, y1: number, z: number, size: number, color: string, weight = 800) {
    const c = this.ctx;
    c.save();
    c.transform(1, 0.5, 0, 1, sx(x, y1), sy(x, y1, z));
    c.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 0, 0);
    c.restore();
  }

  /** Text painted onto the right face (reads along -y). */
  textRight(text: string, x1: number, y: number, z: number, size: number, color: string, weight = 800) {
    const c = this.ctx;
    c.save();
    c.transform(1, -0.5, 0, 1, sx(x1, y), sy(x1, y, z));
    c.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 0, 0);
    c.restore();
  }

  /** Where a world point lands in the current drawing space. */
  at(x: number, y: number, z = 0): [number, number] {
    return this.proj ? this.proj(x, y, z) : [sx(x, y), sy(x, y, z)];
  }

  /** A flat rounded label floating at a world point (screen-aligned). */
  tag(text: string, x: number, y: number, z: number, opts: { bg?: string; fg?: string; size?: number; icon?: string } = {}) {
    const c = this.ctx;
    const size = opts.size ?? 10;
    c.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
    const label = opts.icon ? `${opts.icon} ${text}` : text;
    const w = c.measureText(label).width + size * 1.2;
    const h = size * 1.75;
    const [ax, ay] = this.at(x, y, z);
    const px = ax - w / 2;
    const py = ay - h;
    c.beginPath();
    c.roundRect(px, py, w, h, h / 2);
    c.fillStyle = opts.bg ?? "rgba(8,12,20,0.78)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.18)";
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = opts.fg ?? "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, px + w / 2, py + h / 2 + 0.5);
  }
}

/** Stable pseudo-random value in [0, 1) for a pair of numbers. */
export function rand(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
