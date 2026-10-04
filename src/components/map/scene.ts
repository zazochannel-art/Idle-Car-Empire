// Builds the list of things to draw on the Empire Map from the game state:
// one drawable per plot/cell, depth-sorted by the renderer. Ground (zones,
// roads, sidewalks) is drawn separately and first.
import { CLASSIC_BY_ID } from "@/game/config/classics";
import { racingScene } from "./racing-district";
import { SPEC_BY_ID, STRUCTURE_BY_ID, ZONES, ZONE_BY_ID } from "@/game/config/city";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { isPlantType } from "@/game/config/chain";
import { BLOCKS, NODES, RIVER, ROAD_STEP, WORLD, WORLD_MAP, blockKind, hasRoad, hash, segmentSides, zoneCenterTile, zoneOfBlock, type Decor, type Plot, type Scenery } from "@/game/city/layout";
import { coastline } from "./terrain";
import type { EconomySnapshot } from "@/game/engine/economy";
import type { BuildingState, CarId, GameState, StructureType, ZoneId } from "@/game/types";
import { drawDepot, drawMarket, drawPlant, plantBadge } from "./plants";
import { Painter, rand, sx, sy } from "./iso";
import { sprites3d, tierFor } from "../three/sprites";
import { garageParts } from "../three/building-models";
import { CAR_COLORS, CAR_MODEL_FOR, drawCar, drawModel, drawTruck, type CarModel, type Dir } from "./vehicles";
import { barrier, beacon, bench, billboard, birds, bush, container, drum, fence, flagPole, flowerBed, ledStrip, lightPole, planter, tireStack, wallLamp } from "./props";

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
  /** What stands on the plot; a change plays a construction animation. */
  sig?: string;
  /** Banner shown when that animation finishes ("Garage #01 · Lv 4"). */
  announce?: string;
}

export interface SceneNames {
  garage: (no: number) => string;
  /** "Engine Factory #2" for the plant on a plot. */
  plant: (plotId: string) => string;
  market: string;
  depot: string;
  dealer: (id: keyof typeof DEALER_BY_ID) => string;
  structure: (type: StructureType) => string;
  level: (n: number) => string;
  money: (n: number) => string;
  racing: string;
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
      p.light(sx(x + u0 + dw / 2, y1), sy(x + u0 + dw / 2, y1, h * 0.3), 18, "#ffcf70", 0.35);
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
  if (p.zoom < 0.85) return;
  // a prepared lot: survey stakes, a pallet of materials and a sign
  p.box(x + 0.55, y + 0.6, 0.35, 0.25, 0, 3, "#b45309", "#d97706");
  p.box(x + 0.58, y + 0.62, 0.3, 0.2, 3, 2.5, "#9ca3af");
  for (const [a, b] of [[w - 0.7, d - 0.6], [w - 0.95, d - 0.6]]) {
    const cx = sx(x + a, y + b);
    const cy = sy(x + a, y + b);
    const c = p.ctx;
    c.fillStyle = p.col("#f97316");
    c.beginPath();
    c.moveTo(cx - 2.5, cy);
    c.lineTo(cx, cy - 7);
    c.lineTo(cx + 2.5, cy);
    c.closePath();
    c.fill();
    c.fillStyle = "#f8fafc";
    c.fillRect(cx - 1.3, cy - 4.2, 2.6, 1.2);
  }
  p.box(x + 0.5, y + d - 0.55, 0.05, 0.05, 0, 12, "#64748b");
  p.box(x + 0.35, y + d - 0.58, 0.4, 0.06, 12, 7, buildable ? "#2563eb" : "#64748b");
}

/** The 3D workshop as a sprite; false until it is rendered. */
function garageSprite(p: Painter, level: number, color: string, X: number, Y: number, W: number, D: number): boolean {
  const k = Math.min(4, tierFor((p.zoom ?? 1) * (p.dpr ?? 1)));
  const span = W + D;
  const size = { w: span * 32 + 40, h: span * 16 + 170, ax: span * 16 + 20, ay: span * 8 + 140 };
  const spr = sprites3d.get(`garage|${level}|${color}|${W.toFixed(2)}|${D.toFixed(2)}`, size, k, (T, { kit, buildings }) => buildings.buildGarage(T, kit, level, color, W, D));
  if (!spr) return false;
  const cx = X + W / 2;
  const cy = Y + D / 2;
  p.ctx.drawImage(spr.img, sx(cx, cy) - size.ax, sy(cx, cy, 0) - size.ay, size.w, size.h);
  return true;
}

