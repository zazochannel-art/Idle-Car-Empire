// Building sites on the Empire Map (engine/construction.ts): an empty lot
// turns into a site that goes visibly through its phases — fences and an
// excavator, the foundation slab, the steel frame under a tower crane, walls
// and roof, the equipment going in, then the scaffolding coming down — with
// workers, lorries driving in and out, dust and work lights. Upgrades show
// as scaffolding and a crane on the working building. Pure drawing.
import { STRUCTURE_BY_ID } from "@/game/config/city";
import type { Plot } from "@/game/city/layout";
import { phaseOf } from "@/game/engine/construction";
import type { StructureType } from "@/game/types";
import { rand, sx, sy, type Painter } from "./iso";
import { barrier } from "./props";
import { drawTruck, type Dir } from "./vehicles";

/** Height of the finished building by plot size (px). */
const HEIGHT = { small: 26, medium: 32, large: 44, mega: 58 } as const;

const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Progress within [a, b] as 0–1. */
const span = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));

function fence(p: Painter, plot: Plot, alpha = 1) {
  if (alpha <= 0.02) return;
  const { x, y, w, d } = plot;
  const c = p.ctx;
  c.save();
  c.globalAlpha *= alpha;
  // hoarding panels along the two sides facing the viewer, posts at the back
  for (let k = 0; k < Math.floor(w / 0.8); k++) barrier(p, x + 0.2 + k * 0.8, y + d - 0.2, true);
  for (let k = 0; k < Math.floor(d / 0.8); k++) barrier(p, x + w - 0.2, y + 0.2 + k * 0.8, false);
  p.line(x + 0.15, y + 0.15, x + w - 0.15, y + 0.15, p.col("#f97316"), 1.2, 3, [4, 3]);
  p.line(x + 0.15, y + 0.15, x + 0.15, y + d - 0.15, p.col("#f97316"), 1.2, 3, [4, 3]);
  c.restore();
}

function excavator(p: Painter, x: number, y: number, t: number) {
  p.shadow(x, y, 0.9, 0.6, 10);
  p.box(x, y + 0.05, 0.9, 0.5, 0, 2.5, "#1f2937");
  p.box(x + 0.15, y + 0.1, 0.6, 0.4, 2.5, 6, "#facc15", "#fde047");
  // the arm dips into the pit and lifts again
  const a = Math.sin(t * 1.6) * 0.5 + 0.5;
  const c = p.ctx;
  const bx = sx(x + 0.75, y + 0.3);
  const by = sy(x + 0.75, y + 0.3, 8);
  const ex = bx - 14 - a * 4;
  const ey = by - 6 + a * 12;
  c.strokeStyle = p.col("#eab308");
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(bx, by);
  c.lineTo(bx - 8, by - 10);
  c.lineTo(ex, ey);
  c.stroke();
  c.fillStyle = p.col("#a16207");
  c.fillRect(ex - 3, ey - 1, 5, 4);
}

function mixer(p: Painter, x: number, y: number, t: number) {
  p.box(x, y, 1.1, 0.42, 0, 3, "#334155");
  p.box(x + 0.85, y, 0.25, 0.42, 3, 4, "#e2e8f0");
  p.box(x + 0.05, y + 0.05, 0.75, 0.32, 3, 5, "#f97316", "#fb923c");
  // the drum's stripe turning
  const k = (t * 0.8) % 1;
  p.box(x + 0.05 + k * 0.7, y + 0.04, 0.06, 0.34, 3, 5.1, "#fff7ed");
}

