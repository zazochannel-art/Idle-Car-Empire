// Builds the list of things to draw on the Empire Map from the game state:
// one drawable per plot/cell, depth-sorted by the renderer. Ground (zones,
// roads, sidewalks) is drawn separately and first.
import { SPEC_BY_ID, STRUCTURE_BY_ID, ZONES, ZONE_BY_ID } from "@/game/config/city";
import { FACTORY_BY_ID } from "@/game/config/factories";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { BLOCKS, NODES, ROAD_STEP, WORLD, WORLD_MAP, ZONE_TILES, zoneOfBlock, zoneRect, type Decor, type Plot } from "@/game/city/layout";
import { isFactoryAvailable, type EconomySnapshot } from "@/game/engine/economy";
import type { BuildingState, GameState, StructureType, ZoneId } from "@/game/types";
import { Painter, rand, sx, sy } from "./iso";
import { CAR_COLORS, drawCar, drawTruck, type Dir } from "./vehicles";

export interface DrawInfo {
  zoom: number;
  selected: string | null;
  t: number;
}

export interface Drawable {
  depth: number;
  zone: ZoneId | null;
  /** World-pixel bounds for culling and picking. */
  bbox: [number, number, number, number];
  draw: (p: Painter, info: DrawInfo) => void;
  label?: (p: Painter, info: DrawInfo) => void;
  /** Plot id when tapping this selects something. */
  pickId?: string;
  /** Footprint + height, for precise picking. */
  hit?: { x: number; y: number; w: number; d: number; h: number };
}

export interface SceneNames {
  garage: (no: number) => string;
  factory: (id: keyof typeof FACTORY_BY_ID) => string;
  dealer: (id: keyof typeof DEALER_BY_ID) => string;
  structure: (type: StructureType) => string;
  level: (n: number) => string;
  money: (n: number) => string;
}

function bboxOf(x: number, y: number, w: number, d: number, h: number): [number, number, number, number] {
  return [sx(x, y + d) - 4, sy(x, y) - h - 30, sx(x + w, y) + 4, sy(x + w, y + d) + 4];
}

/** Is the world point inside the silhouette of a box (footprint extruded by h)? */
export function hitBox(hit: { x: number; y: number; w: number; d: number; h: number }, px: number, py: number): boolean {
  const { x, y, w, d, h } = hit;
  const left = sx(x, y + d);
  const right = sx(x + w, y);
  if (px < left || px > right) return false;
  // Top and bottom edges of the footprint diamond at this px.
  const topX = sx(x, y);
  const botX = sx(x + w, y + d);
  const yTop = px < topX ? sy(x, y + d) + ((sy(x, y) - sy(x, y + d)) * (px - left)) / (topX - left || 1) : sy(x, y) + ((sy(x + w, y) - sy(x, y)) * (px - topX)) / (right - topX || 1);
  const yBot = px < botX ? sy(x, y + d) + ((sy(x + w, y + d) - sy(x, y + d)) * (px - left)) / (botX - left || 1) : sy(x + w, y + d) + ((sy(x + w, y) - sy(x + w, y + d)) * (px - botX)) / (right - botX || 1);
  return py >= yTop - h && py <= yBot;
}

// ───────────────────────────── small helpers ─────────────────────────────

function cyl(p: Painter, x: number, y: number, z: number, r: number, h: number, color: string) {
  const c = p.ctx;
  const px = sx(x, y);
  const by = sy(x, y, z);
  const ty = sy(x, y, z + h);
  c.fillStyle = p.col(color, -0.15);
  c.beginPath();
  c.ellipse(px, by, r, r * 0.5, 0, 0, Math.PI);
  c.lineTo(px - r, ty);
  c.lineTo(px + r, ty);
  c.closePath();
  c.fill();
  const g = c.createLinearGradient(px - r, 0, px + r, 0);
  g.addColorStop(0, p.col(color, 0.05));
  g.addColorStop(1, p.col(color, -0.3));
  c.fillStyle = g;
  c.fillRect(px - r, ty, r * 2, by - ty);
  c.fillStyle = p.col(color, 0.15);
  c.beginPath();
  c.ellipse(px, ty, r, r * 0.5, 0, 0, Math.PI * 2);
  c.fill();
}

function smoke(p: Painter, x: number, y: number, z: number, t: number, seed: number) {
  if (p.dim) return;
  const c = p.ctx;
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.35 + i / 4 + seed) % 1;
    c.fillStyle = `rgba(226,232,240,${0.45 * (1 - ph)})`;
    c.beginPath();
    c.arc(sx(x, y) + ph * 14 + Math.sin(ph * 6 + seed * 9) * 2, sy(x, y, z + ph * 34), 3 + ph * 7, 0, Math.PI * 2);
    c.fill();
  }
}

function doors(p: Painter, x: number, y1: number, w: number, n: number, h: number, lit: boolean, t: number) {
  const dw = Math.min(0.42, (w - 0.2) / n - 0.08);
  const gap = (w - n * dw) / (n + 1);
  for (let i = 0; i < n; i++) {
    const u0 = gap + i * (dw + gap);
    p.onLeft(x, y1, 0, u0 - 0.03, u0 + dw + 0.03, 0, h + 1.5, p.col("#1f2937"));
    p.onLeft(x, y1, 0, u0, u0 + dw, 0, h, p.col("#94a3b8", -0.15));
    for (let k = 1; k < 5; k++) p.onLeft(x, y1, 0, u0, u0 + dw, (h * k) / 5 - 0.5, (h * k) / 5, p.col("#64748b"));
    if (lit) {
      const open = 0.45 + 0.15 * Math.sin(t * 1.3 + i);
      p.onLeft(x, y1, 0, u0, u0 + dw, 0, h * open, "rgba(251,191,36,0.85)");
      p.onLeft(x, y1, 0, u0, u0 + dw, 0, h * open * 0.25, "rgba(30,41,59,0.6)");
    }
  }
}

function flag(p: Painter, x: number, y: number, color: string, t: number) {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  c.strokeStyle = p.col("#e5e7eb");
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - 30);
  c.stroke();
  const wave = p.dim ? 0 : Math.sin(t * 4 + x) * 2;
  c.fillStyle = p.col(color);
  c.beginPath();
  c.moveTo(px, py - 30);
  c.quadraticCurveTo(px + 6, py - 29 + wave, px + 12, py - 27);
  c.lineTo(px + 12, py - 21);
  c.quadraticCurveTo(px + 6, py - 23 + wave, px, py - 22);
  c.closePath();
  c.fill();
}