function garage(p: Painter, plot: Plot, b: BuildingState, active: boolean, t: number) {
  const L = b.level;
  const spec = SPEC_BY_ID[b.garage?.spec ?? "repair"];
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  const parts = garageParts(L).map((q) => ({ ...q, x: X + q.x, y: Y + q.y }));
  const has3d = !p.dim && garageSprite(p, L, spec.color, X, Y, W, D);
  if (!has3d) {
    p.quad(X, Y, W, D, p.col("#5b6472"));
    p.quadStroke(X + 0.05, Y + 0.05, W - 0.1, D - 0.1, p.col("#e2e8f0", -0.2), 1);
    for (const part of parts) p.shadow(part.x, part.y, part.w, part.d, part.h);
  }

  // behind the building: fence for small garages, equipment for bigger ones
  if (L <= 2) {
    fence(p, X + 0.05, Y + 0.05, W - 0.1, true);
    fence(p, X + 0.05, Y + 0.05, D - 0.1, false);
  } else if (L <= 4) {
    tireStack(p, X + W - 0.2, Y + 1.25, 4);
    drum(p, X + W - 0.45, Y + 1.35, "#dc2626");
  }

  // front apron: parking bays and cars waiting for service
  const frontY = Y + D - 0.45;
  if (L >= 4) {
    for (let i = 0; i <= 4; i++) p.line(X + 0.15 + i * 0.5, frontY - 0.3, X + 0.15 + i * 0.5, frontY + 0.35, p.col("#f8fafc"), 1);
  }
  const waiting = active ? Math.min(4, 1 + Math.floor(L / 2)) : L >= 4 ? 1 : 0;

  for (const part of parts) {
    const wall = part.kind === "glass" ? "#7dd3fc" : part.kind === "annex" ? "#f1f5f9" : "#e8ecf1";
    const roof = L >= 10 ? "#fbbf24" : "#cbd5e1";
    if (!has3d) {
      if (part.kind === "main" && L >= 5) {
        p.box(part.x, part.y, part.w, part.d, 0, part.h, wall, "#94a3b8");
        p.sawtooth(part.x, part.y, part.w, part.d, part.h, 3, 7, "#cbd5e1");
      } else {
        p.box(part.x, part.y, part.w, part.d, 0, part.h, wall, roof);
      }
    }
    if (part.kind === "main") {
      if (!has3d) p.onLeft(part.x, part.y + part.d, 0, 0, part.w, part.h - 4, part.h - 1, p.col(spec.color));
      // windows above the doors from level 2, wall lamps everywhere
      if (L >= 2 && !has3d) p.windows(part.x, part.y, part.w, part.d, part.h - 13, 7, 1, "#93c5fd", active ? 1 : 0);
      wallLamp(p, part.x, part.y + part.d, 0.1, part.h - 9);
      wallLamp(p, part.x, part.y + part.d, part.w - 0.1, part.h - 9);
      if (L >= 5) ledStrip(p, part.x, part.y + part.d, part.w, part.h - 1.5, spec.color, t);
      doors(p, part.x, part.y + part.d, part.w, L <= 1 ? 1 : L <= 4 ? 2 : 3, Math.min(14, part.h - 7), active, t);
      if (!has3d) p.onRight(part.x + part.w, part.y, 0, 0.2, part.d - 0.2, part.h * 0.45, part.h * 0.7, p.col("#bae6fd", -0.25));
      if (L >= 2 && L < 5 && !has3d) {
        p.box(part.x + 0.25, part.y + 0.25, 0.25, 0.2, part.h, 4, "#94a3b8");
        p.box(part.x + 0.7, part.y + 0.3, 0.2, 0.2, part.h, 3, "#94a3b8");
      }
    } else if (has3d) {
      // the 3D model has the annex and the glass tower
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
  // in front: the apron grows into a proper car park and forecourt
  const models: CarModel[] = L <= 2 ? ["city", "sedan"] : L <= 4 ? ["sedan", "suv", "sports"] : L <= 6 ? ["luxury", "muscle", "sports"] : ["supercar", "hypercar", "electric"];
  for (let i = 0; i < waiting; i++) {
    drawModel(p, X + 0.4 + i * 0.5, frontY + 0.05, 3, models[(i + (b.garage?.no ?? 0)) % models.length], CAR_COLORS[(i * 3 + (b.garage?.no ?? 0)) % CAR_COLORS.length], 1, { lights: p.night > 0.35 });
  }
  if (L <= 2) bush(p, X + W - 0.2, Y + D - 0.2, 0.8);
  if (L >= 4) {
    lightPole(p, X + 0.08, Y + D - 0.08);
    lightPole(p, X + W - 0.08, Y + D - 0.08);
  }
  if (L >= 5) {
    planter(p, X + W - 0.35, Y + 1.75);
    planter(p, X + 0.25, Y + 1.75);
  }
  if (L >= 6) {
    flagPole(p, X + W - 0.1, Y + 1.6, spec.color, t);
    flagPole(p, X + W - 0.1, Y + 1.95, "#f8fafc", t + 1);
  }
}

/** Vector showroom, drawn until the 3D one is ready (or in dimmed previews). */
function dealerHall(p: Painter, tiers: number, X: number, Y: number, W: number, D: number) {
  p.quad(X, Y, W, D, p.col("#e7e5e4"));
  for (let i = 0; i < 6; i++) p.line(X + 0.1, Y + 0.4 * i + 0.2, X + W - 0.1, Y + 0.4 * i + 0.2, p.col("#d6d3d1", -0.05), 1);
  const h = 18 + tiers * 4;
  p.shadow(X + 0.15, Y + 0.15, 2.1, 1.1, h);
  p.box(X + 0.15, Y + 0.15, 2.1, 1.1, 0, h, "#93c5fd", "#f8fafc");
  for (let k = 1; k < 5; k++) p.onLeft(X + 0.15, Y + 1.25, 0, (2.1 * k) / 5 - 0.012, (2.1 * k) / 5 + 0.012, 0, h, p.col("#f1f5f9"));
  for (let k = 1; k < 3; k++) p.onRight(X + 2.25, Y + 0.15, 0, (1.1 * k) / 3 - 0.012, (1.1 * k) / 3 + 0.012, 0, h, p.col("#e2e8f0", -0.2));
  p.box(X + 0.1, Y + 0.1, 2.2, 1.2, h, 3, "#f8fafc");
  p.onLeft(X + 0.1, Y + 1.3, h, 0.3, 1.9, 0.2, 2.8, p.col(tiers >= 3 ? "#eab308" : "#2563eb"));
}

/** The 3D showroom as a sprite; false until it is rendered. */
function dealerSprite(p: Painter, tier: number, X: number, Y: number, W: number, D: number): boolean {
  const k = Math.min(4, tierFor((p.zoom ?? 1) * (p.dpr ?? 1)));
  const span = W + D;
  const size = { w: span * 32 + 40, h: span * 16 + 140, ax: span * 16 + 20, ay: span * 8 + 110 };
  const brand = tier >= 3 ? "#eab308" : "#2563eb";
  const spr = sprites3d.get(`dealer|${tier}|${W.toFixed(2)}|${D.toFixed(2)}`, size, k, (T, { kit, buildings }) => buildings.buildDealer(T, kit, { tier, brand }, W, D));
  if (!spr) return false;
  const cx = X + W / 2;
  const cy = Y + D / 2;
  p.ctx.drawImage(spr.img, sx(cx, cy) - size.ax, sy(cx, cy, 0) - size.ay, size.w, size.h);
  return true;
}

function dealerLot(p: Painter, plot: Plot, owned: boolean, t: number, seed: number, stock: CarId[] = [], next = 0) {
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
  const has3d = !p.dim && dealerSprite(p, tiers, X, Y, W, D);
  if (!has3d) dealerHall(p, tiers, X, Y, W, D);
  // the showroom glows at night; better dealers show better cars
  const h = 18 + tiers * 4;
  p.light(sx(X + 1.2, Y + 1.25), sy(X + 1.2, Y + 1.25, h / 2), 40, "#bfe3ff", 0.55);
  // the cars actually in stock: two in the showroom, the rest on the forecourt
  const cars = stock.map((m) => CAR_MODEL_FOR[m]);
  if (cars[0]) drawModel(p, X + 0.7, Y + 0.7, 0, cars[0], CAR_COLORS[(tiers + 1) % CAR_COLORS.length], 1);
  if (cars[1]) drawModel(p, X + 1.6, Y + 0.75, 0, cars[1], CAR_COLORS[(tiers + 4) % CAR_COLORS.length], 1);
  // the storage lot: stored cars parked in rows on the forecourt (up to 12 shown)
  const rows = Math.max(1, Math.floor((D - 1.6) / 0.5));
  const perRow = Math.max(1, Math.floor((W - 0.3) / 0.55));
  for (let i = 2; i < Math.min(2 + rows * perRow, 14, cars.length); i++) {
    const k = i - 2;
    drawModel(p, X + 0.35 + (k % perRow) * 0.55, Y + 1.85 + Math.floor(k / perRow) * 0.5, 1, cars[i], CAR_COLORS[(i * 3 + Math.floor(seed * 10) + tiers) % CAR_COLORS.length], 1, { lights: false });
  }
  // customers looking at the cars; one walks in shortly before each sale
  if (cars.length && p.zoom > 0.55) {
    p.person(X + 0.55 + Math.sin(t * 0.7) * 0.2, Y + 1.5, "#f472b6", t * 2);
    const k = Math.max(0, Math.min(1, 1 - next / 4));
    p.person(X + W - 0.2 - k * 0.9, Y + D - 0.25 - k * 0.7, "#22d3ee", t * 3);
  }
  lightPole(p, X + W - 0.05, Y + D - 0.6);
  flag(p, X + 0.05, Y + D - 0.1, tiers >= 3 ? "#eab308" : "#ef4444", t);
  flag(p, X + W - 0.1, Y + D - 0.1, "#3b82f6", t + 1);
  if (!has3d) p.box(X + W - 0.3, Y + 0.2, 0.16, 0.16, 0, 30, "#1e293b");
  emojiAt(p, cfg.emoji, X + W - 0.22, Y + 0.28, 40, 13);
}


function structure(p: Painter, plot: Plot, b: BuildingState, t: number, seed: number, classics: string[] = []) {
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
    case "fleetPlant": {
      // a long assembly hall, then a yard of finished vans, trucks and a yellow bus
      p.quad(X, Y, W, D, p.col("#9ca3af"));
      p.shadow(X + 0.15, Y + 0.15, 2.1, 1.0, 26);
      p.box(X + 0.15, Y + 0.15, 2.1, 1.0, 0, 26, "#e2e8f0", "#ca8a04");
      p.windows(X + 0.15, Y + 0.15, 2.1, 1.0, 0, 26, 4, "#fde68a", 0.8);
      doors(p, X + 0.15, Y + 1.15, 2.1, 2, 14, true, t);
      p.onLeft(X + 0.15, Y + 1.15, 0, 0, 2.1, 20, 26, p.col("#ca8a04"));
      p.textLeft("FLEET", X + 1.2, Y + 1.15, 23, 6, "#fff");
      // the yard
      p.quad(X + 0.1, Y + 1.45, W - 0.2, D - 1.55, p.col("#6b7280"));
      drawTruck(p, X + 0.45, Y + 1.85, 0, "#f8fafc", 0.85, false, { kind: "van" });
      drawTruck(p, X + 1.0, Y + 1.85, 0, "#2563eb", 0.95, false, { kind: "truck" });
      // a bus: long yellow box with a band of windows
      p.shadow(X + 1.45, Y + 1.65, 0.9, 0.36, 14);
      p.box(X + 1.45, Y + 1.65, 0.9, 0.36, 1, 13, "#facc15", "#fde047");
      p.onLeft(X + 1.45, Y + 2.01, 1, 0.04, 0.86, 7, 11, p.col("#1e293b"));
      p.onRight(X + 2.35, Y + 1.65, 1, 0.04, 0.32, 7, 11, p.col("#334155"));
      for (const dx of [0.15, 0.75]) cyl(p, X + 1.45 + dx, Y + 2.02, 0, 3, 2, "#111827");
      break;
    }
    case "museum": {
      // a classical hall: steps, a colonnade, a pediment and banners; the classics on the forecourt
      p.quad(X, Y, W, D, p.col("#d6d3d1"));
      p.quad(X + 0.15, Y + 1.55, W - 0.3, D - 1.7, p.col("#e7e5e4"));
      p.shadow(X + 0.2, Y + 0.2, 2.0, 1.25, 30);
      p.box(X + 0.15, Y + 0.15, 2.1, 1.35, 0, 4, "#e7e5e4");
      p.box(X + 0.25, Y + 0.25, 1.9, 1.1, 4, 22, "#f5f0e6", "#e7dfcf");
      // columns along the front
      for (let i = 0; i < 6; i++) p.box(X + 0.3 + i * 0.34, Y + 1.3, 0.09, 0.09, 4, 20, "#fafaf9", "#fafaf9", false);
      p.box(X + 0.22, Y + 1.25, 1.96, 0.2, 24, 4, "#e7dfcf", "#b45309");
      // pediment
      const c = p.ctx;
      c.fillStyle = p.col("#f5f0e6");
      c.beginPath();
      c.moveTo(sx(X + 0.22, Y + 1.45), sy(X + 0.22, Y + 1.45, 28));
      c.lineTo(sx(X + 2.18, Y + 1.45), sy(X + 2.18, Y + 1.45, 28));
      c.lineTo(sx(X + 1.2, Y + 1.45), sy(X + 1.2, Y + 1.45, 40));
      c.closePath();
      c.fill();
      c.strokeStyle = p.col("#b45309");
      c.lineWidth = 1;
      c.stroke();
      p.textLeft("MUSEUM", X + 1.2, Y + 1.45, 26, 6, "#78350f");
      // banners
      const flags = ["#c3141b", "#1b46b8", "#f3c014"];
      for (let i = 0; i < 3; i++) {
        p.box(X + 0.1 + i * 1.05, Y + 1.9, 0.03, 0.03, 0, 22, "#94a3b8", undefined, false);
        p.onLeft(X + 0.11 + i * 1.05, Y + 1.93, 0, 0, 0.18 + Math.sin(t * 2 + i) * 0.02, 14, 21, p.col(flags[i]));
      }
      // the classics on show
      const show = classics.length ? classics : [];
      show.slice(0, 4).forEach((id, i) => drawCar(p, X + 0.45 + i * 0.5, Y + 2.05, 0, CLASSIC_BY_ID[id]?.color ?? "#b3b9c0"));
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

/** Apartment block height in map px (shared by the 3D and vector drawings). */
const apartmentHeight = (seed: number, zone: string) => (44 + Math.floor(seed * 4) * 8) * (zone === "mega" ? 1.4 : 1);

/** Office towers in lot coordinates (shared by the 3D and vector drawings). */
function officeTowers(seed: number, zone: string) {
  const tall = zone === "mega" ? 1.75 : zone === "global" ? 1.4 : zone === "downtown" ? 1.1 : 0.85;
  const h = (70 + Math.floor(seed * 6) * 14) * tall;
  const twin = seed > 0.55;
  const towers = twin
    ? [
        { x: 0.15, z: 0.15, w: 1.0, d: 1.0, h },
        { x: 1.35, z: 1.25, w: 0.9, d: 0.9, h: h * 0.65 },
      ]
    : [{ x: 0.35, z: 0.35, w: 1.6, d: 1.5, h }];
  return { h, twin, towers };
}

const SHOP_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b"];
const OFFICE_TINTS = ["#9fc4e8", "#bcd6ee", "#b9c2e6", "#a8e0ea", "#c3ccd6"];

/**
 * The realistic 3D version of a city lot (houses, blocks, towers, villas).
 * Returns false while the sprite is still being made (or without WebGL).
 */
function decorSprite(p: Painter, dc: Decor, X: number, Y: number, W: number, D: number): boolean {
  if (p.dim) return false;
  const zone = dc.zone;
  // a handful of variants per kind keeps the sprite cache small
  const q = Math.floor(dc.seed * 12) / 12 + 1 / 24;
  const autumn = p.season === "halloween";
  let hpx = 40;
  let k = Math.min(4, tierFor((p.zoom ?? 1) * (p.dpr ?? 1)));
  let key: string;
  let build: Parameters<typeof sprites3d.get>[3];
  const dims = `${W.toFixed(2)}|${D.toFixed(2)}`;
  if (dc.kind === "house" && zone === "luxury") {
    const color = CAR_COLORS[Math.floor(dc.seed * 10)];
    key = `villa|${q}|${color}|${dims}`;
    build = (T, { kit, homes }) => homes.buildVillaLot(T, kit, W, D, q, color);
  } else if (dc.kind === "house") {
    key = `house|${q}|${autumn ? 1 : 0}|${dims}`;
    build = (T, { kit, homes }) => homes.buildHouseLot(T, kit, W, D, q, autumn);
  } else if (dc.kind === "apartment") {
    hpx = apartmentHeight(dc.seed, zone);
    key = `apt|${q}|${hpx}|${dims}`;
    build = (T, { kit, homes }) => homes.buildApartmentLot(T, kit, W, D, q, hpx);
  } else if (dc.kind === "office") {
    const o = officeTowers(dc.seed, zone);
    hpx = o.h + 40;
    k = Math.min(k, 3);
    const tint = OFFICE_TINTS[Math.floor(dc.seed * 13) % OFFICE_TINTS.length];
    const helipad = zone === "mega" && o.h > 150;
    key = `office|${o.h}|${o.twin ? 1 : 0}|${tint}|${helipad ? 1 : 0}|${dims}`;
    build = (T, { kit, homes }) => homes.buildOfficeLot(T, kit, W, D, q, { towers: o.towers, tint, helipad, mast: !o.twin });
  } else if (dc.kind === "shop") {
    const colors = [0, 1].map((i) => SHOP_COLORS[Math.floor(q * 4 + i) % 4]);
    const cars = [0, 1, 2].map((i) => CAR_COLORS[Math.floor(rand(q, i) * CAR_COLORS.length)]);
    key = `shop|${q}|${dims}`;
    build = (T, { kit, homes }) => homes.buildShopLot(T, kit, W, D, q, colors, cars);
  } else return false;
  const span = W + D;
  const size = { w: span * 32 + 60, h: span * 16 + hpx + 90, ax: span * 16 + 30, ay: span * 8 + hpx + 70 };
  const spr = sprites3d.get(key, size, k, build);
  if (!spr) return false;
  const cx = X + W / 2;
  const cy = Y + D / 2;
  p.ctx.drawImage(spr.img, sx(cx, cy) - size.ax, sy(cx, cy, 0) - size.ay, size.w, size.h);
  return true;
}

/** What moves or glows over a 3D lot: lit windows at night, beacons, birds, the pool. */
function decorLife(p: Painter, dc: Decor, X: number, Y: number, t: number) {
  const { seed, zone } = dc;
  const near = p.zoom >= 0.9;
  const lit = p.night > 0.3;
  switch (dc.kind) {
    case "house":
      if (zone === "luxury") {
        p.light(sx(X + 1.75, Y + 1.75), sy(X + 1.75, Y + 1.75), 26, "#67e8f9", 0.5);
        if (lit) p.light(sx(X + 0.9, Y + 1.15), sy(X + 0.9, Y + 1.15, 8), 34, "#fde68a", 0.6);
      } else if (lit) {
        p.light(sx(X + 0.5, Y + 0.95), sy(X + 0.5, Y + 0.95, 6), 18, "#fde68a", 0.55);
        if (seed > 0.4) p.light(sx(X + 1.0, Y + 0.95), sy(X + 1.0, Y + 0.95, 14), 14, "#fde68a", 0.45);
      }
      break;
    case "apartment":
      if (lit) {
        const h = apartmentHeight(seed, zone);
        for (let f = 1; f * 22 < h; f++) if (rand(seed * 31, f) > 0.35) p.light(sx(X + 0.6 + rand(seed, f) * 1.2, Y + 1.8), sy(X + 0.6 + rand(seed, f) * 1.2, Y + 1.8, f * 22), 16, "#fde68a", 0.4);
      }
      if (near && seed > 0.6) birds(p, X + 1, Y + 1, t, seed);
      break;
    case "shop":
      if (lit) for (let i = 0; i < 2; i++) p.light(sx(X + 0.65 + i * 1.15, Y + 1.4), sy(X + 0.65 + i * 1.15, Y + 1.4, 5), 24, "#fde68a", 0.55);
      if (near && seed > 0.5) billboard(p, X + 1.4, Y + 0.05, ["#7c3aed", "#0ea5e9", "#e11d48"][Math.floor(seed * 3)], ["TURBO", "DRIVE", "V8"][Math.floor(seed * 3)]);
      break;
    case "office": {
      const o = officeTowers(seed, zone);
      if (lit)
        for (const tw of o.towers)
          for (let f = 1; f * 26 < tw.h; f++)
            if (rand(seed * 17, f) > 0.3) p.light(sx(X + tw.x + tw.w / 2, Y + tw.z + tw.d), sy(X + tw.x + tw.w / 2, Y + tw.z + tw.d, f * 26), 22, "#bfdbfe", 0.35);
      if (!o.twin) beacon(p, X + 1.15, Y + 1.1, o.h + 26, t + seed * 3, "#ef4444");
      if (near && seed > 0.7) birds(p, X + 1, Y + 1, t, seed);
      break;
    }
  }
}

function decor(p: Painter, dc: Decor, t: number) {
  const { x, y, w, d, seed } = dc;
  const X = x + M;
  const Y = y + M;
  const W = w - 2 * M;
  const D = d - 2 * M;
  const zone = dc.zone;
  // small props only when close enough to read them
  const near = p.zoom >= 0.9;
  if (decorSprite(p, dc, X, Y, W, D)) {
    decorLife(p, dc, X, Y, t);
    return;
  }
  switch (dc.kind) {
    case "house": {
      if (zone === "luxury") {
        villa(p, X, Y, W, D, seed, t);
        break;
      }
      p.quad(X, Y, W, D, p.col("#86c06c"));
      p.quad(X + 0.85, Y + 1.6, 0.35, 0.8, p.col("#d6d3d1"));
      if (near) fence(p, X + 0.05, Y + 0.05, W - 0.1, true, "#f5f5f4");
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
        const win = p.night > 0.3 && r > 0.3 ? "#fde68a" : p.col("#bae6fd", -0.1);
        p.onLeft(X + a, Y + b + hd, 0, 0.1, 0.28, 4, 8, win);
        p.onRight(X + a + hw, Y + b, 0, 0.2, 0.45, 4, 8, p.night > 0.3 ? "#fcd34d" : p.col("#bae6fd", -0.25));
        if (p.night > 0.3 && r > 0.3) p.light(sx(X + a + 0.2, Y + b + hd), sy(X + a + 0.2, Y + b + hd, 6), 14, "#fde68a", 0.5);
        p.gable(X + a, Y + b, hw, hd, h, 8, HOUSE_ROOFS[Math.floor(r * 17) % HOUSE_ROOFS.length]);
        // chimney
        if (!near) return;
        p.box(X + a + hw * 0.7, Y + b + 0.12, 0.1, 0.1, h + 2, 7, "#9a3412");
        bush(p, X + a + hw + 0.08, Y + b + hd + 0.08, 0.6);
      });
      if (near) flowerBed(p, X + 1.35, Y + 1.35, 0.5, 0.25, seed);
      p.tree(X + 2.1, Y + 1.9, 0.75, seed);
      break;
    }
    case "apartment": {
      p.quad(X, Y, W, D, p.col("#a3b18a"));
      const h = apartmentHeight(seed, zone);
      p.shadow(X + 0.25, Y + 0.25, 1.8, 1.6, h);
      const wall = ["#fde68a", "#fecaca", "#e9d5ff", "#cffafe"][Math.floor(seed * 4)];
      p.box(X + 0.25, Y + 0.25, 1.8, 1.6, 0, h, wall, "#94a3b8");
      p.windows(X + 0.25, Y + 0.25, 1.8, 1.6, 0, h, Math.round(h / 11), "#bae6fd", 1);
      // balconies
      for (let f = 1; f < Math.round(h / 11); f += 2) p.box(X + 0.4, Y + 1.85, 0.6, 0.12, f * 11, 1.5, "#f8fafc");
      p.box(X + 0.5, Y + 0.5, 0.35, 0.3, h, 5, "#cbd5e1");
      if (near) bench(p, X + 1.5, Y + 2.15, true);
      p.tree(X + 2.2, Y + 2.2, 0.7, seed);
      break;
    }
    case "office": {
      p.quad(X, Y, W, D, p.col("#cbd5e1"));
      const tall = zone === "mega" ? 1.75 : zone === "global" ? 1.4 : zone === "downtown" ? 1.1 : 0.85;
      const h = (70 + Math.floor(seed * 6) * 14) * tall;
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
        // podium, glass shaft with floor bands, crown
        p.box(tw.x - 0.08, tw.y - 0.08, tw.w + 0.16, tw.d + 0.16, 0, 9, "#e2e8f0", "#94a3b8");
        p.box(tw.x, tw.y, tw.w, tw.d, 9, tw.h - 9, glass, "#475569");
        p.windows(tw.x, tw.y, tw.w, tw.d, 9, tw.h - 9, Math.round(tw.h / 8), "#1e3a8a", 1);
        // vertical sky reflection
        p.onLeft(tw.x, tw.y + tw.d, 9, tw.w * 0.15, tw.w * 0.3, 0, tw.h - 9, "rgba(255,255,255,0.08)");
        p.box(tw.x + tw.w * 0.3, tw.y + tw.d * 0.3, tw.w * 0.4, tw.d * 0.4, tw.h, 6, "#64748b");
        if (zone === "mega" && tw.h > 150) {
          // helipad on the tallest towers
          p.box(tw.x + 0.1, tw.y + 0.1, tw.w - 0.2, tw.d - 0.2, tw.h + 6, 1.5, "#334155", "#334155");
          p.ellipse(tw.x + tw.w / 2, tw.y + tw.d / 2, tw.h + 8, 6, "rgba(250,204,21,0.9)", 0.5);
        }
      }
      if (!twin) {
        p.box(X + 1.1, Y + 1.1, 0.05, 0.05, h + 6, 20, "#e5e7eb");
        beacon(p, X + 1.12, Y + 1.12, h + 27, t + seed * 3, "#ef4444");
      }
      if (near && seed > 0.7) birds(p, X + 1, Y + 1, t, seed);
      break;
    }
    case "shop": {
      p.quad(X, Y, W, D, p.col("#d6d3d1"));
      for (let i = 0; i < 2; i++) {
        const bx = X + 0.15 + i * 1.15;
        const col = SHOP_COLORS[Math.floor(seed * 4 + i) % 4];
        p.shadow(bx, Y + 0.2, 1.0, 1.2, 16);
        p.box(bx, Y + 0.2, 1.0, 1.2, 0, 16, "#f5f5f4", "#a8a29e");
        p.onLeft(bx, Y + 1.4, 0, 0.1, 0.9, 0, 9, p.night > 0.3 ? "#fde68a" : p.col("#bae6fd", -0.15));
        if (p.night > 0.3) p.light(sx(bx + 0.5, Y + 1.4), sy(bx + 0.5, Y + 1.4, 5), 22, "#fde68a", 0.5);
        // striped awning
        for (let k = 0; k < 5; k++) p.onLeft(bx, Y + 1.4, 0, k * 0.2, k * 0.2 + 0.1, 9.5, 12.5, p.col(col));
        p.onLeft(bx, Y + 1.4, 0, 0, 1.0, 12.5, 15, p.col(col, -0.15));
      }
      if (near && seed > 0.5) billboard(p, X + 1.4, Y + 0.05, ["#7c3aed", "#0ea5e9", "#e11d48"][Math.floor(seed * 3)], ["TURBO", "DRIVE", "V8"][Math.floor(seed * 3)]);
      parkedCars(p, X + 0.35, Y + 2.05, 3, seed, 1, 0.6);
      break;
    }
    case "industry": {
      if (zone === "global" || zone === "mega") {
        port(p, X, Y, W, D, seed, t);
        break;
      }
      p.quad(X, Y, W, D, p.col("#a8a29e"));
      p.shadow(X + 0.2, Y + 0.2, 1.4, 1.6, 22);
      p.box(X + 0.2, Y + 0.2, 1.4, 1.6, 0, 20, "#d6d3d1");
      p.sawtooth(X + 0.2, Y + 0.2, 1.4, 1.6, 20, 2, 6, "#a8a29e");
      cyl(p, X + 2.0, Y + 0.6, 0, 8, 26, "#e7e5e4");
      cyl(p, X + 2.0, Y + 1.5, 0, 8, 26, "#e7e5e4");
      container(p, X + 0.2, Y + 2.0, true, "#2563eb");
      if (near) {
        drum(p, X + 1.4, Y + 2.2, "#16a34a");
        drum(p, X + 1.55, Y + 2.3, "#16a34a");
      }
      if (seed > 0.5) {
        cyl(p, X + 0.5, Y + 0.5, 20, 3, 24, "#78716c");
        smoke(p, X + 0.5, Y + 0.5, 44, t, seed);
      }
      break;
    }
    case "park": {
      if (zone === "automotive" || zone === "supercar") {
        testTrack(p, X, Y, W, D, seed, t);
        break;
      }
      p.quad(X, Y, W, D, p.col("#7ccf6a"));
      p.quad(X + 1.05, Y, 0.3, D, p.col("#e7d7b5"));
      p.quad(X, Y + 1.05, W, 0.3, p.col("#e7d7b5"));
      if (seed > 0.6) {
        cyl(p, X + 1.2, Y + 1.2, 0, 12, 3, "#cbd5e1");
        p.ellipse(X + 1.2, Y + 1.2, 3, 10, p.col("#38bdf8"), 0.5);
        if (!p.dim) p.circle(X + 1.2, Y + 1.2, 6 + Math.abs(Math.sin(t * 3)) * 6, 2, "rgba(186,230,253,0.9)");
      } else if (near) {
        flowerBed(p, X + 1.0, Y + 1.0, 0.4, 0.4, seed);
      }
      if (near) {
        bench(p, X + 0.45, Y + 1.4, true);
        bench(p, X + 1.45, Y + 0.5, false);
        flowerBed(p, X + 1.5, Y + 1.5, 0.7, 0.25, seed + 1);
      }
      const spots = [
        [0.35, 0.35], [0.6, 2.0], [2.0, 0.4], [2.05, 2.05], [0.4, 0.9], [1.8, 0.85],
      ];
      spots.forEach(([a, b], i) => {
        const r = rand(seed * 7, i);
        if (r < 0.15) return;
        if (r > 0.75) p.pine(X + a, Y + b, 0.9);
        else if (r < 0.3) bush(p, X + a, Y + b, 0.9);
        else p.tree(X + a, Y + b, 0.7 + r * 0.4, r);
      });
      if (near && seed > 0.5) birds(p, X + 1.2, Y + 1.2, t, seed);
      break;
    }
  }
}

/** Luxury District: a modern villa with a pool. */
function villa(p: Painter, X: number, Y: number, W: number, D: number, seed: number, t: number) {
  p.quad(X, Y, W, D, p.col("#7fd07a"));
  // pool with a deck
  p.quad(X + 1.3, Y + 1.35, 0.95, 0.85, p.col("#e7e5e4"));
  p.quad(X + 1.4, Y + 1.45, 0.75, 0.65, p.col("#22d3ee"));
  if (!p.dim) p.ellipse(X + 1.75 + Math.sin(t) * 0.1, Y + 1.75, 0, 5, "rgba(255,255,255,0.35)", 0.4);
  p.light(sx(X + 1.75, Y + 1.75), sy(X + 1.75, Y + 1.75), 26, "#67e8f9", 0.5);
  p.box(X + 1.35, Y + 2.25, 0.25, 0.1, 0, 1.5, "#f8fafc");
  p.box(X + 1.7, Y + 2.25, 0.25, 0.1, 0, 1.5, "#f8fafc");
  // two stacked volumes with a glass ground floor
  p.shadow(X + 0.15, Y + 0.15, 1.6, 1.0, 24);
  p.box(X + 0.15, Y + 0.15, 1.6, 1.0, 0, 11, "#93c5fd", "#f8fafc");
  for (let k = 1; k < 4; k++) p.onLeft(X + 0.15, Y + 1.15, 0, k * 0.4 - 0.01, k * 0.4 + 0.01, 0, 11, "#e5e7eb");
  p.box(X + 0.35, Y + 0.1, 1.1, 0.8, 11, 10, "#fafaf9", "#e7e5e4");
  p.onLeft(X + 0.35, Y + 0.9, 11, 0.15, 0.95, 3, 7, p.night > 0.3 ? "#fde68a" : p.col("#7dd3fc", -0.1));
  p.light(sx(X + 0.9, Y + 1.15), sy(X + 0.9, Y + 1.15, 6), 30, "#fde68a", 0.5);
  p.tree(X + 2.15, Y + 0.35, 0.9, seed);
  planter(p, X + 0.2, Y + 1.5);
  drawModel(p, X + 0.6, Y + 1.85, 1, seed > 0.5 ? "supercar" : "luxury", CAR_COLORS[Math.floor(seed * 10)], 1);
}

/** Automotive District: a test track with a car lapping it. */
function testTrack(p: Painter, X: number, Y: number, W: number, D: number, seed: number, t: number) {
  p.quad(X, Y, W, D, p.col("#6fb35d"));
  p.quad(X + 0.15, Y + 0.15, W - 0.3, D - 0.3, p.col("#3f4652"));
  p.quad(X + 0.6, Y + 0.6, W - 1.2, D - 1.2, p.col("#7ccf6a"));
  // kerbs
  for (let i = 0; i < 10; i++) {
    const u = 0.15 + i * ((W - 0.3) / 10);
    p.quad(X + u, Y + 0.15, (W - 0.3) / 20, 0.06, i % 2 ? "#ef4444" : "#f8fafc");
    p.quad(X + u, Y + D - 0.21, (W - 0.3) / 20, 0.06, i % 2 ? "#ef4444" : "#f8fafc");
  }
  // start/finish line and a grandstand
  for (let i = 0; i < 4; i++) p.quad(X + 0.9 + (i % 2) * 0.06, Y + 0.18 + i * 0.1, 0.06, 0.1, "#111827");
  p.box(X + 0.8, Y + 0.7, 1.0, 0.3, 0, 8, "#e5e7eb", "#2563eb");
  // the lap: around the rectangle
  const per = 2 * (W - 0.75) + 2 * (D - 0.75);
  let k = ((t * 1.6 + seed * 10) % per + per) % per;
  const a = X + 0.38;
  const b = Y + 0.38;
  const lx = W - 0.75;
  const ly = D - 0.75;
  let cx: number, cy: number, dir: Dir;
  if (k < lx) [cx, cy, dir] = [a + k, b, 0];
  else if ((k -= lx) < ly) [cx, cy, dir] = [a + lx, b + k, 1];
  else if ((k -= ly) < lx) [cx, cy, dir] = [a + lx - k, b + ly, 2];
  else [cx, cy, dir] = [a, b + ly - (k - lx), 3];
  drawModel(p, cx, cy, dir, seed > 0.5 ? "supercar" : "sports", "#ef4444", 1, { lights: p.night > 0.35 });
}

/** Mega City / Global: a container port with a gantry crane. */
function port(p: Painter, X: number, Y: number, W: number, D: number, seed: number, t: number) {
  p.quad(X, Y, W, D, p.col("#9ca3af"));
  const colors = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0891b2", "#7c3aed"];
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 2; k++) {
      const stack = 1 + Math.floor(rand(seed * 5 + r, k) * 3);
      for (let z = 0; z < stack; z++) container(p, X + 0.15 + k * 1.0, Y + 0.25 + r * 0.6, true, colors[(r * 2 + k + z) % colors.length], z * 8);
    }
  // gantry crane sliding along the yard
  const gx = X + 0.2 + ((Math.sin(t * 0.3 + seed * 5) + 1) / 2) * 1.8;
  p.box(gx, Y + 0.05, 0.1, 0.1, 0, 46, "#f59e0b");
  p.box(gx, Y + 2.1, 0.1, 0.1, 0, 46, "#f59e0b");
  p.box(gx - 0.02, Y + 0.05, 0.14, 2.15, 46, 4, "#f59e0b");
  p.box(gx + 0.02, Y + 0.9, 0.06, 0.06, 26, 20, "#334155");
  beacon(p, gx + 0.05, Y + 0.1, 52, t, "#ef4444");
}

