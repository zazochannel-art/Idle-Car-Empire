// Drawing the motorway and the railway (geometry in game/city/network.ts):
// the at-grade stretches go with the ground, the viaducts, tunnel portals,
// gantry signs and lamps are depth-sorted drawables, and the traffic on them
// (cars, lorries, car carriers, freight trains) is computed from the clock
// alone — no state, nothing for the economy.
import { HIGHWAY_HALF, NETWORK, WAYS, heightAt, inTunnel, legs, pointAt, type Way } from "@/game/city/network";
import { rand, sx, sy, type Painter } from "./iso";
import { CAR_COLORS, CAR_MODELS, drawCarrier, drawModel, drawTruck, type Dir } from "./vehicles";

type BBox = [number, number, number, number];
type View = [number, number, number, number];

const ASPHALT = "#454c58";
const CONCRETE = "#b8bec8";
const BALLAST = "#8a8276";
const H = HIGHWAY_HALF;

const open = (w: Way, unlocked: ReadonlySet<string>) => !w.area || unlocked.has(w.area);

/** A leg's frame: u along it, v across (to the right of travel). */
interface Frame {
  horiz: boolean;
  /** The fixed coordinate (y of a horizontal leg, x of a vertical one). */
  f: number;
  /** u of the leg's start and its direction (+1/−1). */
  u0: number;
  sgn: number;
  s0: number;
  len: number;
}

const FRAMES = new Map<Way, Frame[]>();
function frames(w: Way): Frame[] {
  const hit = FRAMES.get(w);
  if (hit) return hit;
  const out = legs(w).map(({ a, b, s0 }) => {
    const horiz = a[1] === b[1];
    const u0 = horiz ? a[0] : a[1];
    const u1 = horiz ? b[0] : b[1];
    return { horiz, f: horiz ? a[1] : a[0], u0, sgn: Math.sign(u1 - u0), s0, len: Math.abs(u1 - u0) };
  });
  FRAMES.set(w, out);
  return out;
}

/** Tile point at distance t along the leg and v across it. */
function at(F: Frame, t: number, v: number): [number, number] {
  const u = F.u0 + F.sgn * t;
  // right of travel: +x → +y, +y → −x
  const across = F.horiz ? F.sgn * v : -F.sgn * v;
  return F.horiz ? [u, F.f + across] : [F.f + across, u];
}

