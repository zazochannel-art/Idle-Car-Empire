// The factory hall: floor, walls, windows and sky, signs, sunlight and lamps.
// Drawn for InteriorEngine (interior-engine.ts): its methods moved here as functions of the engine.
import type { Interior } from "./layout";
import type { InteriorEngine, InteriorScene } from "./interior-engine";
import { floorGrain, hash } from "./interior-shared";
import { brick, bunting, cobweb, garland, planks, tiles } from "./hall-art";
import { chevron, hatch } from "./interior-line";
import { mix, raceFont, shade, sx, sy } from "../../map/iso";

/** The hall (from its cached still layer when it can), then what changes on it. */
export function drawBuilding(e: InteriorEngine, s: InteriorScene, L: Interior) {
  const p = e.p;
  if (!blitHall(e, s, L)) drawHall(e, s, L);
  // the raw material gate lights up while a delivery comes in
  const ay = L.aisle.y;
  if (s.inbound) p.onRight(0, 0, 0, ay - 0.9, ay + 0.9, 0, 30, "rgba(253,230,138,0.85)");
  for (const lk of L.locked) p.tag(s.lockedLabel(L.lines.length + L.locked.indexOf(lk), lk.level), L.w / 2, lk.y0 + 2.5, 2, { size: 13, bg: "rgba(15,23,42,0.85)", icon: "🔒" });
}

/**
 * Draws the hall's still layer into an offscreen canvas covering the view
 * (plus a margin to pan into) at the current zoom, and blits it. Redrawn
 * only when the view leaves it or the zoom moves a quarter octave. False
 * when the area would be too big to keep (then the hall is drawn live).
 */
export function blitHall(e: InteriorEngine, s: InteriorScene, L: Interior): boolean {
  const { cam, p } = e;
  const scale = 2 ** (Math.ceil(Math.log2(cam.zoom * e.dpr) * 4) / 4);
  const detail = p.zoom > 0.6 ? 2 : p.zoom > 0.45 ? 1 : 0;
  // the sign's lettering needs the game font: drawn again once it has loaded
  const fonts = typeof document !== "undefined" ? document.fonts?.status : "";
  // the windows show the time of day (in eighths), and the season decorates the walls
  const sky = Math.round(e.skyDark * 8);
  const key = `${e.layoutKey}|${s.accent}|${s.title}|${s.icon}|${fonts}|${sky}|${e.season}|${scale}|${detail}`;
  // the hall's extent in world px: slab, and the walls up to the roof
  const bx0 = sx(-0.4, L.d + 0.4) - 8;
  const bx1 = sx(L.w + 0.4, -0.4) + 8;
  const by0 = sy(-0.4, -0.4, 100);
  const by1 = sy(L.w + 0.4, L.d + 0.4, -16) + 8;
  const hw = cam.w / 2 / cam.zoom;
  const hh = cam.h / 2 / cam.zoom;
  const vx0 = Math.max(bx0, cam.x - hw);
  const vx1 = Math.min(bx1, cam.x + hw);
  const vy0 = Math.max(by0, cam.y - hh);
  const vy1 = Math.min(by1, cam.y + hh);
  if (vx1 <= vx0 || vy1 <= vy0) return true; // the hall is off screen
  let h = e.hall;
  if (!h || h.key !== key || vx0 < h.x0 || vy0 < h.y0 || vx1 > h.x1 || vy1 > h.y1) {
    const m = 200 / cam.zoom;
    const x0 = Math.max(bx0, vx0 - m);
    const x1 = Math.min(bx1, vx1 + m);
    const y0 = Math.max(by0, vy0 - m);
    const y1 = Math.min(by1, vy1 + m);
    const cw = Math.ceil((x1 - x0) * scale);
    const ch = Math.ceil((y1 - y0) * scale);
    if (cw > 6000 || ch > 6000 || cw * ch > 12e6) return false;
    const canvas = h?.canvas ?? document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const c = canvas.getContext("2d");
    if (!c) return false;
    c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    const main = e.ctx;
    e.ctx = c;
    p.ctx = c;
    try {
      drawHall(e, s, L);
    } finally {
      e.ctx = main;
      p.ctx = main;
    }
    h = e.hall = { canvas, key, scale, x0, y0, x1, y1 };
  }
  e.ctx.drawImage(h.canvas, h.x0, h.y0, h.canvas.width / h.scale, h.canvas.height / h.scale);
  return true;
}

