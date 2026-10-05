// The territories' landmarks on the Empire Map (config/city.ts TERRITORIES):
// the port, the rail yard, the raw-material basin, the suburbs, the premium
// boulevard and the skyline, the cargo airport, the automotive campus, the
// test facility and the racing annex. Each block draws its flat ground
// (with the rest of the ground, so roads and vehicles go on top) and its
// buildings (depth-sorted like every other drawable). Pure drawing.
import { WORLD_MAP, type Landmark, type LandmarkKind } from "@/game/city/layout";
import { rand, sx, sy, type Painter } from "./iso";

type BBox = [number, number, number, number];
const bbox = (x: number, y: number, w: number, d: number, h: number): BBox => [sx(x, y + d) - 4, sy(x, y) - h - 30, sx(x + w, y) + 4, sy(x + w, y + d) + 4];

/** Where a landmark block sits inside its territory (0,0 = the territory's first block of that kind). */
const LOCAL = new Map<Landmark, { i: number; j: number; w: number; d: number }>();
function local(lm: Landmark) {
  const hit = LOCAL.get(lm);
  if (hit) return hit;
  const same = WORLD_MAP.landmarks.filter((l) => l.kind === lm.kind);
  const x0 = Math.min(...same.map((l) => l.bx));
  const y0 = Math.min(...same.map((l) => l.by));
  const x1 = Math.max(...same.map((l) => l.bx));
  const y1 = Math.max(...same.map((l) => l.by));
  const out = { i: lm.bx - x0, j: lm.by - y0, w: x1 - x0 + 1, d: y1 - y0 + 1 };
  LOCAL.set(lm, out);
  return out;
}

const GROUND: Record<LandmarkKind, string> = {
  testFacility: "#5f6b55",
  port: "#9aa1aa",
  railyard: "#8a8174",
  raw: "#a88f66",
  suburbs: "#76b862",
  boulevard: "#39414d",
  skyline: "#b9c1cb",
  airport: "#7fb064",
  campus: "#8fbf78",
  racingAnnex: "#5f9f4e",
};

const ASPHALT = "#3a404b";

// ───────────────────────────── ground ─────────────────────────────