/** A strip on the leg from t0 to t1, v0…v1 across, at heights z0 → z1. */
function strip(p: Painter, F: Frame, t0: number, t1: number, v0: number, v1: number, z0: number, z1: number, fill: string | CanvasPattern) {
  const c = p.ctx;
  const pts: [number, number, number][] = [
    [...at(F, t0, v0), z0],
    [...at(F, t1, v0), z1],
    [...at(F, t1, v1), z1],
    [...at(F, t0, v1), z0],
  ];
  c.beginPath();
  pts.forEach(([x, y, z], i) => (i ? c.lineTo(sx(x, y), sy(x, y, z)) : c.moveTo(sx(x, y), sy(x, y, z))));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function seg(p: Painter, F: Frame, t0: number, t1: number, v: number, z0: number, z1: number, color: string, width: number, dash?: number[]) {
  const [ax, ay] = at(F, t0, v);
  const [bx, by] = at(F, t1, v);
  const c = p.ctx;
  c.beginPath();
  c.moveTo(sx(ax, ay), sy(ax, ay, z0));
  c.lineTo(sx(bx, by), sy(bx, by, z1));
  c.strokeStyle = color;
  c.lineWidth = width;
  if (dash) c.setLineDash(dash);
  c.stroke();
  if (dash) c.setLineDash([]);
}

/** Vertical face along the leg at v (a viaduct's side or a parapet). */
function face(p: Painter, F: Frame, t0: number, t1: number, v: number, zb0: number, zb1: number, zt0: number, zt1: number, fill: string) {
  const [ax, ay] = at(F, t0, v);
  const [bx, by] = at(F, t1, v);
  const c = p.ctx;
  c.beginPath();
  c.moveTo(sx(ax, ay), sy(ax, ay, zb0));
  c.lineTo(sx(bx, by), sy(bx, by, zb1));
  c.lineTo(sx(bx, by), sy(bx, by, zt1));
  c.lineTo(sx(ax, ay), sy(ax, ay, zt0));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Which side of a leg faces the viewer (larger x + y): +1 or −1 in v. */
const nearSide = (F: Frame) => (F.horiz ? F.sgn : -F.sgn);

// ───────────────────────────── motorway surface ─────────────────────────────

/** Carriageways, lane lines, hard shoulders and the central barrier, from t0 to t1. */
function carriageway(p: Painter, F: Frame, t0: number, t1: number, z0: number, z1: number, detail: boolean) {
  strip(p, F, t0, t1, -H, H, z0, z1, p.col(ASPHALT));
  if (!detail) {
    strip(p, F, t0, t1, -0.08, 0.08, z0, z1, p.col(CONCRETE));
    return;
  }
  const edge = p.col("#e5e7eb", -0.1);
  seg(p, F, t0, t1, -H + 0.14, z0, z1, edge, 1);
  seg(p, F, t0, t1, H - 0.14, z0, z1, edge, 1);
  seg(p, F, t0, t1, -0.72, z0, z1, edge, 1, [9, 9]);
  seg(p, F, t0, t1, 0.72, z0, z1, edge, 1, [9, 9]);
  seg(p, F, t0, t1, -0.2, z0, z1, p.col("#facc15", -0.15), 1);
  seg(p, F, t0, t1, 0.2, z0, z1, p.col("#facc15", -0.15), 1);
  // the central crash barrier
  face(p, F, t0, t1, 0, z0, z1, z0 + 2.2, z1 + 2.2, p.col(CONCRETE, -0.1));
  seg(p, F, t0, t1, 0, z0 + 2.2, z1 + 2.2, p.col(CONCRETE, 0.15), 1.6);
}

/** Pieces of a leg: [t0, t1, raised] runs, tunnels left out. */
const PIECES = new Map<string, [number, number, boolean][]>();
function pieces(w: Way, F: Frame, step = 0.5, mergeRaised = false): [number, number, boolean][] {
  const key = `${w.id}:${F.s0}:${step}:${mergeRaised}`;
  const hit = PIECES.get(key);
  if (hit) return hit;
  const out: [number, number, boolean][] = [];
  PIECES.set(key, out);
  for (let t = 0; t < F.len - 1e-6; t += step) {
    const t1 = Math.min(F.len, t + step);
    const sm = F.s0 + (t + t1) / 2;
    if (inTunnel(w, sm)) continue;
    const raised = heightAt(w, F.s0 + t) > 0.01 || heightAt(w, F.s0 + t1) > 0.01;
    const last = out[out.length - 1];
    if (last && (!raised || mergeRaised) && last[2] === raised && Math.abs(last[1] - t) < 1e-6) last[1] = t1;
    else out.push([t, t1, raised]);
  }
  return out;
}

/** Corners of a loop or a bent spur: the square where two legs meet. */
function corners(w: Way): [number, number][] {
  const n = w.pts.length;
  return w.pts.filter((_, i) => w.loop || (i > 0 && i < n - 1));
}

// ───────────────────────────── railway surface ─────────────────────────────

function track(p: Painter, F: Frame, t0: number, t1: number, detail: boolean) {
  strip(p, F, t0, t1, -0.5, 0.5, 0, 0, p.col(BALLAST));
  if (detail) seg(p, F, t0, t1, 0, 0, 0, p.col("#5b4636"), 26 * 0.85, [3, 6]);
  seg(p, F, t0, t1, -0.2, 0, 0, p.col("#d1d5db"), 1.3);
  seg(p, F, t0, t1, 0.2, 0, 0, p.col("#d1d5db"), 1.3);
}

/** The at-grade motorway and the railway, drawn with the ground (after the streets). */
export function drawNetworkGround(p: Painter, unlocked: ReadonlySet<string>, view: View) {
  const detail = p.zoom > 0.5;
  const c = p.ctx;
  c.lineCap = "butt";
  for (const w of WAYS) {
    p.dim = !open(w, unlocked);
    for (const F of frames(w)) {
      // cull the leg as a whole
      const [ax, ay] = at(F, 0, 0);
      const [bx, by] = at(F, F.len, 0);
      const lb: BBox = [Math.min(sx(ax, ay), sx(bx, by)) - 80, Math.min(sy(ax, ay), sy(bx, by)) - 80, Math.max(sx(ax, ay), sx(bx, by)) + 80, Math.max(sy(ax, ay), sy(bx, by)) + 80];
      if (lb[2] < view[0] || lb[0] > view[2] || lb[3] < view[1] || lb[1] > view[3]) continue;
      if (w.kind === "rail") {
        for (const [t0, t1] of pieces(w, F, 1)) track(p, F, t0, t1, detail);
        // river bridge: a steel deck under the track
        for (const cr of w.crossings) {
          const t = cr.s - F.s0;
          if (t < 0 || t > F.len) continue;
          if (cr.kind === "river") {
            strip(p, F, t - 1.6, t + 1.6, -0.62, 0.62, 0, 0, p.col("#4b5563"));
            track(p, F, t - 1.6, t + 1.6, detail);
          } else if (cr.kind === "street") {
            // level crossing: planks between the rails, stop lines either side
            strip(p, F, t - 0.5, t + 0.5, -0.32, 0.32, 0, 0, p.col("#6b7280"));
            seg(p, F, t - 0.5, t - 0.5, -0.5, 0, 0, "#fff", 1);
          }
        }
      } else {
        for (const [t0, t1, raised] of pieces(w, F, 0.5, true)) {
          if (raised) {
            // the viaduct's shadow on the ground
            strip(p, F, t0, t1, -H + 0.6, H + 0.6, 0, 0, "rgba(10,20,30,0.14)");
            continue;
          }
          carriageway(p, F, t0, t1, 0, 0, detail);
        }
      }
    }
    if (w.kind === "highway" && w.loop) for (const F of frames(w)) ramps(p, w, F);
    if (w.kind === "highway")
      for (const [x, y] of corners(w)) if (heightAt(w, cornerS(w, x, y)) < 0.01) p.quad(x - H, y - H, 2 * H, 2 * H, p.col(ASPHALT));
  }
  p.dim = false;
}

/**
 * Slip roads on the outer side (the railway runs along the inner one): off
 * the motorway before a viaduct over streets, down to the first street, and
 * back on after the last one.
 */
function ramps(p: Painter, w: Way, F: Frame) {
  const streets = w.crossings.filter((c) => c.kind === "street" && c.s > F.s0 + 1 && c.s < F.s0 + F.len - 1).map((c) => c.s - F.s0);
  const clusters: [number, number][] = [];
  for (const t of streets) {
    const last = clusters[clusters.length - 1];
    if (last && t - last[1] < 9) last[1] = t;
    else clusters.push([t, t]);
  }
  const v0 = -H - 0.05;
  const v1 = -H - 0.8;
  const c = p.ctx;
  for (const [a, b] of clusters)
    for (const [from, to] of [
      [Math.max(0.5, a - 7), a - 0.5],
      [Math.min(F.len - 0.5, b + 7), b + 0.5],
    ]) {
      const k = Math.sign(to - from);
      const pts = [at(F, from, v0), at(F, from + k * 2.4, v1), at(F, to, v1), at(F, to, v0)];
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(sx(x, y), sy(x, y)) : c.moveTo(sx(x, y), sy(x, y))));
      c.closePath();
      c.fillStyle = p.col(ASPHALT, 0.04);
      c.fill();
      c.beginPath();
      c.moveTo(sx(...pts[1]), sy(...pts[1]));
      c.lineTo(sx(...pts[2]), sy(...pts[2]));
      c.strokeStyle = p.col("#e5e7eb", -0.1);
      c.lineWidth = 1;
      c.stroke();
      // painted chevrons where the slip road splits off
      seg(p, F, from + k * 0.3, from + k * 2.2, v0 - 0.1, 0, 0, p.col("#f8fafc", -0.1), 1, [3, 4]);
    }
}