/** Slab, floor, markings, locked halls, walls with windows and gates: everything that stays still. */
export function drawHall(e: InteriorEngine, s: InteriorScene, L: Interior) {
  const p = e.p;
  const c = e.ctx;
  const look = e.look;
  const { w, d } = L;
  p.box(-0.4, -0.4, w + 0.8, d + 0.8, -16, 16, "#2a3240", "#353e4c", false);
  drawFloor(e, L);
  // hall floors: each line's bay (resin, or worn boards in the old workshop),
  // with a painted walkway in front
  for (const line of L.lines) {
    if (look.planks) {
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, "#8f6a45");
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, planks(c) ?? "#8f6a45");
    } else {
      const g = c.createLinearGradient(sx(w / 2, line.y0 + 0.2), sy(w / 2, line.y0 + 0.2), sx(w / 2, line.y0 + 4.8), sy(w / 2, line.y0 + 4.8));
      g.addColorStop(0, look.bay[0]);
      g.addColorStop(1, look.bay[1]);
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, g);
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, look.era === "hightech" ? (tiles(c) ?? "rgba(0,0,0,0)") : floorGrain(c));
    }
    p.quadStroke(0.3, line.y0 + 0.2, w - 0.6, 4.6, "rgba(15,23,42,0.18)", 1);
    p.quad(0.3, line.belt + 1.55, w - 0.6, 0.55, look.walkway);
    p.line(0.3, line.belt + 1.55, w - 0.3, line.belt + 1.55, look.lines, 1.4);
    p.line(0.3, line.belt + 2.1, w - 0.3, line.belt + 2.1, look.lines, 1.4);
    // painted walking arrows along the walkway
    for (let x = 2; x < w - 1; x += 5) chevron(e, x, line.belt + 1.82, "rgba(255,255,255,0.55)");
    // keep-clear hatching at both ends of the line
    hatch(e, 0.3, line.y0 + 0.2, 0.45, 4.6);
    hatch(e, w - 0.75, line.y0 + 0.2, 0.45, 4.6);
  }
  // locked halls: bare, hatched, with the level that builds them
  for (const lk of L.locked) {
    p.quad(0.3, lk.y0 + 0.2, w - 0.6, 4.6, "#6b7280");
    c.save();
    c.strokeStyle = "rgba(15,23,42,0.25)";
    c.lineWidth = 3;
    c.beginPath();
    for (let k = 0; k < w + 5; k += 1.2) {
      c.moveTo(sx(0.3 + k, lk.y0 + 0.2), sy(0.3 + k, lk.y0 + 0.2));
      c.lineTo(sx(0.3 + k - 4.6, lk.y0 + 4.8), sy(0.3 + k - 4.6, lk.y0 + 4.8));
    }
    c.rect(-1e5, -1e5, 0, 0);
    c.stroke();
    c.restore();
    p.quadStroke(0.3, lk.y0 + 0.2, w - 0.6, 4.6, "rgba(250,204,21,0.8)", 2, [10, 8]);
  }
  // aisle: lane markings, arrows and the tyre marks of the forklifts
  const ay = L.aisle.y;
  c.strokeStyle = "rgba(30,30,32,0.07)";
  c.lineWidth = 3;
  c.beginPath();
  for (const off of [-0.32, -0.12, 0.14, 0.34]) {
    c.moveTo(sx(0.5, ay + off), sy(0.5, ay + off));
    c.lineTo(sx(w - 0.5, ay + off), sy(w - 0.5, ay + off));
  }
  c.stroke();
  p.line(0.2, ay - 0.6, w - 0.2, ay - 0.6, look.lines, 2);
  p.line(0.2, ay + 0.6, w - 0.2, ay + 0.6, look.lines, 2);
  for (let x = 2; x < w - 2; x += 2.5) p.line(x, ay, x + 1.2, ay, "rgba(255,255,255,0.75)", 2, 0, [6, 6]);
  drawWalls(e, s, L);
  drawSunlight(e, L);
  if (look.glossy) reflections(e, L);
}

