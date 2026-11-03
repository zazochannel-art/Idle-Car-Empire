// People walking the town's pavements. They keep to the sidewalks along the
// town streets, go round the corners at the junctions (round the pavement
// at a roundabout), and now and then cross a street on its zebra: at lights
// they wait for the walkers' green (and call it), elsewhere they wait for a
// gap in the traffic. On a crossing they hold the cars (traffic.ts). Fewer
// walk out at night. Everyone is one instance of a few simple shapes.
import * as THREE from "three";
import { roadOpen } from "@/game/city/layout";
import type { Roundabout } from "./junctions";
import { hazed } from "./kit";
import { ROAD_LIFT, pointOn, type MapRoad } from "./scenery";
import type { Signal, Signals } from "./signals";
import type { Ground } from "./terrain";
import type { Body } from "./traffic";

/** The pavement's measures (as roads.ts lays it). */
const KERB_H = 0.035;
const KERB = 0.035;
const WALK = 0.17;
/** Walking pace, and the brisker one over a crossing (world units/s: a touch quick, so they read as moving). */
const WALK_SPEED = 0.24;
const CROSS_SPEED = 0.4;
/** People per unit of open pavement (both sides), and at most. */
const PER_UNIT = 0.16;
const MAX_PEDS = 60;
/** Chance to cross at a zebra they come to, and how long they wait for a chance before walking on. */
const CROSS_CHANCE = 0.4;
const WAIT_MAX = 15;
/** A person's legs, body and head (about 1.75 m tall beside the cars). */
const LEG = 0.12;
const TORSO = 0.1;
const HEAD = 0.026;

type P2 = [number, number];

interface NodeInfo {
  deg: number;
  wmax: number;
  ring: boolean;
  rb?: Roundabout;
  roads: number[];
}

/** A zebra on a road: where along it, and its lights (null: none, wait for a gap). */
interface Spot {
  s: number;
  sig: Signal | null;
}

interface Ped {
  road: number;
  s: number;
  /** Walking along the road (+1 toward b) and on which side of it (+1 right of the road's own direction). */
  dir: 1 | -1;
  side: 1 | -1;
  mode: "walk" | "wait" | "cross" | "corner";
  /** The way over a crossing or round a corner, and how far along it. */
  path: P2[];
  acc: number[];
  d: number;
  /** After the path: the road, side and way along it they walk on. */
  then: { road: number; s: number; dir: 1 | -1; side: 1 | -1 } | null;
  spot: Spot | null;
  wait: number;
  speed: number;
  step: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  alpha: number;
  leaving: boolean;
  shirt: THREE.Color;
  trousers: THREE.Color;
  skin: THREE.Color;
  size: number;
  body: Body;
}

const SHIRTS = ["#e11d48", "#2563eb", "#f59e0b", "#16a34a", "#f8fafc", "#7c3aed", "#0ea5e9", "#f97316", "#334155", "#db2777", "#facc15", "#14b8a6"];
const TROUSERS = ["#1e293b", "#334155", "#1e3a8a", "#57534e", "#0f172a", "#78716c"];
const SKINS = ["#f1c7a5", "#e0ac83", "#c68b5e", "#8d5a3b", "#5c3a24", "#f5d5bd"];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function cumulative(pts: P2[]) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}

function pointAlong(pts: P2[], acc: number[], d: number): [number, number, number, number] {
  const n = pts.length;
  d = Math.max(0, Math.min(acc[n - 1], d));
  let i = 1;
  while (i < n - 1 && acc[i] < d) i++;
  const seg = acc[i] - acc[i - 1] || 1;
  const t = (d - acc[i - 1]) / seg;
  const [ax, az] = pts[i - 1];
  const [bx, bz] = pts[i];
  return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / seg, (bz - az) / seg];
}