function cornerS(w: Way, x: number, y: number) {
  const i = w.pts.findIndex((q) => q[0] === x && q[1] === y);
  return w.acc[Math.max(0, i)];
}

// ───────────────────────────── drawables ─────────────────────────────

export interface NetDrawable {
  depth: number;
  zone: string | null;
  bbox: BBox;
  draw: (p: Painter, info: { t: number; zoom: number }) => void;
}

function bboxAround(x: number, y: number, r: number, h: number): BBox {
  return [sx(x, y + r) - 6, sy(x - r, y - r) - h - 10, sx(x + r, y) + 6, sy(x + r, y + r) + 8];
}

function pillar(p: Painter, x: number, y: number, z: number, horiz: boolean) {
  const [w, d] = horiz ? [0.5, 2.2] : [2.2, 0.5];
  p.shadow(x - w / 2, y - d / 2, w, d, z, 0.18);
  p.box(x - w / 2, y - d / 2, w, d, 0, z - 2, CONCRETE);
}

/** One slice of viaduct: piers, deck, carriageway, parapets. */
function viaduct(w: Way, F: Frame, t0: number, t1: number): NetDrawable {
  const z0 = heightAt(w, F.s0 + t0);
  const z1 = heightAt(w, F.s0 + t1);
  const [cx, cy] = at(F, (t0 + t1) / 2, 0);
  const near = nearSide(F);
  // a pier every 4 tiles where the deck is high enough
  const pierT = Math.ceil((F.s0 + t0) / 4) * 4 - F.s0;
  const pier = pierT >= t0 && pierT < t1 && heightAt(w, F.s0 + pierT) > 7 ? pierT : -1;
  return {
    depth: cx + cy + 0.4,
    zone: w.area ?? null,
    bbox: bboxAround(cx, cy, H + 1, Math.max(z0, z1) + 10),
    draw: (p, info) => {
      if (pier >= 0) {
        const [px, py] = at(F, pier, 0);
        pillar(p, px, py, heightAt(w, F.s0 + pier), F.horiz);
      }
      // deck slab: the side facing us, then the road on top
      face(p, F, t0, t1, near * (H + 0.05), z0 - 2.4, z1 - 2.4, z0, z1, p.col("#9aa1ab"));
      carriageway(p, F, t0, t1, z0, z1, info.zoom > 0.5);
      // parapets
      face(p, F, t0, t1, -near * H, z0, z1, z0 + 1.6, z1 + 1.6, p.col("#cfd5dc"));
      face(p, F, t0, t1, near * H, z0, z1, z0 + 1.6, z1 + 1.6, p.col("#d8dde3"));
    },
  };
}