/** The floor between the bays: concrete (or rubber, resin…), its joints and the marks of the trade. */
export function drawFloor(e: InteriorEngine, L: Interior) {
  const p = e.p;
  const c = e.ctx;
  const look = e.look;
  const { w, d } = L;
  p.quad(0, 0, w, d, look.floor);
  p.quad(0, 0, w, d, floorGrain(c));
  // a darker band along the walls (the floor nobody walks on, and the shade of the walls)
  for (let k = 0; k < 4; k++) {
    p.quad(0, 0, w, 0.25 - k * 0.05, "rgba(15,23,42,0.05)");
    p.quad(0, 0, 0.25 - k * 0.05, d, "rgba(15,23,42,0.05)");
  }
  // saw-cut joints every four tiles: a dark groove and a lit edge
  c.lineWidth = 1.2;
  c.strokeStyle = "rgba(20,24,30,0.16)";
  c.beginPath();
  for (let x = 4; x < w; x += 4) {
    c.moveTo(sx(x, 0), sy(x, 0));
    c.lineTo(sx(x, d), sy(x, d));
  }
  for (let y = 4; y < d; y += 4) {
    c.moveTo(sx(0, y), sy(0, y));
    c.lineTo(sx(w, y), sy(w, y));
  }
  c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = "rgba(255,255,255,0.08)";
  c.beginPath();
  for (let x = 4; x < w; x += 4) {
    c.moveTo(sx(x + 0.05, 0), sy(x + 0.05, 0));
    c.lineTo(sx(x + 0.05, d), sy(x + 0.05, d));
  }
  for (let y = 4; y < d; y += 4) {
    c.moveTo(sx(0, y + 0.05), sy(0, y + 0.05));
    c.lineTo(sx(w, y + 0.05), sy(w, y + 0.05));
  }
  c.stroke();
  // the marks of the trade: oil, rubber, paint, dust (the same ones every visit)
  if (look.stains.length)
    for (let i = 0; i < look.stainCount; i++) {
      const x = 0.8 + hash(i * 3 + 1) * (w - 1.6);
      const y = 0.8 + hash(i * 3 + 2) * (d - 1.6);
      p.ellipse(x, y, 0, 6 + hash(i * 3 + 3) * 18, look.stains[i % look.stains.length], 0.5);
    }
}

