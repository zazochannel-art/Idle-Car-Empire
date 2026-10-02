// Supply-chain buildings on the Empire Map: the plants (one look per kind,
// growing with every level), the Parts Market and the Materials Depot.
// Plants read their live state each frame, so stock piles, smoke and the
// ⚠️ warning follow production without rebuilding the scene.
import { COMPONENT_BY_ID, PLANT_BY_ID } from "@/game/config/chain";
import type { Plot } from "@/game/city/layout";
import type { CarId, PlantData, PlantType } from "@/game/types";
import { Painter, sx, sy } from "./iso";
import { beacon, container, drum, flagPole, forklift, ledStrip, lightPole, robotArm, tireStack, wallLamp } from "./props";
import { CAR_COLORS, CAR_MODEL_FOR, drawModel, drawTruck, type Dir } from "./vehicles";
import { sprites3d, tierFor } from "../three/sprites";

const M = 0.3;

/** A cylinder standing on the ground (tanks, silos, chimneys). */
function cyl(p: Painter, x: number, y: number, z: number, r: number, h: number, color: string) {
  const c = p.ctx;
  const cx = sx(x, y);
  const top = sy(x, y, z + h);
  const bot = sy(x, y, z);
  const g = c.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, p.col(color, 0.12));
  g.addColorStop(0.6, p.col(color, -0.05));
  g.addColorStop(1, p.col(color, -0.25));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, bot, r, r * 0.5, 0, 0, Math.PI);
  c.lineTo(cx - r, top);
  c.ellipse(cx, top, r, r * 0.5, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  c.fillStyle = p.col(color, 0.18);
  c.beginPath();
  c.ellipse(cx, top, r, r * 0.5, 0, 0, Math.PI * 2);
  c.fill();
}

function smoke(p: Painter, x: number, y: number, z: number, t: number, seed: number, color = "200,206,214") {
  if (p.dim || p.zoom < 0.5) return;
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.35 + i / 4 + seed) % 1;
    p.circle(x - k * 0.5, y - k * 0.3, z + k * 34, 3 + k * 9, `rgba(${color},${0.45 * (1 - k)})`);
  }
}

/** Steel coils lying in the yard. */
function coil(p: Painter, x: number, y: number) {
  p.ellipse(x, y, 4, 6, p.col("#64748b"), 1);
  p.ellipse(x, y, 4, 2.5, p.col("#334155"), 1);
}

/** Pallets of finished goods in the yard; their number follows the stock. */
function yardStock(p: Painter, x: number, y: number, n: number, color: string, kind: PlantType) {
  for (let i = 0; i < n; i++) {
    const bx = x + (i % 4) * 0.36;
    const by = y + Math.floor(i / 4) * 0.36;
    if (kind === "tireFactory") tireStack(p, bx + 0.12, by + 0.12, 2 + (i % 2));
    else if (kind === "paintFactory") drum(p, bx + 0.12, by + 0.12, color);
    else if (kind === "glassFactory") p.box(bx, by + 0.08, 0.3, 0.06, 0, 9, "#bae6fd", "#e0f2fe", false);
    else {
      p.box(bx, by, 0.3, 0.3, 0, 1.5, "#a16207");
      p.box(bx + 0.02, by + 0.02, 0.26, 0.26, 1.5, kind === "bodyWorks" ? 5 : 4, color);
    }
  }
}

