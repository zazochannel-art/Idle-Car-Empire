// Paints a circuit on the ground, in the map's isometric projection: the
// asphalt ribbon, red-and-white kerbs and gravel traps on the outside of the
// corners, white edge lines, the chequered start/finish line, grid slots and
// (on the home circuit) the pit lane. Shared by the Empire Map and the race
// viewer; `ox`/`oy` place the track's frame in tile space.
import { pointAt, type Track } from "@/game/racing/tracks";
import { GRID_SPACING } from "@/game/racing/tracks";
import { sx, sy, type Painter } from "../map/iso";

export interface TrackLook {
  asphalt: string;
  kerbA: string;
  kerbB: string;
  runoff: string;
  verge: string;
  line: string;
}

export const DEFAULT_LOOK: TrackLook = { asphalt: "#3b414b", kerbA: "#dc2626", kerbB: "#f8fafc", runoff: "#d6c08c", verge: "#9ca3af", line: "#f1f5f9" };

/** A band along the track from s0 to s1 between two lateral offsets. */
export function strip(p: Painter, tr: Track, ox: number, oy: number, s0: number, s1: number, lat0: number, lat1: number, fill: string, step = 0.2) {
  const c = p.ctx;
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const q = pointAt(tr, s0 + ((s1 - s0) * i) / n, lat0);
    const X = sx(q.x + ox, q.y + oy);
    const Y = sy(q.x + ox, q.y + oy);
    if (i === 0) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  for (let i = n; i >= 0; i--) {
    const q = pointAt(tr, s0 + ((s1 - s0) * i) / n, lat1);
    c.lineTo(sx(q.x + ox, q.y + oy), sy(q.x + ox, q.y + oy));
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Stretches of the lap that are corners: [s0, s1, side] (side +1: the outside is +lat). */
export function corners(tr: Track, minK = 0.22): [number, number, number][] {
  const out: [number, number, number][] = [];
  let open: [number, number, number] | null = null;
  for (const smp of tr.samples) {
    const turning = Math.abs(smp.k) > minK;
    const side = smp.k > 0 ? 1 : -1;
    if (turning && (!open || open[2] !== side)) {
      if (open) out.push(open);
      open = [smp.s, smp.s, side];
    } else if (turning && open) open[1] = smp.s;
    else if (!turning && open) {
      out.push(open);
      open = null;
    }
  }
  if (open) out.push(open);
  return out.filter(([a, b]) => b - a > 0.3);
}

export function paintTrack(p: Painter, tr: Track, ox: number, oy: number, look: TrackLook = DEFAULT_LOOK, pit = false) {
  const w = tr.layout.width / 2;
  const L = tr.length;
  const crn = corners(tr);
  // gravel traps on the outside of every corner, then a pale verge along the whole lap
  for (const [a, b, side] of crn) strip(p, tr, ox, oy, a - 0.6, b + 1.2, side * (w + 0.1), side * (w + 0.85), p.col(look.runoff));
  strip(p, tr, ox, oy, 0, L, -(w + 0.14), w + 0.14, p.col(look.verge));
  // the asphalt
  strip(p, tr, ox, oy, 0, L, -w, w, p.col(look.asphalt), 0.16);
  // rubber laid down on the racing line
  strip(p, tr, ox, oy, 0, L, -w * 0.25, w * 0.15, "rgba(0,0,0,0.07)", 0.3);
  // white edge lines
  strip(p, tr, ox, oy, 0, L, w - 0.05, w - 0.02, p.col(look.line), 0.25);
  strip(p, tr, ox, oy, 0, L, -w + 0.02, -w + 0.05, p.col(look.line), 0.25);
  // kerbs: on both edges through every corner
  for (const [a, b] of crn)
    for (let s = a - 0.3; s < b + 0.3; s += 0.3) {
      const col = Math.floor(s / 0.3) % 2 ? look.kerbA : look.kerbB;
      strip(p, tr, ox, oy, s, s + 0.3, w - 0.02, w + 0.14, p.col(col), 0.3);
      strip(p, tr, ox, oy, s, s + 0.3, -w + 0.02, -w - 0.14, p.col(col), 0.3);
    }
  // start / finish: a chequered band across the track
  const st = tr.startS;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 6; j++) {
      const l0 = -w + ((2 * w) / 6) * j;
      strip(p, tr, ox, oy, st + i * 0.09, st + (i + 1) * 0.09, l0, l0 + (2 * w) / 6, (i + j) % 2 ? "#111827" : "#f8fafc", 0.09);
    }
  // grid slots: staggered white brackets behind the line
  for (let g = 0; g < 8; g++) {
    const s = st - (g + 1) * GRID_SPACING;
    const lat = g % 2 ? -w * 0.45 : w * 0.45;
    strip(p, tr, ox, oy, s - 0.03, s + 0.02, lat - 0.17, lat + 0.17, "rgba(248,250,252,0.85)", 0.05);
  }
  if (pit) paintPitLane(p, tr, ox, oy, look);
}

/** The pit lane: beside the main straight on the infield side, with a speed-limit line and box markings. */
export function pitLane(tr: Track) {
  const w = tr.layout.width / 2;
  return { s0: 0.6, s1: Math.min(tr.startS + 6.2, tr.length * 0.2), lat: -(w + 0.62), half: 0.32 };
}

function paintPitLane(p: Painter, tr: Track, ox: number, oy: number, look: TrackLook) {
  const pl = pitLane(tr);
  const w = tr.layout.width / 2;
  // entry and exit ramps
  strip(p, tr, ox, oy, pl.s0 - 1.2, pl.s0, -w + 0.05, pl.lat - pl.half * 0.2, p.col(look.asphalt, 0.04), 0.1);
  strip(p, tr, ox, oy, pl.s1, pl.s1 + 1.2, pl.lat - pl.half * 0.2, -w + 0.05, p.col(look.asphalt, 0.04), 0.1);
  strip(p, tr, ox, oy, pl.s0, pl.s1, pl.lat + pl.half, pl.lat - pl.half, p.col(look.asphalt, 0.04));
  // the pit wall between the lane and the track
  strip(p, tr, ox, oy, pl.s0 + 0.3, pl.s1 - 0.3, -w - 0.16, -w - 0.26, p.col("#e5e7eb"));
  // box markings
  for (let s = pl.s0 + 0.6; s < pl.s1 - 0.4; s += 0.8) strip(p, tr, ox, oy, s, s + 0.04, pl.lat - pl.half, pl.lat - pl.half + 0.22, "rgba(250,204,21,0.8)", 0.04);
}

/** Where a car parks in the pit lane (box `i`). */
export function pitBox(tr: Track, i: number) {
  const pl = pitLane(tr);
  return pointAt(tr, pl.s0 + 0.9 + i * 0.8, pl.lat - 0.05);
}