/** The flat part of a landmark block: paving, runways, quarry terraces, rails, test roads. */
export function landmarkGround(p: Painter, lm: Landmark, t: number) {
  const { x, y, seed } = lm;
  const L = local(lm);
  p.quad(x - 0.5, y - 0.5, 7, 7, p.col(GROUND[lm.kind]));
  switch (lm.kind) {
    case "port": {
      // quay along the sea side, bollards and the berth markings
      if (L.i === 0) {
        // the dock basin dredged out of the shore, where the ships moor
        p.quad(x - 6.2, y - 0.5, 5.8, 7, p.col("#1f74ad"));
        p.line(x - 6.2, y - 0.5, x - 6.2, y + 6.5, p.col("#7dd3fc"), 1, 0, [6, 6]);
        p.quad(x - 0.5, y - 0.5, 0.6, 7, p.col("#6b7280"));
        for (let k = 0; k < 6; k++) p.quad(x - 0.3, y + k + 0.4, 0.18, 0.18, p.col("#facc15"));
      }
      for (let k = 0; k < 3; k++) p.line(x + 0.3 + k * 2, y, x + 0.3 + k * 2, y + 6, p.col("#f8fafc", -0.2), 1, 0, [6, 6]);
      break;
    }
    case "railyard": {
      for (let k = 0; k < 5; k++) {
        const ry = y + 0.6 + k * 1.15;
        p.quad(x - 0.5, ry - 0.08, 7, 0.36, p.col("#6b6257"));
        p.line(x - 0.5, ry, x + 6.5, ry, p.col("#cbd5e1", -0.3), 1.2);
        p.line(x - 0.5, ry + 0.2, x + 6.5, ry + 0.2, p.col("#cbd5e1", -0.3), 1.2);
      }
      break;
    }
    case "raw": {
      // an open-pit quarry: terraces stepping down
      const deep = rand(seed, 3) > 0.45;
      if (deep) for (let k = 0; k < 4; k++) p.quad(x + 0.4 + k * 0.55, y + 0.4 + k * 0.55, 5.2 - k * 1.1, 5.2 - k * 1.1, p.col("#a88f66", -0.08 * (k + 1)));
      else for (let k = 0; k < 3; k++) p.quad(x + 0.5 + k * 2, y + 0.6, 1.4, 4.8, p.col("#7c6a4c", -0.05 * k));
      break;
    }
    case "suburbs": {
      // quiet streets with sidewalks
      p.quad(x + 2.7, y - 0.5, 0.6, 7, p.col("#d3d9e0"));
      p.quad(x + 2.8, y - 0.5, 0.4, 7, p.col(ASPHALT));
      break;
    }
    case "boulevard": {
      for (let k = 0; k < 6; k++) p.quad(x + k + 0.45, y + 2.9, 0.1, 0.2, p.col("#f5c451"));
      p.quadStroke(x + 0.2, y + 0.2, 5.6, 5.6, p.col("#f5c451", -0.2), 1);
      break;
    }
    case "skyline":
      p.quad(x + 0.3, y + 0.3, 5.4, 5.4, p.col("#cfd6de"));
      break;
    case "airport": {
      // the runway crosses the second row of airport blocks, the taxiway the third
      if (L.j === 1) {
        p.quad(x - 0.5, y + 1.2, 7, 3.6, p.col(ASPHALT));
        for (let k = 0; k < 4; k++) p.quad(x + k * 1.7, y + 2.95, 0.9, 0.1, p.col("#f8fafc"));
        if (L.i === 0 || L.i === L.w - 1) for (let k = 0; k < 6; k++) p.quad(x + (L.i === 0 ? 0.2 : 5.3), y + 1.5 + k * 0.5, 0.5, 0.18, p.col("#f8fafc"));
        // edge lights
        for (let k = 0; k < 7; k++) {
          p.quad(x - 0.5 + k, y + 1.18, 0.08, 0.08, p.night > 0.3 ? "#fde68a" : "#cbd5e1");
          p.quad(x - 0.5 + k, y + 4.74, 0.08, 0.08, p.night > 0.3 ? "#fde68a" : "#cbd5e1");
        }
      } else if (L.j === 2) {
        p.quad(x - 0.5, y + 0.4, 7, 1.2, p.col("#4b5563"));
        p.line(x - 0.5, y + 1, x + 6.5, y + 1, p.col("#facc15"), 1.2);
      } else {
        p.quad(x - 0.5, y - 0.5, 7, 7, p.col("#a4abb5"));
      }
      break;
    }
    case "campus":
      p.quad(x + 0.6, y + 0.6, 4.8, 4.8, p.col("#d6dbe1"));
      p.quad(x + 1.4, y + 1.4, 3.2, 3.2, p.col("#7fbf6a"));
      break;
    case "testFacility": {
      // the test roads: a long straight with a braking zone, a slalom lane and a skid pad
      if (L.j === 0) {
        p.quad(x - 0.5, y + 2.3, 7, 1.4, p.col(ASPHALT));
        if (L.i === L.w - 1) for (let k = 0; k < 5; k++) p.quad(x + 4 + k * 0.4, y + 2.35, 0.2, 1.3, k % 2 ? "#ef4444" : "#f8fafc");
        p.line(x - 0.5, y + 3, x + 6.5, y + 3, p.col("#f8fafc", -0.2), 1, 0, [8, 8]);
      } else if (L.i === 0) {
        p.ellipse(x + 3, y + 3, 0, 2.4, p.col(ASPHALT), 0.5);
        p.ellipse(x + 3, y + 3, 0, 1.6, p.col(GROUND.testFacility), 0.5);
      } else {
        // terraced hill with the hairpin road
        for (let k = 0; k < 3; k++) p.quad(x + 0.2 + k * 0.5, y + 0.2 + k * 0.5, 5.6 - k, 5.6 - k, p.col("#6f7b5e", -0.05 * k));
        const c = p.ctx;
        c.beginPath();
        HILLCLIMB.forEach(([u, v], i) => (i ? c.lineTo(sx(x + u, y + v), sy(x + u, y + v)) : c.moveTo(sx(x + u, y + v), sy(x + u, y + v))));
        c.lineJoin = "round";
        c.strokeStyle = p.col(ASPHALT);
        c.lineWidth = 9;
        c.stroke();
        c.strokeStyle = p.col("#f8fafc", -0.2);
        c.lineWidth = 0.8;
        c.setLineDash([4, 5]);
        c.stroke();
        c.setLineDash([]);
      }
      break;
    }
    case "racingAnnex": {
      // the drag strip and the drift pad
      if (L.i === L.w - 1 || L.i === 0) {
        p.quad(x + 2.2, y - 0.5, 1.6, 7, p.col(ASPHALT));
        p.line(x + 3, y - 0.5, x + 3, y + 6.5, p.col("#f8fafc", -0.1), 1, 0, [4, 4]);
      } else {
        p.ellipse(x + 3, y + 3, 0, 2.6, p.col(ASPHALT), 0.5);
      }
      // tyre marks
      for (let k = 0; k < 3; k++) p.ellipse(x + 3, y + 3, 0, 1.2 + k * 0.4, "rgba(15,15,15,0.15)", 0.5);
      break;
    }
  }
  void t;
}