function emojiAt(p: Painter, emoji: string, x: number, y: number, z: number, size: number) {
  const c = p.ctx;
  c.font = `${size}px ui-sans-serif, system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.globalAlpha = p.dim ? 0.45 : 1;
  c.fillText(emoji, sx(x, y), sy(x, y, z));
  c.globalAlpha = 1;
}

function parkedCars(p: Painter, x: number, y: number, n: number, seed: number, dir: Dir = 1, step = 0.55) {
  for (let i = 0; i < n; i++) drawCar(p, x + i * step, y, dir, CAR_COLORS[Math.floor(rand(seed, i) * CAR_COLORS.length)]);
}

// ───────────────────────────── plot buildings ─────────────────────────────

const M = 0.3;

function emptyPlot(p: Painter, plot: Plot, info: DrawInfo, buildable: boolean) {
  const { x, y, w, d } = plot;
  p.quad(x + M, y + M, w - 2 * M, d - 2 * M, p.col("#b7c98f"));
  p.quad(x + M + 0.15, y + M + 0.15, w - 2 * M - 0.3, d - 2 * M - 0.3, p.col("#c9d6a3"));
  const sel = info.selected === plot.id;
  p.quadStroke(x + M + 0.1, y + M + 0.1, w - 2 * M - 0.2, d - 2 * M - 0.2, sel ? "#fbbf24" : buildable ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)", sel ? 2.5 : 1.4, [6, 5]);
  // corner foundation pegs
  for (const [a, b] of [[0.45, 0.45], [w - 0.45, 0.45], [0.45, d - 0.45], [w - 0.45, d - 0.45]]) p.box(x + a - 0.05, y + b - 0.05, 0.1, 0.1, 0, 4, "#a16207");
}

function garage(p: Painter, plot: Plot, b: BuildingState, active: boolean, t: number) {
  const L = b.level;
  const spec = SPEC_BY_ID[b.garage?.spec ?? "repair"];
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  p.quad(X, Y, W, D, p.col("#5b6472"));
  p.quadStroke(X + 0.05, Y + 0.05, W - 0.1, D - 0.1, p.col("#e2e8f0", -0.2), 1);

  type Part = { x: number; y: number; w: number; d: number; h: number; kind: "main" | "annex" | "glass" };
  const parts: Part[] = [];
  if (L <= 1) parts.push({ x: X + 0.35, y: Y + 0.2, w: 1.5, d: 1.2, h: 18, kind: "main" });
  else if (L === 2) parts.push({ x: X + 0.15, y: Y + 0.15, w: 1.95, d: 1.3, h: 22, kind: "main" });
  else if (L <= 4) parts.push({ x: X + 0.1, y: Y + 0.1, w: 1.5, d: 1.4, h: 24, kind: "main" }, { x: X + 1.7, y: Y + 0.1, w: 0.6, d: 1.0, h: 30, kind: "annex" });
  else if (L === 5) parts.push({ x: X + 0.05, y: Y + 0.05, w: 1.7, d: 1.5, h: 30, kind: "main" }, { x: X + 1.82, y: Y + 0.05, w: 0.52, d: 0.85, h: 44, kind: "annex" });
  else parts.push({ x: X + 0.05, y: Y + 0.05, w: 1.72, d: 1.55, h: 32, kind: "main" }, { x: X + 1.84, y: Y + 0.05, w: 0.5, d: 1.35, h: 28 + (L - 6) * 9, kind: "glass" });

  for (const part of parts) p.shadow(part.x, part.y, part.w, part.d, part.h);

  // front apron: parking bays and cars waiting for service
  const frontY = Y + D - 0.45;
  if (L >= 4) {
    for (let i = 0; i <= 4; i++) p.line(X + 0.15 + i * 0.5, frontY - 0.3, X + 0.15 + i * 0.5, frontY + 0.35, p.col("#f8fafc"), 1);
  }
  const waiting = active ? Math.min(4, 1 + Math.floor(L / 2)) : L >= 4 ? 1 : 0;

  for (const part of parts) {
    const wall = part.kind === "glass" ? "#7dd3fc" : part.kind === "annex" ? "#f1f5f9" : "#e8ecf1";
    const roof = L >= 10 ? "#fbbf24" : "#cbd5e1";
    if (part.kind === "main" && L >= 5) {
      p.box(part.x, part.y, part.w, part.d, 0, part.h, wall, "#94a3b8");
      p.sawtooth(part.x, part.y, part.w, part.d, part.h, 3, 7, "#cbd5e1");
    } else {
      p.box(part.x, part.y, part.w, part.d, 0, part.h, wall, roof);
    }
    if (part.kind === "main") {
      p.onLeft(part.x, part.y + part.d, 0, 0, part.w, part.h - 4, part.h - 1, p.col(spec.color));
      doors(p, part.x, part.y + part.d, part.w, L <= 1 ? 1 : L <= 4 ? 2 : 3, Math.min(14, part.h - 7), active, t);
      p.onRight(part.x + part.w, part.y, 0, 0.2, part.d - 0.2, part.h * 0.45, part.h * 0.7, p.col("#bae6fd", -0.25));
      if (L >= 2 && L < 5) {
        p.box(part.x + 0.25, part.y + 0.25, 0.25, 0.2, part.h, 4, "#94a3b8");
        p.box(part.x + 0.7, part.y + 0.3, 0.2, 0.2, part.h, 3, "#94a3b8");
      }
    } else if (part.kind === "annex") {
      p.windows(part.x, part.y, part.w, part.d, 0, part.h, Math.max(2, Math.round(part.h / 14)), "#7dd3fc", active ? 2 : 0);
    } else {
      // glass showroom: mullions + a car on display
      for (let k = 1; k < 4; k++) p.onLeft(part.x, part.y + part.d, 0, (part.w * k) / 4 - 0.01, (part.w * k) / 4 + 0.01, 0, part.h, p.col("#e2e8f0"));
      p.onRight(part.x + part.w, part.y, 0, 0, part.d, 0, part.h, "rgba(186,230,253,0.25)");
      p.box(part.x - 0.02, part.y - 0.02, part.w + 0.04, part.d + 0.04, part.h, 3, "#e2e8f0", L >= 10 ? "#fbbf24" : undefined);
    }
  }
  // sign over the main entrance
  const main = parts[0];
  const no = String(b.garage?.no ?? 1).padStart(2, "0");
  p.onLeft(main.x, main.y + main.d, 0, main.w * 0.5 - 0.35, main.w * 0.5 + 0.35, main.h + 1, main.h + 10, p.col("#0f172a"));
  p.textLeft(`#${no}`, main.x + main.w * 0.5, main.y + main.d, main.h + 5.5, 7, p.dim ? "#94a3b8" : "#fbbf24");
  if (L >= 8) {
    const g = parts[1] ?? main;
    p.box(g.x + g.w / 2 - 0.04, g.y + 0.2, 0.08, 0.08, g.h + 3, 16, "#e5e7eb");
    emojiAt(p, spec.emoji, g.x + g.w / 2, g.y + 0.24, g.h + 26, 13);
  }
  for (let i = 0; i < waiting; i++) drawCar(p, X + 0.4 + i * 0.5, frontY + 0.05, 3, CAR_COLORS[(i * 3 + (b.garage?.no ?? 0)) % CAR_COLORS.length]);
}