/** The back walls: brick or cladding or white panels, windows, pipes, panels, the gate and the season's decorations. */
export function drawWalls(e: InteriorEngine, s: InteriorScene, L: Interior) {
  const p = e.p;
  const c = e.ctx;
  const look = e.look;
  const { w, d } = L;
  const ay = L.aisle.y;
  const WH = 92;
  p.box(-0.35, -0.35, w + 0.35, 0.35, 0, WH, look.wall[0], "#9aa4b0");
  p.box(-0.35, 0, 0.35, d, 0, WH, look.wall[1], "#9aa4b0");
  if (look.brick) {
    // old brick, darker and sootier toward the floor
    p.onLeft(-0.35, 0, 0, 0.35, w + 0.35, 0, WH, brick(c, "left") ?? look.wall[0]);
    p.onRight(0, 0, 0, 0, d, 0, WH, brick(c, "right") ?? look.wall[1]);
    p.onLeft(-0.35, 0, 0, 0.35, w + 0.35, 0, 18, "rgba(40,22,14,0.28)");
    p.onRight(0, 0, 0, 0, d, 0, 18, "rgba(40,22,14,0.28)");
    // a wooden skirting board
    p.onLeft(-0.35, 0, 0, 0.35, w + 0.35, 0, 3, "#5b3a24");
    p.onRight(0, 0, 0, 0, d, 0, 3, "#5b3a24");
  } else {
    // sandwich-panel ribs (fine seams on the high-tech panels)
    c.strokeStyle = look.era === "hightech" ? "rgba(15,23,42,0.05)" : "rgba(15,23,42,0.07)";
    c.lineWidth = 1;
    c.beginPath();
    const rib = look.era === "hightech" ? 1.5 : 0.5;
    for (let x = rib; x < w; x += rib) {
      c.moveTo(sx(x, 0), sy(x, 0, 24));
      c.lineTo(sx(x, 0), sy(x, 0, WH));
    }
    for (let y = rib; y < d; y += rib) {
      c.moveTo(sx(0, y), sy(0, y, 24));
      c.lineTo(sx(0, y), sy(0, y, WH));
    }
    c.stroke();
    // the lower wall, its cap, and a yellow-black kick band (a lit LED strip in the high-tech plant)
    p.onLeft(-0.35, 0, 0, 0.35, w, 0, 24, look.dado[0]);
    p.onRight(0, 0, 0, 0, d, 0, 24, look.dado[1]);
    p.onLeft(-0.35, 0, 0, 0.35, w, 23, 24.5, shade(look.dado[0], -0.18));
    p.onRight(0, 0, 0, 0, d, 23, 24.5, shade(look.dado[1], -0.18));
    if (look.era === "hightech") {
      p.onLeft(-0.35, 0, 0, 0.35, w, 24.5, 25.5, look.lines);
      p.onRight(0, 0, 0, 0, d, 24.5, 25.5, look.lines);
    } else kickBand(e, L);
  }
  // the accent band under the roof
  p.onLeft(-0.35, 0, 0, 0.35, w, WH - 12, WH - 6, p.col(s.accent));
  p.onRight(0, 0, 0, 0, d, WH - 12, WH - 6, p.col(s.accent));
  // windows: small panes in the workshop, a band of windows, or a glass curtain wall
  for (const [x0, x1] of windowSpans(e, w)) windowLeft(e, x0, x1 - x0);
  if (look.windows === "curtain") windowRight(e, 0.8, d - 5.6);
  else for (let y = 1; y < d - 4; y += 3) windowRight(e, y, 2.2);
  // pipes along the walls: an old rusty main, the air lines and the red sprinkler main, or cable trays
  const pipes: [number, string][] =
    look.era === "workshop" ? [[36, "#7c4a2a"]] : look.era === "hightech" ? [[38, "#cbd5e1"], [WH - 16, "#e2e8f0"]] : [[34, "#6b7684"], [38, "#7c8795"], [WH - 16, "#dc2626"]];
  for (const [z, col] of pipes) {
    p.onLeft(-0.35, 0, 0, 0.35, w, z, z + 2.2, col);
    p.onRight(0, 0, 0, 0, d, z, z + 2.2, col);
  }
  for (let x = 1.5; x < w; x += 2) p.onLeft(-0.35, 0, 0, x, x + 0.06, 32, 41, "#475569");
  for (let y = 1.5; y < d; y += 2) p.onRight(0, 0, 0, y, y + 0.06, 32, 41, "#475569");
  // electrical panels and fire points along the back wall, clear of the columns
  for (const x of [2.2, 8.4, 14.6, 21.4]) {
    if (x > w - 1.5) continue;
    p.box(x, 0, 0.8, 0.22, 0, 30, look.era === "workshop" ? "#6b705c" : "#c7ced6", look.era === "workshop" ? "#7d8270" : "#dfe4ea");
    p.onLeft(x, 0.22, 0, 0.08, 0.36, 12, 26, "#9aa4b0");
    p.onLeft(x, 0.22, 0, 0.44, 0.72, 12, 26, "#9aa4b0");
    p.onLeft(x, 0.22, 0, 0.62, 0.68, 27, 29, "#22c55e");
    // the fire point: an extinguisher on a red board
    p.onLeft(-0.35, 0, 0, x + 1.25 + 0.35, x + 1.55 + 0.35, 14, 30, "#dc2626");
    p.box(x + 1.33, 0.02, 0.1, 0.1, 0, 11, "#ef4444", "#f87171");
  }
  // the raw material gate on the side wall, by the aisle: a roller door in a striped frame
  p.onRight(0, 0, 0, ay - 1.12, ay + 1.12, 0, 44, "#facc15");
  for (let k = 0; k < 6; k++) p.onRight(0, 0, 0, ay - 1.12 + k * 0.4, ay - 0.92 + k * 0.4, 0, 44, "#111827");
  p.onRight(0, 0, 0, ay - 1, ay + 1, 0, 40, "#4b5563");
  for (let z = 3; z < 40; z += 3) p.onRight(0, 0, 0, ay - 1, ay + 1, z, z + 0.8, "#374151");
  if (s.title) sign(e, s, w);
  // the season, on the walls: cobwebs in the corners, or a garland
  if (e.season === "halloween") {
    cobweb(c, 0, 0, WH - 1, 34);
    cobweb(c, w, 0, WH - 1, 30, true);
    for (const [x0] of windowSpans(e, w).filter((_, i) => i % 3 === 1)) cobweb(c, x0, 0, 78, 14);
  } else if (e.season === "winter") garland(p, w, WH - 18);
  else if (e.season === "spring") bunting(p, w, WH - 16, ["#f9a8d4", "#fde68a", "#86efac", "#c4b5fd", "#f8fafc"]);
  else if (e.season === "summer") bunting(p, w, WH - 16, ["#ef4444", "#facc15", "#3b82f6", "#22c55e", "#fb923c"]);
}

