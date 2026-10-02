// Drawing of a garage interior: floor grid, back walls and every facility in
// the same isometric style as the map, at "room" scale.
import { FACILITY_BY_ID } from "@/game/config/city";
import type { FacilityType } from "@/game/types";
import { Painter, rand, sx, sy } from "../map/iso";
import { CAR_COLORS, drawModel, type CarModel, type Dir } from "../map/vehicles";

export const WALL_H = 74;
const CAR_S = 3.6;

export interface FacilityDraw {
  uid: number;
  type: FacilityType;
  x: number;
  y: number;
  w: number;
  d: number;
  staffed: boolean;
  workstation: boolean;
  /** 0..1 progress of the current car (workstations). */
  progress: number;
  /** Colour of the car currently being worked on. */
  car: string;
  /** Where cars come in and leave (the garage door). */
  door?: [number, number];
}

const STATION_MODEL: Partial<Record<FacilityType, CarModel>> = {
  serviceBay: "sedan",
  carLift: "suv",
  paintBooth: "luxury",
  engineWorkshop: "muscle",
  tuningArea: "sports",
  dyno: "muscle",
  performanceWorkshop: "supercar",
  advancedPaint: "luxury",
  supercarWorkshop: "hypercar",
  advancedTuning: "supercar",
};

/**
 * The car at a workstation. Each cycle it drives in through the door,
 * stays while it is worked on, then drives back out.
 */
function stationCar(p: Painter, f: FacilityDraw, cx: number, cy: number, dir: Dir, color: string, s: number, lift = 0) {
  const model = STATION_MODEL[f.type] ?? (f.uid % 2 ? "city" : "sedan");
  const ph = f.progress;
  const door = f.door;
  const travel = f.workstation && door ? (ph < 0.12 ? ph / 0.12 : ph > 0.9 ? 1 - (ph - 0.9) / 0.1 : 1) : 1;
  if (travel >= 1 || !door) {
    drawModel(p, cx, cy, dir, model, color, s, { lift });
    return;
  }
  // L-shaped path: up the aisle from the door, then across into the bay
  const leaving = ph > 0.9;
  const legA = Math.abs(door[1] - cy);
  const legB = Math.abs(door[0] - cx);
  const along = travel * (legA + legB);
  let x: number, y: number, d: Dir;
  if (along <= legA) {
    x = door[0];
    y = door[1] - Math.sign(door[1] - cy) * along;
    d = leaving ? 1 : 3;
  } else {
    y = cy;
    x = door[0] + Math.sign(cx - door[0]) * (along - legA);
    const toward: Dir = cx >= door[0] ? 0 : 2;
    d = leaving ? (toward === 0 ? 2 : 0) : toward;
  }
  drawModel(p, x, y, d, model, color, s, { brake: !leaving && travel > 0.85 });
}

