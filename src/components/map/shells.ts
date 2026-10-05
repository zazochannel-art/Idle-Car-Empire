// Unbought plots on the Empire Map: each one already shows the bare bones of
// the building it is zoned for — unfinished walls with empty window holes
// and rebar sticking out, on its own ground, in its own layout and material,
// with the leftovers of its trade lying about (tyres by a Tire Factory plot,
// glass sheets by a Glass Factory plot…). No two plots look alike. Pure
// drawing; the plot's status (available / owned / locked) is drawn on top.
import type { Plot } from "@/game/city/layout";
import type { StructureType } from "@/game/types";
import { rand, sx, sy, type Painter } from "./iso";
import { drum, tireStack } from "./props";

/** Wall materials: face colour and the colour of its top course. */
const MATERIALS = [
  { face: "#a8a29e", top: "#d6d3d1" }, // poured concrete
  { face: "#b45309", top: "#c2410c" }, // red brick
  { face: "#d6d3d1", top: "#e7e5e4" }, // breeze blocks
  { face: "#ca8a04", top: "#d97706" }, // yellow brick
  { face: "#78716c", top: "#a8a29e" }, // dark blocks
];

/** Ground of the lot: gravel, packed earth, an old slab, rough grass. */
const GROUNDS = ["#b8b0a2", "#a88f6a", "#c4c8cc", "#9fb07a"];

/** How each kind of building's shell is laid out (walls standing so far). */
type Layout = "L" | "U" | "ring" | "rows" | "frame";
const LAYOUTS: Layout[] = ["L", "U", "ring", "rows", "frame"];

const hashStr = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

/**
 * A wall along x (alongX) or y, built in courses that stop at different
 * heights (the top is ragged), with window holes and rebar on the top.
 */
function wall(p: Painter, x: number, y: number, len: number, alongX: boolean, h: number, mat: (typeof MATERIALS)[number], seed: number) {
  const seg = 0.42;
  const n = Math.max(1, Math.round(len / seg));
  const step = len / n;
  const t = 0.16;
  for (let k = 0; k < n; k++) {
    // the courses stop at uneven heights: a smooth ragged profile plus a little noise
    const u = k / Math.max(1, n - 1);
    const profile = 0.62 + 0.38 * Math.sin(u * Math.PI * (1 + (seed % 3)) + seed);
    const hk = Math.max(4, h * profile * (0.88 + rand(seed, k + 50) * 0.2));
    const wx = alongX ? x + k * step : x;
    const wy = alongX ? y : y + k * step;
    const [w, d] = alongX ? [step * 0.98, t] : [t, step * 0.98];
    const window = k % 3 === 1 && hk > 12;
    if (window) {
      // a sill, then an empty hole (the lintel is not in yet)
      p.box(wx, wy, w, d, 0, hk * 0.35, mat.face, mat.top);
    } else {
      p.box(wx, wy, w, d, 0, hk, mat.face, mat.top, false);
      // rebar left sticking out of the top course
      if (rand(seed, k + 90) > 0.55) {
        const cx = wx + w / 2;
        const cy = wy + d / 2;
        const c = p.ctx;
        c.strokeStyle = p.col("#7c2d12");
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(sx(cx, cy), sy(cx, cy, hk));
        c.lineTo(sx(cx, cy), sy(cx, cy, hk + 5));
        c.stroke();
      }
    }
  }
}

/** Bare steel columns (no walls yet), some with a beam across. */
function columns(p: Painter, X: number, Y: number, W: number, D: number, h: number, seed: number) {
  const cols = Math.max(2, Math.round(W / 1.1));
  const rows = Math.max(2, Math.round(D / 1.1));
  for (let i = 0; i <= cols; i++)
    for (let j = 0; j <= rows; j++) {
      if (i > 0 && i < cols && j > 0 && j < rows) continue;
      const hh = h * (0.55 + rand(seed, i * 7 + j) * 0.45);
      p.box(X + (W * i) / cols - 0.05, Y + (D * j) / rows - 0.05, 0.1, 0.1, 0, hh, "#64748b", "#94a3b8");
    }
  p.line(X, Y, X + W, Y, p.col("#475569"), 1.6, h * 0.55);
  p.line(X, Y, X, Y + D, p.col("#475569"), 1.6, h * 0.55);
}