function towerCrane(p: Painter, x: number, y: number, h: number, t: number, seed: number) {
  p.box(x - 0.08, y - 0.08, 0.16, 0.16, 0, h, "#facc15");
  for (let k = 8; k < h; k += 8) p.box(x - 0.1, y - 0.1, 0.2, 0.2, k, 0.6, "#eab308");
  const c = p.ctx;
  const ang = Math.sin(t * 0.35 + seed * 6) * 1.1;
  const X = sx(x, y);
  const Y = sy(x, y, h);
  const jx = Math.cos(ang) * 46;
  const jy = Math.sin(ang) * 14;
  c.strokeStyle = p.col("#eab308");
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(X - jx * 0.3, Y - jy * 0.3);
  c.lineTo(X + jx, Y + jy);
  c.stroke();
  c.fillStyle = p.col("#475569");
  c.fillRect(X - jx * 0.3 - 3, Y - jy * 0.3 - 2, 6, 5);
  // the hook with a load swinging under the jib
  const hx = X + jx * 0.7;
  const hy = Y + jy * 0.7;
  const drop = 18 + Math.sin(t * 0.9 + seed) * 8;
  c.strokeStyle = "rgba(30,41,59,0.8)";
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(hx, hy);
  c.lineTo(hx, hy + drop);
  c.stroke();
  c.fillStyle = p.col("#64748b");
  c.fillRect(hx - 4, hy + drop, 8, 3);
  if (p.night > 0.3) p.light(X, Y - 2, 4, "#ef4444", 0.6);
}

function workers(p: Painter, plot: Plot, t: number, n: number) {
  const { x, y, w, d } = plot;
  for (let i = 0; i < n; i++) {
    const u = (Math.sin(t * (0.5 + i * 0.13) + i * 2.1) + 1) / 2;
    const wx = x + 0.5 + u * (w - 1);
    const wy = y + 0.6 + ((i * 0.37) % 1) * (d - 1.2);
    p.person(wx, wy, i % 2 ? "#f97316" : "#facc15", t * 6 + i);
  }
}

function dust(p: Painter, plot: Plot, t: number, amount: number) {
  if (amount <= 0) return;
  const c = p.ctx;
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.5 + i / 6) % 1;
    const dx = plot.x + plot.w * (0.2 + ((i * 37) % 60) / 100);
    const dy = plot.y + plot.d * (0.3 + ((i * 23) % 50) / 100);
    c.fillStyle = `rgba(214,198,170,${0.3 * amount * (1 - ph)})`;
    c.beginPath();
    c.arc(sx(dx, dy) + ph * 10, sy(dx, dy, 3 + ph * 20), 3 + ph * 7, 0, Math.PI * 2);
    c.fill();
  }
}

/** Floodlights on poles at two corners, for night shifts. */
function workLights(p: Painter, plot: Plot) {
  if (p.night < 0.25) return;
  for (const [a, b] of [[0.3, plot.d - 0.3], [plot.w - 0.3, 0.3]]) {
    p.box(plot.x + a - 0.03, plot.y + b - 0.03, 0.06, 0.06, 0, 22, "#475569");
    const X = sx(plot.x + a, plot.y + b);
    const Y = sy(plot.x + a, plot.y + b, 23);
    p.light(X, Y, 6, "#fff7cc", 0.9);
    p.light(X, Y + 20, 36, "#ffe8a3", 0.35);
  }
}

/** A lorry driving up to the site, unloading, and driving off again. */
function deliveries(p: Painter, plot: Plot, t: number, seed: number, cargo: string) {
  const e = plot.entry;
  const cycle = 16;
  const k = (t + seed * 31) % cycle;
  const lane = e.inward > 0 ? -0.25 : 0.25;
  let x = e.x;
  let y = e.y + lane;
  let dir: Dir = 0;
  if (k < 5) {
    x = e.x - 5 + k;
  } else if (k < 7) {
    // turning in: up the drive towards the plot
    y = e.y + lane + e.inward * (k - 5) * 0.6;
    dir = e.inward > 0 ? 1 : 3;
  } else if (k < 10) {
    y = e.y + lane + e.inward * 1.2;
    dir = e.inward > 0 ? 1 : 3;
  } else if (k < 12) {
    y = e.y + lane + e.inward * (12 - k) * 0.6;
    dir = e.inward > 0 ? 3 : 1;
  } else {
    x = e.x + (k - 12) * 1.25;
  }
  drawTruck(p, x, y, dir, cargo, 0.9);
}