export function drawRoom(p: Painter, gw: number, gd: number, accent: string, t: number) {
  // slab
  p.box(-0.35, -0.35, gw + 0.7, gd + 0.7, -18, 18, "#334155", "#3f4856", false);
  // floor
  p.quad(0, 0, gw, gd, "#4b5563");
  p.quad(0.06, 0.06, gw - 0.12, gd - 0.12, "#556070");
  const c = p.ctx;
  c.strokeStyle = "rgba(255,255,255,0.07)";
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 1; i < gw; i++) {
    c.moveTo(sx(i, 0), sy(i, 0));
    c.lineTo(sx(i, gd), sy(i, gd));
  }
  for (let j = 1; j < gd; j++) {
    c.moveTo(sx(0, j), sy(0, j));
    c.lineTo(sx(gw, j), sy(gw, j));
  }
  c.stroke();
  // floor sheen
  const g = c.createLinearGradient(sx(0, gd), sy(0, 0), sx(gw, 0), sy(gw, gd));
  g.addColorStop(0, "rgba(255,255,255,0.05)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255,0.04)");
  p.quad(0, 0, gw, gd, g);
  // worn concrete: oil stains and tyre marks
  for (let i = 0; i < gw * gd * 0.18; i++) {
    const x = 0.4 + rand(i, 11) * (gw - 0.8);
    const y = 0.4 + rand(i, 12) * (gd - 0.8);
    p.ellipse(x, y, 0, 3 + rand(i, 13) * 9, `rgba(15,20,30,${0.06 + rand(i, 14) * 0.08})`, 0.5);
  }
  // sunlight falling through the back windows
  for (let i = 0; i < Math.floor(gw / 3); i++) {
    const u = 0.8 + i * 3;
    p.quad(u + 0.3, 0.2, 1.6, 2.4, "rgba(255,244,214,0.07)");
  }

  // entrance with hazard stripes on the front edge
  const ex = Math.max(0.5, gw / 2 - 1.5);
  for (let i = 0; i < 12; i++) p.quad(ex + i * 0.25, gd - 0.18, 0.125, 0.18, i % 2 ? "#111827" : "#facc15");
  // walkway lines
  p.line(0.15, gd - 0.35, gw - 0.15, gd - 0.35, "rgba(250,204,21,0.55)", 1.5);
  p.line(gw - 0.35, 0.15, gw - 0.35, gd - 0.15, "rgba(250,204,21,0.55)", 1.5);

  // back walls
  p.box(-0.3, -0.3, gw + 0.3, 0.3, 0, WALL_H, "#cbd5e1", "#94a3b8");
  p.box(-0.3, 0, 0.3, gd, 0, WALL_H, "#dbe3ec", "#94a3b8");
  // brick courses on both walls
  for (let z = 4; z < WALL_H - 12; z += 5) {
    p.onLeft(-0.3, 0, 0, 0.3, gw, z, z + 0.6, "rgba(15,23,42,0.07)");
    p.onRight(0, 0, 0, 0, gd, z, z + 0.6, "rgba(15,23,42,0.07)");
  }
  p.onLeft(-0.3, 0, 0, 0.3, gw, 0, 12, "rgba(51,65,85,0.25)");
  p.onRight(0, 0, 0, 0, gd, 0, 12, "rgba(51,65,85,0.25)");
  // tool cabinets and a pegboard along the back wall
  for (let i = 0; i < Math.floor(gw / 3); i++) {
    const u = 2.6 + i * 3;
    if (u + 0.5 > gw) break;
    p.onLeft(-0.3, 0, 0, u, u + 0.5, 0, 14, "#b91c1c");
    for (let k = 1; k < 5; k++) p.onLeft(-0.3, 0, 0, u + 0.03, u + 0.47, k * 2.8, k * 2.8 + 0.5, "#7f1d1d");
    p.onLeft(-0.3, 0, 0, u, u + 0.5, 14, 15, "#e5e7eb");
  }
  // tyre rack on the side wall
  for (let i = 0; i < Math.floor(gd / 5); i++) {
    const u = 3.2 + i * 5;
    if (u + 1 > gd) break;
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 3; k++) {
        const cx = sx(0, u + k * 0.32 + 0.16);
        const cy = sy(0, u + k * 0.32 + 0.16, 6 + r * 9);
        p.ctx.fillStyle = "#111827";
        p.ctx.beginPath();
        p.ctx.ellipse(cx, cy, 2.6, 4.2, -0.45, 0, Math.PI * 2);
        p.ctx.fill();
        p.ctx.fillStyle = "#6b7280";
        p.ctx.beginPath();
        p.ctx.ellipse(cx, cy, 1.1, 1.8, -0.45, 0, Math.PI * 2);
        p.ctx.fill();
      }
    p.onRight(0, u, 0, 0, 1, 1.8, 2.3, "#475569");
    p.onRight(0, u, 0, 0, 1, 10.8, 11.3, "#475569");
  }
  // accent band + windows on the back wall (the y = 0 plane, seen from the front)
  p.onLeft(-0.3, 0, 0, 0.3, gw, WALL_H - 10, WALL_H - 5, p.col(accent));
  for (let i = 0; i < Math.floor(gw / 3); i++) {
    const u = 0.8 + i * 3;
    p.onLeft(-0.3, 0, 0, u, u + 1.6, 34, 58, "#7dd3fc");
    p.onLeft(-0.3, 0, 0, u + 0.78, u + 0.82, 34, 58, "#e2e8f0");
    p.onLeft(-0.3, 0, 0, u, u + 1.6, 45.5, 46.5, "#e2e8f0");
  }
  // tool board and posters on the side wall (x = 0 plane)
  for (let i = 0; i < Math.floor(gd / 4); i++) {
    const u = 1 + i * 4;
    p.onRight(0, u, 0, 0, 1.6, 22, 44, "#92400e");
    for (let k = 0; k < 5; k++) p.onRight(0, u + 0.15 + k * 0.28, 0, 0, 0.12, 26 + (k % 2) * 6, 40, "#94a3b8");
    p.onRight(0, u + 2.1, 0, 0, 1.1, 30, 48, CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
    p.onRight(0, u + 2.2, 0, 0, 0.9, 33, 45, "#f8fafc");
  }
  // ceiling lights glow on the floor
  for (let i = 0; i < Math.ceil(gw / 4); i++)
    for (let j = 0; j < Math.ceil(gd / 4); j++) {
      const flick = 0.025 + 0.006 * Math.sin(t * 2 + i + j);
      p.ellipse(2 + i * 4, 2 + j * 4, 0, 46, `rgba(255,255,240,${flick})`, 0.5);
    }
}