export class Pedestrians {
  readonly root = new THREE.Group();
  /** Share of the usual crowd (low graphics halves it). */
  density = 1;
  private peds: Ped[] = [];
  private nodes: NodeInfo[];
  private walkable: boolean[] = [];
  private walkLen = 0;
  private spots: Spot[][] = [];
  private far = false;
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private o = { x: 0, z: 0, tx: 0, tz: 0 };

  constructor(
    private ground: Ground,
    private roads: MapRoad[],
    private rings: ReadonlyMap<number, Roundabout>,
    private signals: Signals | null,
    /** Is a vehicle standing on a crossing (from one kerb to the other), or moving within `r` of it? From the traffic. */
    private busy: (a: P2, b: P2, r: number) => boolean,
  ) {
    this.root.name = "pedestrians";
    const N = Math.max(0, ...roads.flatMap((r) => [r.a, r.b])) + 1;
    this.nodes = Array.from({ length: N }, (_, i) => ({ deg: 0, wmax: 0, ring: false, rb: rings.get(i), roads: [] }));
    roads.forEach((r, i) => {
      for (const k of [r.a, r.b]) {
        const n = this.nodes[k];
        n.deg++;
        n.wmax = Math.max(n.wmax, r.l);
        if (r.ring) n.ring = true;
        n.roads.push(i);
      }
    });
    // the zebras: before the junctions (as roads.ts paints them) and at the crossings with lights
    this.spots = roads.map((r, i) => {
      const out: Spot[] = [];
      if (!r.urban || r.ring) return out;
      for (const [k, end] of [
        [r.a, 0],
        [r.b, 1],
      ] as const) {
        const n = this.nodes[k];
        if (n.deg < 3 || n.ring) continue;
        const c = this.cross(n);
        const s = end === 0 ? c : r.L - c;
        if (s < 0.3 || s > r.L - 0.3 || r.L < 2 * c + 0.6) continue;
        if (r.decks.some(([d0, d1]) => s > d0 - 0.4 && s < d1 + 0.4)) continue;
        out.push({ s, sig: signals?.at(k) ?? null });
      }
      for (const c of signals?.crossingsOn(i) ?? []) out.push({ s: c.f * r.L, sig: c.signal });
      return out;
    });

    const mat = (c: string) => hazed(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
    const torsoGeo = new THREE.CylinderGeometry(0.032, 0.027, TORSO, 7);
    torsoGeo.translate(0, LEG + TORSO / 2, 0);
    const headGeo = new THREE.SphereGeometry(HEAD, 8, 6);
    headGeo.translate(0, LEG + TORSO + HEAD * 0.9, 0);
    const legGeo = new THREE.BoxGeometry(0.022, LEG, 0.022);
    // a leg hangs from the hip (its top at the origin), so it swings from there
    legGeo.translate(0, -LEG / 2, 0);
    this.torso = new THREE.InstancedMesh(torsoGeo, mat("#ffffff"), MAX_PEDS);
    this.head = new THREE.InstancedMesh(headGeo, mat("#ffffff"), MAX_PEDS);
    this.legs = new THREE.InstancedMesh(legGeo, mat("#ffffff"), MAX_PEDS * 2);
    for (const m of [this.torso, this.head, this.legs]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = m === this.torso;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    this.dummy.rotation.order = "YXZ";
  }

  /** Where a road's zebra lies before a junction (roads.ts). */
  private cross(n: NodeInfo) {
    return n.rb ? n.rb.outer + 0.22 : n.wmax / 2 + 0.32;
  }

  /** Where the pavement stops before a junction (roads.ts). */
  private kerbStop(n: NodeInfo) {
    return n.rb ? n.rb.outer + 0.02 : n.deg >= 3 ? n.wmax / 2 + WALK + 0.02 : 0;
  }

  /** The stretch of a road's pavement. */
  private range(i: number): [number, number] {
    const r = this.roads[i];
    return [this.kerbStop(this.nodes[r.a]), r.L - this.kerbStop(this.nodes[r.b])];
  }

  /** A point on a road's pavement (the middle of the walk), or on its carriageway at offset `u`. */
  private pavement(i: number, s: number, side: number, u?: number): P2 {
    const r = this.roads[i];
    pointOn(r, s, this.o);
    const off = u ?? side * (r.l / 2 + 0.02 + KERB + WALK / 2);
    return [this.o.x - this.o.tz * off, this.o.z + this.o.tx * off];
  }

  setFar(far: boolean) {
    this.far = far;
  }

  /** People walk the pavements of the open districts' town streets (bridges have none). */
  setOpen(unlocked: ReadonlySet<string>) {
    this.walkLen = 0;
    this.walkable = this.roads.map((r, i) => {
      if (!r.urban || r.ring || r.decks.length || !roadOpen(i, unlocked)) return false;
      const [a, b] = this.range(i);
      if (b - a < 0.6) return false;
      this.walkLen += b - a;
      return true;
    });
    for (const p of this.peds) if (!this.walkable[p.road]) p.leaving = true;
  }

  /** Those on a crossing now: the cars stop for them. */
  bodies(): readonly Body[] {
    const out: Body[] = [];
    for (const p of this.peds) if (p.mode === "cross" && p.alpha > 0.3) out.push(p.body);
    return out;
  }

  private target(dark: number) {
    return Math.round(Math.min(MAX_PEDS, this.walkLen * PER_UNIT) * this.density * (1 - 0.6 * dark));
  }

  private spawn() {
    let k = Math.random() * this.walkLen;
    let road = -1;
    for (let i = 0; i < this.roads.length; i++) {
      if (!this.walkable[i]) continue;
      const [a, b] = this.range(i);
      k -= b - a;
      if (k <= 0) {
        road = i;
        break;
      }
    }
    if (road < 0) return;
    const [a, b] = this.range(road);
    const s = a + Math.random() * (b - a);
    const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const [x, z] = this.pavement(road, s, side);
    for (const p of this.peds) if (Math.abs(p.x - x) < 0.25 && Math.abs(p.z - z) < 0.25) return;
    const ped: Ped = {
      road, s, side, dir: Math.random() < 0.5 ? 1 : -1, mode: "walk", path: [], acc: [], d: 0, then: null, spot: null, wait: 0,
      speed: WALK_SPEED * (0.8 + Math.random() * 0.4), step: Math.random() * 6, x, y: 0, z, yaw: 0, alpha: 0, leaving: false,
      shirt: new THREE.Color(pick(SHIRTS)), trousers: new THREE.Color(pick(TROUSERS)), skin: new THREE.Color(pick(SKINS)), size: 0.92 + Math.random() * 0.16,
      body: { x, z, yaw: 0, half: 0.05, hard: true },
    };
    this.place(ped);
    this.peds.push(ped);
  }

  /** Off along a path (a crossing or a corner), then on along `then`. */
  private follow(p: Ped, mode: "cross" | "corner", pts: P2[], then: Ped["then"]) {
    p.mode = mode;
    p.path = pts;
    p.acc = cumulative(pts);
    p.d = 0;
    p.then = then;
  }

  /** At the end of their pavement: round the corner, on along the next street, or back. */
  private atEnd(p: Ped) {
    const r = this.roads[p.road];
    const k = p.dir > 0 ? r.b : r.a;
    const n = this.nodes[k];
    const here: P2 = [p.x, p.z];
    const back = () => {
      p.dir = p.dir > 0 ? -1 : 1;
    };
    if (n.deg === 2 && !n.rb) {
      // a bend: the street goes on as another road, on the same side
      const i = n.roads.find((j) => j !== p.road);
      if (i === undefined || !this.walkable[i]) return back();
      const r2 = this.roads[i];
      const dir: 1 | -1 = r2.a === k ? 1 : -1;
      const rel = p.side * p.dir;
      p.road = i;
      p.dir = dir;
      p.side = (rel * dir) as 1 | -1;
      p.s = dir > 0 ? this.range(i)[0] : this.range(i)[1];
      return;
    }
    if (n.deg < 3 || Math.random() < 0.12) return back();
    // round the corner: the nearest pavement end of another street there (the same block)
    let best: { road: number; side: 1 | -1; s: number; dir: 1 | -1; at: P2 } | null = null;
    let bestD = Infinity;
    for (const i of n.roads) {
      if (i === p.road || !this.walkable[i]) continue;
      const r2 = this.roads[i];
      const dir: 1 | -1 = r2.a === k ? 1 : -1;
      const [a, b] = this.range(i);
      const s = dir > 0 ? a : b;
      for (const side of [1, -1] as const) {
        const at = this.pavement(i, s, side);
        const d = Math.hypot(at[0] - here[0], at[1] - here[1]);
        if (d < bestD) {
          bestD = d;
          best = { road: i, side, s, dir, at };
        }
      }
    }
    if (!best || bestD > 3.5) return back();
    let pts: P2[] = [here, best.at];
    const rb = n.rb;
    if (rb) {
      // round the ring's pavement
      const R = rb.outer + KERB + WALK / 2 + 0.02;
      const a0 = Math.atan2(here[1] - rb.z, here[0] - rb.x);
      let da = Math.atan2(best.at[1] - rb.z, best.at[0] - rb.x) - a0;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.2));
      pts = [here];
      for (let j = 0; j <= steps; j++) {
        const a = a0 + (da * j) / steps;
        pts.push([rb.x + Math.cos(a) * R, rb.z + Math.sin(a) * R]);
      }
      pts.push(best.at);
    }
    this.follow(p, "corner", pts, { road: best.road, s: best.s, dir: best.dir, side: best.side });
  }