/** Concrete portal where the way goes into the mountain. */
function portal(w: Way, F: Frame, t: number, into: 1 | -1): NetDrawable {
  const [x, y] = at(F, t, 0);
  const half = w.kind === "highway" ? H + 0.5 : 0.8;
  const tall = w.kind === "highway" ? 14 : 11;
  return {
    depth: x + y + 0.5,
    zone: w.area ?? null,
    bbox: bboxAround(x, y, half + 1, tall + 6),
    draw: (p) => {
      // the wall across the way, its dark mouth facing out of the hill
      const [w0, d0] = F.horiz ? [0.7, half * 2] : [half * 2, 0.7];
      p.box(x - w0 / 2, y - d0 / 2, w0, d0, 0, tall, "#8c939d", "#6b7280");
      const c = p.ctx;
      const facing = -F.sgn * into;
      // only the mouth facing the viewer (+x or +y) is visible
      if (facing < 0) return;
      const holes = w.kind === "highway" ? [-0.8, 0.8] : [0];
      for (const v of holes) {
        const [hx, hy] = at(F, t, v);
        const ex = F.horiz ? hx + w0 / 2 : hx;
        const ey = F.horiz ? hy : hy + d0 / 2;
        c.fillStyle = "#111827";
        c.beginPath();
        c.ellipse(sx(ex, ey), sy(ex, ey, 4.5), 9, 7, 0, Math.PI, 0);
        c.lineTo(sx(ex, ey) + 9, sy(ex, ey, 0));
        c.lineTo(sx(ex, ey) - 9, sy(ex, ey, 0));
        c.fill();
        if (p.night > 0.2) p.light(sx(ex, ey), sy(ex, ey, 3), 10, "#fde68a", 0.5);
      }
    },
  };
}

