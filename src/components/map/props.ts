// Small props that make the city feel lived in: street furniture, garden
// details and industrial equipment. All in tile coordinates, like the rest
// of the map drawing.
import { sx, sy, type Painter } from "./iso";

export function bush(p: Painter, x: number, y: number, size = 1, color = "#3f9d4a") {
  p.ellipse(x + 0.06, y - 0.02, 0, 6 * size, "rgba(10,30,20,0.2)", 0.45);
  const c = p.ctx;
  const bx = sx(x, y);
  const by = sy(x, y);
  const blob = (dx: number, dz: number, r: number, k: number) => {
    c.beginPath();
    c.arc(bx + dx * size, by - dz * size, r * size, 0, Math.PI * 2);
    c.fillStyle = p.col(color, k);
    c.fill();
  };
  blob(0, 3, 4.5, -0.15);
  blob(-2.5, 4.5, 3, 0);
  blob(2.2, 4.3, 3.2, -0.05);
  blob(-1, 6, 2.4, 0.2);
}

const FLOWERS = ["#f43f5e", "#facc15", "#f472b6", "#a78bfa", "#fb923c", "#f8fafc"];

export function flowerBed(p: Painter, x: number, y: number, w: number, d: number, seed: number) {
  p.box(x, y, w, d, 0, 2.5, "#a8a29e", "#6b4f2c");
  const c = p.ctx;
  const n = Math.round(w * d * 40);
  for (let i = 0; i < n; i++) {
    const fx = x + 0.06 + ((Math.sin(seed * 97 + i * 12.9) + 1) / 2) * (w - 0.12);
    const fy = y + 0.06 + ((Math.sin(seed * 31 + i * 7.3) + 1) / 2) * (d - 0.12);
    c.fillStyle = p.col(i % 3 === 0 ? "#3f9d4a" : FLOWERS[(i + Math.floor(seed * 10)) % FLOWERS.length]);
    c.beginPath();
    c.arc(sx(fx, fy), sy(fx, fy, 3.5), 1.1, 0, Math.PI * 2);
    c.fill();
  }
}

export function bench(p: Painter, x: number, y: number, alongX = true) {
  const w = alongX ? 0.45 : 0.14;
  const d = alongX ? 0.14 : 0.45;
  p.box(x, y, w, d, 2, 1, "#8b5e3c", "#a16207");
  if (alongX) p.box(x, y - 0.02, w, 0.04, 3, 3, "#8b5e3c");
  else p.box(x - 0.02, y, 0.04, d, 3, 3, "#8b5e3c");
  p.box(x + 0.02, y + 0.02, 0.04, 0.04, 0, 2, "#374151");
  p.box(x + w - 0.06, y + d - 0.06, 0.04, 0.04, 0, 2, "#374151");
}

/** A run of fence along x (alongX) or y: posts and two rails in one path. */
export function fence(p: Painter, x: number, y: number, len: number, alongX: boolean, color = "#e5e7eb") {
  const c = p.ctx;
  const n = Math.max(2, Math.round(len / 0.3));
  const at = (t: number, z: number): [number, number] => (alongX ? [sx(x + t, y), sy(x + t, y, z)] : [sx(x, y + t), sy(x, y + t, z)]);
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    const [ax, ay] = at(t, 0);
    c.moveTo(ax, ay);
    c.lineTo(ax, ay - 7);
  }
  for (const z of [3, 6]) {
    const [ax, ay] = at(0, z);
    const [bx, by] = at(len, z);
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
  }
  c.strokeStyle = p.col(color);
  c.lineWidth = 1.2;
  c.stroke();
}

export function tireStack(p: Painter, x: number, y: number, n = 3) {
  const c = p.ctx;
  for (let i = 0; i < n; i++) {
    const px = sx(x, y);
    const py = sy(x, y, i * 2.2);
    c.fillStyle = p.col("#111827");
    c.beginPath();
    c.ellipse(px, py, 4, 2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(px - 4, py - 2.2, 8, 2.2);
    c.beginPath();
    c.ellipse(px, py - 2.2, 4, 2, 0, 0, Math.PI * 2);
    c.fillStyle = p.col("#1f2937");
    c.fill();
    c.beginPath();
    c.ellipse(px, py - 2.2, 1.6, 0.8, 0, 0, Math.PI * 2);
    c.fillStyle = "#0b0f17";
    c.fill();
  }
}

export function drum(p: Painter, x: number, y: number, color = "#2563eb") {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  c.fillStyle = p.col(color, -0.2);
  c.fillRect(px - 2.5, py - 7, 5, 7);
  c.beginPath();
  c.ellipse(px, py, 2.5, 1.25, 0, 0, Math.PI);
  c.fill();
  c.fillStyle = p.col(color, 0.1);
  c.beginPath();
  c.ellipse(px, py - 7, 2.5, 1.25, 0, 0, Math.PI * 2);
  c.fill();
}

/** A lamp on a building wall (left face, at u along x). */
export function wallLamp(p: Painter, x: number, y1: number, u: number, z: number) {
  p.onLeft(x, y1, z, u - 0.05, u + 0.05, 0, 2.2, p.col("#1f2937"));
  p.onLeft(x, y1, z, u - 0.035, u + 0.035, -0.4, 0.8, p.night > 0.25 ? "#fff3c4" : p.col("#cbd5e1"));
  p.light(sx(x + u, y1), sy(x + u, y1, z), 14, "#ffe2a0", 0.4);
}

/** A neon / LED strip along the left face, glowing at night. */
export function ledStrip(p: Painter, x: number, y1: number, w: number, z: number, color: string, t: number) {
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.5);
  p.onLeft(x, y1, z, 0, w, 0, 1.4, p.night > 0.25 ? color : p.col(color, -0.1));
  if (p.night > 0.25) {
    for (let u = 0.2; u < w; u += 0.5) p.light(sx(x + u, y1), sy(x + u, y1, z), 14, color, 0.45 * pulse);
  }
}