  /** May they step out onto the zebra now? */
  private mayCross(p: Ped, spot: Spot, from: P2, to: P2) {
    if (spot.sig) {
      this.signals!.callCrossing(spot.sig, p.road);
      return this.signals!.walk(spot.sig, p.road) && !this.busy(from, to, 0.6);
    }
    return !this.busy(from, to, 1.4);
  }

  private walk(p: Ped, dt: number) {
    const [a, b] = this.range(p.road);
    const s0 = p.s;
    let s1 = s0 + p.dir * p.speed * dt;
    // a zebra on the way: across now and then
    if (!p.leaving)
      for (const spot of this.spots[p.road]) {
        const passed = p.dir > 0 ? spot.s > s0 && spot.s <= s1 : spot.s < s0 && spot.s >= s1;
        if (!passed || spot.s < a || spot.s > b || Math.random() > CROSS_CHANCE) continue;
        s1 = spot.s;
        p.mode = "wait";
        p.spot = spot;
        p.wait = 0;
        break;
      }
    p.s = Math.max(a, Math.min(b, s1));
    if (p.mode === "walk" && (p.dir > 0 ? p.s >= b : p.s <= a)) this.atEnd(p);
  }

  update(dt: number, dark: number) {
    // keep the crowd at its level (fewer by night)
    const want = this.target(dark);
    let n = 0;
    for (const p of this.peds) if (!p.leaving) n++;
    for (let i = 0; i < 2 && n < want; i++, n++) this.spawn();
    for (const p of this.peds) {
      if (n <= want) break;
      if (!p.leaving && p.mode === "walk") {
        p.leaving = true;
        n--;
      }
    }

    for (const p of this.peds) {
      p.alpha = p.leaving && p.mode === "walk" ? Math.max(0, p.alpha - dt) : Math.min(1, p.alpha + dt);
      if (p.mode === "walk") this.walk(p, dt);
      else if (p.mode === "wait") {
        const spot = p.spot!;
        const from = this.pavement(p.road, spot.s, p.side);
        const to = this.pavement(p.road, spot.s, -p.side);
        p.wait += dt;
        if (p.wait > WAIT_MAX) {
          // no chance came: walk on
          p.mode = "walk";
          p.s += p.dir * 0.02;
        } else if (this.mayCross(p, spot, from, to)) {
          // over to the other side, then on the same way along the street
          const s = Math.max(this.range(p.road)[0], Math.min(this.range(p.road)[1], spot.s));
          this.follow(p, "cross", [from, to], { road: p.road, s, dir: p.dir, side: p.side > 0 ? -1 : 1 });
        }
      } else {
        // crossing (the walkers' green held for them) or rounding a corner
        if (p.mode === "cross" && p.spot?.sig) this.signals!.callCrossing(p.spot.sig, p.road);
        p.d += (p.mode === "cross" ? CROSS_SPEED : p.speed) * dt;
        if (p.d >= p.acc[p.acc.length - 1]) {
          const t = p.then!;
          p.road = t.road;
          p.s = t.s;
          p.dir = t.dir;
          p.side = t.side;
          p.mode = "walk";
          p.spot = null;
          p.then = null;
        }
      }
      this.place(p);
      if (p.mode !== "wait") p.step += dt * (p.mode === "cross" ? CROSS_SPEED : p.speed) * 34;
    }
    this.peds = this.peds.filter((p) => !(p.leaving && p.alpha <= 0));
    this.draw();
  }