/** Double-headed lamp on the central barrier. */
function lampPost(w: Way, x: number, y: number, z: number, horiz: boolean): NetDrawable {
  return {
    depth: x + y + 0.45,
    zone: w.area ?? null,
    bbox: bboxAround(x, y, 1.6, z + 30),
    draw: (p, info) => {
      const c = p.ctx;
      const X = sx(x, y);
      const Y = sy(x, y, z + 2);
      c.strokeStyle = p.col("#475569");
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(X, Y);
      c.lineTo(X, Y - 22);
      const [dx, dy] = horiz ? [-8, -4] : [8, -4];
      c.moveTo(X - dx, Y - 22 - dy);
      c.lineTo(X + dx, Y - 22 + dy);
      c.stroke();
      if (p.dim) return;
      const on = p.night > 0.25;
      for (const k of [-1, 1]) {
        const hx = X + dx * k;
        const hy = Y - 22 + dy * k;
        c.fillStyle = on ? "rgba(254,240,138,0.95)" : "rgba(226,232,240,0.9)";
        c.beginPath();
        c.arc(hx, hy, 1.8, 0, Math.PI * 2);
        c.fill();
        if (on) p.light(hx, hy + 18, 22, "#ffd27a", 0.28 + 0.04 * Math.sin(info.t + x));
      }
    },
  };
}

/** Overhead gantry with a green direction board. */
function gantry(w: Way, F: Frame, t: number, text: string): NetDrawable {
  const z = heightAt(w, F.s0 + t);
  const [x, y] = at(F, t, 0);
  return {
    depth: x + y + 0.6,
    zone: null,
    bbox: bboxAround(x, y, H + 1.5, z + 40),
    draw: (p) => {
      const c = p.ctx;
      const [ax, ay] = at(F, t, -H - 0.2);
      const [bx, by] = at(F, t, H + 0.2);
      c.strokeStyle = p.col("#64748b");
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(sx(ax, ay), sy(ax, ay, z));
      c.lineTo(sx(ax, ay), sy(ax, ay, z + 26));
      c.lineTo(sx(bx, by), sy(bx, by, z + 26));
      c.lineTo(sx(bx, by), sy(bx, by, z));
      c.stroke();
      // the board over the carriageway that goes the sign's way
      const [mx, my] = at(F, t, 0.75);
      const X = sx(mx, my);
      const Y = sy(mx, my, z + 30);
      c.fillStyle = p.col("#15803d");
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = 1;
      c.beginPath();
      c.roundRect(X - 15, Y - 8, 30, 14, 2);
      c.fill();
      c.stroke();
      c.font = "9px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#fff";
      c.fillText(`${text} ➜`, X, Y - 1);
    },
  };
}