/** Where the windows of the back wall are (x from, x to). */
export function windowSpans(e: InteriorEngine, w: number): [number, number][] {
  if (e.look.windows === "curtain") return [[0.8, w - 0.8]];
  const out: [number, number][] = [];
  for (let x = 1; x < w - 1; x += 3) out.push([x, x + 2.2]);
  return out;
}

/** The heights of the windows' glass (from, to). */
export function windowZ(e: InteriorEngine): [number, number] {
  return e.look.windows === "small" ? [46, 72] : e.look.windows === "curtain" ? [30, 84] : [52, 76];
}

/** The sky through the glass: blue by day, gold in the evening, dark with stars at night. */
export function skyGradient(e: InteriorEngine, y0: number, y1: number): CanvasGradient {
  const dark = e.skyDark;
  const keys: [string, string, string][] = [
    ["#b9dcfb", "#e3f1fd", "#cfe5f8"],
    ["#7fa6d6", "#ffcf9e", "#ffad75"],
    ["#0b1430", "#16234a", "#22325c"],
  ];
  const a = dark <= 0.5 ? keys[0] : keys[1];
  const b = dark <= 0.5 ? keys[1] : keys[2];
  const k = dark <= 0.5 ? dark / 0.5 : (dark - 0.5) / 0.5;
  const g = e.ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, mix(a[0], b[0], k));
  g.addColorStop(0.6, mix(a[1], b[1], k));
  g.addColorStop(1, mix(a[2], b[2], k));
  return g;
}

/** A window (or the glass curtain) on the back wall (plane y = 0): frame, sky, mullions, transom. */
export function windowLeft(e: InteriorEngine, x: number, w: number) {
  const p = e.p;
  const look = e.look;
  const [z0, z1] = windowZ(e);
  const frame = look.windows === "small" ? "#2f3d36" : look.windows === "curtain" ? "#94a3b8" : "#475569";
  const bar = look.windows === "small" ? "#2f3d36" : "#64748b";
  p.onLeft(-0.35, 0, 0, x - 0.08 + 0.35, x + w + 0.08 + 0.35, z0 - 2, z1 + 2, frame);
  p.onLeft(-0.35, 0, 0, x + 0.35, x + w + 0.35, z0, z1, skyGradient(e, sy(x, 0, z1), sy(x, 0, z0)));
  if (e.skyDark > 0.6) stars(e, x, w, z0, z1, true);
  // the glass catches the hall's light: a few diagonal glints on the curtain wall
  if (look.windows === "curtain") for (let u = 1; u < w; u += 3.1) p.onLeft(-0.35, 0, 0, x + u + 0.35, x + u + 0.65, z0 + 4, z1 - 4, "rgba(255,255,255,0.12)");
  const step = look.windows === "small" ? 0.37 : look.windows === "curtain" ? 1.3 : 0.55;
  for (let u = step; u < w; u += step) p.onLeft(-0.35, 0, 0, x + u + 0.33, x + u + 0.37, z0, z1, bar);
  const rows = look.windows === "small" ? [z0 + 6.5, z0 + 13, z0 + 19.5] : [(z0 + z1) / 2];
  for (const z of rows) p.onLeft(-0.35, 0, 0, x + 0.35, x + w + 0.35, z - 0.5, z + 0.5, bar);
  // a stone sill (with snow on it in winter)
  p.onLeft(-0.35, 0, 0, x + 0.25, x + w + 0.45, z0 - 3, z0 - 1.5, look.era === "workshop" ? "#c8bfb0" : "#94a3b8");
  if (e.season === "winter") p.onLeft(-0.35, 0, 0, x + 0.3, x + w + 0.4, z0 - 1.5, z0 + 1.2, "#f8fafc");
}