// ───────────────────────────── buildings ─────────────────────────────

const CONTAINER = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0891b2", "#7c3aed", "#ea580c"];

function containers(p: Painter, x: number, y: number, rows: number, cols: number, seed: number) {
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const h = 1 + Math.floor(rand(seed + i, j) * 3);
      for (let k = 0; k < h; k++) p.box(x + i * 0.62, y + j * 1.5, 0.55, 1.35, k * 8, 8, CONTAINER[Math.floor(rand(seed * 3 + i + k, j) * CONTAINER.length)]);
    }
}

function crane(p: Painter, x: number, y: number, t: number, seed: number) {
  // a ship-to-shore gantry: four legs, the boom out over the water
  for (const [dx, dy] of [[0, 0], [0, 1.6], [1.4, 0], [1.4, 1.6]]) p.box(x + dx, y + dy, 0.16, 0.16, 0, 86, "#f97316");
  p.box(x - 1.6, y - 0.05, 3.3, 1.8, 86, 6, "#ea580c", "#fb923c");
  const trolley = (Math.sin(t * 0.4 + seed * 9) + 1) / 2;
  p.box(x - 1.4 + trolley * 2.6, y + 0.6, 0.4, 0.6, 76, 10, "#334155");
}

function tower(p: Painter, x: number, y: number, w: number, d: number, h: number, glass: string, seed: number) {
  p.shadow(x, y, w, d, h);
  p.box(x, y, w, d, 0, h, glass, "#e2e8f0");
  p.windows(x, y, w, d, 0, h, Math.max(3, Math.floor(h / 14)), "#0f172a", p.night > 0.3 ? 0.6 : 0);
  if (rand(seed, 9) > 0.5) p.box(x + w * 0.3, y + d * 0.3, w * 0.4, d * 0.4, h, 14, "#94a3b8");
  if (h > 250) {
    // aircraft-warning mast on the tallest towers
    p.box(x + w / 2 - 0.05, y + d / 2 - 0.05, 0.1, 0.1, h, 40, "#cbd5e1");
    if (Math.sin(p.t * 3 + seed * 5) > 0) p.light(sx(x + w / 2, y + d / 2), sy(x + w / 2, y + d / 2, h + 40), 5, "#ef4444", 0.5 + p.night * 0.5);
  }
}