function toolCart(p: Painter, x: number, y: number) {
  p.box(x, y, 0.4, 0.3, 0, 12, "#dc2626", "#ef4444");
  for (let i = 1; i < 4; i++) p.onLeft(x, y + 0.3, 0, 0.04, 0.36, i * 3, i * 3 + 0.6, "#7f1d1d");
}

function shelf(p: Painter, x: number, y: number, w: number, d: number, seed: number) {
  const h = 40;
  p.box(x, y, w, d, 0, 2, "#64748b");
  for (let lvl = 0; lvl < 4; lvl++) {
    const z = lvl * 12 + 2;
    p.box(x, y, w, d, z, 1.2, "#94a3b8");
    for (let k = 0; k < 3; k++) {
      const r = rand(seed * 9 + lvl, k);
      if (r < 0.2) continue;
      const bw = (w - 0.2) / 3 - 0.05;
      if (r > 0.7) {
        const cx = x + 0.15 + k * (bw + 0.05) + bw / 2;
        p.ellipse(cx, y + d / 2, z + 6, 5, "#111827", 1);
      } else p.box(x + 0.1 + k * (bw + 0.05), y + 0.1, bw, d - 0.2, z + 1.2, 8, ["#d97706", "#a16207", "#2563eb", "#16a34a"][Math.floor(r * 4)]);
    }
  }
  for (const [a, b] of [[0, 0], [w - 0.06, 0], [0, d - 0.06], [w - 0.06, d - 0.06]]) p.box(x + a, y + b, 0.06, 0.06, 0, h, "#475569");
}

function lightRig(p: Painter, x: number, y: number, w: number, d: number, color: string, t: number) {
  const pulse = 0.25 + 0.12 * Math.sin(t * 3);
  p.ellipse(x + w / 2, y + d / 2, 0, (w + d) * 14, `${color}${Math.round(pulse * 255).toString(16).padStart(2, "0")}`, 0.5);
}