/** Crossbuck at a level crossing. */
function crossbuck(x: number, y: number, zone: string | null): NetDrawable {
  return {
    depth: x + y + 0.3,
    zone,
    bbox: bboxAround(x, y, 0.5, 16),
    draw: (p, info) => {
      const c = p.ctx;
      const X = sx(x, y);
      const Y = sy(x, y);
      c.strokeStyle = p.col("#e5e7eb");
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X, Y);
      c.lineTo(X, Y - 12);
      c.stroke();
      c.strokeStyle = p.col("#dc2626");
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(X - 4, Y - 15);
      c.lineTo(X + 4, Y - 9);
      c.moveTo(X + 4, Y - 15);
      c.lineTo(X - 4, Y - 9);
      c.stroke();
      if (!p.dim && Math.sin(info.t * 5) > 0.3) {
        c.fillStyle = "#ef4444";
        c.beginPath();
        c.arc(X, Y - 6, 1.3, 0, Math.PI * 2);
        c.fill();
      }
    },
  };
}

/** Ring signs (s along the ring → what lies ahead). */
const RING_SIGNS: [number, string][] = [
  [28, "🏭"],
  [60, "🏙️"],
  [96, "💎"],
  [140, "🏁"],
  [178, "🏡"],
  [228, "⛏️"],
  [265, "⚓"],
  [312, "🏔️"],
];

/** Every static piece of the network: viaducts, portals, lamps, gantries, crossbucks. */
export function networkDrawables(): NetDrawable[] {
  const out: NetDrawable[] = [];
  for (const w of WAYS) {
    const fs = frames(w);
    for (const F of fs) {
      if (w.kind === "highway") for (const [t0, t1, raised] of pieces(w, F, 1)) if (raised) out.push(viaduct(w, F, t0, t1));
      // tunnel mouths
      for (const [a, b] of w.tunnels) {
        if (a >= F.s0 && a <= F.s0 + F.len) out.push(portal(w, F, a - F.s0, 1));
        if (b >= F.s0 && b <= F.s0 + F.len) out.push(portal(w, F, b - F.s0, -1));
      }
      if (w.kind === "highway") {
        // lamps every 6 tiles, none in the tunnel
        for (let t = 3; t < F.len - 1; t += 6) {
          if (inTunnel(w, F.s0 + t)) continue;
          const [x, y] = at(F, t, 0);
          out.push(lampPost(w, x, y, heightAt(w, F.s0 + t), F.horiz));
        }
      } else {
        for (const cr of w.crossings) {
          const t = cr.s - F.s0;
          if (cr.kind !== "street" || t < 0 || t > F.len) continue;
          const [x, y] = at(F, t - 0.7, 0.7);
          out.push(crossbuck(x, y, w.area ?? null));
        }
      }
    }
    if (w.kind === "highway" && w.loop)
      for (const [s, text] of RING_SIGNS) {
        const F = fs.find((f) => s >= f.s0 && s < f.s0 + f.len);
        if (F && !inTunnel(w, s)) out.push(gantry(w, F, s - F.s0, text));
      }
  }
  // the spurs' signs, on the ring before each junction
  const ring = NETWORK.highway[0];
  const rf = frames(ring);
  for (const w of NETWORK.highway) {
    if (!w.sign) continue;
    const [jx, jy] = w.pts[0];
    const F = rf.find((f) => (f.horiz ? Math.abs(f.f - jy) < 2 : Math.abs(f.f - jx) < 2) && (f.horiz ? between(jx, f) : between(jy, f)));
    if (!F) continue;
    const tj = Math.abs((F.horiz ? jx : jy) - F.u0) - 6;
    if (tj > 0) out.push(gantry(ring, F, tj, w.sign));
  }
  return out;
}

const between = (u: number, F: Frame) => (u - F.u0) * F.sgn >= -2 && (u - F.u0) * F.sgn <= F.len + 2;

// ───────────────────────────── traffic ─────────────────────────────