/** The signature of each kind of plant, drawn in its yard. */
function signature(p: Painter, type: PlantType, X: number, Y: number, W: number, h: number, t: number, active: boolean, seed: number) {
  switch (type) {
    case "bodyWorks":
      coil(p, X + W - 0.45, Y + 0.45);
      coil(p, X + W - 0.45, Y + 0.95);
      // the press: a tall block with a moving ram
      p.box(X + 0.15, Y + 0.15, 0.55, 0.55, 0, h + 10, "#94a3b8", "#cbd5e1");
      p.box(X + 0.25, Y + 0.25, 0.35, 0.35, h + 10 + (active ? Math.abs(Math.sin(t * 3)) * 4 : 0), 3, "#475569");
      break;
    case "engineFactory":
      cyl(p, X + 0.4, Y + 0.4, 0, 4, h + 22, "#9ca3af");
      if (active) smoke(p, X + 0.4, Y + 0.4, h + 22, t, seed, "120,113,108");
      break;
    case "interiorFactory":
      for (let i = 0; i < 3; i++) p.box(X + W - 0.5, Y + 0.2 + i * 0.32, 0.36, 0.26, 0, 5, ["#dc2626", "#2563eb", "#a16207"][i], undefined);
      break;
    case "glassFactory":
      cyl(p, X + 0.42, Y + 0.42, 0, 6, h + 18, "#e2e8f0");
      if (active) p.light(sx(X + 0.42, Y + 0.42), sy(X + 0.42, Y + 0.42, h + 18), 22, "#fb923c", 0.9);
      if (active) smoke(p, X + 0.42, Y + 0.42, h + 18, t, seed, "251,191,143");
      break;
    case "tireFactory":
      tireStack(p, X + W - 0.4, Y + 0.35, 4);
      tireStack(p, X + W - 0.4, Y + 0.75, 3);
      cyl(p, X + 0.4, Y + 0.4, 0, 4, h + 18, "#3f3f46");
      if (active) smoke(p, X + 0.4, Y + 0.4, h + 18, t, seed, "82,82,91");
      break;
    case "paintFactory":
      cyl(p, X + W - 0.4, Y + 0.4, 0, 6, 24, "#f472b6");
      cyl(p, X + W - 0.4, Y + 0.95, 0, 6, 24, "#60a5fa");
      cyl(p, X + W - 0.95, Y + 0.4, 0, 6, 24, "#facc15");
      break;
    case "electronicsFactory":
      for (let i = 0; i < 3; i++) p.box(X + W - 0.8, Y + 0.15 + i * 0.3, 0.6, 0.24, 2, 0.6, "#1e3a8a", "#3b82f6");
      p.box(X + 0.25, Y + 0.25, 0.08, 0.08, 0, h + 26, "#e5e7eb");
      beacon(p, X + 0.29, Y + 0.29, h + 27, t, "#22c55e");
      break;
    case "batteryFactory":
      for (let i = 0; i < 2; i++) {
        p.box(X + W - 0.9, Y + 0.2 + i * 0.5, 0.7, 0.4, 0, 14, "#d9f99d", "#a3e635");
        p.onLeft(X + W - 0.9, Y + 0.6 + i * 0.5, 0, 0.25, 0.45, 5, 10, "#365314");
      }
      break;
    case "assemblyPlant":
      break;
  }
}

export interface PlantLook {
  type: PlantType;
  level: number;
  plant: PlantData | null;
  /** Fraction of output storage used, 0..1. */
  fill: number;
  car: CarId | null;
}

/** Draws the plant's 3D model as a sprite; false until it is rendered. */
function plantSprite(p: Painter, look: PlantLook, X: number, Y: number, W: number, D: number, big: boolean, dockFront: boolean, wall: string, roof: string): boolean {
  const k = Math.min(4, tierFor((p.zoom ?? 1) * (p.dpr ?? 1)));
  const span = W + D;
  const size = { w: span * 32 + 40, h: span * 16 + 170, ax: span * 16 + 20, ay: span * 8 + 140 };
  const accent = PLANT_BY_ID[look.type].roof;
  const key = `plant|${look.type}|${look.level}|${big ? 1 : 0}|${dockFront ? 1 : 0}|${W.toFixed(2)}|${D.toFixed(2)}`;
  const spr = sprites3d.get(key, size, k, (T, { kit, buildings }) =>
    buildings.buildPlant(T, kit, { type: look.type, level: look.level, big, dockFront, wall, roof, accent }, W, D),
  );
  if (!spr) return false;
  const cx = X + W / 2;
  const cy = Y + D / 2;
  p.ctx.drawImage(spr.img, sx(cx, cy) - size.ax, sy(cx, cy, 0) - size.ay, size.w, size.h);
  return true;
}