function factoryLot(p: Painter, plot: Plot, owned: boolean, level: number, t: number, seed: number) {
  const id = plot.factory!;
  const cfg = FACTORY_BY_ID[id];
  const { x, y, w, d } = plot;
  const X = x + M;
  const Y = y + M;
  const W = w - 2 * M;
  const D = d - 2 * M;
  if (!owned) {
    p.quad(X, Y, W, D, p.col("#b08d5b"));
    p.quad(X + 0.3, Y + 0.3, W - 0.6, D - 0.6, p.col("#c4a274"));
    p.quadStroke(X + 0.1, Y + 0.1, W - 0.2, D - 0.2, p.col("#f59e0b"), 1.5, [4, 4]);
    if (w > 3) {
      // crane, beams and a foundation slab
      p.box(X + 0.6, Y + 0.6, W * 0.45, D * 0.4, 0, 3, "#cbd5e1");
      p.box(X + W - 1.2, Y + 0.5, 0.6, 0.3, 0, 5, "#a16207");
      p.box(X + W - 1.2, Y + 0.9, 0.6, 0.3, 0, 5, "#a16207");
      const mx = X + W - 0.8;
      const my = Y + D - 1.2;
      p.box(mx, my, 0.18, 0.18, 0, 78, "#facc15");
      const c = p.ctx;
      c.strokeStyle = p.col("#eab308");
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sx(mx + 0.09, my + 0.09) - 50, sy(mx + 0.09, my + 0.09, 78));
      c.lineTo(sx(mx + 0.09, my + 0.09) + 18, sy(mx + 0.09, my + 0.09, 78));
      c.stroke();
      const swing = p.dim ? 0 : Math.sin(t * 0.6 + seed * 6) * 6;
      c.strokeStyle = p.col("#334155");
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(sx(mx, my) - 36 + swing, sy(mx, my, 78));
      c.lineTo(sx(mx, my) - 36 + swing, sy(mx, my, 40));
      c.stroke();
    } else {
      p.box(X + 0.4, Y + 0.4, 1.2, 0.9, 0, 3, "#cbd5e1");
    }
    return;
  }

  p.quad(X, Y, W, D, p.col("#9ca3af"));
  if (w <= 3) {
    // Assembly Workshop: a small shed with a gabled roof.
    p.shadow(X + 0.2, Y + 0.2, 1.9, 1.4, 22);
    p.box(X + 0.2, Y + 0.2, 1.9, 1.4, 0, 18, "#f1e7d6");
    p.gable(X + 0.2, Y + 0.2, 1.9, 1.4, 18, 10, "#b45309");
    doors(p, X + 0.2, Y + 1.6, 1.9, 2, 12, true, t);
    p.box(X + 0.3, Y + 1.85, 1.6, 0.25, 0, 3, "#475569");
    drawCar(p, X + 0.7 + ((t * 0.15) % 1) * 0.9, Y + 1.97, 0, cfg.accent);
    return;
  }

  const hall = { x: X + 0.25, y: Y + 0.25, w: 3.3, d: 2.9, h: 34 };
  p.shadow(hall.x, hall.y, hall.w, hall.d, hall.h);
  const big = level >= 25;
  if (big) p.shadow(X + 3.75, Y + 0.25, 1.35, 1.9, 26);
  p.shadow(X + 3.75, Y + 2.45, 1.35, 1.2, 44);
  p.box(hall.x, hall.y, hall.w, hall.d, 0, hall.h, "#e5e7eb", "#94a3b8");
  p.sawtooth(hall.x, hall.y, hall.w, hall.d, hall.h, 4, 9, "#b6c2d1");
  p.onLeft(hall.x, hall.y + hall.d, 0, 0, hall.w, hall.h - 5, hall.h - 2, p.col(cfg.accent));
  doors(p, hall.x, hall.y + hall.d, hall.w, 4, 18, true, t);
  cyl(p, hall.x + 0.5, hall.y + 0.5, hall.h, 5, 34, "#9ca3af");
  cyl(p, hall.x + 1.1, hall.y + 0.45, hall.h, 4, 26, "#a1a1aa");
  smoke(p, hall.x + 0.5, hall.y + 0.5, hall.h + 36, t, seed);
  smoke(p, hall.x + 1.1, hall.y + 0.45, hall.h + 28, t, seed + 0.4);
  if (big) {
    p.box(X + 3.75, Y + 0.25, 1.35, 1.9, 0, 26, "#e2e8f0");
    p.gable(X + 3.75, Y + 0.25, 1.35, 1.9, 26, 8, "#64748b");
  } else {
    cyl(p, X + 4.2, Y + 0.9, 0, 9, 30, "#d1d5db");
    cyl(p, X + 4.7, Y + 1.5, 0, 9, 30, "#d1d5db");
  }
  p.box(X + 3.75, Y + 2.45, 1.35, 1.2, 0, 44, "#f8fafc");
  p.windows(X + 3.75, Y + 2.45, 1.35, 1.2, 0, 44, 4, "#38bdf8", 2);
  p.onLeft(X + 3.75, Y + 3.65, 0, 0, 1.35, 40, 44, p.col(cfg.accent));
  emojiAt(p, cfg.emoji, X + 4.42, Y + 3.0, 58, 16);
  if (level >= 100) {
    cyl(p, X + 4.6, Y + 4.6, 0, 7, 24, "#e5e7eb");
  }
  // yard with trucks at the docks
  for (let i = 0; i < 3; i++) p.line(X + 0.4 + i * 1.0, Y + 3.4, X + 0.4 + i * 1.0, Y + 4.4, p.col("#f8fafc"), 1);
  drawTruck(p, X + 0.9, Y + 3.95, 3, cfg.accent);
  drawTruck(p, X + 1.9, Y + 3.95, 3, "#f8fafc");
  parkedCars(p, X + 0.6, Y + 4.9, 5, seed, 1, 0.6);
}