export function lightPole(p: Painter, x: number, y: number) {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  p.ellipse(x + 0.04, y, 0, 3, "rgba(0,0,0,0.25)", 0.5);
  c.strokeStyle = p.col("#475569");
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - 30);
  c.moveTo(px - 5, py - 30);
  c.lineTo(px + 5, py - 30);
  c.stroke();
  c.fillStyle = p.night > 0.25 ? "#fff7d6" : p.col("#e2e8f0");
  c.fillRect(px - 6, py - 31, 3, 2);
  c.fillRect(px + 3, py - 31, 3, 2);
  p.light(px, py - 30, 12, "#fff1c2", 0.55);
  p.light(px, py - 4, 30, "#ffd27a", 0.28);
}

export function planter(p: Painter, x: number, y: number) {
  p.box(x - 0.12, y - 0.12, 0.24, 0.24, 0, 4, "#d6d3d1", "#5b4636");
  bush(p, x, y, 0.55, "#2f8f46");
}

export function flagPole(p: Painter, x: number, y: number, color: string, t: number) {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  c.strokeStyle = p.col("#e5e7eb");
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - 34);
  c.stroke();
  const wave = p.dim ? 0 : Math.sin(t * 4 + x * 3) * 2;
  c.fillStyle = p.col(color);
  c.beginPath();
  c.moveTo(px, py - 34);
  c.quadraticCurveTo(px + 7, py - 33 + wave, px + 13, py - 31);
  c.lineTo(px + 13, py - 25);
  c.quadraticCurveTo(px + 7, py - 27 + wave, px, py - 26);
  c.closePath();
  c.fill();
}

/** Roadside billboard on two legs facing the viewer. */
export function billboard(p: Painter, x: number, y: number, color: string, text: string) {
  p.box(x, y, 0.06, 0.06, 0, 18, "#475569");
  p.box(x + 0.8, y, 0.06, 0.06, 0, 18, "#475569");
  p.box(x - 0.05, y - 0.04, 0.96, 0.08, 18, 13, "#e5e7eb");
  p.onLeft(x - 0.05, y + 0.04, 18, 0.04, 0.87, 1, 12, p.col(color));
  p.textLeft(text, x + 0.43, y + 0.04, 24.5, 6, "#ffffff");
  p.light(sx(x + 0.43, y + 0.04), sy(x + 0.43, y + 0.04, 24), 18, "#fff7d6", 0.5);
}

/** Traffic light at a corner; `green` = which axis currently has green. */
export function trafficLight(p: Painter, x: number, y: number, green: "x" | "y" | "amber") {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  c.strokeStyle = p.col("#1f2937");
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - 20);
  c.stroke();
  c.fillStyle = p.col("#111827");
  c.fillRect(px - 2.2, py - 27, 4.4, 9);
  const on = (col: string, k: number, lit: boolean) => {
    c.fillStyle = lit ? col : "rgba(255,255,255,0.12)";
    c.beginPath();
    c.arc(px, py - 25.5 + k * 3, 1.2, 0, Math.PI * 2);
    c.fill();
    if (lit) p.light(px, py - 25.5 + k * 3, 6, col, 0.9);
  };
  on("#ef4444", 0, green === "y");
  on("#f59e0b", 1, green === "amber");
  on("#22c55e", 2, green === "x");
}

export function container(p: Painter, x: number, y: number, alongX: boolean, color: string, z = 0) {
  const w = alongX ? 0.9 : 0.36;
  const d = alongX ? 0.36 : 0.9;
  p.box(x, y, w, d, z, 8, color);
  const ribs = 6;
  for (let i = 1; i < ribs; i++) {
    if (alongX) p.onLeft(x, y + d, z, (w * i) / ribs - 0.008, (w * i) / ribs + 0.008, 0.5, 7.5, "rgba(0,0,0,0.15)");
    else p.onRight(x + w, y, z, (d * i) / ribs - 0.008, (d * i) / ribs + 0.008, 0.5, 7.5, "rgba(0,0,0,0.15)");
  }
}