/** Draws a plant on its lot. `live` is null for previews and construction. */
export function drawPlant(p: Painter, plot: Plot, look: PlantLook, t: number, seed: number) {
  const { type, level } = look;
  const cfg = PLANT_BY_ID[type];
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  const big = plot.w > 3;
  const s = big ? 2 : 1;
  const active = !look.plant || look.plant.status === "ok";
  const dockFront = plot.entry.inward === -1;

  // the 3D model of the plant (hall, roof, doors, office, tanks, tower…)
  const has3d = !p.dim && plantSprite(p, look, X, Y, W, D, big, dockFront, cfg.color, cfg.roof);
  // concrete yard with painted bays
  if (!has3d) {
    p.quad(X, Y, W, D, p.col("#9ca3af"));
    p.quad(X + 0.08, Y + 0.08, W - 0.16, D - 0.16, p.col("#a8b0bb"));
    if (p.zoom > 0.7) for (let i = 1; i < 4; i++) p.line(X + (W * i) / 4, Y + D - 0.55, X + (W * i) / 4, Y + D - 0.1, p.col("#f8fafc", -0.1), 1);
  }

  // main hall: grows wider and taller with every level
  const hw = Math.min(W - 0.5, (1.25 + level * 0.12) * s);
  const hd = Math.min(D - 0.8, (1.0 + level * 0.07) * s);
  const hx = X + 0.25;
  const hy = Y + (dockFront ? 0.25 : D - hd - 0.25);
  const h = (12 + level * 4) * (big ? 1.25 : 1);
  const wall = level >= 7 ? "#dbeafe" : cfg.color;
  const doorY = hy + hd;
  if (!has3d) {
    p.shadow(hx, hy, hw, hd, h + 6);
    p.box(hx, hy, hw, hd, 0, h, wall, "#94a3b8");
    if (level >= 5) p.sawtooth(hx, hy, hw, hd, h, Math.round(hw * 2), 7, p.col(cfg.roof, 0.25));
    else p.gable(hx, hy, hw, hd, h, 6 + level, cfg.roof);
    // coloured band and big doors on the dock side
    p.onLeft(hx, doorY, 0, 0, hw, h - 4, h - 1.5, p.col(cfg.roof));
    const doorsN = Math.min(4, 1 + Math.floor(level / 2));
    for (let i = 0; i < doorsN; i++) {
      const u0 = 0.1 + (i * (hw - 0.2)) / doorsN;
      const u1 = u0 + (hw - 0.2) / doorsN - 0.08;
      p.onLeft(hx, doorY, 0, u0, u1, 0, Math.min(10, h * 0.55), active ? "#facc15" : "#57534e");
    }
    if (level >= 7) {
      // high-tech glass facade with an LED strip
      p.windows(hx, hy, hw, hd, 0, h, 3, "#38bdf8", 3);
      ledStrip(p, hx, doorY, hw, h - 1, cfg.roof, t);
    } else if (level >= 3) {
      p.windows(hx, hy, hw, hd, 0, h, Math.max(1, Math.floor(level / 2)), "#bae6fd", level >= 4 ? 2 : 1);
    }
    wallLamp(p, hx, doorY, 0.15, h * 0.6);

    // office block from Industrial (3) on
    if (level >= 3) {
      const ox = hx + hw + 0.12;
      const ow = Math.min(0.75 * s, X + W - ox - 0.1);
      if (ow > 0.3) {
        const oh = 14 + level * 3;
        p.shadow(ox, hy, ow, 0.7 * s, oh);
        p.box(ox, hy, ow, 0.7 * s, 0, oh, "#f8fafc", "#cbd5e1");
        p.windows(ox, hy, ow, 0.7 * s, 0, oh, Math.max(2, Math.floor(oh / 9)), "#60a5fa", 2);
      }
    }
  }
  // lit doors and windows in the evening
  if (active && p.night > 0.3) {
    const doorsN = Math.min(5, 1 + Math.floor(level / 2)) * (has3d && big ? 2 : 1);
    for (let i = 0; i < doorsN; i++) {
      const u = 0.1 + ((i + 0.45) * (hw - 0.2)) / doorsN;
      p.light(sx(hx + u, doorY), sy(hx + u, doorY, 4), 16, "#fde68a", 0.5);
    }
  }
  // automated plants: robots and a conveyor bridge outside
  if (level >= 6 && p.zoom > 0.6) {
    robotArm(p, hx + hw * 0.3, hy + hd + 0.35, t, active);
    robotArm(p, hx + hw * 0.7, hy + hd + 0.35, t + 0.8, active);
  }
  // Mega Factory: a tower with beacons and flags
  if (level >= 8) {
    const tx = X + W - 0.55 * s;
    const ty = Y + 0.15;
    if (!has3d) {
      p.shadow(tx, ty, 0.5 * s, 0.5 * s, 90);
      p.box(tx, ty, 0.5 * s, 0.5 * s, 0, 80, "#bfdbfe", "#1e3a8a");
      p.windows(tx, ty, 0.5 * s, 0.5 * s, 0, 80, 9, "#1d4ed8", 2);
    }
    beacon(p, tx + 0.25 * s, ty + 0.25 * s, has3d ? 88 : 82, t, "#ef4444");
    flagPole(p, X + 0.1, Y + D - 0.1, cfg.roof, t);
  }
  if (level >= 4) {
    beacon(p, hx + 0.08, doorY - 0.08, h + 1, t);
    beacon(p, hx + hw - 0.08, doorY - 0.08, h + 1, t + 1.1);
  }

  if (!has3d) signature(p, type, hx, hy, hw, h, t, active, seed);

  // assembly: finished cars wait on the lot, a conveyor brings them out
  if (type === "assemblyPlant") {
    const model = CAR_MODEL_FOR[look.car ?? "city"];
    const n = Math.round(look.fill * 6 * s);
    for (let i = 0; i < n; i++) drawModel(p, X + 0.35 + (i % (3 * s)) * 0.6, Y + D - 0.35 - Math.floor(i / (3 * s)) * 0.5 - (dockFront ? 0 : D - 1.2), 1, model, CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length], 0.95);
    if (active && p.zoom > 0.55) {
      const u = (t * 0.12) % 1;
      drawModel(p, hx + 0.2 + u * (hw - 0.4), doorY + 0.25, 0, model, CAR_COLORS[Math.floor(t * 0.12) % CAR_COLORS.length], 0.9, { lights: p.night > 0.3 });
    }
  } else if (cfg.item) {
    // finished goods stacked by the dock
    const n = Math.round(look.fill * 8 * s);
    const sy0 = dockFront ? Y + D - 0.75 : Y + 0.15;
    yardStock(p, hx + hw - 1.25, sy0, n, COMPONENT_BY_ID[cfg.item].color, type);
    if (active && p.zoom > 0.6) forklift(p, hx + 0.3, sy0 + 0.2, hx + hw - 1.3, sy0 + 0.2, t * 0.6, seed);
  }

  // smoke from the roof while it works
  if (active && level >= 2) smoke(p, hx + hw * 0.6, hy + hd * 0.4, h + 4, t, seed);
  if (big && !has3d) {
    container(p, X + W - 0.9, Y + D - 1.2, true, cfg.roof);
    container(p, X + W - 0.9, Y + D - 0.8, true, "#64748b");
  }
  lightPole(p, X + W - 0.05, Y + D - 0.05);
}

