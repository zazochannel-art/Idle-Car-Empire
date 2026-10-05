// The rest of the living world on the Empire Map: what moves without being
// part of the economy. Airliners crossing the region and landing at the cargo
// airport, a helicopter over the skyline, flocks of birds, boats on the river,
// a tug in the port basin with a straddle carrier on the quay, and tractors
// working the fields. Everything is a pure function of the clock, so it costs
// no state and nothing to save. Pure drawing.
import { RIVER, ROAD_STEP, WORLD, WORLD_MAP, type Landmark } from "@/game/city/layout";
import { rand, sx, sy, type Painter } from "./iso";
import { isLand } from "./terrain";

export interface LifeMover {
  depth: number;
  x: number;
  y: number;
  draw: (p: Painter) => void;
}

/** Tile direction → unit vector on screen (iso projection, before zoom). */
function screenDir(dx: number, dy: number): [number, number] {
  const ux = (dx - dy) * 32;
  const uy = (dx + dy) * 16;
  const l = Math.hypot(ux, uy) || 1;
  return [ux / l, uy / l];
}

const blink = (t: number, phase: number, every = 1.3) => (t + phase) % every < 0.12;

// ───────────────────────────── the sky ─────────────────────────────

interface Flight {
  x: number;
  y: number;
  /** Height above the ground, screen px. */
  z: number;
  dx: number;
  dy: number;
  /** Wingspan, screen px. */
  span: number;
  color: string;
  tail: string;
}