// ───────────────────────────── ground ─────────────────────────────

const ASPHALT = "#3d4450";
const SIDEWALK = "#d3d9e0";
const GRASS = "#69a955";

let grassPattern: CanvasPattern | null | undefined;
/** A soft speckle texture laid over the grass so it doesn't look flat. */
function grassTexture(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grassPattern !== undefined) return grassPattern;
  if (typeof document === "undefined") return (grassPattern = null);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 520; i++) {
    const x = rand(i, 1) * 128;
    const y = rand(i, 2) * 128;
    const r = 0.8 + rand(i, 3) * 2.6;
    g.fillStyle = rand(i, 4) > 0.5 ? "rgba(255,255,190,0.07)" : "rgba(10,40,10,0.08)";
    g.beginPath();
    g.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
    g.fill();
  }
  return (grassPattern = ctx.createPattern(cv, "repeat"));
}

let asphaltPattern: CanvasPattern | null | undefined;
/** Aggregate speckle, patched repairs and oil stains for the roads. */
function asphaltTexture(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (asphaltPattern !== undefined) return asphaltPattern;
  if (typeof document === "undefined") return (asphaltPattern = null);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 160;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 6; i++) {
    g.fillStyle = rand(i, 7) > 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.035)";
    g.beginPath();
    g.ellipse(rand(i, 1) * 160, rand(i, 2) * 160, 10 + rand(i, 3) * 22, 6 + rand(i, 4) * 12, rand(i, 5) * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 1800; i++) {
    const v = rand(i, 4);
    g.fillStyle = v > 0.6 ? "rgba(255,255,255,0.09)" : v > 0.25 ? "rgba(0,0,0,0.12)" : "rgba(180,170,150,0.08)";
    g.fillRect(rand(i, 1) * 160, rand(i, 2) * 160, 1 + rand(i, 3), 1 + rand(i, 5));
  }
  // a few hairline cracks
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 0.7;
  for (let i = 0; i < 3; i++) {
    let x = rand(i, 11) * 160;
    let y = rand(i, 12) * 160;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) g.lineTo((x += (rand(i * 7 + k, 13) - 0.5) * 18), (y += (rand(i * 7 + k, 14) - 0.5) * 18));
    g.stroke();
  }
  return (asphaltPattern = ctx.createPattern(cv, "repeat"));
}