/** The ⚠️ bubble over a plant that stopped, and the stock gauge. */
export function plantBadge(p: Painter, plot: Plot, plant: PlantData, zoom: number, t: number) {
  if (plant.status === "ok") return;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.d / 2;
  const icon = plant.status === "noParts" && plant.missing ? COMPONENT_BY_ID[plant.missing].emoji : plant.status === "noRaw" ? "🪨" : plant.status === "full" ? "📦" : "⚠️";
  const bob = Math.sin(t * 4) * 2;
  p.tag(zoom < 0.6 ? "!" : `⚠️ ${icon}`, cx + 0.4, cy - 0.4, 78 + bob, { bg: "rgba(245,158,11,0.95)", fg: "#111", size: 11 });
}

// ───────────────────────────── market & depot ─────────────────────────────

/** Parts Market: a trading hall with awnings where trucks unload. */
export function drawMarket(p: Painter, plot: Plot, t: number) {
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  p.quad(X, Y, W, D, p.col("#d6d3d1"));
  p.shadow(X + 0.2, Y + 0.2, 1.6, 1.3, 26);
  p.box(X + 0.2, Y + 0.2, 1.6, 1.3, 0, 22, "#fef3c7", "#b45309");
  p.gable(X + 0.2, Y + 0.2, 1.6, 1.3, 22, 9, "#92400e");
  // striped awnings over the stalls
  for (let k = 0; k < 6; k++) p.onLeft(X + 0.2, Y + 1.5, 0, k * 0.27, k * 0.27 + 0.13, 11, 14, k % 2 ? "#f8fafc" : "#16a34a");
  p.onLeft(X + 0.2, Y + 1.5, 0, 0.1, 1.5, 0, 9, p.night > 0.3 ? "#fde68a" : p.col("#fcd34d", -0.25));
  p.light(sx(X + 1, Y + 1.5), sy(X + 1, Y + 1.5, 6), 26, "#fde68a", 0.5);
  // sign
  p.box(X + 0.5, Y + 0.6, 1, 0.1, 31, 7, "#1e293b");
  p.textLeft("PARTS MARKET", X + 0.5, Y + 0.7, 32, 5.5, "#facc15");
  // crates and buyers
  for (let i = 0; i < 4; i++) p.box(X + 1.95, Y + 0.2 + i * 0.32, 0.26, 0.26, 0, 4 + (i % 2) * 3, ["#a16207", "#475569", "#b91c1c", "#0369a1"][i]);
  p.person(X + 0.6, Y + 1.85, "#22c55e", t * 3);
  p.person(X + 1.3, Y + 1.95, "#3b82f6", t * 3 + 2);
  flagPole(p, X + W - 0.1, Y + D - 0.1, "#16a34a", t);
}