/** A window (or the glass curtain) on the side wall (plane x = 0). */
export function windowRight(e: InteriorEngine, y: number, w: number) {
  const p = e.p;
  const look = e.look;
  const [z0, z1] = windowZ(e);
  const frame = look.windows === "small" ? "#2f3d36" : look.windows === "curtain" ? "#94a3b8" : "#475569";
  const bar = look.windows === "small" ? "#2f3d36" : "#64748b";
  p.onRight(0, 0, 0, y - 0.08, y + w + 0.08, z0 - 2, z1 + 2, frame);
  p.onRight(0, 0, 0, y, y + w, z0, z1, skyGradient(e, sy(0, y, z1), sy(0, y, z0)));
  if (e.skyDark > 0.6) stars(e, y, w, z0, z1, false);
  const step = look.windows === "small" ? 0.37 : look.windows === "curtain" ? 1.3 : 0.55;
  for (let u = step; u < w; u += step) p.onRight(0, 0, 0, y + u - 0.02, y + u + 0.02, z0, z1, bar);
  const rows = look.windows === "small" ? [z0 + 6.5, z0 + 13, z0 + 19.5] : [(z0 + z1) / 2];
  for (const z of rows) p.onRight(0, 0, 0, y, y + w, z - 0.5, z + 0.5, bar);
  if (e.season === "winter") p.onRight(0, 0, 0, y, y + w, z0 - 1.5, z0 + 1.2, "#f8fafc");
}

/** Stars in a window at night (always the same ones). */
export function stars(e: InteriorEngine, u0: number, w: number, z0: number, z1: number, left: boolean) {
  const c = e.ctx;
  const a = Math.min(1, (e.skyDark - 0.6) / 0.3);
  c.fillStyle = `rgba(255,255,255,${(0.85 * a).toFixed(2)})`;
  for (let i = 0; i < w * 3; i++) {
    const u = u0 + hash(i * 2 + u0 * 13) * w;
    const z = z0 + 2 + hash(i * 2 + 1 + u0 * 7) * (z1 - z0 - 4);
    const [px, py] = left ? [sx(u, 0), sy(u, 0, z)] : [sx(0, u), sy(0, u, z)];
    c.fillRect(px, py, 0.9, 0.9);
  }
}

/** The plant's sign, hung in front of the back wall: a painted board, an enamel sign, or a backlit glass panel. */
export function sign(e: InteriorEngine, s: InteriorScene, w: number) {
  const p = e.p;
  const c = e.ctx;
  const era = e.look.era;
  const text = `${s.icon ?? ""} ${(s.title ?? "").toUpperCase()}`.trim();
  // as wide as the name needs (within reason), centred over the halls
  c.font = raceFont(900, 14 * 1.1, false);
  const size = Math.min(14, (14 * 250) / Math.max(1, c.measureText(text).width));
  c.font = raceFont(900, size * 1.1, false);
  const half = Math.min(4.6, (c.measureText(text).width + 36) / 64);
  const [x0, x1, y] = [w / 2 - half, w / 2 + half, 0.45];
  // the cables (or chains) to the roof
  c.strokeStyle = era === "workshop" ? "#5b3a24" : "#334155";
  c.lineWidth = 1;
  c.beginPath();
  for (const x of [x0 + 0.4, x1 - 0.4]) {
    c.moveTo(sx(x, y), sy(x, y, 80));
    c.lineTo(sx(x, y), sy(x, y, 92));
  }
  c.stroke();
  if (era === "workshop") {
    p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#5b3520");
    p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 59.5, 78.5, "#7c4a2a");
    for (const z of [64, 70, 76]) p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, z, z + 0.4, "rgba(40,20,10,0.35)");
    p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#f5e6c8", 900);
  } else if (era === "hightech") {
    p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#0f172a");
    p.onLeft(x0, y, 0, 0, x1 - x0, 78.6, 80, p.col(s.accent));
    p.onLeft(x0, y, 0, 0, x1 - x0, 58, 59.4, p.col(s.accent));
    p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#f8fafc", 900);
  } else {
    p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#f8fafc");
    p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 59.5, 78.5, p.col(s.accent));
    p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 76.5, 78.5, "rgba(255,255,255,0.25)");
    p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#ffffff", 900);
  }
}