function dealerLot(p: Painter, plot: Plot, owned: boolean, t: number, seed: number) {
  const id = plot.dealer!;
  const cfg = DEALER_BY_ID[id];
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  if (!owned) {
    p.quad(X, Y, W, D, p.col("#cbd5c0"));
    p.quadStroke(X + 0.1, Y + 0.1, W - 0.2, D - 0.2, p.col("#f59e0b"), 1.4, [4, 4]);
    p.box(X + 0.5, Y + 0.4, 1.4, 0.9, 0, 3, "#d6d3d1");
    return;
  }
  const tiers = ["local", "city", "premium", "luxury", "supercar", "global"].indexOf(id);
  p.quad(X, Y, W, D, p.col("#e7e5e4"));
  for (let i = 0; i < 6; i++) p.line(X + 0.1, Y + 0.4 * i + 0.2, X + W - 0.1, Y + 0.4 * i + 0.2, p.col("#d6d3d1", -0.05), 1);
  const h = 18 + tiers * 4;
  p.shadow(X + 0.15, Y + 0.15, 2.1, 1.1, h);
  p.box(X + 0.15, Y + 0.15, 2.1, 1.1, 0, h, "#93c5fd", "#f8fafc");
  for (let k = 1; k < 5; k++) p.onLeft(X + 0.15, Y + 1.25, 0, (2.1 * k) / 5 - 0.012, (2.1 * k) / 5 + 0.012, 0, h, p.col("#f1f5f9"));
  for (let k = 1; k < 3; k++) p.onRight(X + 2.25, Y + 0.15, 0, (1.1 * k) / 3 - 0.012, (1.1 * k) / 3 + 0.012, 0, h, p.col("#e2e8f0", -0.2));
  p.box(X + 0.1, Y + 0.1, 2.2, 1.2, h, 3, "#f8fafc");
  p.onLeft(X + 0.1, Y + 1.3, h, 0.3, 1.9, 0.2, 2.8, p.col(tiers >= 3 ? "#eab308" : "#2563eb"));
  drawCar(p, X + 0.7, Y + 0.7, 0, CAR_COLORS[(tiers + 1) % CAR_COLORS.length], 1, 0, tiers >= 3);
  parkedCars(p, X + 0.35, Y + 1.85, 4, seed + tiers, 1, 0.55);
  flag(p, X + 0.05, Y + D - 0.1, tiers >= 3 ? "#eab308" : "#ef4444", t);
  flag(p, X + W - 0.1, Y + D - 0.1, "#3b82f6", t + 1);
  p.box(X + W - 0.3, Y + 0.2, 0.16, 0.16, 0, 30, "#1e293b");
  emojiAt(p, cfg.emoji, X + W - 0.22, Y + 0.28, 40, 13);
}