/** Materials Depot: piles of steel, sand and rubber, a gantry crane and supply trucks. */
export function drawDepot(p: Painter, plot: Plot, t: number) {
  const X = plot.x + M;
  const Y = plot.y + M;
  const W = plot.w - 2 * M;
  const D = plot.d - 2 * M;
  p.quad(X, Y, W, D, p.col("#a8a29e"));
  p.shadow(X + 0.15, Y + 0.15, 1.2, 1.0, 22);
  p.box(X + 0.15, Y + 0.15, 1.2, 1.0, 0, 20, "#e7e5e4", "#57534e");
  p.sawtooth(X + 0.15, Y + 0.15, 1.2, 1.0, 20, 3, 6, "#78716c");
  // material piles
  coil(p, X + 1.7, Y + 0.4);
  coil(p, X + 2.1, Y + 0.4);
  p.ellipse(X + 1.85, Y + 1.0, 4, 10, p.col("#d6b98c"), 0.55);
  p.ellipse(X + 1.85, Y + 1.0, 8, 6, p.col("#e3c99c"), 0.55);
  for (let i = 0; i < 3; i++) p.box(X + 0.25 + i * 0.4, Y + 1.45, 0.32, 0.3, 0, 6, ["#57534e", "#365314", "#7c2d12"][i]);
  // gantry crane sliding over the yard
  const gx = X + 1.4 + ((Math.sin(t * 0.4) + 1) / 2) * 0.8;
  p.box(gx, Y + 0.05, 0.08, 0.08, 0, 34, "#f59e0b");
  p.box(gx, Y + D - 0.15, 0.08, 0.08, 0, 34, "#f59e0b");
  p.box(gx - 0.02, Y + 0.05, 0.12, D - 0.1, 34, 3, "#f59e0b");
  drawTruck(p, X + 0.5, Y + D - 0.2, 0 as Dir, "#a8a29e");
  p.box(X + 0.5, Y + 0.5, 1, 0.1, 25, 6, "#1e293b");
  p.textLeft("MATERIALS", X + 0.5, Y + 0.6, 26, 5.5, "#fbbf24");
}