/** A yellow-black safety band along the foot of both walls. */
export function kickBand(e: InteriorEngine, L: Interior) {
  const p = e.p;
  p.onLeft(-0.35, 0, 0, 0.35, L.w, 0, 4, "#facc15");
  p.onRight(0, 0, 0, 0, L.d, 0, 4, "#facc15");
  for (let u = 0.35; u < L.w; u += 0.5) p.onLeft(-0.35, 0, 0, u, u + 0.22, 0, 4, "#1f2937");
  for (let u = 0; u < L.d; u += 0.5) p.onRight(0, 0, 0, u, u + 0.22, 0, 4, "#1f2937");
}

/** Daylight from the back windows, falling across the floor in soft shafts (fading in the evening, gone at night). */
export function drawSunlight(e: InteriorEngine, L: Interior) {
  const day = daylight(e);
  if (day <= 0.02) return;
  const c = e.ctx;
  const [z0, z1] = windowZ(e);
  // where light through a point of the back wall (height z) meets the floor
  const fx = (x: number, z: number) => x + z * 0.012;
  const fy = (z: number) => z * 0.05;
  // the evening sun is golden
  const warm = mix("#fff4d6", "#ffc98f", Math.min(1, e.skyDark * 2));
  const [r, g, b] = [parseInt(warm.slice(1, 3), 16), parseInt(warm.slice(3, 5), 16), parseInt(warm.slice(5, 7), 16)];
  c.save();
  c.globalCompositeOperation = "lighter";
  const spans: [number, number][] = e.look.windows === "curtain" ? Array.from({ length: Math.floor((L.w - 2) / 2.6) }, (_, i) => [1.2 + i * 2.6, 2.5 + i * 2.6]) : windowSpans(e, L.w);
  for (const [x0, x1] of spans) {
    // the patch of light on the floor
    c.beginPath();
    c.moveTo(sx(fx(x0, z1), fy(z1)), sy(fx(x0, z1), fy(z1)));
    c.lineTo(sx(fx(x1, z1), fy(z1)), sy(fx(x1, z1), fy(z1)));
    c.lineTo(sx(fx(x1, z0), fy(z0)), sy(fx(x1, z0), fy(z0)));
    c.lineTo(sx(fx(x0, z0), fy(z0)), sy(fx(x0, z0), fy(z0)));
    c.closePath();
    c.fillStyle = `rgba(${r},${g},${b},${(0.1 * day).toFixed(3)})`;
    c.fill();
    // the shaft itself, fading toward the floor
    const top = [sx(x0, 0), sy(x0, 0, z1)];
    const bot = [sx(fx(x0, z1), fy(z1)), sy(fx(x0, z1), fy(z1))];
    const gr = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
    gr.addColorStop(0, `rgba(${r},${g},${b},${(0.1 * day).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},${(0.01 * day).toFixed(3)})`);
    c.beginPath();
    c.moveTo(sx(x0, 0), sy(x0, 0, z1));
    c.lineTo(sx(x1, 0), sy(x1, 0, z1));
    c.lineTo(sx(fx(x1, z1), fy(z1)), sy(fx(x1, z1), fy(z1)));
    c.lineTo(sx(fx(x1, z0), fy(z0)), sy(fx(x1, z0), fy(z0)));
    c.lineTo(sx(fx(x0, z0), fy(z0)), sy(fx(x0, z0), fy(z0)));
    c.lineTo(sx(x0, 0), sy(x0, 0, z0));
    c.closePath();
    c.fillStyle = gr;
    c.fill();
  }
  c.restore();
}

/** A polished floor mirrors the lamps: soft bright streaks under each one. */
export function reflections(e: InteriorEngine, L: Interior) {
  const c = e.ctx;
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const line of L.lines)
    for (let x = 2.5; x < L.w - 1; x += 4) {
      const [fx, fy] = [sx(x, line.belt - 0.4), sy(x, line.belt - 0.4)];
      const g = c.createLinearGradient(fx, fy - 6, fx, fy + 34);
      g.addColorStop(0, "rgba(255,255,255,0.1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(fx - 14, fy - 6, 28, 40);
    }
  c.restore();
}

/** How much daylight comes in: full by day, a little in the evening, none at night. */
export function daylight(e: InteriorEngine) {
  return Math.max(0, 1 - e.skyDark * 1.6);
}