/** The hill climb's hairpins, in block tiles. */
const HILLCLIMB: [number, number][] = [[0.6, 5.4], [5.2, 5.4], [5.2, 4.1], [1.2, 4.1], [1.2, 2.8], [4.8, 2.8], [4.8, 1.6], [1.8, 1.6], [1.8, 0.6], [4.2, 0.6]];

/** A container ship along the quay (bow north), its deck stacked with boxes. */
function ship(p: Painter, x: number, y: number, seed: number, t: number) {
  const bob = Math.sin(t * 0.8 + seed * 4) * 0.8;
  p.ctx.save();
  p.ctx.translate(0, bob);
  p.box(x, y + 0.6, 2.4, 4.6, 0, 9, "#7f1d1d", "#9ca3af");
  p.box(x + 0.4, y, 1.6, 0.8, 0, 9, "#7f1d1d");
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 2; i++) {
      const h = 1 + Math.floor(rand(seed + i, j) * 2);
      for (let k = 0; k < h; k++) p.box(x + 0.2 + i * 1, y + 1 + j * 0.9, 0.9, 0.8, 9 + k * 7, 7, CONTAINER[Math.floor(rand(seed * 5 + i + k, j) * CONTAINER.length)]);
    }
  // bridge at the stern, its funnel smoking
  p.box(x + 0.4, y + 4.6, 1.6, 0.5, 9, 18, "#f8fafc", "#e5e7eb");
  p.box(x + 1, y + 5, 0.4, 0.3, 27, 8, "#1f2937");
  if (p.night > 0.3) p.light(sx(x + 1.2, y + 4.6), sy(x + 1.2, y + 4.6, 22), 8, "#fde68a", 0.6);
  p.ctx.restore();
}