function structure(p: Painter, plot: Plot, b: BuildingState, t: number, seed: number) {
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  const cfg = STRUCTURE_BY_ID[b.type];
  const L = b.level;
  switch (b.type) {
    case "carWash": {
      p.quad(X, Y, W, D, p.col("#94a3b8"));
      p.shadow(X + 0.2, Y + 0.3, 2.0, 1.1, 18);
      p.box(X + 0.2, Y + 0.3, 2.0, 1.1, 0, 16, "#e0f2fe", "#0ea5e9");
      p.onLeft(X + 0.2, Y + 1.4, 0, 0.6, 1.4, 0, 11, p.col("#0c4a6e"));
      drawCar(p, X + 1.0, Y + 1.6, 0, CAR_COLORS[(L + 1) % CAR_COLORS.length]);
      p.onLeft(X + 0.2, Y + 1.4, 0, 0, 2.0, 12, 16, p.col("#0ea5e9"));
      p.textLeft("WASH", X + 1.2, Y + 1.4, 14, 6, "#fff");
      if (!p.dim)
        for (let i = 0; i < 5; i++) {
          const ph = (t * 0.5 + i / 5) % 1;
          p.circle(X + 0.6 + i * 0.3, Y + 1.7, 6 + ph * 20, 2 + ph * 2, `rgba(224,242,254,${0.8 * (1 - ph)})`);
        }
      break;
    }
    case "parking": {
      p.quad(X, Y, W, D, p.col("#475569"));
      for (let i = 0; i <= 5; i++) p.line(X + 0.1 + i * 0.44, Y + 0.15, X + 0.1 + i * 0.44, Y + 0.9, p.col("#f8fafc"), 1);
      for (let i = 0; i <= 5; i++) p.line(X + 0.1 + i * 0.44, Y + 1.5, X + 0.1 + i * 0.44, Y + 2.25, p.col("#f8fafc"), 1);
      parkedCars(p, X + 0.32, Y + 0.55, Math.min(5, 2 + L), seed, 1, 0.44);
      parkedCars(p, X + 0.32, Y + 1.9, Math.min(5, 1 + L), seed + 3, 3, 0.44);
      p.box(X + W - 0.4, Y + D - 0.35, 0.3, 0.25, 0, 10, "#fef3c7", "#64748b");
      emojiAt(p, "🅿️", X + W - 0.25, Y + D - 0.2, 24, 11);
      break;
    }
    case "serviceCenter": {
      p.quad(X, Y, W, D, p.col("#9ca3af"));
      p.shadow(X + 0.15, Y + 0.15, 2.1, 1.4, 22);
      p.box(X + 0.15, Y + 0.15, 2.1, 1.4, 0, 22, "#fff7ed", "#fb923c");
      p.onLeft(X + 0.15, Y + 1.55, 0, 0, 2.1, 18, 22, p.col("#f97316"));
      doors(p, X + 0.15, Y + 1.55, 2.1, 3, 13, true, t);
      for (let i = 0; i < 3; i++) cyl(p, X + 2.2, Y + 1.9 + i * 0.01, i * 2.2, 3, 2, "#111827");
      drawCar(p, X + 0.7, Y + 2.0, 3, CAR_COLORS[seed * 10 > 5 ? 1 : 6]);
      break;
    }
    case "warehouse": {
      p.quad(X, Y, W, D, p.col("#a8a29e"));
      p.shadow(X + 0.1, Y + 0.1, 2.2, 1.6, 26);
      p.box(X + 0.1, Y + 0.1, 2.2, 1.6, 0, 26, "#e8dcc4");
      p.gable(X + 0.1, Y + 0.1, 2.2, 1.6, 26, 8, "#a16207");
      doors(p, X + 0.1, Y + 1.7, 2.2, 3, 15, false, t);
      for (let i = 0; i < 3; i++) p.box(X + 0.2 + i * 0.5, Y + 1.95, 0.35, 0.3, 0, 7, "#d97706");
      break;
    }
    case "partsFactory": {
      p.quad(X, Y, W, D, p.col("#9ca3af"));
      p.shadow(X + 0.1, Y + 0.1, 2.1, 1.7, 26);
      p.box(X + 0.1, Y + 0.1, 2.1, 1.7, 0, 24, "#d6d3d1", "#78716c");
      p.sawtooth(X + 0.1, Y + 0.1, 2.1, 1.7, 24, 3, 7, "#a8a29e");
      cyl(p, X + 0.5, Y + 0.4, 24, 3.5, 22, "#78716c");
      smoke(p, X + 0.5, Y + 0.4, 48, t, seed);
      doors(p, X + 0.1, Y + 1.8, 2.1, 2, 13, true, t);
      emojiAt(p, "⚙️", X + 1.6, Y + 1.0, 40, 12);
      break;
    }
    case "logistics": {
      p.quad(X, Y, W, D, p.col("#94a3b8"));
      p.shadow(X + 0.1, Y + 0.1, 2.3, 1.2, 22);
      p.box(X + 0.1, Y + 0.1, 2.3, 1.2, 0, 22, "#e5e7eb", "#2563eb");
      doors(p, X + 0.1, Y + 1.3, 2.3, 4, 13, true, t);
      drawTruck(p, X + 0.6, Y + 1.85, 3, "#2563eb");
      drawTruck(p, X + 1.5, Y + 1.85, 3, "#f8fafc");
      break;
    }
    case "truckDepot": {
      p.quad(X, Y, W, D, p.col("#64748b"));
      p.box(X + 0.15, Y + 0.15, 0.9, 0.8, 0, 16, "#f1f5f9", "#dc2626");
      p.windows(X + 0.15, Y + 0.15, 0.9, 0.8, 0, 16, 1, "#38bdf8");
      drawTruck(p, X + 1.6, Y + 0.6, 3, "#dc2626");
      drawTruck(p, X + 2.1, Y + 0.6, 3, "#f8fafc");
      drawTruck(p, X + 0.6, Y + 1.8, 0, "#f59e0b");
      drawTruck(p, X + 1.6, Y + 1.9, 0, "#dc2626");
      break;
    }
    case "researchCenter": {
      p.quad(X, Y, W, D, p.col("#cbd5e1"));
      p.quad(X + 0.2, Y + 1.7, W - 0.4, 0.5, p.col("#86efac"));
      p.shadow(X + 0.2, Y + 0.2, 1.9, 1.3, 30);
      p.box(X + 0.2, Y + 0.2, 1.9, 1.3, 0, 30, "#f8fafc");
      p.windows(X + 0.2, Y + 0.2, 1.9, 1.3, 0, 30, 3, "#22d3ee", 1);
      const c = p.ctx;
      c.fillStyle = p.col("#e0f2fe");
      c.beginPath();
      c.ellipse(sx(X + 0.9, Y + 0.8), sy(X + 0.9, Y + 0.8, 30), 16, 9, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = p.col("#bae6fd", -0.1);
      c.beginPath();
      c.ellipse(sx(X + 0.9, Y + 0.8), sy(X + 0.9, Y + 0.8, 30), 16, 8, 0, 0, Math.PI);
      c.fill();
      p.box(X + 1.7, Y + 0.4, 0.06, 0.06, 30, 10, "#94a3b8");
      p.ellipse(X + 1.73, Y + 0.43, 42 + Math.sin(t) * 0.5, 6, p.col("#e2e8f0"), 0.7);
      break;
    }
    case "exportTerminal": {
      p.quad(X, Y, W, D, p.col("#64748b"));
      const colors = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0891b2"];
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 2; k++) for (let z = 0; z < 1 + ((r + k + L) % 3); z++) p.box(X + 0.15 + k * 0.85, Y + 0.2 + r * 0.55, 0.75, 0.4, z * 7, 7, colors[(r * 2 + k + z) % colors.length]);
      p.box(X + 1.95, Y + 0.1, 0.12, 0.12, 0, 50, "#f59e0b");
      p.box(X + 1.95, Y + 1.9, 0.12, 0.12, 0, 50, "#f59e0b");
      p.box(X + 1.9, Y + 0.1, 0.22, 1.95, 50, 4, "#f59e0b");
      break;
    }
    case "hq": {
      p.quad(X, Y, W, D, p.col("#cbd5e1"));
      const h = 70 + L * 8;
      p.shadow(X + 0.4, Y + 0.4, 1.5, 1.5, h);
      p.box(X + 0.4, Y + 0.4, 1.5, 1.5, 0, h, "#93c5fd", "#1e3a8a");
      p.windows(X + 0.4, Y + 0.4, 1.5, 1.5, 0, h, Math.round(h / 9), "#1d4ed8", 1);
      p.box(X + 0.6, Y + 0.6, 1.1, 1.1, h, 8, "#1e3a8a");
      p.box(X + 1.1, Y + 1.1, 0.08, 0.08, h + 8, 18, "#e5e7eb");
      if (!p.dim && Math.sin(t * 3) > 0) p.circle(X + 1.14, Y + 1.14, h + 27, 2, "#ef4444");
      flag(p, X + 0.1, Y + D - 0.1, "#1e3a8a", t);
      break;
    }
    case "airport": {
      p.quad(X, Y, W, D, p.col("#86a789"));
      p.quad(X + 0.1, Y + 1.5, W - 0.2, 0.6, p.col("#374151"));
      for (let i = 0; i < 5; i++) p.quad(X + 0.25 + i * 0.45, Y + 1.78, 0.25, 0.05, p.col("#f8fafc"));
      p.box(X + 0.2, Y + 0.2, 1.6, 0.8, 0, 16, "#e2e8f0", "#475569");
      p.windows(X + 0.2, Y + 0.2, 1.6, 0.8, 0, 16, 1, "#38bdf8", 1);
      p.box(X + 2.0, Y + 0.3, 0.2, 0.2, 0, 34, "#e2e8f0");
      p.box(X + 1.9, Y + 0.2, 0.4, 0.4, 34, 8, "#7dd3fc");
      const px = X + 0.4 + ((t * 0.12) % 1) * 1.8;
      p.box(px - 0.35, Y + 1.75, 0.7, 0.12, 4, 4, "#f8fafc");
      p.box(px - 0.05, Y + 1.5, 0.12, 0.62, 5, 2, "#f8fafc");
      break;
    }
    default:
      p.box(X + 0.3, Y + 0.3, 1.8, 1.4, 0, 20, cfg.color, cfg.roof);
  }
}

// ───────────────────────────── decor ─────────────────────────────

const HOUSE_ROOFS = ["#b91c1c", "#1d4ed8", "#92400e", "#475569", "#15803d", "#7c2d12"];
const HOUSE_WALLS = ["#fef3c7", "#f5f5f4", "#e0f2fe", "#fce7f3", "#ecfccb"];
const GLASS = ["#60a5fa", "#93c5fd", "#a5b4fc", "#67e8f9", "#94a3b8"];