/** A forklift shuttling between two points (phase 0..1). */
export function forklift(p: Painter, x0: number, y0: number, x1: number, y1: number, t: number, seed: number) {
  const ph = (Math.sin(t * 0.6 + seed * 9) + 1) / 2;
  const x = x0 + (x1 - x0) * ph;
  const y = y0 + (y1 - y0) * ph;
  p.ellipse(x + 0.03, y, 0, 6, "rgba(0,0,0,0.25)", 0.45);
  p.box(x - 0.12, y - 0.1, 0.24, 0.2, 1.5, 4, "#f59e0b", "#fbbf24");
  p.box(x - 0.1, y - 0.08, 0.12, 0.16, 5.5, 3.5, "#1e293b");
  p.box(x + 0.12, y - 0.08, 0.03, 0.16, 0, 9, "#374151");
  p.box(x + 0.14, y - 0.09, 0.14, 0.18, 1 + ph * 3, 3, "#a16207");
}

/** Industrial robot arm welding (animated). */
export function robotArm(p: Painter, x: number, y: number, t: number, active: boolean) {
  const c = p.ctx;
  p.box(x - 0.08, y - 0.08, 0.16, 0.16, 0, 3, "#f97316", "#fb923c");
  const a = active ? Math.sin(t * 3 + x) * 0.6 : 0.2;
  const bx = sx(x, y);
  const by = sy(x, y, 3);
  const ex = bx + Math.cos(-1.2 + a) * 9;
  const ey = by + Math.sin(-1.2 + a) * 9;
  const hx = ex + Math.cos(0.4 - a) * 8;
  const hy = ey + Math.sin(0.4 - a) * 8;
  c.lineCap = "round";
  c.strokeStyle = p.col("#f97316");
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(bx, by);
  c.lineTo(ex, ey);
  c.lineTo(hx, hy);
  c.stroke();
  c.lineCap = "butt";
  c.fillStyle = p.col("#1f2937");
  c.beginPath();
  c.arc(ex, ey, 1.6, 0, Math.PI * 2);
  c.fill();
  if (active && !p.dim && Math.sin(t * 13 + x * 5) > 0.2) {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? "#fde047" : "#ffffff";
      c.fillRect(hx + Math.sin(t * 40 + i) * 3, hy + Math.cos(t * 33 + i) * 2.5, 1.2, 1.2);
    }
    p.light(hx, hy, 12, "#a5f3fc", 0.9);
  }
}

/** Rotating amber beacon on top of something. */
export function beacon(p: Painter, x: number, y: number, z: number, t: number, color = "#f59e0b") {
  const c = p.ctx;
  const on = Math.sin(t * 6 + x) > 0;
  c.fillStyle = on ? color : p.col(color, -0.45);
  c.beginPath();
  c.arc(sx(x, y), sy(x, y, z), 1.8, 0, Math.PI * 2);
  c.fill();
  if (on) p.light(sx(x, y), sy(x, y, z), 10, color, 0.9);
}

/** Construction barrier (red/white). */
export function barrier(p: Painter, x: number, y: number, alongX: boolean) {
  const w = alongX ? 0.5 : 0.06;
  const d = alongX ? 0.06 : 0.5;
  p.box(x, y, w, d, 2, 3, "#f8fafc");
  for (let i = 0; i < 4; i += 2) {
    if (alongX) p.onLeft(x, y + d, 2, (w * i) / 4, (w * (i + 1)) / 4, 0, 3, "#dc2626");
    else p.onRight(x + w, y, 2, (d * i) / 4, (d * (i + 1)) / 4, 0, 3, "#dc2626");
  }
  p.box(x, y, 0.04, 0.04, 0, 2, "#374151");
  p.box(x + w - 0.04, y + d - 0.04, 0.04, 0.04, 0, 2, "#374151");
}

/** A small flock of birds circling at height. */
export function birds(p: Painter, x: number, y: number, t: number, seed: number) {
  const c = p.ctx;
  c.strokeStyle = "rgba(30,41,59,0.7)";
  c.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const a = t * 0.4 + seed * 6 + i * 0.5;
    const bx = sx(x, y) + Math.cos(a) * (40 + i * 6);
    const by = sy(x, y, 110 + i * 4) + Math.sin(a) * 18;
    const flap = Math.sin(t * 9 + i) * 2;
    c.beginPath();
    c.moveTo(bx - 3, by - flap);
    c.lineTo(bx, by);
    c.lineTo(bx + 3, by - flap);
    c.stroke();
  }
}