let paverPattern: CanvasPattern | null | undefined;
/** Concrete paving slabs for the pavements. */
function paverTexture(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (paverPattern !== undefined) return paverPattern;
  if (typeof document === "undefined") return (paverPattern = null);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      g.fillStyle = `rgba(${rand(i, j) > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + rand(j, i) * 0.04})`;
      g.fillRect(i * 16, j * 16, 16, 16);
    }
  g.strokeStyle = "rgba(60,70,85,0.16)";
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k <= 64; k += 16) {
    g.moveTo(k + 0.5, 0);
    g.lineTo(k + 0.5, 64);
    g.moveTo(0, k + 0.5);
    g.lineTo(64, k + 0.5);
  }
  g.stroke();
  return (paverPattern = ctx.createPattern(cv, "repeat"));
}

function coastPath(c: CanvasRenderingContext2D) {
  c.beginPath();
  for (const loop of coastline()) {
    loop.forEach(([x, y], i) => (i ? c.lineTo(sx(x, y), sy(x, y)) : c.moveTo(sx(x, y), sy(x, y))));
    c.closePath();
  }
}

const inBox = (b: [number, number, number, number], view: [number, number, number, number]) => b[2] >= view[0] && b[0] <= view[2] && b[3] >= view[1] && b[1] <= view[3];