export interface Mover {
  depth: number;
  x: number;
  y: number;
  draw: (p: Painter) => void;
}

const LANES = [0.42, 1.05];
type Kind = "car" | "truck" | "carrier";

function vehicleKind(seed: number): Kind {
  const r = rand(seed, 3);
  return r < 0.62 ? "car" : r < 0.86 ? "truck" : "carrier";
}

function vehicle(p: Painter, kind: Kind, x: number, y: number, dir: Dir, seed: number, odo: number) {
  if (p.zoom < 0.45) {
    // far away: a coloured block is all one can see
    const L = kind === "car" ? 0.55 : 1.0;
    const [w, d] = dir === 0 || dir === 2 ? [L, 0.3] : [0.3, L];
    const col = kind === "car" ? CAR_COLORS[Math.floor(rand(seed, 6) * CAR_COLORS.length)] : "#e2e8f0";
    p.box(x - w / 2, y - d / 2, w, d, 0, kind === "car" ? 3 : 5, col, undefined, false);
    return;
  }
  if (kind === "car") {
    const model = CAR_MODELS[Math.floor(rand(seed, 5) * CAR_MODELS.length)];
    drawModel(p, x, y, dir, model, CAR_COLORS[Math.floor(rand(seed, 6) * CAR_COLORS.length)], 1, { odo, lights: p.night > 0.35 });
  } else if (kind === "truck") drawTruck(p, x, y, dir, ["#f97316", "#0ea5e9", "#f8fafc", "#16a34a"][Math.floor(rand(seed, 7) * 4)], 1, false, { kind: "semi", odo });
  else drawCarrier(p, x, y, dir, [CAR_COLORS[Math.floor(rand(seed, 8) * 10)], CAR_COLORS[Math.floor(rand(seed, 9) * 10)]], 1, ["sedan", "suv"], { odo });
}

/** Cars and lorries on the motorway, freight trains on the railway, at time t. */
export function networkTraffic(t: number, unlocked: ReadonlySet<string>, density = 1, zoom = 1): Mover[] {
  const out: Mover[] = [];
  // too small to see from the region view
  if (zoom < 0.2) return out;
  for (const w of NETWORK.highway) {
    if (!open(w, unlocked)) continue;
    const perLane = Math.max(1, Math.round((w.loop ? 9 : 2) * density));
    for (let li = 0; li < LANES.length * 2; li++) {
      const fwd = li < LANES.length;
      const v = LANES[li % LANES.length];
      const speed = (li % 2 === 0 ? 2.4 : 3.1) * (fwd ? 1 : 0.97);
      for (let k = 0; k < perLane; k++) {
        const seed = li * 31 + k * 7 + w.id.length * 101;
        const base = (k + rand(seed, 1) * 0.6) * (w.len / perLane);
        let s = base + (fwd ? 1 : -1) * speed * t;
        if (w.loop) s = ((s % w.len) + w.len) % w.len;
        else {
          s = ((s % w.len) + w.len) % w.len;
          if (s < 0.6 || s > w.len - 0.6) continue;
        }
        if (inTunnel(w, s)) continue;
        const pt = pointAt(w, s);
        const dir = (fwd ? pt.dir : (pt.dir + 2) % 4) as Dir;
        const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][pt.dir];
        // right of travel along the way
        const side = fwd ? v : -v;
        const x = pt.x - dy * side;
        const y = pt.y + dx * side;
        const z = heightAt(w, s);
        const kind = vehicleKind(seed);
        out.push({
          depth: x + y + 0.55,
          x,
          y,
          draw: (p) => {
            const c = p.ctx;
            c.save();
            c.translate(0, -z);
            vehicle(p, kind, x, y, dir, seed, s);
            c.restore();
          },
        });
      }
    }
  }
  for (const w of NETWORK.rail) {
    if (!open(w, unlocked)) continue;
    const trains = w.loop ? TRAINS : [{ cars: 3, cargo: w.id === "quarry" ? "ore" : "containers", speed: 0 }];
    trains.forEach((tr, ti) => {
      // ring trains run round; siding trains shunt back and forth
      const head = w.loop ? tr.speed * t + (ti * w.len) / TRAINS.length : 1.5 + (w.len - 6) * (0.5 - 0.5 * Math.cos(t * 0.12 + w.len));
      for (let k = 0; k <= tr.cars; k++) {
        const s = w.loop ? head - k * 1.45 : head + k * 1.45;
        if (!w.loop && (s < 0 || s > w.len)) continue;
        const ss = w.loop ? ((s % w.len) + w.len) % w.len : s;
        if (inTunnel(w, ss)) continue;
        const pt = pointAt(w, ss);
        const kind = k === 0 ? "loco" : tr.cargo;
        const seed = ti * 13 + k;
        out.push({ depth: pt.x + pt.y + 0.5, x: pt.x, y: pt.y, draw: (p) => wagon(p, pt.x, pt.y, pt.dir, kind, seed) });
      }
    });
  }
  return out;
}