/** Red-and-white lighthouse; the beam sweeps at night. */
function lighthouse(p: Painter, x: number, y: number, t: number) {
  for (let k = 0; k < 5; k++) p.box(x, y, 0.55, 0.55, k * 12, 12, k % 2 ? "#f8fafc" : "#dc2626");
  p.box(x - 0.1, y - 0.1, 0.75, 0.75, 60, 6, "#fde68a", "#1f2937");
  if (p.night > 0.2) {
    const c = p.ctx;
    const X = sx(x + 0.27, y + 0.27);
    const Y = sy(x + 0.27, y + 0.27, 63);
    const a = t * 1.2;
    const g = c.createRadialGradient(X, Y, 0, X, Y, 160);
    g.addColorStop(0, "rgba(254,240,138,0.45)");
    g.addColorStop(1, "rgba(254,240,138,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(X, Y);
    c.arc(X, Y, 160, a - 0.12, a + 0.12);
    c.closePath();
    c.fill();
  }
}

/** A sponsor hoarding on two legs. */
function sponsor(p: Painter, x: number, y: number, seed: number, text: string) {
  const col = ["#e11d48", "#2563eb", "#f59e0b", "#16a34a"][Math.floor(rand(seed, 3) * 4)];
  p.box(x, y, 0.08, 0.08, 0, 10, "#475569");
  p.box(x + 1.2, y, 0.08, 0.08, 0, 10, "#475569");
  p.box(x - 0.1, y, 1.5, 0.12, 10, 8, col);
  p.textLeft(text, x + 0.1, y + 0.12, 12, 6, "#ffffff");
}

function plane(p: Painter, x: number, y: number, z: number, color = "#f8fafc") {
  // fuselage along x, wings and tail
  p.box(x, y, 2.2, 0.32, z + 0.4 * 32, 9, color);
  p.box(x + 0.8, y - 0.9, 0.5, 2.1, z + 0.5 * 32, 2, "#cbd5e1");
  p.box(x + 1.9, y - 0.35, 0.25, 1, z + 0.6 * 32, 2, "#cbd5e1");
  p.box(x + 1.95, y + 0.1, 0.2, 0.12, z + 0.6 * 32, 12, "#ef4444");
}

function house(p: Painter, x: number, y: number, seed: number) {
  const walls = ["#fef3c7", "#f5f5f4", "#e0f2fe", "#fce7f3", "#ecfccb"];
  const roofs = ["#b91c1c", "#1d4ed8", "#92400e", "#475569", "#15803d"];
  p.shadow(x, y, 1.2, 1, 22);
  p.box(x, y, 1.2, 1, 0, 14, walls[Math.floor(rand(seed, 1) * walls.length)]);
  p.gable(x, y, 1.2, 1, 14, 9, roofs[Math.floor(rand(seed, 2) * roofs.length)]);
}

/** The buildings of a landmark block. */
function landmarkBuildings(p: Painter, lm: Landmark, t: number) {
  const { x, y, seed } = lm;
  const L = local(lm);
  switch (lm.kind) {
    case "port": {
      if (L.i === 0) {
        // a container ship moored along the quay, and the lighthouse on the north pier
        if (L.j < L.d - 1) ship(p, x - 5, y + 0.4, seed, t);
        if (L.j === 0) lighthouse(p, x - 0.2, y - 0.2, t);
      }
      containers(p, x + 1.2, y + 0.4, 3, 6, seed * 100);
      if (L.i === 0) crane(p, x + 0.2, y + 1 + (L.j % 2) * 2.4, t, seed);
      else {
        p.shadow(x + 1, y + 4.6, 4.2, 1.3, 30);
        p.box(x + 1, y + 4.6, 4.2, 1.3, 0, 26, "#cbd5e1");
        p.gable(x + 1, y + 4.6, 4.2, 1.3, 26, 8, "#0f766e");
      }
      break;
    }
    case "railyard": {
      for (let k = 0; k < 3; k++) {
        const wy = y + 0.5 + k * 2.3;
        const n = 3 + Math.floor(rand(seed, k) * 3);
        for (let i = 0; i < n; i++) p.box(x + 0.2 + i * 1.25, wy, 1.1, 0.42, 3, 11, ["#7c2d12", "#334155", "#a16207"][(i + k) % 3]);
      }
      p.box(x + 5.2, y + 5.3, 0.9, 0.6, 0, 18, "#e5e7eb");
      p.gable(x + 5.2, y + 5.3, 0.9, 0.6, 18, 6, "#475569");
      break;
    }
    case "raw": {
      if (rand(seed, 3) > 0.45) {
        // mine headframe and conveyor over the pit
        p.box(x + 4.7, y + 4.6, 0.8, 0.8, 0, 70, "#57534e");
        p.box(x + 4.6, y + 4.5, 1, 1, 70, 8, "#b45309");
        p.ellipse(x + 1.5, y + 5, 0, 0.9, "#57534e", 0.5);
        p.box(x + 1.2, y + 4.4, 0.6, 0.6, 0, 16, "#6b5b45");
      } else {
        // a steel/aluminium works: sheds, a chimney, ore heaps
        p.shadow(x + 0.5, y + 0.6, 3.6, 2, 40);
        p.box(x + 0.5, y + 0.6, 3.6, 2, 0, 34, "#a8a29e");
        p.sawtooth(x + 0.5, y + 0.6, 3.6, 2, 34, 4, 8, "#57534e");
        p.box(x + 4.5, y + 1, 0.5, 0.5, 0, 110, "#7c2d12");
        const puff = (t * 0.3 + seed) % 1;
        p.ellipse(x + 4.75, y + 1.25, 110 + puff * 40, 0.5 + puff, `rgba(200,200,200,${0.5 - puff * 0.45})`, 1);
        for (let k = 0; k < 3; k++) p.ellipse(x + 1 + k * 1.6, y + 4.4, 6, 0.7, ["#78716c", "#a8a29e", "#57534e"][k], 0.6);
      }
      break;
    }
    case "suburbs": {
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 3; j++) {
          const hx = x + (i === 0 ? 0.6 : 3.9);
          const hy = y + 0.4 + j * 1.95;
          if (rand(seed + i, j) < 0.82) house(p, hx, hy, seed * 10 + i * 3 + j);
          else p.tree(hx + 0.6, hy + 0.5, 1.1, seed + j);
          p.tree(hx + (i === 0 ? 1.6 : -0.4), hy + 1.3, 0.75, seed + i + j);
        }
      break;
    }
    case "boulevard": {
      // glass showrooms with cars in the windows
      for (const [dx, dy] of [[0.5, 0.5], [3.4, 0.5], [0.5, 3.4], [3.4, 3.4]] as const) {
        p.shadow(x + dx, y + dy, 2.1, 2.1, 30);
        p.box(x + dx, y + dy, 2.1, 2.1, 0, 26, "#a5d8ff", "#e2e8f0");
        p.box(x + dx + 0.1, y + dy + 0.1, 1.9, 1.9, 26, 3, "#f5c451");
        p.light(x + dx + 1, y + dy + 1, 1.6, "#fde68a", p.night * 0.6);
      }
      break;
    }
    case "skyline": {
      const k = rand(seed, 1);
      const tall = 160 + k * 220;
      tower(p, x + 0.6, y + 0.6, 2.2, 2.2, tall, ["#7fb2e5", "#9fc4e8", "#a5b4fc", "#67e8f9"][Math.floor(rand(seed, 2) * 4)], seed);
      tower(p, x + 3.4, y + 0.8, 1.9, 1.9, tall * (0.5 + rand(seed, 3) * 0.4), "#bcd6ee", seed + 1);
      tower(p, x + 0.9, y + 3.6, 1.8, 1.8, tall * (0.35 + rand(seed, 4) * 0.4), "#c3ccd6", seed + 2);
      p.tree(x + 4.4, y + 4.4, 1.1, seed);
      p.tree(x + 5.2, y + 3.6, 0.9, seed + 0.4);
      break;
    }
    case "airport": {
      if (L.j === 0) {
        if (L.i === 0) {
          // control tower
          p.box(x + 2.5, y + 2.5, 0.7, 0.7, 0, 120, "#e5e7eb");
          p.box(x + 2.2, y + 2.2, 1.3, 1.3, 120, 14, "#60a5fa", "#334155");
          p.light(x + 2.85, y + 2.85, 1, "#ef4444", p.night);
        } else {
          // terminal and cargo hangars
          p.shadow(x + 0.4, y + 0.6, 5.2, 2.6, 40);
          p.box(x + 0.4, y + 0.6, 5.2, 2.6, 0, L.i === 1 ? 30 : 40, L.i === 1 ? "#bfdbfe" : "#cbd5e1", L.i === 1 ? "#e2e8f0" : "#94a3b8");
          if (L.i !== 1) p.gable(x + 0.4, y + 0.6, 5.2, 2.6, 40, 12, "#64748b");
          plane(p, x + 1.6, y + 4.6, 0, ["#f8fafc", "#fde68a", "#e0f2fe"][L.i % 3]);
        }
      } else if (L.j === 1) {
        // a plane taking off down the runway
        const run = (t * 0.06 + seed) % 1;
        if (L.i === Math.floor(run * L.w)) plane(p, x + ((run * L.w) % 1) * 5, y + 2.85, run * 60, "#f8fafc");
      } else if (L.j >= 2) {
        if ((L.i + L.j) % 2 === 0) plane(p, x + 1.6, y + 2.9, 0, "#fef3c7");
        else {
          p.box(x + 0.6, y + 2.2, 4.6, 3, 0, 46, "#d1d5db", "#9ca3af");
          p.gable(x + 0.6, y + 2.2, 4.6, 3, 46, 16, "#6b7280");
        }
      }
      break;
    }
    case "campus": {
      if ((lm.bx + lm.by) % 3 === 0) {
        // headquarters tower with the logo crown
        tower(p, x + 1.8, y + 1.8, 2.4, 2.4, 260, "#93c5fd", seed);
        p.box(x + 2.3, y + 2.3, 1.4, 1.4, 274, 10, "#f5c451");
      } else if ((lm.bx + lm.by) % 3 === 1) {
        // R&D labs and the design centre's dome
        p.box(x + 1, y + 1, 3.6, 1.6, 0, 30, "#f8fafc", "#e2e8f0");
        p.windows(x + 1, y + 1, 3.6, 1.6, 0, 30, 2, "#0e7490");
        p.ellipse(x + 3, y + 4.2, 0, 1.2, "#e2e8f0", 0.5);
        p.ellipse(x + 3, y + 4.2, 14, 1, "#bae6fd", 0.6);
      } else {
        p.box(x + 1.2, y + 1.2, 2.6, 2.6, 0, 46, "#e0e7ff", "#c7d2fe");
        p.windows(x + 1.2, y + 1.2, 2.6, 2.6, 0, 46, 3, "#1e3a8a");
        p.tree(x + 4.6, y + 4.4, 1, seed);
      }
      break;
    }
    case "testFacility": {
      if (L.j === 0 && L.i === 0) {
        p.box(x + 0.6, y + 4.3, 2.2, 1.3, 0, 22, "#f1f5f9", "#cbd5e1");
        p.windows(x + 0.6, y + 4.3, 2.2, 1.3, 0, 22, 2, "#0f172a");
        p.box(x + 3.4, y + 4.6, 0.4, 0.4, 0, 54, "#334155");
        p.box(x + 3.2, y + 4.4, 0.8, 0.8, 54, 8, "#38bdf8");
      } else if (L.j > 0 && L.i === 0) {
        // slalom cones on the pad
        for (let k = 0; k < 6; k++) p.box(x + 1 + k * 0.8, y + 3 + Math.sin(k) * 0.3, 0.12, 0.12, 0, 4, "#f97316");
      } else if (L.j > 0) {
        // the hill climb: a car working up the hairpins, marshal flags at the bends
        const path = HILLCLIMB.map(([u, v]) => [x + u, y + v] as const);
        const f = (t * 0.08 + seed) % 1;
        const i = Math.floor(f * (path.length - 1));
        const k = f * (path.length - 1) - i;
        const [ax, ay] = path[i];
        const [bx, by] = path[i + 1];
        const cx = ax + (bx - ax) * k;
        const cy = ay + (by - ay) * k;
        const along = Math.abs(bx - ax) > Math.abs(by - ay);
        p.box(cx - (along ? 0.35 : 0.18), cy - (along ? 0.18 : 0.35), along ? 0.7 : 0.36, along ? 0.36 : 0.7, 0, 6, "#22d3ee");
        for (const [u, v] of HILLCLIMB.slice(1, -1)) p.box(x + u, y + v - 0.5, 0.06, 0.06, 0, 10, "#f8fafc");
      }
      if (L.j === 0) {
        // a car on the straight, back and forth
        const u = (Math.sin(t * 0.5 + seed * 3) + 1) / 2;
        p.box(x - 0.3 + u * 6, y + 2.75, 0.7, 0.35, 0, 7, "#ef4444");
      }
      break;
    }
    case "racingAnnex": {
      if (L.j === 0) {
        // grandstand and the media/VIP centre
        p.box(x + 0.5, y + 0.5, 1, 4.5, 0, 26, "#cbd5e1", "#94a3b8");
        for (let k = 0; k < 9; k++) p.person(x + 0.9, y + 0.8 + k * 0.48, ["#ef4444", "#3b82f6", "#facc15", "#22c55e"][k % 4], t * 2 + k);
        p.box(x + 4, y + 0.6, 1.6, 1.6, 0, 40, "#1e293b", "#f5c451");
      } else if (L.i === 0 || L.i === L.w - 1) {
        // drag strip: the start tree, sponsor boards and a dragster down the quarter mile
        p.box(x + 1.7, y + 0.4, 0.15, 0.15, 0, 22, "#334155");
        const lit = Math.floor((t * 2 + seed) % 4);
        for (let k = 0; k < 3; k++) p.box(x + 1.62, y + 0.32, 0.3, 0.3, 8 + k * 4, 3, k < lit ? (k === 2 ? "#22c55e" : "#facc15") : "#1f2937");
        sponsor(p, x + 4.4, y + 1, seed, "SPEED");
        sponsor(p, x + 4.4, y + 4, seed + 1, "OIL");
        const run = (t * 0.25 + seed) % 1;
        if (run < 0.7) p.box(x + 2.75, y - 0.5 + (run / 0.7) * 7, 0.45, 0.9, 0, 6, L.i === 0 ? "#ef4444" : "#facc15");
      } else if (L.j === 1) {
        // media centre with its dishes, the VIP lounge and sponsor boards
        p.shadow(x + 0.5, y + 0.5, 2.4, 2, 40);
        p.box(x + 0.5, y + 0.5, 2.4, 2, 0, 34, "#1e293b", "#334155");
        p.windows(x + 0.5, y + 0.5, 2.4, 2, 0, 34, 3, "#38bdf8", p.night > 0.3 ? 0.8 : 0.2);
        for (let k = 0; k < 2; k++) p.ellipse(x + 1.1 + k * 1.1, y + 1.4, 40, 0.35, "#e2e8f0", 0.4);
        p.shadow(x + 3.4, y + 0.6, 2.2, 1.8, 24);
        p.box(x + 3.4, y + 0.6, 2.2, 1.8, 0, 20, "#a5d8ff", "#f5c451");
        p.box(x + 3.3, y + 0.5, 2.4, 2, 20, 1.2, "#f5c451");
        p.tag("VIP", x + 4.5, y + 1.5, 26, { bg: "#f5c451", fg: "#111827", size: 7 });
        sponsor(p, x + 0.8, y + 4.6, seed, "TYRES");
        sponsor(p, x + 3.6, y + 4.6, seed + 2, "FUEL");
      } else {
        // a drift car circling the pad under the sponsor arch
        const a = t * 1.3 + seed * 5;
        p.box(x + 3 + Math.cos(a) * 1.8, y + 3 + Math.sin(a) * 1.8, 0.6, 0.35, 0, 7, "#a855f7");
        p.ellipse(x + 3 + Math.cos(a - 0.4) * 1.8, y + 3 + Math.sin(a - 0.4) * 1.8, 2, 0.5, "rgba(226,232,240,0.45)", 1);
        p.box(x + 0.4, y + 0.3, 0.15, 0.15, 0, 26, "#e11d48");
        p.box(x + 5.4, y + 0.3, 0.15, 0.15, 0, 26, "#e11d48");
        p.box(x + 0.4, y + 0.3, 5.15, 0.15, 26, 4, "#e11d48");
      }
      break;
    }
  }
}

const HEIGHT: Record<LandmarkKind, number> = {
  testFacility: 70,
  port: 120,
  railyard: 30,
  raw: 160,
  suburbs: 50,
  boulevard: 40,
  skyline: 420,
  airport: 140,
  campus: 300,
  racingAnnex: 60,
};

/** The drawables of every landmark block: depth-sorted with the rest of the map. */
export function landmarkDrawables() {
  return WORLD_MAP.landmarks.map((lm) => ({
    depth: lm.x + 3 + lm.y + 3,
    zone: lm.territory as string,
    // the port's ships lie off the quay, in the sea
    bbox: lm.kind === "port" ? bbox(lm.x - 6, lm.y - 1, 13, 8, HEIGHT.port) : bbox(lm.x - 2, lm.y - 1, 9, 8, HEIGHT[lm.kind]),
    draw: (p: Painter, info: { t: number }) => landmarkBuildings(p, lm, info.t),
  }));
}