export function drawGround(p: Painter, unlocked: ReadonlySet<ZoneId>, view: [number, number, number, number], t: number) {
  const c = p.ctx;
  const inView = (b: [number, number, number, number]) => inBox(b, view);
  p.dim = false;

  // ── shore: shallow water, foam, sand, then the land
  c.lineJoin = "round";
  coastPath(c);
  c.strokeStyle = "rgba(56,189,248,0.16)";
  c.lineWidth = 120;
  c.stroke();
  c.strokeStyle = "rgba(125,211,252,0.22)";
  c.lineWidth = 60;
  c.stroke();
  c.setLineDash([18, 26]);
  c.lineDashOffset = -t * 6;
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 34 + Math.sin(t * 0.8) * 3;
  c.stroke();
  c.setLineDash([]);
  c.lineDashOffset = 0;
  c.strokeStyle = "#e4cf98";
  c.lineWidth = 26;
  c.stroke();
  c.fillStyle = GRASS;
  c.fill("evenodd");
  const tex = grassTexture(c);
  if (tex) {
    c.fillStyle = tex;
    c.fill("evenodd");
  }

  // ── blocks: districts get pavements; scenery gets fields, woods and hills
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const kind = blockKind(bx, by);
      if (kind === "sea") continue;
      const x = bx * ROAD_STEP + 1;
      const y = by * ROAD_STEP + 1;
      if (!inView(bboxOf(x - 1, y - 1, 8, 8, 0))) continue;
      const zone = zoneOfBlock(bx, by);
      if (zone) {
        p.dim = !unlocked.has(zone);
        p.quad(x, y, 6, 6, p.col(SIDEWALK));
        const pav = !p.dim && paverTexture(c);
        if (pav) p.quad(x, y, 6, 6, pav);
        p.quad(x + 0.22, y + 0.22, 5.56, 5.56, p.col(ZONE_BY_ID[zone].ground));
        // kerb line
        p.quadStroke(x + 0.02, y + 0.02, 5.96, 5.96, p.col("#a8b0ba"), 1);
      } else if (kind === "farm") {
        const seed = hash(bx, by);
        const crops = ["#c8b560", "#8fbf4f", "#b6c96b", "#d9b45a", "#7eaa48"];
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            const col = crops[Math.floor(rand(seed * 9 + i, j) * crops.length)];
            const fx = x + 0.25 + i * 3;
            const fy = y + 0.25 + j * 3;
            p.quad(fx, fy, 2.6, 2.6, col);
            const alongX = rand(seed, i * 2 + j) > 0.5;
            for (let r = 1; r < 7; r++) {
              if (alongX) p.line(fx + 0.1, fy + r * 0.37, fx + 2.5, fy + r * 0.37, "rgba(60,45,10,0.22)", 1);
              else p.line(fx + r * 0.37, fy + 0.1, fx + r * 0.37, fy + 2.5, "rgba(60,45,10,0.22)", 1);
            }
          }
        p.quad(x + 2.85, y, 0.3, 6, "#c9b48a");
      } else if (kind === "forest") {
        p.quad(x - 0.5, y - 0.5, 7, 7, "#4f8f44");
      } else if (kind === "hills") {
        p.quad(x - 0.5, y - 0.5, 7, 7, "#7d9a5a");
      }
    }
  p.dim = false;

  // ── river with stone embankments
  const rx = RIVER * ROAD_STEP;
  const river = bboxOf(rx - 1, -8, 3, WORLD + 16, 0);
  if (inView(river)) {
    // only where there is land: the river flows into the sea
    c.save();
    coastPath(c);
    c.clip("evenodd");
    p.quad(rx - 0.42, -8, 1.84, WORLD + 16, "#9ca3af");
    const g = c.createLinearGradient(sx(rx - 0.3, 30), 0, sx(rx + 1.3, 30), 0);
    g.addColorStop(0, "#1e6fa8");
    g.addColorStop(0.5, "#2b8fd0");
    g.addColorStop(1, "#1a5f92");
    p.quad(rx - 0.3, -8, 1.6, WORLD + 16, g);
    // small glints drifting with the current
    c.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const yy = ((i * 1.13 + t * (0.4 + rand(i, 3) * 0.4)) % (WORLD + 14)) - 6;
      const xx = rx - 0.15 + rand(i, 9) * 1.3;
      const a = 0.12 + 0.18 * Math.abs(Math.sin(t * 1.7 + i));
      c.strokeStyle = `rgba(255,255,255,${a})`;
      c.beginPath();
      c.arc(sx(xx, yy), sy(xx, yy), 3 + rand(i, 4) * 3, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    }
    c.restore();
  }

  // ── roads, segment by segment
  for (let line = 0; line < NODES; line++)
    for (let k = 0; k < BLOCKS; k++) {
      for (const axis of ["x", "y"] as const) {
        if (!hasRoad(axis, line, k)) continue;
        const open = segmentSides(axis, line, k).some((s) => s !== null && unlocked.has(s));
        const x = axis === "x" ? k * ROAD_STEP : line * ROAD_STEP;
        const y = axis === "x" ? line * ROAD_STEP : k * ROAD_STEP;
        const w = axis === "x" ? ROAD_STEP + 1 : 1;
        const d = axis === "x" ? 1 : ROAD_STEP + 1;
        if (!inView(bboxOf(x, y, w, d, 0))) continue;
        p.dim = !open;
        p.quad(x, y, w, d, p.col(ASPHALT));
        const asph = !p.dim && asphaltTexture(c);
        if (asph) p.quad(x, y, w, d, asph);
        // worn tyre tracks give the asphalt some texture
        if (axis === "x") {
          p.quad(x + 1, y + 0.22, ROAD_STEP - 1, 0.1, p.col(ASPHALT, -0.08));
          p.quad(x + 1, y + 0.68, ROAD_STEP - 1, 0.1, p.col(ASPHALT, -0.08));
          p.line(x + 1.3, y + 0.5, x + ROAD_STEP - 0.3, y + 0.5, p.col("#facc15", -0.15), 1.2, 0, [7, 6]);
          p.line(x + 1, y + 0.04, x + ROAD_STEP, y + 0.04, p.col("#e5e7eb", -0.2), 1);
          p.line(x + 1, y + 0.96, x + ROAD_STEP, y + 0.96, p.col("#e5e7eb", -0.2), 1);
        } else {
          p.quad(x + 0.22, y + 1, 0.1, ROAD_STEP - 1, p.col(ASPHALT, -0.08));
          p.quad(x + 0.68, y + 1, 0.1, ROAD_STEP - 1, p.col(ASPHALT, -0.08));
          p.line(x + 0.5, y + 1.3, x + 0.5, y + ROAD_STEP - 0.3, p.col("#facc15", -0.15), 1.2, 0, [7, 6]);
          p.line(x + 0.04, y + 1, x + 0.04, y + ROAD_STEP, p.col("#e5e7eb", -0.2), 1);
          p.line(x + 0.96, y + 1, x + 0.96, y + ROAD_STEP, p.col("#e5e7eb", -0.2), 1);
        }
      }
    }

  // ── intersections: crosswalks, and bridges where they cross the river
  for (let j = 0; j < NODES; j++)
    for (let i = 0; i < NODES; i++) {
      const roads = [hasRoad("x", j, i - 1), hasRoad("x", j, i), hasRoad("y", i, j - 1), hasRoad("y", i, j)];
      if (!roads.some(Boolean)) continue;
      const x = i * ROAD_STEP;
      const y = j * ROAD_STEP;
      if (!inView(bboxOf(x - 1, y - 1, 3, 3, 30))) continue;
      const zs = [zoneOfBlock(i - 1, j - 1), zoneOfBlock(i, j - 1), zoneOfBlock(i - 1, j), zoneOfBlock(i, j)];
      p.dim = !zs.some((z) => z !== null && unlocked.has(z));
      if (i === RIVER) {
        // bridge deck over the river with parapets
        p.shadow(x - 0.5, y, 2, 1, 10, 0.3);
        p.box(x - 0.5, y - 0.02, 2, 1.04, 0, 3, "#9ca3af", p.col(ASPHALT, 0.05));
        p.box(x - 0.5, y - 0.06, 2, 0.08, 3, 4, "#d1d5db");
        p.box(x - 0.5, y + 0.98, 2, 0.08, 3, 4, "#d1d5db");
        p.line(x - 0.4, y + 0.5, x + 1.4, y + 0.5, p.col("#facc15", -0.15), 1.2, 3, [7, 6]);
        continue;
      }
      p.quad(x, y, 1, 1, p.col(ASPHALT, 0.03));
      const asph = !p.dim && asphaltTexture(c);
      if (asph) p.quad(x, y, 1, 1, asph);
      const stripe = p.col("#f1f5f9", -0.05);
      for (let s = 0; s < 4; s++) {
        if (roads[1]) p.quad(x + 1.08, y + 0.1 + s * 0.22, 0.32, 0.1, stripe);
        if (roads[3]) p.quad(x + 0.1 + s * 0.22, y + 1.08, 0.1, 0.32, stripe);
      }
    }
  p.dim = false;
  c.globalAlpha = 1;
}