function decor(p: Painter, dc: Decor, t: number) {
  const { x, y, w, d, seed } = dc;
  const X = x + M;
  const Y = y + M;
  const W = w - 2 * M;
  const D = d - 2 * M;
  switch (dc.kind) {
    case "house": {
      p.quad(X, Y, W, D, p.col("#86c06c"));
      p.quad(X + 0.85, Y + 1.6, 0.35, 0.8, p.col("#d6d3d1"));
      const homes = [
        [0.15, 0.2],
        [1.35, 0.25],
        [0.25, 1.45],
      ];
      homes.forEach(([a, b], i) => {
        const r = rand(seed * 10, i);
        if (i === 2 && r < 0.4) {
          p.tree(X + a + 0.4, Y + b + 0.4, 0.9, r);
          return;
        }
        const hw = 0.8 + r * 0.2;
        const hd = 0.7;
        const h = 11 + Math.floor(r * 3) * 3;
        p.shadow(X + a, Y + b, hw, hd, h + 6);
        p.box(X + a, Y + b, hw, hd, 0, h, HOUSE_WALLS[Math.floor(r * HOUSE_WALLS.length)]);
        p.onLeft(X + a, Y + b + hd, 0, hw * 0.4, hw * 0.4 + 0.16, 0, 7, p.col("#7c2d12"));
        p.onLeft(X + a, Y + b + hd, 0, 0.1, 0.28, 4, 8, p.col("#bae6fd", -0.1));
        p.onRight(X + a + hw, Y + b, 0, 0.2, 0.45, 4, 8, p.col("#bae6fd", -0.25));
        p.gable(X + a, Y + b, hw, hd, h, 8, HOUSE_ROOFS[Math.floor(r * 17) % HOUSE_ROOFS.length]);
      });
      p.tree(X + 2.1, Y + 1.9, 0.75, seed);
      break;
    }
    case "apartment": {
      p.quad(X, Y, W, D, p.col("#a3b18a"));
      const h = 44 + Math.floor(seed * 4) * 8;
      p.shadow(X + 0.25, Y + 0.25, 1.8, 1.6, h);
      const wall = ["#fde68a", "#fecaca", "#e9d5ff", "#cffafe"][Math.floor(seed * 4)];
      p.box(X + 0.25, Y + 0.25, 1.8, 1.6, 0, h, wall, "#94a3b8");
      p.windows(X + 0.25, Y + 0.25, 1.8, 1.6, 0, h, Math.round(h / 11), "#bae6fd", 1);
      p.box(X + 0.5, Y + 0.5, 0.35, 0.3, h, 5, "#cbd5e1");
      p.tree(X + 2.2, Y + 2.2, 0.7, seed);
      break;
    }
    case "office": {
      p.quad(X, Y, W, D, p.col("#cbd5e1"));
      const h = 70 + Math.floor(seed * 6) * 14;
      const glass = GLASS[Math.floor(seed * 13) % GLASS.length];
      const twin = seed > 0.55;
      const towers = twin
        ? [
            { x: X + 0.15, y: Y + 0.15, w: 1.0, d: 1.0, h },
            { x: X + 1.35, y: Y + 1.25, w: 0.9, d: 0.9, h: h * 0.65 },
          ]
        : [{ x: X + 0.35, y: Y + 0.35, w: 1.6, d: 1.5, h }];
      for (const tw of towers) p.shadow(tw.x, tw.y, tw.w, tw.d, tw.h);
      for (const tw of towers) {
        p.box(tw.x, tw.y, tw.w, tw.d, 0, tw.h, glass, "#475569");
        p.windows(tw.x, tw.y, tw.w, tw.d, 0, tw.h, Math.round(tw.h / 8), "#1e3a8a", 1);
        p.box(tw.x + tw.w * 0.3, tw.y + tw.d * 0.3, tw.w * 0.4, tw.d * 0.4, tw.h, 6, "#64748b");
      }
      if (!twin) {
        p.box(X + 1.1, Y + 1.1, 0.05, 0.05, h + 6, 20, "#e5e7eb");
        if (!p.dim && Math.sin(t * 2 + seed * 7) > 0.3) p.circle(X + 1.12, Y + 1.12, h + 27, 1.8, "#ef4444");
      }
      break;
    }
    case "shop": {
      p.quad(X, Y, W, D, p.col("#d6d3d1"));
      const colors = ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b"];
      for (let i = 0; i < 2; i++) {
        const bx = X + 0.15 + i * 1.15;
        const col = colors[Math.floor(seed * 4 + i) % 4];
        p.shadow(bx, Y + 0.2, 1.0, 1.2, 16);
        p.box(bx, Y + 0.2, 1.0, 1.2, 0, 16, "#f5f5f4", "#a8a29e");
        p.onLeft(bx, Y + 1.4, 0, 0.1, 0.9, 0, 9, p.col("#bae6fd", -0.15));
        p.onLeft(bx, Y + 1.4, 0, 0, 1.0, 10, 13, p.col(col));
      }
      parkedCars(p, X + 0.35, Y + 2.05, 3, seed, 1, 0.6);
      break;
    }
    case "industry": {
      p.quad(X, Y, W, D, p.col("#a8a29e"));
      p.shadow(X + 0.2, Y + 0.2, 1.4, 1.6, 22);
      p.box(X + 0.2, Y + 0.2, 1.4, 1.6, 0, 20, "#d6d3d1");
      p.sawtooth(X + 0.2, Y + 0.2, 1.4, 1.6, 20, 2, 6, "#a8a29e");
      cyl(p, X + 2.0, Y + 0.6, 0, 8, 26, "#e7e5e4");
      cyl(p, X + 2.0, Y + 1.5, 0, 8, 26, "#e7e5e4");
      if (seed > 0.5) {
        cyl(p, X + 0.5, Y + 0.5, 20, 3, 24, "#78716c");
        smoke(p, X + 0.5, Y + 0.5, 44, t, seed);
      }
      break;
    }
    case "park": {
      p.quad(X, Y, W, D, p.col("#7ccf6a"));
      p.quad(X + 1.05, Y, 0.3, D, p.col("#e7d7b5"));
      p.quad(X, Y + 1.05, W, 0.3, p.col("#e7d7b5"));
      if (seed > 0.6) {
        cyl(p, X + 1.2, Y + 1.2, 0, 12, 3, "#cbd5e1");
        p.ellipse(X + 1.2, Y + 1.2, 3, 10, p.col("#38bdf8"), 0.5);
        if (!p.dim) p.circle(X + 1.2, Y + 1.2, 6 + Math.abs(Math.sin(t * 3)) * 6, 2, "rgba(186,230,253,0.9)");
      }
      const spots = [
        [0.35, 0.35], [0.6, 2.0], [2.0, 0.4], [2.05, 2.05], [0.4, 0.9], [1.8, 0.85],
      ];
      spots.forEach(([a, b], i) => {
        const r = rand(seed * 7, i);
        if (r < 0.15) return;
        if (r > 0.75) p.pine(X + a, Y + b, 0.9);
        else p.tree(X + a, Y + b, 0.7 + r * 0.4, r);
      });
      break;
    }
    case "water": {
      const c = p.ctx;
      p.quad(X - 0.1, Y - 0.1, W + 0.2, D + 0.2, p.col("#e9d8a6"));
      p.quad(X + 0.1, Y + 0.1, W - 0.2, D - 0.2, p.col("#38bdf8", -0.1));
      p.quad(X + 0.35, Y + 0.35, W - 0.7, D - 0.7, p.col("#0ea5e9", -0.15));
      if (!p.dim) {
        c.strokeStyle = "rgba(255,255,255,0.35)";
        c.lineWidth = 1;
        for (let i = 0; i < Math.min(12, Math.round(W * 2)); i++) {
          const a = rand(seed * 31, i);
          const b = rand(seed * 17, i + 5);
          const px = X + 0.5 + a * (W - 1);
          const py = Y + 0.5 + b * (D - 1);
          const ph = Math.sin(t * 1.5 + i) * 3;
          c.beginPath();
          c.moveTo(sx(px, py) - 5 + ph, sy(px, py));
          c.lineTo(sx(px, py) + 5 + ph, sy(px, py));
          c.stroke();
        }
      }
      break;
    }
  }
}