/** What lies about a plot, by the trade it is zoned for. */
function leftovers(p: Painter, plot: Plot, use: StructureType, seed: number) {
  const x = plot.x + plot.w - 1.15;
  const y = plot.y + plot.d - 1.05;
  const c = p.ctx;
  switch (use) {
    case "tireFactory":
    case "wheelFactory":
      tireStack(p, x, y, 3);
      tireStack(p, x + 0.45, y + 0.2, 2);
      break;
    case "glassFactory":
      for (let k = 0; k < 4; k++) p.box(x + k * 0.12, y, 0.04, 0.7, 0, 9, "#bae6fd", "#e0f2fe");
      break;
    case "paintFactory":
      drum(p, x, y, "#db2777");
      drum(p, x + 0.35, y + 0.1, "#2563eb");
      drum(p, x + 0.15, y + 0.4, "#facc15");
      break;
    case "electronicsFactory":
    case "batteryFactory":
      for (let k = 0; k < 2; k++) {
        p.ellipse(x + k * 0.5, y + 0.3, 6, 0.28, p.col(use === "batteryFactory" ? "#65a30d" : "#15803d"), 0.9);
        p.ellipse(x + k * 0.5, y + 0.3, 6.2, 0.1, p.col("#1f2937"), 0.9);
      }
      break;
    case "engineFactory":
    case "transmissionFactory":
      // pipes in a stack
      for (let k = 0; k < 3; k++) p.box(x, y + k * 0.18, 0.9, 0.14, k % 2 ? 1.4 : 0, 1.6, "#9ca3af", "#cbd5e1");
      break;
    case "assemblyPlant":
    case "fleetPlant":
      // steel beams waiting for the crane
      for (let k = 0; k < 3; k++) p.box(x - 0.3, y + k * 0.2, 1.3, 0.12, 0, 1.4 + k * 1.4, "#475569", "#64748b");
      break;
    case "bodyWorks":
    case "partsFactory":
      for (let k = 0; k < 4; k++) p.box(x, y, 0.8, 0.55, k * 1.2, 1.1, k % 2 ? "#94a3b8" : "#cbd5e1");
      break;
    case "interiorFactory":
      for (let k = 0; k < 3; k++) {
        p.ellipse(x + k * 0.3, y + 0.25, 3, 0.16, p.col(["#a16207", "#7c2d12", "#d6d3d1"][k]), 1);
        p.box(x + k * 0.3 - 0.12, y, 0.24, 0.5, 0, 3, ["#a16207", "#7c2d12", "#d6d3d1"][k]);
      }
      break;
    case "suspensionFactory":
    case "brakeFactory":
      for (let k = 0; k < 3; k++) {
        const X = sx(x + k * 0.28, y + 0.2);
        const Y = sy(x + k * 0.28, y + 0.2, 3);
        c.strokeStyle = p.col(use === "brakeFactory" ? "#991b1b" : "#d97706");
        c.lineWidth = 1.4;
        c.beginPath();
        c.ellipse(X, Y, 3, 1.6, 0, 0, Math.PI * 2);
        c.stroke();
      }
      break;
    default:
      // a pallet of blocks and a cement bag or two
      p.box(x, y, 0.6, 0.45, 0, 1, "#b45309", "#d97706");
      p.box(x + 0.04, y + 0.04, 0.52, 0.37, 1, 2.6, "#d6d3d1");
      if (rand(seed, 3) > 0.5) p.box(x + 0.7, y + 0.1, 0.3, 0.22, 0, 1.4, "#e7e5e4", "#f5f5f4");
  }
}

/**
 * The shell of an unbuilt plot: its own ground, the walls (or bare frame)
 * left standing for the building it is zoned for, weeds and leftovers.
 */
export function drawShell(p: Painter, plot: Plot, use: StructureType, seed: number) {
  const key = hashStr(`${plot.id}:${use}`);
  const mat = MATERIALS[(key + Math.floor(seed * 7)) % MATERIALS.length];
  const ground = GROUNDS[(key >> 2) % GROUNDS.length];
  const layout = LAYOUTS[(key + Math.floor(seed * 11)) % LAYOUTS.length];
  const big = plot.big || plot.size === "large" || plot.size === "mega";
  const H = (big ? 40 : 24) + rand(seed, 41) * (big ? 22 : 14);
  const inset = 0.45 + rand(seed, 42) * 0.25;
  const X = plot.x + inset;
  const Y = plot.y + inset;
  const W = plot.w - inset * 2 - 0.35;
  const D = plot.d - inset * 2 - 0.35;

  // the lot's ground and the outline of the planned footprint
  p.quad(plot.x + 0.3, plot.y + 0.3, plot.w - 0.6, plot.d - 0.6, p.col(ground));
  p.quad(X, Y, W, D, p.col("#9ca3af", 0.05));
  p.quadStroke(X, Y, W, D, p.col("#6b7280"), 1);

  // the walls standing so far — back walls first so the inside stays visible
  if (layout === "frame") columns(p, X, Y, W, D, H, seed);
  else {
    wall(p, X, Y, W, true, H, mat, key);
    if (layout !== "rows") wall(p, X, Y + 0.16, D - 0.16, false, H * 0.9, mat, key + 1);
    if (layout === "rows") wall(p, X, Y + D * 0.55, W * 0.8, true, H * 0.6, mat, key + 2);
    if (layout === "U" || layout === "ring") wall(p, X + W - 0.16, Y + 0.16, D * (layout === "ring" ? 0.7 : 1) - 0.16, false, H * 0.65, mat, key + 3);
    // a low front stub: the front wall has only just been started
    if (layout === "ring") wall(p, X, Y + D - 0.16, W * 0.45, true, H * 0.3, mat, key + 4);
  }

  // weeds through the gravel
  if (p.zoom >= 0.6)
    for (let k = 0; k < 5; k++) {
      const wx = plot.x + 0.4 + rand(seed, k + 60) * (plot.w - 0.8);
      const wy = plot.y + 0.4 + rand(seed, k + 70) * (plot.d - 0.8);
      p.ellipse(wx, wy, 0, 0.12 + rand(seed, k) * 0.08, p.col("#4d7c0f"), 0.5);
    }
  if (p.zoom >= 0.7) leftovers(p, plot, use, seed);
}