/** Shade over locked districts, outlined along their real border. */
export function drawFog(p: Painter, unlocked: ReadonlySet<ZoneId>, t: number) {
  const c = p.ctx;
  for (const z of ZONES) {
    if (unlocked.has(z.id)) continue;
    const blocks = WORLD_MAP.zoneBlocks[z.id];
    for (const [bx, by] of blocks) p.quad(bx * ROAD_STEP, by * ROAD_STEP, ROAD_STEP + 1, ROAD_STEP + 1, "rgba(9,13,24,0.16)");
    c.setLineDash([10, 8]);
    c.lineDashOffset = -t * 12;
    const mine = (bx: number, by: number) => zoneOfBlock(bx, by) === z.id;
    for (const [bx, by] of blocks) {
      const x0 = bx * ROAD_STEP + 0.5;
      const y0 = by * ROAD_STEP + 0.5;
      const x1 = x0 + ROAD_STEP;
      const y1 = y0 + ROAD_STEP;
      const col = "rgba(251,191,36,0.6)";
      if (!mine(bx, by - 1)) p.line(x0, y0, x1, y0, col, 2);
      if (!mine(bx, by + 1)) p.line(x0, y1, x1, y1, col, 2);
      if (!mine(bx - 1, by)) p.line(x0, y0, x0, y1, col, 2);
      if (!mine(bx + 1, by)) p.line(x1, y0, x1, y1, col, 2);
    }
    c.setLineDash([]);
    c.lineDashOffset = 0;
  }
}