/** The building as it stands at progress f (0–1), on its plot's footprint. */
function rising(p: Painter, plot: Plot, type: StructureType, f: number, t: number, seed: number) {
  const cfg = STRUCTURE_BY_ID[type];
  const H = HEIGHT[plot.size ?? "small"];
  const X = plot.x + 0.5;
  const Y = plot.y + 0.5;
  const W = plot.w - 1;
  const D = plot.d - 1;
  const phase = phaseOf(f);

  // dug ground, then the slab poured across it
  if (phase === "site") {
    p.quad(X, Y, W, D, p.col("#9a7b55"));
    p.quad(X + 0.3, Y + 0.3, W - 0.6, D - 0.6, p.col("#7c6142"));
    const k = span(f, 0, 0.15);
    p.ellipse(plot.x + plot.w - 0.9, plot.y + 0.9, 0, 0.4 + k * 0.5, p.col("#8b6b47"), 0.6);
    excavator(p, X + W * 0.35, Y + D * 0.35, t);
    return;
  }
  const slab = Math.min(1, span(f, 0.15, 0.3) * 1.15);
  p.box(X, Y, W * (phase === "foundation" ? slab : 1), D, 0, 2.5, "#cbd5e1", "#9ca3af");
  if (phase === "foundation") {
    // rebar mats waiting for concrete
    for (let k = 1; k < 5; k++) p.line(X + (W * k) / 5, Y + 0.1, X + (W * k) / 5, Y + D - 0.1, p.col("#92400e"), 1, 2.6);
    mixer(p, plot.x + plot.w - 1.3, plot.y + 0.3, t);
    return;
  }
  // steel columns rising, then beams across the top
  const frameH = phase === "structure" ? H * ease(span(f, 0.3, 0.5)) : H;
  const wallH = phase === "walls" ? H * ease(span(f, 0.5, 0.68)) : phase === "structure" ? 0 : H;
  const cols = Math.max(2, Math.round(W / 0.9));
  const rows = Math.max(2, Math.round(D / 0.9));
  const steel = p.col("#64748b");
  if (wallH > 0) {
    p.box(X + 0.05, Y + 0.05, W - 0.1, D - 0.1, 2.5, wallH, cfg.color);
    if (phase !== "walls" || f > 0.66) p.box(X, Y, W, D, 2.5 + H, 1.6, cfg.roof, cfg.roof);
  }
  if (phase === "structure" || phase === "walls") {
    for (let i = 0; i <= cols; i++)
      for (const j of [0, rows]) p.box(X + (W * i) / cols - 0.04, Y + (D * j) / rows - 0.04, 0.08, 0.08, 2.5, frameH, "#64748b");
    for (let j = 1; j < rows; j++) for (const i of [0, cols]) p.box(X + (W * i) / cols - 0.04, Y + (D * j) / rows - 0.04, 0.08, 0.08, 2.5, frameH, "#64748b");
    if (frameH > H * 0.6) {
      p.line(X, Y + D, X + W, Y + D, steel, 1.4, 2.5 + frameH);
      p.line(X + W, Y, X + W, Y + D, steel, 1.4, 2.5 + frameH);
      p.line(X, Y, X + W, Y, steel, 1.4, 2.5 + frameH);
    }
  }
  // the equipment going in: windows, doors, machines on pallets at the front
  if (phase === "equipment" || phase === "final") {
    const lit = phase === "final" ? span(f, 0.9, 1) : span(f, 0.7, 0.9) * 0.4;
    p.windows(X + 0.05, Y + 0.05, W - 0.1, D - 0.1, 2.5, H, Math.max(1, Math.floor(H / 13)), "#1e3a8a", p.night > 0.3 ? lit : 0);
    p.onLeft(X + 0.05, Y + D - 0.05, 2.5, W * 0.35, W * 0.6, 0, Math.min(10, H * 0.4), p.col("#334155"));
    if (phase === "equipment") for (let k = 0; k < 3; k++) p.box(plot.x + 0.4 + k * 0.6, plot.y + plot.d - 0.55, 0.45, 0.35, 0, 4 + rand(seed, k) * 3, ["#0ea5e9", "#64748b", "#f59e0b"][k]);
  }
  // scaffolding up the walls until the very end
  const scaffold = phase === "final" ? 1 - span(f, 0.9, 0.98) : phase === "structure" ? 0 : 1;
  if (scaffold > 0.02) {
    const c = p.ctx;
    c.save();
    c.globalAlpha *= scaffold;
    const sh = Math.max(wallH, frameH) + 4;
    for (let i = 0; i <= cols; i++) p.box(X + (W * i) / cols - 0.03, Y + D + 0.12, 0.05, 0.05, 0, sh, "#f59e0b");
    for (let z = 8; z < sh; z += 8) p.line(X, Y + D + 0.15, X + W, Y + D + 0.15, p.col("#d97706"), 1.2, z);
    c.restore();
  }
}

