// Smooth driving lines for the traffic. A route is an axis-aligned polyline
// along the road centre lines; vehicles drive it offset into their lane (keep
// right), and every corner becomes a circular arc: a tight one for a right
// turn (the inside lane), a wide one for a left turn across the junction, a
// half circle for a U-turn. Vehicles sample the curve by distance, so they
// follow the bend instead of snapping round a corner.
import { ROAD_STEP } from "@/game/city/layout";

export interface Pt {
  x: number;
  y: number;
}

/** Distance of the lane from the road centre (tiles). */
export const LANE = 0.2;
/** Corner radii (tiles) on the lane line. */
const R_RIGHT = 0.28;
const R_LEFT = 0.5;
const R_DRIVEWAY = 0.34;

type Piece =
  | { kind: "line"; s0: number; len: number; ax: number; ay: number; dx: number; dy: number }
  | { kind: "arc"; s0: number; len: number; cx: number; cy: number; r: number; a0: number; sweep: number };

export interface Sample {
  x: number;
  y: number;
  /** Heading of travel (radians, map axes) and signed curvature (1/tiles, + = turning right). */
  yaw: number;
  curv: number;
}

const onGrid = (v: number) => Math.abs((v - 0.5) / ROAD_STEP - Math.round((v - 0.5) / ROAD_STEP)) < 1e-6;
/** A point on a road centre line (as opposed to inside a lot, at the end of a driveway). */
const onRoad = (p: Pt) => onGrid(p.x) || onGrid(p.y);

export class LanePath {
  readonly length: number;
  /** Curve distance at each route point (the middle of the bend at a corner). */
  readonly knots: number[];
  private pieces: Piece[];

  constructor(points: Pt[], lanes?: number[]) {
    const n = points.length;
    const segs: { dx: number; dy: number; len: number; lane: number }[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      // driveways (one end inside a lot) run down the middle
      const lane = lanes?.[i] ?? (onRoad(a) && onRoad(b) ? LANE : 0);
      segs.push({ dx, dy, len, lane });
    }
    // offset point of segment i at route point p
    const off = (i: number, p: Pt): Pt => ({ x: p.x - segs[i].dy * segs[i].lane, y: p.y + segs[i].dx * segs[i].lane });

    this.pieces = [];
    this.knots = [0];
    let s = 0;
    let cur = n > 1 && segs[0].len > 0 ? off(0, points[0]) : { ...points[0] };
    const line = (to: Pt) => {
      const len = Math.hypot(to.x - cur.x, to.y - cur.y);
      if (len > 1e-6) {
        this.pieces.push({ kind: "line", s0: s, len, ax: cur.x, ay: cur.y, dx: (to.x - cur.x) / len, dy: (to.y - cur.y) / len });
        s += len;
      }
      cur = to;
    };
    const arc = (cx: number, cy: number, r: number, a0: number, sweep: number) => {
      const len = Math.abs(sweep) * r;
      this.pieces.push({ kind: "arc", s0: s, len, cx, cy, r, a0, sweep });
      s += len;
      cur = { x: cx + Math.cos(a0 + sweep) * r, y: cy + Math.sin(a0 + sweep) * r };
    };

    for (let k = 1; k < n - 1; k++) {
      const A = segs[k - 1];
      const B = segs[k];
      const p = points[k];
      if (!A.len || !B.len) {
        this.knots.push(s);
        continue;
      }
      const cross = A.dx * B.dy - A.dy * B.dx;
      const dot = A.dx * B.dx + A.dy * B.dy;
      if (cross === 0 && dot > 0) {
        // straight on (a lane change, if any, is a short diagonal)
        const e = off(k - 1, p);
        const f = off(k, p);
        if (Math.abs(e.x - f.x) + Math.abs(e.y - f.y) > 1e-6) {
          line({ x: e.x - A.dx * 0.2, y: e.y - A.dy * 0.2 });
          const mid = s;
          line({ x: f.x + B.dx * 0.2, y: f.y + B.dy * 0.2 });
          this.knots.push((mid + s) / 2);
        } else {
          line(e);
          this.knots.push(s);
        }
        continue;
      }
      if (cross === 0) {
        // U-turn: a half circle from one lane to the other
        const e = off(k - 1, p);
        const f = off(k, p);
        const r = Math.max(0.12, Math.hypot(e.x - f.x, e.y - f.y) / 2);
        // push the turn a little forward so it has room
        const fx = e.x + A.dx * 0.05;
        const fy = e.y + A.dy * 0.05;
        line({ x: fx, y: fy });
        const cx = (e.x + f.x) / 2 + A.dx * 0.05;
        const cy = (e.y + f.y) / 2 + A.dy * 0.05;
        const a0 = Math.atan2(fy - cy, fx - cx);
        // turn toward the side the far lane is on
        const side = Math.sign(A.dx * (f.y - e.y) - A.dy * (f.x - e.x)) || 1;
        const mid = s + (Math.PI * r) / 2;
        arc(cx, cy, r, a0, side * Math.PI);
        this.knots.push(mid);
        continue;
      }
      // a 90° corner: where the two lane lines cross, rounded off
      const qa = off(k - 1, p);
      const qb = off(k, p);
      const C = A.dx !== 0 ? { x: qb.x, y: qa.y } : { x: qa.x, y: qb.y };
      const driveway = A.lane === 0 || B.lane === 0;
      let r = driveway ? R_DRIVEWAY : cross > 0 ? R_RIGHT : R_LEFT;
      // room on both sides: the leg we came along and the leg ahead
      const back = Math.abs(C.x - cur.x) + Math.abs(C.y - cur.y);
      const ahead = B.len * 0.5;
      r = Math.max(0.05, Math.min(r, back, ahead));
      line({ x: C.x - A.dx * r, y: C.y - A.dy * r });
      const cx = cur.x + B.dx * r;
      const cy = cur.y + B.dy * r;
      const a0 = Math.atan2(cur.y - cy, cur.x - cx);
      const sweep = (Math.PI / 2) * Math.sign(cross);
      const mid = s + (Math.PI / 4) * r;
      arc(cx, cy, r, a0, sweep);
      this.knots.push(mid);
    }
    if (n > 1) line(off(n - 2, points[n - 1]));
    this.knots.push(s);
    this.length = s;
  }