// ───────────────────────────── scenery ─────────────────────────────

function mountain(p: Painter, x: number, y: number, w: number, d: number, h: number, seed: number) {
  const c = p.ctx;
  const px = x + w * (0.45 + rand(seed, 1) * 0.1);
  const py = y + d * (0.45 + rand(seed, 2) * 0.1);
  const peak: [number, number] = [sx(px, py), sy(px, py, h)];
  const corners: [number, number][] = [
    [sx(x, y), sy(x, y)],
    [sx(x + w, y), sy(x + w, y)],
    [sx(x + w, y + d), sy(x + w, y + d)],
    [sx(x, y + d), sy(x, y + d)],
  ];
  const tri = (a: [number, number], b: [number, number], fill: string) => {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.lineTo(peak[0], peak[1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  // back faces first, then the two faces toward the viewer
  tri(corners[0], corners[1], "#7f8a6a");
  tri(corners[3], corners[0], "#8c9873");
  tri(corners[1], corners[2], "#5d6b4c");
  tri(corners[2], corners[3], "#77865c");
  // snow cap
  const cap = (a: [number, number], b: [number, number], fill: string) => {
    const k = 0.3;
    c.beginPath();
    c.moveTo(peak[0] + (a[0] - peak[0]) * k, peak[1] + (a[1] - peak[1]) * k + 3);
    c.lineTo(peak[0] + (b[0] - peak[0]) * k, peak[1] + (b[1] - peak[1]) * k + 3);
    c.lineTo(peak[0], peak[1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  if (h > 70) {
    cap(corners[1], corners[2], "#dbe4ee");
    cap(corners[2], corners[3], "#f8fafc");
  }
}

function scenery(p: Painter, sc: Scenery) {
  const { x, y, seed } = sc;
  if (sc.kind === "forest") {
    const n = 22;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < n; i++) pts.push([x - 0.3 + rand(seed * 13, i) * 6.6, y - 0.3 + rand(seed * 7, i + 40) * 6.6, rand(seed, i)]);
    pts.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [tx, ty, r] of pts) {
      if (r > 0.45) p.pine(tx, ty, 0.95 + r * 0.5);
      else p.tree(tx, ty, 0.85 + r * 0.6, r);
    }
  } else if (sc.kind === "farm") {
    const fx = x + 3.35;
    const fy = y + 3.35;
    p.shadow(fx, fy, 1.3, 0.9, 20);
    p.box(fx, fy, 1.3, 0.9, 0, 13, "#f5efe0");
    p.gable(fx, fy, 1.3, 0.9, 13, 8, "#9a3412");
    p.box(fx + 1.5, fy + 0.2, 1, 1.2, 0, 15, "#b91c1c");
    p.gable(fx + 1.5, fy + 0.2, 1, 1.2, 15, 7, "#57534e");
    cyl(p, fx + 0.5, fy + 1.9, 0, 6, 30, "#d6d3d1");
    p.tree(fx - 0.4, fy + 2.2, 1, seed);
    p.tree(fx + 2.4, fy - 0.3, 0.9, seed + 0.3);
  } else {
    const ox = rand(seed, 5) * 0.8;
    mountain(p, x - 0.6 + ox, y - 0.4, 4.2, 4.0, 70 + rand(seed, 6) * 40, seed);
    mountain(p, x + 2.4, y + 2.2, 3.8, 3.8, 50 + rand(seed, 7) * 50, seed + 1);
    for (let i = 0; i < 6; i++) p.pine(x + rand(seed, i + 20) * 6, y + 4.6 + rand(seed, i + 30) * 1.4, 0.9);
  }
}

function lamp(p: Painter, x: number, y: number, t: number) {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.beginPath();
  c.ellipse(px, py, 3, 1.5, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = p.col("#334155");
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - 22);
  c.lineTo(px + 5, py - 24);
  c.stroke();
  if (!p.dim) {
    const on = p.night > 0.25;
    const glow = on ? 0.95 : 0.5 + 0.08 * Math.sin(t * 2 + x);
    c.fillStyle = `rgba(254,240,138,${glow})`;
    c.beginPath();
    c.arc(px + 5, py - 23.5, on ? 2.6 : 2, 0, Math.PI * 2);
    c.fill();
    // a pool of light on the pavement and a halo round the lamp head
    p.light(px + 5, py - 23.5, 10, "#fff1b8", 0.6);
    p.light(px + 3, py - 2, 28, "#ffd27a", 0.3);
  }
}

// ───────────────────────────── scene ─────────────────────────────

export function buildScene(state: GameState, snap: EconomySnapshot, names: SceneNames, live: () => GameState = () => state): Drawable[] {
  const out: Drawable[] = [];
  const unlocked = new Set(state.city.zones);

  for (const dc of WORLD_MAP.decor) {
    const h = dc.kind === "office" ? 290 : dc.kind === "apartment" ? 110 : 60;
    out.push({
      depth: dc.x + dc.w / 2 + dc.y + dc.d / 2,
      zone: dc.zone,
      bbox: bboxOf(dc.x, dc.y, dc.w, dc.d, h),
      draw: (p, info) => decor(p, dc, info.t),
    });
  }

  for (const sc of WORLD_MAP.scenery) {
    out.push({
      depth: sc.x + 3 + sc.y + 3,
      zone: null,
      bbox: bboxOf(sc.x - 1, sc.y - 1, 8, 8, 130),
      draw: (p) => scenery(p, sc),
    });
  }

  // street lamps on the corners of district blocks
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const zone = zoneOfBlock(bx, by);
      if (!zone) continue;
      for (const [lx, ly] of [
        [bx * ROAD_STEP + 1.12, by * ROAD_STEP + 1.12],
        [bx * ROAD_STEP + 6.88, by * ROAD_STEP + 6.88],
      ]) {
        out.push({ depth: lx + ly, zone, bbox: bboxOf(lx - 0.5, ly - 0.5, 1, 1, 30), draw: (p, info) => lamp(p, lx, ly, info.t) });
      }
    }

  // the Racing District draws itself
  out.push(...racingScene(live, { locked: names.racing, title: names.racing }));

  for (const plot of WORLD_MAP.plots) {
    if (plot.kind === "racing") continue;
    const seed = rand(plot.x, plot.y);
    const isOpen = unlocked.has(plot.zone);
    const tall = plot.big || !!state.city.buildings[plot.id]?.plant;
    const hitH = plot.big ? 60 : 30;
    const base = {
      depth: plot.x + plot.w / 2 + plot.y + plot.d / 2,
      zone: plot.zone,
      bbox: bboxOf(plot.x, plot.y, plot.w, plot.d, tall ? 170 : 70),
      pickId: plot.id,
      hit: { x: plot.x + 0.2, y: plot.y + 0.2, w: plot.w - 0.4, d: plot.d - 0.4, h: hitH },
    };
    if (plot.kind === "market" || plot.kind === "depot") {
      const market = plot.kind === "market";
      out.push({
        ...base,
        sig: "built",
        draw: (p, info) => {
          if (market) drawMarket(p, plot, info.t);
          else drawDepot(p, plot, info.t);
          if (info.selected === plot.id) p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#fbbf24", 2.5);
        },
        label: (p, info) => {
          if (info.zoom < 0.5) return;
          p.tag(market ? names.market : names.depot, plot.x + plot.w / 2, plot.y + plot.d / 2, 52, { icon: market ? "💰" : "🏗️", bg: market ? "rgba(21,128,61,0.9)" : "rgba(146,64,14,0.9)" });
        },
      });
    } else if (plot.kind === "dealer") {
      const id = plot.dealer!;
      const dl = state.dealers[id];
      out.push({
        ...base,
        sig: dl.owned ? "built" : "lot",
        announce: names.dealer(id),
        draw: (p, info) => {
          const stock = live().chain.dealers[id];
          dealerLot(p, plot, dl.owned, info.t, seed, stock?.models, stock?.next);
          if (info.selected === plot.id) p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#fbbf24", 2.5);
        },
        label: (p, info) => {
          if (!isOpen || info.zoom < 0.75) return;
          const cx = plot.x + plot.w / 2;
          const cy = plot.y + plot.d / 2;
          if (dl.owned) p.tag(`${names.dealer(id)} · ${names.level(dl.level)}`, cx, cy, 52, { icon: DEALER_BY_ID[id].emoji });
          else if (live().chain.firstCar || live().lifetime.carsProduced > 0) p.tag(names.money(DEALER_BY_ID[id].cost), cx, cy, 24, { icon: "🏪", bg: "rgba(120,53,15,0.85)", fg: "#fde68a" });
          else if (info.zoom >= 0.9) p.tag("🔒", cx, cy, 24, { bg: "rgba(15,23,42,0.75)", size: 10 });
        },
      });
    } else {
      const b = state.city.buildings[plot.id];
      if (!b) {
        out.push({
          ...base,
          sig: "lot",
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
      } else if (b.plant && isPlantType(b.type)) {
        const type = b.type;
        out.push({
          ...base,
          sig: `${type}:${b.level}`,
          announce: `${names.plant(plot.id)} · ${names.level(b.level)}`,
          draw: (p, info) => {
            const now = live().city.buildings[plot.id];
            const pl = now?.plant ?? null;
            const st = snap.chain.plants[plot.id];
            drawPlant(p, plot, { type, level: Math.min(b.level, 10), plant: pl, fill: pl && st ? Math.min(1, pl.out / st.outCap) : 0, car: st?.car?.id ?? null }, info.t, seed);
            if (info.selected === plot.id) p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#fbbf24", 2.5);
          },
          label: (p, info) => {
            if (!isOpen || info.zoom < 0.32) return;
            const cx = plot.x + plot.w / 2;
            const cy = plot.y + plot.d / 2;
            const text = info.zoom < 0.9 ? names.level(b.level) : `${names.plant(plot.id)} · ${names.level(b.level)}`;
            p.tag(text, cx, cy, (plot.big ? 110 : 64) + b.level * 4, { icon: STRUCTURE_BY_ID[type].emoji, bg: "rgba(15,23,42,0.85)" });
            const pl = live().city.buildings[plot.id]?.plant;
            if (pl) plantBadge(p, plot, pl, info.zoom, info.t);
          },
        });
      } else if (b.type === "garage") {
        const st = snap.city.garages[plot.id];
        const active = (st?.incomePerSec ?? 0) > 0;
        out.push({
          ...base,
          sig: `garage:${b.level}`,
          announce: `${names.garage(b.garage?.no ?? 1)} · ${names.level(b.level)}`,
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
          sig: `${b.type}:${b.level}`,
          announce: `${names.structure(b.type)} · ${names.level(b.level)}`,
          draw: (p, info) => {
            structure(p, plot, b, info.t, seed, b.type === "museum" ? live().classics.owned : undefined);
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
  minX: sx(0, WORLD) - 120,
  maxX: sx(WORLD, 0) + 120,
  minY: sy(0, 0) - 200,
  maxY: sy(WORLD, WORLD) + 80,
};

export function zoneCenter(id: ZoneId) {
  return zoneCenterTile(id);
}

// ───────────────────────────── construction ─────────────────────────────

export const BUILD_ANIM = 3.2;

/**
 * Draws a plot while it is being built or upgraded: barriers, a crane,
 * workers and dust while the finished building rises out of the ground.
 * `age` runs from 0 to BUILD_ANIM seconds.
 */
export function drawConstruction(p: Painter, plotId: string, age: number, upgrade: boolean, drawFinal: () => void, bbox: [number, number, number, number]) {
  const plot = WORLD_MAP.plotById[plotId];
  if (!plot) return drawFinal();
  const c = p.ctx;
  const { x, y, w, d } = plot;
  const k = Math.min(1, age / (BUILD_ANIM * 0.8));
  // the building grows from the ground: clip its drawing from the bottom up
  const start = upgrade ? 0.55 : 0;
  const grow = start + (1 - start) * (k * k * (3 - 2 * k));
  c.save();
  c.beginPath();
  const bottom = bbox[3] + 4;
  c.rect(bbox[0] - 20, bottom - (bottom - bbox[1] + 20) * grow, bbox[2] - bbox[0] + 40, (bottom - bbox[1] + 20) * grow + 20);
  c.clip();
  if (grow > 0.02) drawFinal();
  c.restore();
  if (k >= 1) return;
  // foundation slab while nothing stands yet
  if (!upgrade && grow < 0.2) p.box(x + 0.4, y + 0.4, w - 0.8, d - 0.8, 0, 2 + grow * 10, "#cbd5e1", "#9ca3af");
  // scaffolding poles around the rising walls
  const hgt = 26 * grow + 8;
  for (const [a, b2] of [[0.45, 0.45], [w - 0.45, 0.45], [0.45, d - 0.45], [w - 0.45, d - 0.45]]) p.box(x + a - 0.03, y + b2 - 0.03, 0.06, 0.06, 0, hgt, "#f59e0b");
  p.line(x + 0.45, y + d - 0.45, x + w - 0.45, y + d - 0.45, "#f59e0b", 1.5, hgt * 0.5);
  p.line(x + w - 0.45, y + 0.45, x + w - 0.45, y + d - 0.45, "#f59e0b", 1.5, hgt * 0.5);
  // barriers along the front
  barrier(p, x + 0.3, y + d - 0.25, true);
  barrier(p, x + 1.1, y + d - 0.25, true);
  barrier(p, x + w - 0.25, y + 0.3, false);
  // a little crane swinging
  const cx = x + w - 0.5;
  const cy = y + 0.5;
  p.box(cx - 0.05, cy - 0.05, 0.1, 0.1, 0, 60, "#facc15");
  const ang = Math.sin(age * 1.4) * 0.5;
  c.strokeStyle = "#eab308";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(sx(cx, cy), sy(cx, cy, 60));
  c.lineTo(sx(cx, cy) - 40 * Math.cos(ang), sy(cx, cy, 60) + 6 * Math.sin(ang));
  c.stroke();
  // workers in hard hats
  for (let i = 0; i < 3; i++) {
    const wx = x + 0.6 + ((Math.sin(age * 1.7 + i * 2) + 1) / 2) * (w - 1.2);
    p.person(wx, y + d - 0.45, i % 2 ? "#f97316" : "#facc15", age * 8 + i);
  }
  // dust
  for (let i = 0; i < 8; i++) {
    const ph = (age * 0.8 + i / 8) % 1;
    const dx = x + w * (0.2 + ((i * 37) % 60) / 100);
    const dy = y + d * (0.3 + ((i * 23) % 50) / 100);
    c.fillStyle = `rgba(214,198,170,${0.35 * (1 - ph)})`;
    c.beginPath();
    c.arc(sx(dx, dy) + ph * 10, sy(dx, dy, 4 + ph * 22), 3 + ph * 8, 0, Math.PI * 2);
    c.fill();
  }
}

/** Translucent preview of what a plot would look like with `type` on it. */
export function drawPreview(p: Painter, plotId: string, type: StructureType, t: number) {
  const plot = WORLD_MAP.plotById[plotId];
  if (!plot) return;
  const c = p.ctx;
  c.save();
  c.globalAlpha = 0.55 + 0.15 * Math.sin(t * 4);
  const b: BuildingState = type === "garage" ? { type, level: 1, garage: { no: 0, spec: "repair", workers: 0, facilities: [], carry: 0, serviced: 0, earned: 0 } } : { type, level: 1 };
  if (type === "garage") garage(p, plot, b, false, t);
  else if (isPlantType(type)) drawPlant(p, plot, { type, level: 1, plant: null, fill: 0, car: null }, t, 0.5);
  else structure(p, plot, b, t, 0.5);
  c.restore();
  p.quadStroke(plot.x + 0.2, plot.y + 0.2, plot.w - 0.4, plot.d - 0.4, "#4ade80", 2.5);
}