/** A whole building site at progress f. */
export function drawSite(p: Painter, plot: Plot, type: StructureType, f: number, t: number, seed: number) {
  const phase = phaseOf(f);
  // packed earth under the site
  p.quad(plot.x + 0.25, plot.y + 0.25, plot.w - 0.5, plot.d - 0.5, p.col("#b9a27c"));
  rising(p, plot, type, f, t, seed);
  if (phase === "structure" || phase === "walls" || phase === "equipment") {
    const H = HEIGHT[plot.size ?? "small"];
    towerCrane(p, plot.x + plot.w - 0.35, plot.y + 0.35, H + 34, t, seed);
  }
  // materials stacked by the gate
  if (phase !== "final") {
    p.box(plot.x + 0.3, plot.y + plot.d - 0.9, 0.5, 0.35, 0, 2.4, "#b45309", "#d97706");
    p.box(plot.x + 0.32, plot.y + plot.d - 0.88, 0.45, 0.3, 2.4, 2, "#94a3b8");
    p.box(plot.x + 0.95, plot.y + plot.d - 0.85, 0.6, 0.25, 0, 1.6, "#a1a1aa");
  }
  workers(p, plot, t, plot.big ? 5 : 3);
  fence(p, plot, phase === "final" ? 1 - span(f, 0.95, 1) : 1);
  dust(p, plot, t, phase === "site" ? 1 : phase === "foundation" ? 0.6 : phase === "final" ? 0 : 0.3);
  workLights(p, plot);
  deliveries(p, plot, t, seed, phase === "site" ? "#a16207" : phase === "foundation" ? "#9ca3af" : phase === "structure" ? "#64748b" : "#f8fafc");
}

/** An upgrade being built onto a working building: scaffolding, a crane, workers. */
export function drawWorks(p: Painter, plot: Plot, f: number, t: number, seed: number) {
  const H = HEIGHT[plot.size ?? "small"] + 10;
  const { x, y, w, d } = plot;
  const c = p.ctx;
  for (let k = 0; k < 4; k++) p.box(x + 0.35 + (k * (w - 0.7)) / 3, y + d - 0.3, 0.05, 0.05, 0, H * (0.6 + 0.4 * f), "#f59e0b");
  for (let z = 8; z < H * (0.6 + 0.4 * f); z += 9) p.line(x + 0.35, y + d - 0.28, x + w - 0.35, y + d - 0.28, p.col("#d97706"), 1.1, z);
  towerCrane(p, x + w - 0.3, y + 0.3, H + 30, t, seed);
  c.save();
  c.globalAlpha *= 0.9;
  barrier(p, x + 0.3, y + d - 0.12, true);
  barrier(p, x + w - 1, y + d - 0.12, true);
  c.restore();
  workers(p, plot, t, 2);
  workLights(p, plot);
}

/** Small progress chip over a site (screen pixels, labels pass). */
export function siteTag(p: Painter, plot: Plot, f: number, icon = "🏗️", z = 70) {
  p.tag(`${Math.floor(f * 100)}%`, plot.x + plot.w / 2, plot.y + plot.d / 2, z, { icon, bg: "rgba(120,53,15,0.88)", fg: "#fde68a", size: 10 });
}