/** An airliner seen from above, in screen space: fuselage, swept wings, tailplane. */
function jet(p: Painter, f: Flight, t: number, seed: number) {
  const c = p.ctx;
  const [ux, uy] = screenDir(f.dx, f.dy);
  const X = sx(f.x, f.y);
  const Y = sy(f.x, f.y, f.z);
  const s = f.span / 2;
  c.save();
  c.translate(X, Y);
  c.transform(ux, uy, -uy, ux, 0, 0);
  // squash across the heading a little: the map is seen at an angle
  c.scale(1, 0.75);
  c.fillStyle = p.col(f.color);
  // wings
  c.beginPath();
  c.moveTo(s * 0.18, 0);
  c.lineTo(-s * 0.25, s);
  c.lineTo(-s * 0.42, s);
  c.lineTo(-s * 0.2, 0);
  c.lineTo(-s * 0.42, -s);
  c.lineTo(-s * 0.25, -s);
  c.closePath();
  c.fill();
  // tailplane
  c.beginPath();
  c.moveTo(-s * 0.78, 0);
  c.lineTo(-s * 0.98, s * 0.38);
  c.lineTo(-s * 1.05, s * 0.38);
  c.lineTo(-s * 0.98, 0);
  c.lineTo(-s * 1.05, -s * 0.38);
  c.lineTo(-s * 0.98, -s * 0.38);
  c.closePath();
  c.fill();
  // fuselage
  c.beginPath();
  c.ellipse(-s * 0.35, 0, s * 0.72, s * 0.1, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = p.col(f.tail);
  c.fillRect(-s * 1.06, -s * 0.05, s * 0.2, s * 0.1);
  c.restore();
  if (p.night > 0.25) {
    // red port, green starboard, white strobe
    const wing = (k: number): [number, number] => [X - uy * s * k * 0.75 - ux * s * 0.3, Y + ux * s * k * 0.75 - uy * s * 0.3];
    const [lx, ly] = wing(-1);
    const [rx, ry] = wing(1);
    p.lights.push({ x: lx, y: ly, r: 6, color: "#ef4444", a: p.night });
    p.lights.push({ x: rx, y: ry, r: 6, color: "#22c55e", a: p.night });
    if (blink(t, seed)) p.lights.push({ x: X, y: Y, r: 14, color: "#ffffff", a: 1 });
  }
}

/** Its shadow on the ground, offset away from the sun and softer the higher it flies. */
function jetShadow(p: Painter, f: Flight) {
  const c = p.ctx;
  const off = f.z * 0.35;
  const [ux, uy] = screenDir(f.dx, f.dy);
  const X = sx(f.x, f.y) + off * 0.5;
  const Y = sy(f.x, f.y) + off * 0.15;
  const s = f.span / 2;
  c.save();
  c.globalAlpha = Math.max(0.05, 0.22 - f.z / 2000);
  c.fillStyle = "#0f172a";
  c.translate(X, Y);
  c.transform(ux, uy * 0.5, -uy, ux * 0.5, 0, 0);
  c.beginPath();
  c.ellipse(-s * 0.35, 0, s * 0.72, s * 0.12, 0, 0, Math.PI * 2);
  c.moveTo(s * 0.1, 0);
  c.lineTo(-s * 0.3, s);
  c.lineTo(-s * 0.45, s);
  c.lineTo(-s * 0.3, 0);
  c.lineTo(-s * 0.45, -s);
  c.lineTo(-s * 0.3, -s);
  c.closePath();
  c.fill();
  c.restore();
}

/** The runway: the middle row of the airport's blocks, west to east. */
const RUNWAY = (() => {
  const blocks = WORLD_MAP.landmarks.filter((l) => l.kind === "airport");
  if (!blocks.length) return null;
  const by0 = Math.min(...blocks.map((l) => l.by));
  const row = blocks.filter((l) => l.by === by0 + 1);
  if (!row.length) return null;
  return {
    x0: Math.min(...row.map((l) => l.x)) - 0.5,
    x1: Math.max(...row.map((l) => l.x)) + 6.5,
    y: row[0].y + 3,
    territory: row[0].territory as string,
  };
})();

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Everything in the air at time t (screen px heights). */
function flights(t: number, unlocked: ReadonlySet<string>): Flight[] {
  const out: Flight[] = [];
  // two airliners cruising high over the region, each crossing in ~70 s
  const routes = [
    { a: [-30, WORLD * 0.3], b: [WORLD + 30, WORLD * 0.75], period: 70, z: 420, color: "#f8fafc", tail: "#2563eb" },
    { a: [WORLD * 0.85, -30], b: [WORLD * 0.15, WORLD + 30], period: 85, z: 360, color: "#f1f5f9", tail: "#dc2626" },
  ];
  for (const [i, r] of routes.entries()) {
    const k = ((t + i * 31) % r.period) / r.period;
    const dx = r.b[0] - r.a[0];
    const dy = r.b[1] - r.a[1];
    const l = Math.hypot(dx, dy);
    out.push({ x: r.a[0] + dx * k, y: r.a[1] + dy * k, z: r.z, dx: dx / l, dy: dy / l, span: 84, color: r.color, tail: r.tail });
  }
  // a cargo plane landing at the airport once it is open: down the glide
  // slope from the west, touchdown, then rolling out down the runway
  if (RUNWAY && unlocked.has(RUNWAY.territory)) {
    const period = 48;
    const k = ((t + 17) % period) / period;
    const touch = RUNWAY.x0 + 3;
    const roll = RUNWAY.x1 - 6;
    if (k < 0.55) {
      const a = k / 0.55;
      const x = touch - 60 * (1 - a);
      out.push({ x, y: RUNWAY.y, z: 260 * Math.pow(1 - a, 1.2), dx: 1, dy: 0, span: 96, color: "#fde68a", tail: "#0f766e" });
    } else if (k < 0.8) {
      const a = smooth(0.55, 0.8, k);
      out.push({ x: touch + (roll - touch) * (1 - Math.pow(1 - a, 2)), y: RUNWAY.y, z: 6, dx: 1, dy: 0, span: 96, color: "#fde68a", tail: "#0f766e" });
    }
  }
  return out;
}

/** The skyline's helicopter: a slow circle over the towers, rotor turning. */
function helicopter(p: Painter, cx: number, cy: number, t: number) {
  const a = t * 0.25;
  const x = cx + Math.cos(a) * 5;
  const y = cy + Math.sin(a) * 5;
  const z = 300 + Math.sin(t * 0.7) * 10;
  const [ux, uy] = screenDir(-Math.sin(a), Math.cos(a));
  const X = sx(x, y);
  const Y = sy(x, y, z);
  const c = p.ctx;
  // shadow far below
  c.fillStyle = "rgba(15,23,42,0.12)";
  c.beginPath();
  c.ellipse(sx(x, y) + 40, sy(x, y) + 12, 13, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(X, Y);
  c.transform(ux, uy, -uy, ux, 0, 0);
  c.scale(1.9, 1.4);
  c.fillStyle = p.col("#dc2626");
  c.beginPath();
  c.ellipse(0, 0, 6, 3.2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillRect(-14, -0.8, 9, 1.6);
  c.fillStyle = p.col("#bae6fd");
  c.beginPath();
  c.ellipse(3, 0, 2.6, 2.2, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // the rotor disc and its blades
  c.strokeStyle = "rgba(30,41,59,0.55)";
  c.lineWidth = 1.2;
  for (let b = 0; b < 2; b++) {
    const r = t * 22 + (b * Math.PI) / 2;
    c.beginPath();
    c.moveTo(X - Math.cos(r) * 21, Y - 6 - Math.sin(r) * 10);
    c.lineTo(X + Math.cos(r) * 21, Y - 6 + Math.sin(r) * 10);
    c.stroke();
  }
  c.fillStyle = "rgba(148,163,184,0.12)";
  c.beginPath();
  c.ellipse(X, Y - 6, 21, 10, 0, 0, Math.PI * 2);
  c.fill();
  if (p.night > 0.25 && blink(t, 0.4, 1)) p.lights.push({ x: X, y: Y, r: 10, color: "#ef4444", a: 1 });
}

/** A flock in a loose V, wings flapping. */
function flock(p: Painter, x: number, y: number, z: number, dx: number, dy: number, t: number, n: number) {
  const [ux, uy] = screenDir(dx, dy);
  const X = sx(x, y);
  const Y = sy(x, y, z);
  const c = p.ctx;
  c.strokeStyle = p.night > 0.5 ? "rgba(226,232,240,0.5)" : "rgba(30,41,59,0.7)";
  c.lineWidth = 1.1;
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const bx = X - ux * row * 9 - uy * side * row * 7;
    const by = Y - uy * row * 9 + ux * side * row * 7;
    const flap = Math.sin(t * 9 + i * 1.7) * 2;
    c.beginPath();
    c.moveTo(bx - 3.5, by - flap);
    c.quadraticCurveTo(bx - 1.5, by - 1.5, bx, by);
    c.quadraticCurveTo(bx + 1.5, by - 1.5, bx + 3.5, by - flap);
    c.stroke();
  }
}

const SKYLINE = (() => {
  const b = WORLD_MAP.landmarks.filter((l) => l.kind === "skyline");
  if (!b.length) return null;
  return { x: b.reduce((a, l) => a + l.x + 3, 0) / b.length, y: b.reduce((a, l) => a + l.y + 3, 0) / b.length, territory: b[0].territory as string };
})();

/** Shadows of whatever flies, drawn with the ground (under the buildings). */
export function drawSkyShadows(p: Painter, t: number, unlocked: ReadonlySet<string>) {
  if (p.zoom < 0.2) return;
  for (const f of flights(t, unlocked)) jetShadow(p, f);
}

/** Everything in the air, drawn over the city. */
export function drawSky(p: Painter, t: number, unlocked: ReadonlySet<string>, low: boolean) {
  for (const [i, f] of flights(t, unlocked).entries()) jet(p, f, t, i * 0.37);
  if (low) return;
  if (SKYLINE && unlocked.has(SKYLINE.territory)) helicopter(p, SKYLINE.x, SKYLINE.y, t);
  // birds are only seen close up
  if (p.zoom < 0.5) return;
  for (let i = 0; i < 4; i++) {
    const period = 90 + i * 17;
    const k = ((t + i * 41) % period) / period;
    const y0 = WORLD * (0.15 + i * 0.22);
    flock(p, -10 + (WORLD + 20) * k, y0 + Math.sin(t * 0.1 + i) * 6, 150 + i * 25, 1, 0.15 * (i % 2 ? 1 : -1), t, 5 + (i % 3) * 2);
  }
}

// ───────────────────────────── on the water and the land ─────────────────────────────

/** A small boat heading along y (+1 downstream, -1 up). */
function riverBoat(p: Painter, x: number, y: number, dir: 1 | -1, kind: number, t: number) {
  const bob = Math.sin(t * 2 + x) * 0.4;
  for (let s = 1; s <= 3; s++) p.ellipse(x, y - dir * (0.6 + s * 0.45), 0, 3 + s * 2, `rgba(255,255,255,${0.3 - s * 0.08})`, 0.5);
  if (kind === 0) {
    // a barge with two containers
    p.box(x - 0.28, y - 0.9, 0.56, 1.8, -1 + bob, 4, "#334155", "#475569");
    p.box(x - 0.22, y - 0.6, 0.44, 0.5, 3 + bob, 5, "#f59e0b");
    p.box(x - 0.22, y - 0.05, 0.44, 0.5, 3 + bob, 5, "#2563eb");
    p.box(x - 0.2, y + (dir > 0 ? -0.85 : 0.5), 0.4, 0.3, 3 + bob, 6, "#f8fafc");
  } else {
    // a little motorboat
    p.box(x - 0.18, y - 0.45, 0.36, 0.9, -1 + bob, 3, kind === 1 ? "#f8fafc" : "#ef4444", "#e2e8f0");
    p.box(x - 0.12, y - 0.1 * dir, 0.24, 0.25, 2 + bob, 3, "#bae6fd");
  }
  if (p.night > 0.35) p.light(sx(x, y), sy(x, y, 6), 7, "#fde68a", 0.6);
}

/** The port's tug, looping around the dock basin. */
function tug(p: Painter, x: number, y: number, dx: number, dy: number, t: number) {
  const bob = Math.sin(t * 1.6) * 0.5;
  for (let s = 1; s <= 3; s++) p.ellipse(x - dx * (0.5 + s * 0.4), y - dy * (0.5 + s * 0.4), 0, 3 + s * 2, `rgba(255,255,255,${0.28 - s * 0.07})`, 0.5);
  const along = Math.abs(dx) > Math.abs(dy);
  const [w, d] = along ? [1, 0.5] : [0.5, 1];
  p.box(x - w / 2, y - d / 2, w, d, -1 + bob, 4, "#b91c1c", "#1f2937");
  p.box(x - 0.18, y - 0.18, 0.36, 0.36, 3 + bob, 7, "#f8fafc");
  p.box(x - 0.06, y - 0.06, 0.12, 0.12, 10 + bob, 5, "#1f2937");
}

/** A straddle carrier on the quay with a container slung under it. */
function straddle(p: Painter, x: number, y: number, carrying: boolean) {
  for (const [ox, oy] of [[0, 0], [0.62, 0], [0, 0.82], [0.62, 0.82]]) p.box(x + ox, y + oy, 0.1, 0.1, 0, 20, "#facc15");
  p.box(x, y, 0.72, 0.92, 20, 4, "#eab308", "#fde047");
  if (carrying) p.box(x + 0.13, y + 0.06, 0.46, 0.8, 7, 9, "#2563eb");
}

/** A tractor with its trailer, ploughing a field. */
function tractor(p: Painter, x: number, y: number, dir: 1 | -1, t: number) {
  // dust behind
  for (let s = 1; s <= 3; s++) p.circle(x - dir * (0.5 + s * 0.35), y, 2 + s * 1.5, 1.5 + s, `rgba(180,150,100,${0.3 - s * 0.08})`);
  p.box(x - 0.3, y - 0.2, 0.6, 0.4, 2, 5, "#16a34a", "#22c55e");
  p.box(x + (dir > 0 ? -0.25 : 0.05), y - 0.16, 0.2, 0.32, 7, 6, "#bae6fd");
  for (const oy of [-0.24, 0.2]) p.box(x + (dir > 0 ? -0.28 : 0.1), y + oy, 0.2, 0.06, 0, 6, "#1f2937");
  p.box(x - dir * 0.75 - 0.2, y - 0.22, 0.4, 0.44, 0.5, 3, "#a16207");
  if (p.night > 0.35) p.light(sx(x + dir * 0.35, y), sy(x + dir * 0.35, y, 4), 9, "#fef3c7", 0.6);
  void t;
}

const PORT = WORLD_MAP.landmarks.filter((l) => l.kind === "port");
/** The westmost port blocks hold the dock basin. */
const DOCKS: Landmark[] = (() => {
  if (!PORT.length) return [];
  const x0 = Math.min(...PORT.map((l) => l.bx));
  return PORT.filter((l) => l.bx === x0);
})();
const FARMS = WORLD_MAP.scenery.filter((s) => s.kind === "farm").filter((_, i) => i % 2 === 0).slice(0, 8);
/** River x (its middle) and the stretch of it running over land. */
const RIVER_X = RIVER * ROAD_STEP + 0.5;
const RIVER_SPAN = (() => {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let y = -8; y < WORLD + 8; y += 0.5)
    if (isLand(RIVER_X, y)) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  // run on a little past the mouth, into the sea
  return Number.isFinite(y0) ? { y0: y0 - 4, y1: y1 + 4 } : null;
})();

/** Boats, the port's workers and the farms' tractors at time t (depth-sorted with the traffic). */
export function lifeMovers(t: number, unlocked: ReadonlySet<string>, density = 1, zoom = 1): LifeMover[] {
  const out: LifeMover[] = [];
  if (zoom < 0.3) return out;
  if (RIVER_SPAN) {
    const len = RIVER_SPAN.y1 - RIVER_SPAN.y0;
    const n = Math.max(1, Math.round(3 * density));
    for (let i = 0; i < n; i++) {
      const dir: 1 | -1 = i % 2 ? -1 : 1;
      const k = ((t * (0.55 + i * 0.12) + i * len * 0.37) % len) / len;
      const y = dir > 0 ? RIVER_SPAN.y0 + k * len : RIVER_SPAN.y1 - k * len;
      // keep right on the river
      const x = RIVER_X + dir * 0.32;
      out.push({ depth: x + y, x, y, draw: (p) => riverBoat(p, x, y, dir, i % 3, t) });
    }
  }
  for (const [i, lm] of DOCKS.entries()) {
    if (!unlocked.has(lm.territory)) continue;
    // the tug: a rounded loop in the basin, west of the quay
    const k = ((t * 0.035 + i * 0.4) % 1) * Math.PI * 2;
    const cx = lm.x - 3.4;
    const cy = lm.y + 3;
    const x = cx + Math.cos(k) * 1.6;
    const y = cy + Math.sin(k) * 2.6;
    const dx = -Math.sin(k) * 1.6;
    const dy = Math.cos(k) * 2.6;
    const l = Math.hypot(dx, dy) || 1;
    out.push({ depth: x + y, x, y, draw: (p) => tug(p, x, y, dx / l, dy / l, t) });
  }
  for (const [i, lm] of PORT.entries()) {
    if (!unlocked.has(lm.territory) || i % 2) continue;
    // a straddle carrier shuttling boxes along the quay, laden one way
    const k = (t * 0.05 + rand(lm.seed, 2)) % 2;
    const back = k > 1;
    const y = lm.y + 0.2 + (back ? 2 - k : k) * 5;
    const x = lm.x + 1.1 + Math.floor(rand(lm.seed, 3) * 3) * 2;
    out.push({ depth: x + 0.5 + y + 0.5, x, y, draw: (p) => straddle(p, x, y, !back) });
  }
  for (const [i, f] of FARMS.entries()) {
    // up and down the furrows, one row further each pass
    const pass = (t * 0.12 + i * 0.7) % 8;
    const row = Math.floor(pass);
    const dir: 1 | -1 = row % 2 ? -1 : 1;
    const a = pass - row;
    const x = f.x + 0.4 + (dir > 0 ? a : 1 - a) * 2.4;
    const y = f.y + 0.6 + row * 0.32;
    out.push({ depth: x + y, x, y, draw: (p) => tractor(p, x, y, dir, t) });
  }
  return out;
}