const TRAINS = [
  { cars: 8, cargo: "containers", speed: 3.4 },
  { cars: 7, cargo: "carCarrier", speed: 3.0 },
  { cars: 6, cargo: "ore", speed: 2.6 },
];

const CONTAINER_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0891b2", "#7c3aed"];

/** A locomotive or a wagon, 1.3 tiles long, along its heading. */
function wagon(p: Painter, x: number, y: number, dir: number, kind: string, seed: number) {
  const along = dir === 0 || dir === 2;
  const [w, d] = along ? [1.3, 0.62] : [0.62, 1.3];
  const X = x - w / 2;
  const Y = y - d / 2;
  p.shadow(X, Y, w, d, 8, 0.2);
  // bogies and frame
  p.box(X + 0.05, Y + 0.05, w - 0.1, d - 0.1, 0, 1.6, "#1f2937");
  if (kind === "loco") {
    p.box(X, Y, w, d, 1.6, 8, "#facc15", "#e5e7eb");
    // cab at the front end
    const front = dir === 0 || dir === 1 ? 1 : -1;
    const cx = along ? (front > 0 ? X + w - 0.42 : X) : X;
    const cy = along ? Y : front > 0 ? Y + d - 0.42 : Y;
    p.box(cx, cy, along ? 0.42 : w, along ? d : 0.42, 9.6, 3, "#1e3a8a", "#cbd5e1");
    if (p.night > 0.3) {
      const hx = along ? X + (front > 0 ? w : 0) : x;
      const hy = along ? y : Y + (front > 0 ? d : 0);
      p.light(sx(hx, hy), sy(hx, hy, 5), 14, "#fff7cc", 0.8);
    }
  } else if (kind === "containers") {
    const col = CONTAINER_COLORS[seed % CONTAINER_COLORS.length];
    p.box(X + 0.03, Y + 0.03, w - 0.06, d - 0.06, 1.6, 7, col);
  } else if (kind === "ore") {
    p.box(X + 0.03, Y + 0.03, w - 0.06, d - 0.06, 1.6, 5.5, "#78350f");
    p.quad(X + 0.12, Y + 0.12, w - 0.24, d - 0.24, "#44403c", 7.2);
  } else {
    // two-deck car carrier: open frame with a car on each deck
    p.box(X, Y, w, d, 1.6, 0.6, "#94a3b8");
    p.box(X, Y, w, d, 6, 0.5, "#94a3b8");
    const tint = CAR_COLORS[seed % CAR_COLORS.length];
    const [cw, cd] = along ? [0.9, 0.42] : [0.42, 0.9];
    p.box(x - cw / 2, y - cd / 2, cw, cd, 2.2, 2.6, tint);
    p.box(x - cw / 2, y - cd / 2, cw, cd, 6.5, 2.6, CAR_COLORS[(seed + 3) % CAR_COLORS.length]);
  }
}