/** The lamps over the lines: bare bulbs, high-bay domes or LED panels, each with its cone and pool of light. */
export function drawLamps(e: InteriorEngine, L: Interior) {
  const c = e.ctx;
  const look = e.look;
  const kind = look.lamps;
  const Z = kind === "bulb" ? 66 : kind === "led" ? 84 : 86;
  // stronger at night, when they light the hall alone
  const strength = look.lampStrength * (1 + e.skyDark * 0.6);
  const [half, spread] = kind === "bulb" ? [3, 28] : kind === "led" ? [26, 56] : [5, 40];
  let cone = e.cones.get(kind);
  if (!cone) {
    const col = kind === "bulb" ? "255,214,150" : kind === "led" ? "226,240,255" : "255,248,226";
    cone = c.createLinearGradient(0, 0, 0, Z);
    cone.addColorStop(0, `rgba(${col},${kind === "led" ? 0.06 : 0.08})`);
    cone.addColorStop(0.7, `rgba(${col},0.03)`);
    cone.addColorStop(1, `rgba(${col},0)`);
    e.cones.set(kind, cone);
  }
  c.save();
  for (const line of L.lines)
    for (let x = 2.5; x < L.w - 1; x += 4) {
      const y = line.belt - 0.4;
      const [lx, ly] = [sx(x, y), sy(x, y, Z)];
      const [fx, fy] = [sx(x, y), sy(x, y, 0)];
      // the cone is the same for every lamp: one gradient, moved to each
      c.globalCompositeOperation = "lighter";
      c.translate(lx, ly);
      c.fillStyle = cone;
      c.beginPath();
      c.moveTo(-half, 0);
      c.lineTo(half, 0);
      c.lineTo(spread, Z);
      c.lineTo(-spread, Z);
      c.closePath();
      c.fill();
      c.translate(-lx, -ly);
      c.globalCompositeOperation = "source-over";
      c.strokeStyle = "rgba(43,48,56,0.6)";
      c.lineWidth = 0.8;
      c.beginPath();
      if (kind === "bulb") {
        // a cable from the roof, an enamel shade and the hot bulb
        c.moveTo(lx, ly - 4);
        c.lineTo(lx, sy(x, y, 92));
        c.stroke();
        c.fillStyle = "#2f4f3f";
        c.beginPath();
        c.moveTo(lx - 5, ly + 1);
        c.lineTo(lx - 2, ly - 4);
        c.lineTo(lx + 2, ly - 4);
        c.lineTo(lx + 5, ly + 1);
        c.closePath();
        c.fill();
        c.fillStyle = "#fff1c7";
        c.beginPath();
        c.arc(lx, ly + 1.5, 2, 0, Math.PI * 2);
        c.fill();
        e.p.light(fx, fy, 64, look.lampColor, strength);
        e.p.light(lx, ly + 1.5, 10, "#ffd9a0", 0.6);
      } else if (kind === "led") {
        // a long slim panel along the line, two hangers
        for (const dx of [-18, 18]) {
          c.moveTo(lx + dx, ly - 2);
          c.lineTo(lx + dx, sy(x, y, 92) + dx * 0.5);
        }
        c.stroke();
        c.fillStyle = "#cbd5e1";
        c.beginPath();
        c.moveTo(lx - 26, ly - 13);
        c.lineTo(lx + 26, ly + 13);
        c.lineTo(lx + 26, ly + 15);
        c.lineTo(lx - 26, ly - 11);
        c.closePath();
        c.fill();
        c.strokeStyle = "#f8fbff";
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(lx - 25, ly - 11);
        c.lineTo(lx + 25, ly + 14);
        c.stroke();
        e.p.light(sx(x - 0.6, y), sy(x - 0.6, y), 56, look.lampColor, strength);
        e.p.light(sx(x + 0.6, y), sy(x + 0.6, y), 56, look.lampColor, strength);
      } else {
        // the high-bay dome and its hot lens
        c.moveTo(lx, ly - 5);
        c.lineTo(lx, ly - 22);
        c.stroke();
        c.fillStyle = "#2b3038";
        c.beginPath();
        c.moveTo(lx - 7, ly + 1);
        c.lineTo(lx - 4, ly - 5);
        c.lineTo(lx + 4, ly - 5);
        c.lineTo(lx + 7, ly + 1);
        c.closePath();
        c.fill();
        c.fillStyle = "#fffaf0";
        c.beginPath();
        c.ellipse(lx, ly + 1, 6.5, 2, 0, 0, Math.PI * 2);
        c.fill();
        e.p.light(fx, fy, 78, look.lampColor, strength);
      }
    }
  c.restore();
}