export function drawFacility(p: Painter, f: FacilityDraw, t: number) {
  const { x, y, w, d } = f;
  const cfg = FACILITY_BY_ID[f.type];
  const longX = w >= d;
  const dir: Dir = longX ? 0 : 1;
  const cx = x + w / 2;
  const cy = y + d / 2;
  const working = f.staffed && f.workstation;
  const ph = f.progress;

  switch (f.type) {
    case "serviceBay": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "rgba(250,204,21,0.12)");
      p.quadStroke(x + 0.08, y + 0.08, w - 0.16, d - 0.16, "#facc15", 2);
      if (f.staffed) stationCar(p, f, cx, cy, dir, f.car, CAR_S * 0.9);
      toolCart(p, longX ? x + w - 0.55 : x + 0.1, longX ? y + 0.1 : y + d - 0.45);
      break;
    }
    case "carLift": {
      p.quad(x + 0.1, y + 0.1, w - 0.2, d - 0.2, "#374151");
      const lift = working ? 10 + 12 * Math.sin(ph * Math.PI) : 0;
      const post = (px: number, py: number) => p.box(px, py, 0.18, 0.18, 0, 46, "#2563eb", "#3b82f6");
      if (longX) {
        post(x + w / 2 - 0.09, y + 0.05);
        if (f.staffed) stationCar(p, f, cx, cy, dir, f.car, CAR_S * 0.62, lift);
        p.box(x + 0.25, y + 0.3, w - 0.5, 0.12, lift, 2.5, "#1e40af");
        post(x + w / 2 - 0.09, y + d - 0.23);
      } else {
        post(x + 0.05, y + d / 2 - 0.09);
        if (f.staffed) stationCar(p, f, cx, cy, dir, f.car, CAR_S * 0.62, lift);
        post(x + w - 0.23, y + d / 2 - 0.09);
      }
      break;
    }
    case "storage":
      shelf(p, x + 0.15, y + 0.15, w - 0.3, d - 0.3, f.uid);
      break;
    case "office": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#8b5e3c");
      p.box(x + 0.4, y + 0.35, 1.0, 0.5, 0, 12, "#e5e7eb", "#f8fafc");
      p.box(x + 0.75, y + 0.45, 0.35, 0.06, 12, 9, "#111827");
      p.onLeft(x + 0.75, y + 0.51, 12, 0.03, 0.32, 1.5, 8, f.staffed ? "#38bdf8" : "#1f2937");
      p.box(x + 0.75, y + 1.05, 0.35, 0.35, 0, 8, "#1f2937");
      p.tree(x + w - 0.3, y + d - 0.3, 0.55, 0.3);
      // glass partitions
      p.box(x, y + d - 0.06, w, 0.06, 0, 26, "#bae6fd");
      p.ctx.globalAlpha = 1;
      break;
    }
    case "partsWorkshop": {
      p.box(x + 0.15, y + 0.2, w - 0.3, 0.55, 0, 14, "#78716c", "#a8a29e");
      for (let i = 0; i < 4; i++) p.box(x + 0.3 + i * 0.6, y + 0.3, 0.3, 0.25, 14, 4 + (i % 2) * 3, ["#9ca3af", "#ef4444", "#facc15", "#64748b"][i]);
      p.box(x + 0.4, y + 1.3, 0.8, 0.7, 0, 16, "#57534e");
      p.box(x + 0.5, y + 1.4, 0.6, 0.5, 16, 8, "#9ca3af");
      shelf(p, x + w - 1.0, y + d - 0.9, 0.8, 0.7, f.uid);
      break;
    }
    case "paintBooth":
    case "advancedPaint": {
      const glass = f.type === "paintBooth" ? "#f9a8d4" : "#e9d5ff";
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#1f2937");
      p.box(x + 0.05, y + 0.05, w - 0.1, 0.1, 0, 44, "#e5e7eb");
      p.box(x + 0.05, y + 0.15, 0.1, d - 0.2, 0, 44, "#e5e7eb");
      if (f.staffed) stationCar(p, f, cx, cy, dir, working ? mixPaint(f.car, cfg.color, Math.max(0, (ph - 0.12) / 0.78)) : f.car, CAR_S * 0.72);
      if (working && !p.dim) {
        for (let i = 0; i < 10; i++) {
          const a = (t * 0.9 + i / 10) % 1;
          p.circle(x + 0.4 + rand(f.uid, i) * (w - 0.8), y + 0.4 + rand(i, f.uid) * (d - 0.8), 10 + a * 24, 3 + a * 6, `${cfg.color}${Math.round((1 - a) * 90).toString(16).padStart(2, "0")}`);
        }
      }
      // translucent front walls and roof frame
      p.ctx.globalAlpha = 0.28;
      p.box(x + 0.05, y + d - 0.1, w - 0.1, 0.05, 0, 44, glass);
      p.box(x + w - 0.1, y + 0.05, 0.05, d - 0.1, 0, 44, glass);
      p.ctx.globalAlpha = 1;
      // open roof frame with a filter unit, so the car stays visible
      p.quadStroke(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#e2e8f0", 3, undefined, 44);
      p.line(x + 0.05, y + d / 2, x + w - 0.05, y + d / 2, "#cbd5e1", 2, 44);
      p.box(x + w * 0.4, y + d * 0.4, w * 0.2, d * 0.2, 44, 5, "#94a3b8");
      break;
    }
    case "engineWorkshop": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "rgba(239,68,68,0.12)");
      p.box(x + 0.2, y + 0.2, w - 0.4, 0.6, 0, 14, "#78716c", "#a8a29e");
      for (let i = 0; i < 2; i++) {
        const ex = x + 0.6 + i * 1.6;
        p.box(ex, y + 1.6, 0.12, 0.12, 0, 16, "#475569");
        p.box(ex - 0.35, y + 1.35, 0.8, 0.6, 16, 14, i ? "#9ca3af" : "#b91c1c");
        p.box(ex - 0.2, y + 1.45, 0.5, 0.4, 30, 6, "#64748b");
      }
      // gantry hoist
      p.box(x + 0.25, y + d - 0.5, 0.12, 0.12, 0, 56, "#f59e0b");
      p.box(x + w - 0.4, y + d - 0.5, 0.12, 0.12, 0, 56, "#f59e0b");
      p.box(x + 0.25, y + d - 0.5, w - 0.53, 0.12, 56, 4, "#f59e0b");
      const hx = x + 0.6 + ((Math.sin(t * 0.5 + f.uid) + 1) / 2) * (w - 1.2);
      p.box(hx, y + d - 0.48, 0.08, 0.08, 34, 22, "#111827");
      shelf(p, x + w - 1.0, y + 2.6, 0.8, 0.6, f.uid);
      break;
    }
    case "tuningArea":
    case "advancedTuning": {
      const glow = f.type === "tuningArea" ? "#f97316" : "#8b5cf6";
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#111827");
      p.quadStroke(x + 0.12, y + 0.12, w - 0.24, d - 0.24, glow, 2);
      if (working) lightRig(p, x, y, w, d, glow, t);
      if (f.staffed) stationCar(p, f, cx, cy, dir, f.car, CAR_S * 0.72);
      p.box(x + w - 0.6, y + 0.15, 0.45, 0.3, 0, 18, "#334155");
      p.box(x + w - 0.62, y + 0.17, 0.5, 0.06, 18, 12, "#0f172a");
      p.onLeft(x + w - 0.62, y + 0.23, 18, 0.04, 0.46, 2, 10, working ? glow : "#1f2937");
      break;
    }
    case "dyno": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#1f2937");
      const rx = longX ? cx - 0.6 : cx;
      p.quad(longX ? rx - 0.3 : x + 0.5, longX ? y + 0.4 : cy - 0.9, longX ? 0.6 : w - 1, longX ? d - 0.8 : 0.6, "#0b1220");
      for (let i = 0; i < 4; i++) p.line(longX ? rx - 0.3 : x + 0.5, longX ? y + 0.5 + i * 0.5 : cy - 0.85 + i * 0.15, longX ? rx + 0.3 : x + w - 0.5, longX ? y + 0.5 + i * 0.5 : cy - 0.85 + i * 0.15, "#475569", 1);
      if (f.staffed) stationCar(p, f, cx, cy, dir, f.car, CAR_S * 0.72, Math.sin(t * 40) * (working ? 0.6 : 0));
      // exhaust fan and console
      p.box(longX ? x + 0.1 : x + w / 2 - 0.4, longX ? cy - 0.4 : y + 0.1, longX ? 0.3 : 0.8, longX ? 0.8 : 0.3, 0, 26, "#374151");
      if (working && !p.dim)
        for (let i = 0; i < 3; i++) {
          const a = (t * 1.6 + i / 3) % 1;
          p.circle(longX ? x + 0.5 - a * 0.3 : cx, longX ? cy : y + 0.5 - a * 0.3, 8 + a * 10, 2 + a * 4, `rgba(203,213,225,${0.5 * (1 - a)})`);
        }
      p.box(x + w - 0.6, y + d - 0.5, 0.45, 0.35, 0, 16, "#e5e7eb");
      p.onLeft(x + w - 0.6, y + d - 0.15, 0, 0.05, 0.4, 9, 15, working ? "#22c55e" : "#1f2937");
      break;
    }
    case "performanceWorkshop": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "rgba(6,182,212,0.12)");
      p.box(x + 0.5, y + 0.5, w - 1, d - 1, 0, 6, "#164e63", "#0e7490");
      if (f.staffed) stationCar(p, f, cx, cy, dir, f.car, CAR_S * 0.78, 6);
      if (working) {
        p.line(x + 0.3, y + 0.3, cx, cy, "rgba(239,68,68,0.7)", 1, 14);
        p.line(x + w - 0.3, y + 0.3, cx, cy, "rgba(239,68,68,0.7)", 1, 14);
      }
      for (let i = 0; i < 3; i++) p.ellipse(x + w - 0.35, y + d - 0.4 - i * 0.02, i * 4.5 + 3, 7, "#111827", 0.9);
      break;
    }
    case "supercarWorkshop": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#1c1917");
      p.ellipse(cx, cy, 0, (w + d) * 13, "rgba(250,204,21,0.25)", 0.5);
      p.box(cx - 1.2, cy - 1.2, 2.4, 2.4, 0, 4, "#a16207", "#eab308");
      if (f.staffed) stationCar(p, f, cx, cy, dir, working ? f.car : "#f59e0b", CAR_S * 0.8, 4);
      for (const [a, b] of [[0.2, 0.2], [w - 0.3, 0.2]]) {
        p.box(x + a, y + b, 0.1, 0.1, 0, 60, "#d4d4d8");
        p.circle(x + a + 0.05, y + b + 0.05, 62, 3, working ? "#fef08a" : "#71717a");
      }
      break;
    }
    case "carbonWorkshop": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#1e293b");
      // autoclave
      for (let i = 0; i < 5; i++) p.ellipse(x + 0.9 + i * 0.35, y + 1.0, 18, 18, "#475569", 0.95);
      p.ellipse(x + 2.6, y + 1.0, 18, 18, "#94a3b8", 0.95);
      p.ellipse(x + 2.62, y + 1.0, 18, 12, "#334155", 0.95);
      p.box(x + 0.4, y + 2.3, w - 0.8, 1.0, 0, 13, "#0f172a", "#334155");
      for (let i = 0; i < 6; i++) p.line(x + 0.5 + i * 0.5, y + 2.35, x + 0.5 + i * 0.5, y + 3.25, "rgba(148,163,184,0.5)", 1, 13);
      break;
    }
    case "vipArea": {
      p.quad(x + 0.05, y + 0.05, w - 0.1, d - 0.1, "#78350f");
      p.quad(x + 0.3, y + 0.3, w - 0.6, d - 0.6, "#b45309");
      p.box(x + 0.3, y + 0.25, 1.6, 0.4, 0, 8, "#f5f5f4");
      p.box(x + 0.3, y + 0.25, 1.6, 0.1, 8, 7, "#e7e5e4");
      p.box(x + 0.8, y + 0.95, 0.6, 0.4, 0, 6, "#1f2937", "#d4a017");
      p.tree(x + 0.25, y + d - 0.3, 0.6, 0.6);
      drawModel(p, x + w - 1.0, cy + 0.2, longX ? 1 : 0, "hypercar", "#facc15", CAR_S * 0.6, { lift: 3 });
      p.box(x + w - 1.6, y + d - 0.5, 1.2, 0.3, 0, 3, "#d4a017");
      break;
    }
  }
  if (!f.staffed && f.workstation) {
    // an idle station shows a "needs a mechanic" marker
    p.circle(cx, cy, 34, 7, "rgba(245,158,11,0.95)");
    p.ctx.fillStyle = "#111";
    p.ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
    p.ctx.textAlign = "center";
    p.ctx.textBaseline = "middle";
    p.ctx.fillText("!", sx(cx, cy), sy(cx, cy, 34) + 0.5);
  }
}

function mixPaint(from: string, to: string, k: number) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return "#" + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Where a station's mechanic stands, bobbing between the car and a toolbox. */
export function workerSpot(f: FacilityDraw, t: number): { x: number; y: number; phase: number } {
  const swing = (Math.sin(t * 0.9 + f.uid * 1.7) + 1) / 2;
  const longX = f.w >= f.d;
  return longX
    ? { x: f.x + 0.4 + swing * (f.w - 0.8), y: f.y + f.d - 0.25, phase: t * 6 + f.uid }
    : { x: f.x + f.w - 0.25, y: f.y + 0.4 + swing * (f.d - 0.8), phase: t * 6 + f.uid };
}

export function carColorFor(uid: number, cycle: number) {
  return CAR_COLORS[Math.abs(uid * 7 + cycle * 3) % CAR_COLORS.length];
}