// ───────────────────────────── ground ─────────────────────────────

const ASPHALT = "#3f4652";
const SIDEWALK = "#cfd6de";

export function drawGround(p: Painter, unlocked: ReadonlySet<ZoneId>, view: [number, number, number, number]) {
  const c = p.ctx;
  const inView = (b: [number, number, number, number]) => b[2] >= view[0] && b[0] <= view[2] && b[3] >= view[1] && b[1] <= view[3];

  // island slab
  p.dim = false;
  p.box(-1, -1, WORLD + 2, WORLD + 2, -30, 30, "#7c5a3a", "#5e9b4c", false);
  p.quad(-1, -1, WORLD + 2, WORLD + 2, "#e9d8a6");
  p.quad(-0.4, -0.4, WORLD + 0.8, WORLD + 0.8, "#6aa956");

  for (const z of ZONES) {
    const r = zoneRect(z);
    p.dim = !unlocked.has(z.id);
    p.quad(r.x, r.y, r.w, r.d, p.col(z.ground));
  }
  p.dim = false;

  // blocks: sidewalks around every city block
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const zone = zoneOfBlock(bx, by);
      if (!zone) continue;
      const x = bx * ROAD_STEP + 1;
      const y = by * ROAD_STEP + 1;
      if (!inView(bboxOf(x, y, 6, 6, 0))) continue;
      p.dim = !unlocked.has(zone);
      p.quad(x, y, 6, 6, p.col(SIDEWALK));
      p.quad(x + 0.22, y + 0.22, 5.56, 5.56, p.col(ZONE_BY_ID[zone].ground));
    }

  // roads, segment by segment (none inside the lake corner)
  for (let line = 0; line < NODES; line++)
    for (let k = 0; k < BLOCKS; k++) {
      for (const axis of ["x", "y"] as const) {
        const sides = axis === "x" ? [zoneOfBlock(k, line - 1), zoneOfBlock(k, line)] : [zoneOfBlock(line - 1, k), zoneOfBlock(line, k)];
        if (sides.every((s) => s === null)) continue;
        const open = sides.some((s) => s !== null && unlocked.has(s));
        const x = axis === "x" ? k * ROAD_STEP : line * ROAD_STEP;
        const y = axis === "x" ? line * ROAD_STEP : k * ROAD_STEP;
        const w = axis === "x" ? ROAD_STEP + 1 : 1;
        const d = axis === "x" ? 1 : ROAD_STEP + 1;
        if (!inView(bboxOf(x, y, w, d, 0))) continue;
        p.dim = !open;
        p.quad(x, y, w, d, p.col(ASPHALT));
        if (axis === "x") {
          p.line(x + 1.3, y + 0.5, x + ROAD_STEP - 0.3, y + 0.5, p.col("#f8fafc", -0.1), 1, 0, [6, 7]);
          p.line(x + 1, y + 0.04, x + ROAD_STEP, y + 0.04, p.col("#9ca3af"), 1);
          p.line(x + 1, y + 0.96, x + ROAD_STEP, y + 0.96, p.col("#9ca3af"), 1);
        } else {
          p.line(x + 0.5, y + 1.3, x + 0.5, y + ROAD_STEP - 0.3, p.col("#f8fafc", -0.1), 1, 0, [6, 7]);
          p.line(x + 0.04, y + 1, x + 0.04, y + ROAD_STEP, p.col("#9ca3af"), 1);
          p.line(x + 0.96, y + 1, x + 0.96, y + ROAD_STEP, p.col("#9ca3af"), 1);
        }
      }
    }
  // crosswalks at intersections
  for (let j = 0; j < NODES; j++)
    for (let i = 0; i < NODES; i++) {
      const zs = [zoneOfBlock(i - 1, j - 1), zoneOfBlock(i, j - 1), zoneOfBlock(i - 1, j), zoneOfBlock(i, j)];
      if (zs.every((z) => z === null)) continue;
      const x = i * ROAD_STEP;
      const y = j * ROAD_STEP;
      if (!inView(bboxOf(x - 1, y - 1, 3, 3, 0))) continue;
      p.dim = !zs.some((z) => z !== null && unlocked.has(z));
      p.quad(x, y, 1, 1, p.col(ASPHALT, 0.04));
      const stripe = p.col("#f1f5f9", -0.05);
      for (let s = 0; s < 4; s++) {
        if (i < BLOCKS) p.quad(x + 1.08, y + 0.1 + s * 0.22, 0.32, 0.1, stripe);
        if (j < BLOCKS) p.quad(x + 0.1 + s * 0.22, y + 1.08, 0.1, 0.32, stripe);
      }
    }
  p.dim = false;
  c.globalAlpha = 1;
}

/** Shade over locked zones so they read as "not yours yet". */
export function drawFog(p: Painter, unlocked: ReadonlySet<ZoneId>, t: number) {
  const c = p.ctx;
  for (const z of ZONES) {
    if (unlocked.has(z.id)) continue;
    const r = zoneRect(z);
    p.quad(r.x + 0.5, r.y + 0.5, r.w - 1, r.d - 1, "rgba(9,13,24,0.28)");
    c.setLineDash([10, 8]);
    c.lineDashOffset = -t * 12;
    p.quadStroke(r.x + 0.6, r.y + 0.6, r.w - 1.2, r.d - 1.2, "rgba(251,191,36,0.55)", 2);
    c.setLineDash([]);
    c.lineDashOffset = 0;
  }
}

// ───────────────────────────── scene ─────────────────────────────