  /** Curve distance for progress along route segment `seg` at fraction t. */
  along(seg: number, t: number) {
    const a = this.knots[seg] ?? this.length;
    const b = this.knots[seg + 1] ?? this.length;
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  /** Position, heading and curvature at curve distance s (clamped to the ends). */
  at(s: number): Sample {
    const ps = this.pieces;
    if (!ps.length) return { x: 0, y: 0, yaw: 0, curv: 0 };
    const d = Math.max(0, Math.min(this.length, s));
    let lo = 0;
    let hi = ps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ps[mid].s0 <= d) lo = mid;
      else hi = mid - 1;
    }
    const pc = ps[lo];
    const u = Math.min(pc.len, d - pc.s0);
    if (pc.kind === "line") return { x: pc.ax + pc.dx * u, y: pc.ay + pc.dy * u, yaw: Math.atan2(pc.dy, pc.dx), curv: 0 };
    const sign = Math.sign(pc.sweep);
    const a = pc.a0 + sign * (u / pc.r);
    return { x: pc.cx + Math.cos(a) * pc.r, y: pc.cy + Math.sin(a) * pc.r, yaw: a + (sign * Math.PI) / 2, curv: sign / pc.r };
  }

  /**
   * Where a vehicle of wheelbase `wb` sits with its centre at s: the body
   * points from the rear axle to the front axle, so it swings through a bend
   * like a real car instead of pivoting on the spot.
   */
  pose(s: number, wb: number): Sample {
    const c = this.at(s);
    const f = this.at(s + wb / 2);
    const r = this.at(s - wb / 2);
    const dx = f.x - r.x;
    const dy = f.y - r.y;
    const yaw = dx * dx + dy * dy > 1e-8 ? Math.atan2(dy, dx) : c.yaw;
    return { x: (f.x + r.x) / 2, y: (f.y + r.y) / 2, yaw, curv: f.curv };
  }
}