  /** Where they are now, and which way they face. */
  private place(p: Ped) {
    let x: number;
    let z: number;
    let tx: number;
    let tz: number;
    let kerb = KERB_H;
    if (p.mode === "cross" || p.mode === "corner") {
      [x, z, tx, tz] = pointAlong(p.path, p.acc, p.d);
      if (p.mode === "cross") kerb = 0;
    } else {
      [x, z] = this.pavement(p.road, p.s, p.side);
      tx = this.o.tx * p.dir;
      tz = this.o.tz * p.dir;
      if (p.mode === "wait") {
        // facing the street they wait to cross
        const r = p.side;
        tx = this.o.tz * r;
        tz = -this.o.tx * r;
      }
    }
    p.x = x;
    p.z = z;
    p.y = Math.max(this.ground.at(x, z), 0) + ROAD_LIFT + kerb;
    if (Math.abs(tx) + Math.abs(tz) > 1e-6) p.yaw = Math.atan2(-tz, tx);
    p.body.x = x;
    p.body.z = z;
    p.body.yaw = p.yaw;
  }

  private draw() {
    const vis = !this.far && this.peds.length > 0;
    this.root.visible = vis;
    if (!vis) return;
    const d = this.dummy;
    let n = 0;
    for (const p of this.peds) {
      if (p.alpha <= 0.02 || n >= MAX_PEDS) continue;
      const sc = p.size * (0.3 + 0.7 * p.alpha);
      const moving = p.mode !== "wait";
      const swing = moving ? Math.sin(p.step) * 0.5 : 0;
      const bob = moving ? Math.abs(Math.cos(p.step)) * 0.006 : 0;
      d.position.set(p.x, p.y + bob, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.setScalar(sc);
      d.updateMatrix();
      this.torso.setMatrixAt(n, d.matrix);
      this.torso.setColorAt(n, p.shirt);
      this.head.setMatrixAt(n, d.matrix);
      this.head.setColorAt(n, p.skin);
      // the legs swing from the hips, one forward as the other goes back
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      for (const [k, side] of [
        [0, 1],
        [1, -1],
      ] as const) {
        // the hip: up from the feet, out to the side (local z, turned with the body)
        const off = 0.015 * side * sc;
        d.position.set(p.x + s * off, p.y + bob + LEG * sc, p.z + c * off);
        d.rotation.set(0, p.yaw, swing * side);
        d.updateMatrix();
        this.legs.setMatrixAt(n * 2 + k, d.matrix);
        this.legs.setColorAt(n * 2 + k, p.trousers);
      }
      n++;
    }
    this.torso.count = this.head.count = n;
    this.legs.count = n * 2;
    for (const m of [this.torso, this.head, this.legs]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of [this.torso, this.head, this.legs]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.root.clear();
    this.peds = [];
  }
}