export function buildScene(state: GameState, snap: EconomySnapshot, names: SceneNames): Drawable[] {
  const out: Drawable[] = [];
  const unlocked = new Set(state.city.zones);

  for (const dc of WORLD_MAP.decor) {
    const h = dc.kind === "office" ? 160 : dc.kind === "apartment" ? 80 : 40;
    out.push({
      depth: dc.x + dc.w / 2 + dc.y + dc.d / 2,
      zone: dc.zone,
      bbox: bboxOf(dc.x, dc.y, dc.w, dc.d, h),
      draw: (p, info) => decor(p, dc, info.t),
    });
  }

  for (const plot of WORLD_MAP.plots) {
    const seed = rand(plot.x, plot.y);
    const isOpen = unlocked.has(plot.zone);
    const hitH = plot.kind === "factory" ? 60 : 30;
    const base = {
      depth: plot.x + plot.w / 2 + plot.y + plot.d / 2,
      zone: plot.zone,
      bbox: bboxOf(plot.x, plot.y, plot.w, plot.d, plot.kind === "factory" ? 100 : 60),
      pickId: plot.id,
      hit: { x: plot.x + 0.2, y: plot.y + 0.2, w: plot.w - 0.4, d: plot.d - 0.4, h: hitH },
    };
    if (plot.kind === "factory") {
      const id = plot.factory!;
      const f = state.factories[id];
      const available = isFactoryAvailable(snap.gm, id);
      out.push({
        ...base,
        draw: (p, info) => {
          factoryLot(p, plot, f.owned, f.level, info.t, seed);
          if (info.selected === plot.id) p.quadStroke(plot.x + 0.15, plot.y + 0.15, plot.w - 0.3, plot.d - 0.3, "#fbbf24", 2.5);
        },
        label: (p, info) => {
          if (!isOpen || info.zoom < 0.5) return;
          const cx = plot.x + plot.w / 2;
          const cy = plot.y + plot.d / 2;
          if (f.owned) p.tag(info.zoom < 0.8 ? names.level(f.level) : `${names.factory(id)} · ${names.level(f.level)}`, cx, cy, plot.w > 3 ? 92 : 46, { icon: FACTORY_BY_ID[id].emoji });
          else p.tag(names.money(FACTORY_BY_ID[id].cost), cx, cy, 40, { icon: available ? "🏗️" : "🔒", bg: "rgba(120,53,15,0.85)", fg: "#fde68a" });
        },
      });
    } else if (plot.kind === "dealer") {
      const id = plot.dealer!;
      const dl = state.dealers[id];
      out.push({
        ...base,
        draw: (p, info) => {
          dealerLot(p, plot, dl.owned, info.t, seed);
          if (info.selected === plot.id) p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#fbbf24", 2.5);
        },
        label: (p, info) => {
          if (!isOpen || info.zoom < 0.75) return;
          const cx = plot.x + plot.w / 2;
          const cy = plot.y + plot.d / 2;
          if (dl.owned) p.tag(`${names.dealer(id)} · ${names.level(dl.level)}`, cx, cy, 52, { icon: DEALER_BY_ID[id].emoji });
          else p.tag(names.money(DEALER_BY_ID[id].cost), cx, cy, 24, { icon: "🏪", bg: "rgba(120,53,15,0.85)", fg: "#fde68a" });
        },
      });
    } else {
      const b = state.city.buildings[plot.id];
      if (!b) {
        out.push({
          ...base,
          draw: (p, info) => emptyPlot(p, plot, info, isOpen),
          label: (p, info) => {
            if (!isOpen || info.zoom < 0.38) return;
            const cx = plot.x + plot.w / 2;
            const cy = plot.y + plot.d / 2;
            const bob = Math.sin(info.t * 2.4 + seed * 6) * 2;
            const c = p.ctx;
            const [px, py] = p.at(cx, cy, 16 + bob);
            c.beginPath();
            c.arc(px, py, 9, 0, Math.PI * 2);
            c.fillStyle = info.selected === plot.id ? "#f59e0b" : "rgba(37,99,235,0.92)";
            c.fill();
            c.strokeStyle = "#fff";
            c.lineWidth = 1.5;
            c.stroke();
            c.beginPath();
            c.moveTo(px - 4, py);
            c.lineTo(px + 4, py);
            c.moveTo(px, py - 4);
            c.lineTo(px, py + 4);
            c.lineWidth = 2;
            c.stroke();
          },
        });
      } else if (b.type === "garage") {
        const st = snap.city.garages[plot.id];
        const active = (st?.incomePerSec ?? 0) > 0;
        out.push({
          ...base,
          draw: (p, info) => {
            garage(p, plot, b, active, info.t);
            if (info.selected === plot.id) p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#fbbf24", 2.5);
          },
          label: (p, info) => {
            if (!isOpen || info.zoom < 0.32) return;
            const cx = plot.x + plot.w / 2;
            const cy = plot.y + plot.d / 2;
            const no = String(b.garage?.no ?? 1).padStart(2, "0");
            const text = info.zoom < 0.9 ? `#${no} · ${names.level(b.level)}` : `${names.garage(b.garage?.no ?? 1)} · ${names.level(b.level)}`;
            p.tag(text, cx, cy, 52 + (b.level >= 6 ? 30 : 0), { icon: SPEC_BY_ID[b.garage?.spec ?? "repair"].emoji, bg: active ? "rgba(29,78,216,0.9)" : "rgba(8,12,20,0.8)" });
            if (!active && info.zoom >= 0.5) p.tag("!", cx + 0.9, cy - 0.9, 70, { bg: "rgba(245,158,11,0.95)", fg: "#111", size: 11 });
          },
        });
      } else {
        out.push({
          ...base,
          draw: (p, info) => {
            structure(p, plot, b, info.t, seed);
            if (info.selected === plot.id) p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#fbbf24", 2.5);
          },
          label: (p, info) => {
            if (!isOpen || info.zoom < 0.85) return;
            p.tag(names.level(b.level), plot.x + plot.w / 2, plot.y + plot.d / 2, b.type === "hq" ? 160 : 50, { icon: STRUCTURE_BY_ID[b.type].emoji });
          },
        });
      }
    }
  }
  out.sort((a, b) => a.depth - b.depth);
  return out;
}

export const WORLD_BOUNDS = {
  minX: sx(0, WORLD),
  maxX: sx(WORLD, 0),
  minY: sy(0, 0) - 120,
  maxY: sy(WORLD, WORLD),
};

export function zoneCenter(id: ZoneId) {
  const z = ZONE_BY_ID[id];
  const cx = z.gx * ZONE_TILES + ZONE_TILES / 2 + 0.5;
  const cy = z.gy * ZONE_TILES + ZONE_TILES / 2 + 0.5;
  return { x: cx, y: cy };
}
