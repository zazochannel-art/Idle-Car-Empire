// Traffic on the island map. The supply-chain trucks are the game's real
// shipments: each one drives its road route between the two lots (the same
// route the engine timed it on), loaded on the way out and empty on the way
// back. Around them: town traffic on the open roads, buyers driving off in
// the car they just bought, and the first car rolling out of its plant.
import * as THREE from "three";
import { WORLD_MAP, along, plotOf, roadOpen, roadRoute, roadsBetween, type Entry, type Plot } from "@/game/city/layout";
import { buildCar, buildCarrier, buildTruck, loadHeroes, materialKit, type MaterialKit } from "../../three/car-models";
import type { ShipView, Site, VehiclePick } from "../map-types";
import { CAR_COLORS, type CarModel } from "../vehicles";
import type { Fx } from "./fx";
import type { Lamp } from "./street-lights";

/** Simple unbranded commuter traffic only. Hero/special cars stay reserved for the player, showroom and events. */
const TRAFFIC_MODELS: readonly CarModel[] = ["city", "compact", "sedan", "wagon", "minivan"];
const TRAFFIC_SCALE: Record<CarModel, number> = {
  city: 0.9,
  compact: 0.86,
  sedan: 1,
  wagon: 1.03,
  minivan: 1.12,
  suv: 1,
  sports: 1,
  muscle: 1,
  luxury: 1,
  supercar: 1,
  hypercar: 1,
  electric: 1,
  offroad: 1,
  pickup: 1,
  robotaxi: 1,
};
import { aroundRings, ringPath, type Roundabout } from "./junctions";
import { freezeStatic, hazed, shadowFromLargest } from "./kit";
import { ROAD_LIFT, carGeometry, roadSurface, type MapRoad } from "./scenery";
import type { Arm, Signal, Signals } from "./signals";
import { bake } from "./structures";
import type { Ground } from "./terrain";

/** World units per metre for the vehicle models (a touch over life size, so they read from above). */
const VSCALE = 0.12;
/** Town cars keep about the trucks' pace (the engine times trucks at ROAD_SPEED tiles/s, with stops). */
const TOWN_SPEED = 1.9;
const COUNTRY_SPEED = 3.6;
/** Town cars at most: each is a full 3D model (several draw calls), so phones stay smooth. */
const MAX_CARS = 24;
/** Road length (world units) per town car: a calm town, not a traffic jam. */
const ROAD_PER_CAR = 20;
/** Buyers driving off at once, and the gap between two at the same dealership (s): a busy dealer sells several cars a second. */
const MAX_BUYERS = 5;
const BUYER_GAP = 4;
/** How fast a car gets back to its pace after slowing (units/s²). */
const ACCEL = 2.4;
/** Share of its pace a car keeps through a turn, and round a roundabout. */
const TURN_PACE = 0.75;
const RING_PACE = 0.62;
/** A truck may run this far (s) behind its shipment's clock while it waits for the car in front. */
const TRUCK_LAG = 2.5;
/** The free room (units) a car leaves to the one in front, and from where it starts to slow. */
const STOP_GAP = 0.12;
const SLOW_GAP = 0.85;
/** A car that has stood this long (s) edges through a junction, then through anything (no jam lasts). */
const WAIT_CROSS = 2;
const WAIT_ANY = 5;
/** …and past a red light or a pedestrian only after this long (should anything ever hold a car there for good). */
const WAIT_HARD = 16;

type P3 = [number, number, number];
type P2 = [number, number];

/** A car's way through a junction: a curve onto the next road, or round a roundabout. */
interface Turn {
  pts: P2[];
  acc: number[];
  /** Distance done along it. */
  d: number;
  /** The road it comes out on, the way along it, and where. */
  road: number;
  dir: 1 | -1;
  s: number;
  /** Round a roundabout (slower than a plain turn). */
  ring: boolean;
  /** The junction, and the road and way the car came in on. */
  node: number;
  from: number;
  fromDir: 1 | -1;
}

/** A car driving the roads on its own. */
interface RoadCar {
  road: number;
  s: number;
  dir: 1 | -1;
  /** Its own pace (a share of the road's speed), its speed now, and how long it has stood still. */
  pace: number;
  v: number;
  wait: number;
  /** Going through a junction. */
  turn: Turn | null;
  /** Half its length (others keep this far off its middle). */
  half: number;
  /** The road it takes at the next junction (chosen as it gets near), and its way through. */
  next: [number, boolean] | null;
  plan: Turn | null;
  color: THREE.Color;
  hex: string;
  model: CarModel;
  x: number;
  y: number;
  z: number;
  yaw: number;
  alpha: number;
  /** Seconds left before it drives off the map (buyers and the first car). */
  life: number;
  scale: number;
  visual: THREE.Group;
  hero?: boolean;
  /** A customer driving off in the car they just bought. */
  buyer?: boolean;
  /** Town traffic is painted in its own colour; buyers and the first car keep the model's factory look. */
  paint?: boolean;
  /** One of the company's own cars (the town drives them as sales grow). */
  own?: boolean;
  /** A bonus on the map (the golden car, the VIP's limousine): it drives until it is let go. */
  special?: { finish: "metallic" | "gloss" | "matte"; stretch: number };
  /** The body's lean in a turn and its dip when braking (radians), and what they were worked out from. */
  roll: number;
  pitch: number;
  vPrev: number;
  yawPrev: number;
  /** Cached road segment to avoid a binary search every rendered frame. */
  seg: number;
  /** Last visual alpha scale applied; avoids redundant matrix updates every frame. */
  visualScale: number;
}

interface Truck {
  view: ShipView;
  /** Yard → road → yard, with heights. */
  path: P3[];
  acc: number[];
  /** Local clock of the current leg (eased toward the engine's). */
  lt: number;
  back: boolean;
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Delivered: fading out in the yard. */
  gone: number;
  /** The shipment's clock as the engine runs it (lt, the one it is drawn at, may fall behind while it waits). */
  et: number;
  /** The two lots (the empty truck drives home on its own side of the road). */
  a: Plot;
  b: Plot;
  /** Its model's length, height and width (for the simple shape far out). */
  size?: THREE.Vector3;
}

/** The simple car shape's own size (length, height, width). */
const SHAPE = new THREE.Vector3(0.56, 0.29, 0.27);
/** Room in the far-out batch: every road car and every truck. */
const FAR_CAP = 256;

/** A vehicle model's size in its own frame (length along x, height, width along z). */
function modelSize(obj: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(part.copy(m.geometry.boundingBox!).applyMatrix4(m.matrix));
  });
  return box.isEmpty() ? SHAPE.clone() : box.getSize(new THREE.Vector3());
}

/** Where a lot's vehicles park: just inside its front edge, and the front edge itself. */
function yard(p: Plot, k = 0.7): [number, number] {
  const fx = Math.sin(p.rot);
  const fz = Math.cos(p.rot);
  return [p.x + fx * (p.d / 2 - k), p.y + fz * (p.d / 2 - k)];
}

function cumulative(pts: P3[]) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  return acc;
}

function cumulative2(pts: P2[]) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}

/** Something on the road that others keep behind: where it is, its heading and half its length. */
export interface Body {
  x: number;
  z: number;
  yaw: number;
  half: number;
  /** A red light's stop line or a pedestrian on a crossing: nobody edges past it after a short wait (only after WAIT_HARD). */
  hard?: boolean;
  /** Only holds those going its way (a stop line holds its own lane, not the cars turning across it). */
  oneWay?: boolean;
}

/** Point at distance s along a 3D path (and its direction on the ground). */
function at3(path: P3[], acc: number[], s: number) {
  const n = path.length;
  s = Math.max(0, Math.min(acc[n - 1], s));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (acc[m] <= s) lo = m;
    else hi = m;
  }
  const a = path[lo];
  const b = path[hi];
  const seg = acc[hi] - acc[lo] || 1;
  const f = (s - acc[lo]) / seg;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, tx: (b[0] - a[0]) / seg, tz: (b[2] - a[2]) / seg };
}

const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Same interpolation as along(), but reuses the current segment while a car moves. */
function alongCached(pts: [number, number][], acc: number[], s: number, hint: number, dir: 1 | -1) {
  const n = pts.length;
  s = Math.max(0, Math.min(acc[n - 1], s));
  let i = Math.max(0, Math.min(n - 2, hint));
  if (dir > 0) {
    while (i < n - 2 && acc[i + 1] < s) i++;
    while (i > 0 && acc[i] > s) i--;
  } else {
    while (i > 0 && acc[i] > s) i--;
    while (i < n - 2 && acc[i + 1] < s) i++;
  }
  const a = pts[i];
  const b = pts[i + 1];
  const seg = acc[i + 1] - acc[i] || 1;
  const f = (s - acc[i]) / seg;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, tx: (b[0] - a[0]) / seg, ty: (b[1] - a[1]) / seg, seg: i };
}


/** Half a vehicle's width, and the room kept beside it. */
const HALF_WIDTH = 0.14;
const SIDE_ROOM = 0.03;
/** Step (units) of the look along a vehicle's way ahead. */
const PROBE_STEP = 0.1;

/** Distance from a point to the middle line of a body (from its back to its front, less the rounded ends). */
function toBody(x: number, z: number, o: Body) {
  const ex = Math.cos(o.yaw);
  const ez = -Math.sin(o.yaw);
  const l = Math.max(0, o.half - HALF_WIDTH);
  const t = Math.max(-l, Math.min(l, (x - o.x) * ex + (z - o.z) * ez));
  return Math.hypot(x - o.x - ex * t, z - o.z - ez * t);
}

/**
 * How much of its pace a vehicle may keep (0–1) with `others` round it. It
 * looks along its own way ahead (`way(d)`: the point d units ahead of its
 * middle, round the bends and through the junction it is taking) and slows
 * for anything its front would run into there, stopping a little short.
 * Cars beside its way (oncoming ones in the other lane, those waiting at
 * a junction) are no obstacle. `wait` (s stood still) lets it edge on at last.
 */
export function clearance(me: Body, others: readonly Body[], way: (d: number) => [number, number], wait = 0): number {
  if (wait > WAIT_HARD) return 1;
  // only what is near enough to matter
  const R = me.half + SLOW_GAP + 1;
  const near: Body[] = [];
  for (const o of others) {
    if (o === me || (wait > WAIT_ANY && !o.hard)) continue;
    if (o.oneWay && Math.abs(angle(o.yaw - me.yaw)) > 0.8) continue;
    const dx = o.x - me.x;
    const dz = o.z - me.z;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    // already beside or behind its front: it is the one to wait (or we are passing); a stop line already under it is behind it
    const ahead = dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw);
    if (ahead <= (o.oneWay ? me.half - 0.05 : 0)) continue;
    // standing long enough, it edges past anything not going its way
    if (wait > WAIT_CROSS && !o.hard && Math.abs(angle(o.yaw - me.yaw)) > 0.8) continue;
    near.push(o);
  }
  if (!near.length) return 1;
  for (let gap = 0; gap <= SLOW_GAP; gap += PROBE_STEP) {
    const [x, z] = way(me.half + gap);
    for (const o of near) if (toBody(x, z, o) < 2 * HALF_WIDTH + SIDE_ROOM) return Math.max(0, Math.min(1, (gap - STOP_GAP) / (SLOW_GAP - STOP_GAP)));
  }
  return 1;
}

/** Where the vehicles on an arm of a signal stop for its red light. */
interface StopLine {
  sig: Signal;
  arm: Arm;
  /** The stop line itself (a hard, one-way body while the light is red). */
  body: Body;
  /** Direction of travel. */
  tx: number;
  tz: number;
}

/** The cab paint trucks are built with, swapped for each truck's own colour (no truck is this colour). */
const CAB_PLACEHOLDER = "#fe01fe";

export class Traffic3D {
  readonly root = new THREE.Group();
  /** Share of the usual town traffic (low graphics halves it). */
  density = 1;
  /** A carrier reached its dealership (for the "🚗" pop). */
  onArrive: (siteId: string) => void = () => {};
  private cars: RoadCar[] = [];
  private trucks = new Map<number, Truck>();
  private open: boolean[] = [];
  private openLen = 0;
  /** Roads leaving each junction: [road, forward]. */
  private exits: [number, boolean][][] = [];
  /** Far out, every road car is drawn from this one batch of simple car shapes. */
  private inst: THREE.InstancedMesh;
  private far = false;
  private kit: MaterialKit = materialKit(THREE);
  private models = new Map<string, THREE.Group>();
  private carMats = new Map<string, THREE.Material>();
  private carGeo = carGeometry();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private col = new THREE.Color();
  hero: RoadCar | null = null;
  fx: Pick<Fx, "evAura" | "exhaustFume"> | null = null;
  /** Seconds since start, and when each dealership last sent a buyer off. */
  private clock = 0;
  private lastBuyer = new Map<string, number>();

  /** How far before a junction a car leaves its road to turn (0: it just carries on). */
  private cut: number[] = [];
  /** How much further back than that a car waits at a junction it may not go into yet, off its zebra crossing (per road end: [at a, at b]). */
  private hold: [number, number][] = [];
  /** Every signal's stop lines, and those showing red now. */
  private stopLines: StopLine[] = [];
  private stops: Body[] = [];
  /** Others on the roads the cars keep behind: the pedestrians on the crossings (pedestrians.ts). */
  obstacles: () => readonly Body[] = () => [];

  constructor(
    private ground: Ground,
    private mapRoads: MapRoad[],
    carMat: THREE.Material,
    private rings: ReadonlyMap<number, Roundabout> = new Map(),
    private signals: Signals | null = null,
  ) {
    this.root.name = "traffic";
    this.inst = new THREE.InstancedMesh(this.carGeo, carMat, FAR_CAP);
    this.inst.count = 0;
    this.inst.castShadow = true;
    this.inst.frustumCulled = false;
    this.inst.count = 0;
    this.inst.visible = false;
    this.root.add(this.inst);
    void loadHeroes(THREE).then(() => {
      for (const car of this.cars) this.refreshCarVisual(car);
    });
    const N = WORLD_MAP.nodes.length;
    this.exits = Array.from({ length: N }, () => []);
    WORLD_MAP.roads.forEach((r, i) => {
      this.exits[r.a].push([i, true]);
      if (!r.oneway) this.exits[r.b].push([i, false]);
    });
    // where three roads meet or more, cars turn on a curve from a little before it (round the ring at a roundabout);
    // on the old roundabout's own ring (one-way roads) they keep to its line
    const deg = new Array<number>(N).fill(0);
    const wmax = new Array<number>(N).fill(0);
    const ring = new Array<boolean>(N).fill(false);
    for (const r of WORLD_MAP.roads)
      for (const k of [r.a, r.b]) {
        deg[k]++;
        wmax[k] = Math.max(wmax[k], r.w);
        if (r.oneway) ring[k] = true;
      }
    this.cut = Array.from({ length: N }, (_, i) => {
      const rb = this.rings.get(i);
      if (rb) return rb.outer + 0.25;
      return deg[i] >= 3 && !ring[i] ? wmax[i] * 0.62 + 0.3 : 0;
    });
    // town streets have a zebra crossing just before their junctions (roads.ts): a waiting car stops short of it
    this.hold = WORLD_MAP.roads.map((r, i) => {
      const mr = this.mapRoads[i];
      return [r.a, r.b].map((n) => {
        if (!mr?.urban || mr.ring || deg[n] < 3 || ring[n] || this.cut[n] <= 0) return 0;
        const rb = this.rings.get(n);
        const far = (rb ? rb.outer + 0.22 : wmax[n] / 2 + 0.32) + 0.13 + 0.04;
        return Math.max(0, far + 0.28 - this.cut[n]);
      }) as [number, number];
    });
    if (signals) {
      for (const sig of signals.list)
        for (const arm of sig.arms) {
          const r = WORLD_MAP.roads[arm.road];
          let at: number;
          if (sig.node >= 0) {
            // just inside the junction's line: the first car stops at the line, off the crossing
            const line = arm.dir > 0 ? r.len - this.cut[sig.node] : this.cut[sig.node];
            at = line + arm.dir * 0.25;
          } else {
            const c = signals.crossings.find((x) => x.signal === sig)!;
            at = c.f * r.len - arm.dir * 0.05;
          }
          const p = this.lanePoint(arm.road, Math.max(0, Math.min(r.len, at)), arm.dir);
          this.stopLines.push({ sig, arm, tx: p.tx, tz: p.tz, body: { x: p.x, z: p.z, yaw: Math.atan2(-p.tz, p.tx), half: 0.05, hard: true, oneWay: true } });
        }
    }
  }

  /** How far before its junction's line a car waits when it may not go in. */
  private holdAt(c: RoadCar, node: number) {
    const h = this.hold[c.road];
    if (!h) return 0;
    return node === WORLD_MAP.roads[c.road].b ? h[1] : h[0];
  }

  /**
   * Pedestrians look before they cross from `a` to `b`: is a car or truck
   * standing on the crossing, or moving within `r` of its middle?
   */
  busyNear(a: [number, number], b: [number, number], r: number): boolean {
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const on = (o: Body) => {
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        if (toBody(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, o) < HALF_WIDTH + 0.08) return true;
      }
      return false;
    };
    for (const c of this.cars) {
      if (c.alpha < 0.5) continue;
      const d = Math.hypot(c.x - mx, c.z - mz);
      if (d > r + 0.6) continue;
      if ((d < r && c.v > 0.15) || on(c)) return true;
    }
    for (const t of this.trucks.values()) {
      if (t.gone) continue;
      const d = Math.hypot(t.x - mx, t.z - mz);
      if (d < r + 0.3 || (d < r + 1.2 && on(this.truckBody(t)))) return true;
    }
    return false;
  }

  /** Every vehicle on the roads now, for the headlights: position, heading, half its length and half its width. */
  *lamps(): Generator<Lamp> {
    for (const c of this.cars) if (c.alpha > 0.05) yield [c.x, c.y, c.z, c.yaw, c.half, 0.1 * c.scale, c.alpha, c.v < this.cruise(c) * 0.7 ? 1 : 0];
    for (const t of this.trucks.values()) {
      const size = (t.size ??= modelSize(t.obj));
      yield [t.x, t.y, t.z, t.yaw, size.x / 2, size.z / 2, t.gone > 0 ? Math.max(0, 1 - t.gone / 0.8) : 1];
    }
  }

  /** The signals' red stop lines hold the traffic; who waits at one calls its green (a truck at once: it is on the clock). */
  private watchSignals() {
    this.stops.length = 0;
    if (!this.signals) return;
    for (const st of this.stopLines) {
      const red = this.signals.show(st.sig, st.arm) === "red";
      if (red) this.stops.push(st.body);
      const b = st.body;
      const near = (x: number, z: number, yaw: number) => {
        const dx = b.x - x;
        const dz = b.z - z;
        if (dx * dx + dz * dz > 3.2) return false;
        // facing its way, not yet past it
        return Math.cos(yaw) * st.tx - Math.sin(yaw) * st.tz > 0.6 && dx * st.tx + dz * st.tz > -0.05;
      };
      let car = false;
      for (const c of this.cars) if (!c.turn && c.road === st.arm.road && c.dir === st.arm.dir && c.alpha > 0.5 && near(c.x, c.z, c.yaw)) car = true;
      let truck = false;
      for (const t of this.trucks.values()) if (!t.gone && near(t.x, t.z, t.yaw)) truck = true;
      if (car || truck) this.signals.call(st.sig, st.arm, truck);
    }
  }

  /**
   * From far out a car is a few pixels wide: then the cars draw as one
   * instanced batch of simple shapes instead of a dozen meshes each.
   */
  setFar(far: boolean) {
    this.far = far;
  }

  /** Which roads carry traffic (those through open districts and territories). */
  setOpen(unlocked: ReadonlySet<string>) {
    this.open = WORLD_MAP.roads.map((_, i) => roadOpen(i, unlocked));
    this.openLen = WORLD_MAP.roads.reduce((a, r, i) => a + (this.open[i] ? r.len : 0), 0);
    // cars on roads that closed (a new game) leave
    this.cars = this.cars.filter((c) => {
      const keep = this.open[c.road] || c.life > 0;
      if (!keep) this.root.remove(c.visual);
      return keep;
    });
  }

  // ───────────────────────── road cars ─────────────────────────

  private target() {
    return Math.round(Math.min(MAX_CARS, this.openLen / ROAD_PER_CAR) * this.density);
  }

  /** The part of a road a car drives along (outside the junctions at its ends). */
  private span(road: number): [number, number] {
    const r = WORLD_MAP.roads[road];
    const s0 = this.cut[r.a];
    const s1 = r.len - this.cut[r.b];
    return s1 - s0 > 0.1 ? [s0, s1] : [r.len / 2, r.len / 2];
  }

  /** Nothing (car or truck) this close to a spot: room for a car to appear. */
  private roomAt(x: number, z: number, room = 1) {
    for (const c of this.cars) if (Math.abs(c.x - x) < room && Math.abs(c.z - z) < room) return false;
    for (const t of this.trucks.values()) if (!t.gone && Math.abs(t.x - x) < room + 0.4 && Math.abs(t.z - z) < room + 0.4) return false;
    return true;
  }

  /** A point on a road's right-hand lane, going `dir` along it, and the way it faces. */
  private lanePoint(road: number, s: number, dir: 1 | -1) {
    const r = WORLD_MAP.roads[road];
    const p = along(r.pts, r.acc, s);
    const dx = p.tx * dir;
    const dz = p.ty * dir;
    const lane = r.oneway ? 0 : r.w * 0.25;
    return { x: p.x - dz * lane, z: p.y + dx * lane, tx: dx, tz: dz };
  }

  /** The way from the end of a car's road, through `node`, onto the next road. */
  private makeTurn(c: RoadCar, node: number, next: [number, boolean], at = c.s): Turn {
    const from = this.lanePoint(c.road, at, c.dir);
    const nr = WORLD_MAP.roads[next[0]];
    const dir: 1 | -1 = next[1] ? 1 : -1;
    const cut = Math.min(this.cut[node], nr.len / 2);
    const s = dir > 0 ? cut : nr.len - cut;
    const to = this.lanePoint(next[0], s, dir);
    const rb = this.rings.get(node);
    let pts: P2[];
    if (rb) pts = ringPath(rb, [from.x, from.z], [to.x, to.z]);
    else {
      // a smooth curve from one lane into the other (a U-turn at a dead end too)
      const h = Math.max(0.35, Math.hypot(to.x - from.x, to.z - from.z) * 0.42);
      const p1: P2 = [from.x + from.tx * h, from.z + from.tz * h];
      const p2: P2 = [to.x - to.tx * h, to.z - to.tz * h];
      pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const d = 3 * u * t * t;
        const e = t * t * t;
        pts.push([a * from.x + b * p1[0] + d * p2[0] + e * to.x, a * from.z + b * p1[1] + d * p2[1] + e * to.z]);
      }
    }
    return { pts, acc: cumulative2(pts), d: 0, road: next[0], dir, s, ring: !!rb, node, from: c.road, fromDir: c.dir };
  }

  /** The junction a car on a road drives into next, and where it stops for it. */
  private ahead(c: RoadCar) {
    const r = WORLD_MAP.roads[c.road];
    const node = c.dir > 0 ? r.b : r.a;
    return { node, stop: c.dir > 0 ? r.len - this.cut[node] : this.cut[node] };
  }

  /** The road a car takes at `node` (it keeps its choice until it is through). */
  private choose(c: RoadCar, node: number): [number, boolean] | null {
    if (c.next) return c.next;
    const r = WORLD_MAP.roads[c.road];
    const back = c.road;
    const options = this.exits[node].filter(([i]) => (this.open[i] || c.life > 0) && i !== back);
    c.next = options.length ? options[Math.floor(Math.random() * options.length)] : r.oneway ? null : [back, node === r.a];
    const { stop } = this.ahead(c);
    c.plan = c.next && (this.cut[node] > 0 || c.next[0] === back) ? this.makeTurn(c, node, c.next, stop) : null;
    return c.next;
  }

  /**
   * May a car waiting at a junction go? At a plain junction one stream at a
   * time (the cars behind the one turning follow it); at a roundabout the
   * cars already on the ring go first, and a few at most are on it.
   */
  private mayEnter(c: RoadCar, node: number): boolean {
    const sig = this.signals?.at(node);
    if (sig) {
      // the lights: green (or amber at speed, too late to stop), and nobody from the other ways still in the junction
      const arm = sig.arms.find((a) => a.road === c.road);
      if (arm && c.wait < WAIT_HARD) {
        const light = this.signals!.show(sig, arm);
        if (light === "red" || (light === "amber" && c.v < this.cruise(c) * 0.5)) return false;
        for (const o of this.cars) {
          const t = o.turn;
          if (o === c || !t || t.node !== node) continue;
          const oa = sig.arms.find((a) => a.road === t.from);
          if (oa && oa.phase !== arm.phase) return false;
        }
        return true;
      }
    }
    if (this.cut[node] <= 0 || c.wait > 6) return true;
    const rb = this.rings.get(node);
    const ae = rb ? Math.atan2(c.z - rb.z, c.x - rb.x) : 0;
    let onRing = 0;
    for (const o of this.cars) {
      const t = o.turn;
      if (o === c || !t || t.node !== node || (o.life > 0 && o.alpha < 0.5)) continue;
      if (!rb) {
        if (t.from === c.road && t.fromDir === c.dir) continue;
        return false;
      }
      onRing++;
      // coming round toward this entry (the ring turns the angle down): give way
      const d = angle(Math.atan2(o.z - rb.z, o.x - rb.x) - ae);
      if (d > -0.35 && d < 1.5) return false;
    }
    return onRing < 4;
  }

  /** The point `d` ahead of a car along its way: its road, the junction it is taking, the road after. */
  private way(c: RoadCar, d: number): [number, number] {
    const t = c.turn;
    if (t) {
      const L = t.acc[t.acc.length - 1];
      if (t.d + d <= L) {
        const p = along(t.pts, t.acc, t.d + d);
        return [p.x, p.y];
      }
      const r = WORLD_MAP.roads[t.road];
      const p = this.lanePoint(t.road, Math.max(0, Math.min(r.len, t.s + (t.d + d - L) * t.dir)), t.dir);
      return [p.x, p.z];
    }
    const { node, stop } = this.ahead(c);
    const left = (stop - c.s) * c.dir;
    if (d <= left || this.cut[node] <= 0) {
      const r = WORLD_MAP.roads[c.road];
      const p = this.lanePoint(c.road, Math.max(0, Math.min(r.len, c.s + d * c.dir)), c.dir);
      return [p.x, p.z];
    }
    // past the line: the way through the junction it chose (straight on if it has not chosen yet)
    const plan = c.plan;
    const k = d - Math.max(0, left);
    if (plan && k <= plan.acc[plan.acc.length - 1]) {
      const p = along(plan.pts, plan.acc, k);
      return [p.x, p.y];
    }
    const p = this.lanePoint(c.road, stop, c.dir);
    return [p.x + p.tx * k, p.z + p.tz * k];
  }

  /** A car's usual speed on its road. */
  private cruise(c: RoadCar) {
    const r = WORLD_MAP.roads[c.turn ? c.turn.road : c.road];
    const base = (r.fast ? COUNTRY_SPEED : TOWN_SPEED) * c.pace * (c.hero ? 0.6 : 1) * (c.special ? 0.8 : 1);
    return c.turn ? base * (c.turn.ring ? RING_PACE : TURN_PACE) : base;
  }

  private randomRoad(): number {
    let k = Math.random() * this.openLen;
    for (let i = 0; i < WORLD_MAP.roads.length; i++) {
      if (!this.open[i]) continue;
      k -= WORLD_MAP.roads[i].len;
      if (k <= 0) return i;
    }
    return this.open.indexOf(true);
  }

  private newCar(road: number, s: number, dir: 1 | -1, hex: string, model: CarModel, life = 0, scale = 1, paint = false): RoadCar {
    const r = WORLD_MAP.roads[road];
    if (r.oneway) dir = 1;
    const [s0, s1] = this.span(road);
    s = Math.max(s0, Math.min(s1, s));
    const c: RoadCar = {
      road, s, dir,
      pace: 0.88 + Math.random() * 0.24,
      v: 0,
      wait: 0,
      turn: null,
      next: null,
      plan: null,
      half: 0.28 * scale,
      color: new THREE.Color(hex), hex, model, x: 0, y: 0, z: 0, yaw: 0,
      alpha: life ? 0 : 1, life, scale, paint, visual: new THREE.Group(), seg: 0, visualScale: -1, roll: 0, pitch: 0, vPrev: 0, yawPrev: 0,
    };
    // yaw first, then lean about the car's own long axis and dip about its cross axis
    c.visual.rotation.order = "YXZ";
    c.visual.name = `traffic-car-${model}`;
    this.root.add(c.visual);
    this.refreshCarVisual(c);
    this.place(c, 1);
    return c;
  }

  private spawnAmbient() {
    // a free stretch of an open road (a few tries), so no car appears on top of another
    let road = -1;
    let s = 0;
    let dir: 1 | -1 = 1;
    for (let k = 0; k < 4 && road < 0; k++) {
      const i = this.randomRoad();
      if (i < 0) return;
      const [s0, s1] = this.span(i);
      const ss = s0 + Math.random() * (s1 - s0);
      const d: 1 | -1 = WORLD_MAP.roads[i].oneway || Math.random() < 0.5 ? 1 : -1;
      const p = this.lanePoint(i, ss, d);
      if (this.roomAt(p.x, p.z)) [road, s, dir] = [i, ss, d];
    }
    if (road < 0) return;
    // as the company sells, more of the town drives its cars
    const mine = this.own.length && Math.random() < this.ownShare ? this.own[Math.floor(Math.random() * this.own.length)] : null;
    const hex = mine?.color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const model = mine?.model ?? TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)];
    const c = this.newCar(road, s, dir, hex, model, 0, mine ? 1 : TRAFFIC_SCALE[model], mine ? mine.paint : true);
    c.v = this.cruise(c);
    c.own = !!mine;
    c.alpha = 0;
    this.cars.push(c);
  }

  private own: { model: CarModel; color: string; paint: boolean }[] = [];
  private ownShare = 0;

  /**
   * The company's models and the share of the town that drives them: the
   * cars already on the roads change hands too (a fixed spread of them), so
   * the mix follows sales without waiting for new cars.
   */
  setOwn(own: { model: CarModel; color: string; paint: boolean }[], share: number) {
    this.own = own;
    this.ownShare = own.length ? share : 0;
    let i = 0;
    for (const c of this.cars) {
      if (c.life || c.buyer || c.hero || c.special) continue;
      const k = i++;
      const want = this.own.length > 0 && ((k * 0.6180339887) % 1) < this.ownShare;
      const mine = want ? this.own[k % this.own.length] : null;
      if (mine) {
        if (c.own && c.model === mine.model && c.hex === mine.color) continue;
        Object.assign(c, { own: true, model: mine.model, hex: mine.color, paint: mine.paint, scale: 1 });
      } else if (c.own) {
        const model = TRAFFIC_MODELS[k % TRAFFIC_MODELS.length];
        Object.assign(c, { own: false, model, hex: CAR_COLORS[k % CAR_COLORS.length], paint: true, scale: TRAFFIC_SCALE[model] });
      } else continue;
      c.color.set(c.hex);
      c.visual.name = `traffic-car-${c.model}`;
      this.refreshCarVisual(c);
    }
  }

  /** A buyer drives off from a dealership in the car they bought. */
  spawnBuyer(site: Site, model: CarModel, color?: string) {
    // a few buyers stand for all the sales: one per dealership every few seconds, ten on the roads at most
    if (this.clock - (this.lastBuyer.get(site.id) ?? -Infinity) < BUYER_GAP) return;
    let buyers = 0;
    for (const c of this.cars) if (c.buyer) buyers++;
    if (buyers >= MAX_BUYERS) return;
    const e = site.entry;
    if (!this.roomAt(e.x, e.y, 0.8)) return;
    this.lastBuyer.set(site.id, this.clock);
    const c = this.newCar(e.edge, e.s, Math.random() < 0.5 ? 1 : -1, color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], model, 14);
    c.buyer = true;
    this.cars.push(c);
  }

  /** FIRST CAR: the new car rolls out of its plant and onto the road. */
  rollOut(site: Site, model: CarModel, color: string) {
    const c = this.newCar(site.entry.edge, site.entry.s, 1, color, model, 9, 1.5);
    c.hero = true;
    c.alpha = 1;
    this.cars.push(c);
    this.hero = c;
  }

  /**
   * A bonus car joins the traffic on an open road (the golden car, the VIP's
   * limousine): painted `color`, in `finish`, `stretch` times its length.
   * It drives until releaseSpecial.
   */
  spawnSpecial(model: CarModel, color: string, finish: "metallic" | "gloss" | "matte", stretch = 1, scale = 1.15): object | null {
    const road = this.randomRoad();
    if (road < 0) return null;
    const r = WORLD_MAP.roads[road];
    const c = this.newCar(road, Math.random() * r.len, r.oneway || Math.random() < 0.5 ? 1 : -1, color, model, 0, scale, false);
    c.special = { finish, stretch };
    c.alpha = 0;
    // built again now that it is special (its finish and length)
    this.refreshCarVisual(c);
    this.cars.push(c);
    return c;
  }

  /** The bonus car leaves (it fades out where it is). */
  releaseSpecial(ref: object) {
    const c = this.cars.find((x) => x === ref);
    if (c && !c.life) c.life = 1;
  }

  /** A truck model like those on the road (a red cab), for a truck that isn't a shipment. */
  truckObject(vehicle: ShipView["vehicle"], cargo = "#c08a4a"): THREE.Object3D {
    const site = { id: "", entry: WORLD_MAP.plots[0].entry, weight: 1 };
    return this.truckModel({ id: 0, from: site, to: site, t: 0, dur: 1, back: false, vehicle, color: cargo });
  }

  /**
   * A spot by the side of a road the trucks drive (on one of their routes when
   * some are out, else any open road): position and heading.
   */
  roadSpot(): { x: number; y: number; z: number; yaw: number } | null {
    const trucks = [...this.trucks.values()].filter((t) => !t.gone && t.path.length > 3);
    if (trucks.length) {
      const tr = trucks[Math.floor(Math.random() * trucks.length)];
      const L = tr.acc[tr.acc.length - 1];
      const p = at3(tr.path, tr.acc, L * (0.3 + Math.random() * 0.4));
      const yaw = Math.atan2(-p.tz, p.tx);
      // pulled over onto the right-hand shoulder
      return { x: p.x - p.tz * 0.18, y: p.y, z: p.z + p.tx * 0.18, yaw };
    }
    const road = this.randomRoad();
    if (road < 0) return null;
    const r = WORLD_MAP.roads[road];
    const p = along(r.pts, r.acc, r.len * (0.3 + Math.random() * 0.4));
    const lane = r.oneway ? 0 : r.w * 0.25 + 0.18;
    const x = p.x - p.ty * lane;
    const z = p.y + p.tx * lane;
    const mr = this.mapRoads[road];
    const y = (mr ? roadSurface(this.ground, mr, (r.len * 0.5 * mr.L) / r.len, x, z) : this.ground.at(x, z) + ROAD_LIFT) + 0.005;
    return { x, y: Math.max(y, this.ground.at(x, z) + ROAD_LIFT), z, yaw: Math.atan2(-p.ty, p.tx) };
  }

  /** Replace the generic traffic silhouette with the actual GLB-backed model. */
  private refreshCarVisual(c: RoadCar) {
    const model = buildCar(THREE, { model: c.model, color: c.hex, finish: c.special?.finish ?? "gloss", build: c.paint || c.special ? { color: c.hex } : undefined });
    if (!model.children.length) return;
    c.visual.clear();
    model.scale.setScalar(0.118 * c.scale);
    // a limousine: the same car, longer
    if (c.special) model.scale.x *= c.special.stretch;
    c.visual.add(model);
    // the model's parts only move with the car (c.visual); its shadow comes from the body
    freezeStatic(model);
    shadowFromLargest(model);
    c.visual.visible = c.alpha > 0.01;
  }

  /** Sets a car's position from its road and distance; `k` eases the heading. */
  private place(c: RoadCar, k: number) {
    if (c.turn) {
      const t = c.turn;
      const p = along(t.pts, t.acc, t.d);
      c.x = p.x;
      c.z = p.y;
      c.y = Math.max(this.ground.at(c.x, c.z), 0) + ROAD_LIFT + 0.005;
      const yaw = Math.atan2(-p.ty, p.tx);
      c.yaw = k >= 1 ? yaw : c.yaw + angle(yaw - c.yaw) * k;
      c.visual.position.set(c.x, c.y, c.z);
      c.visual.rotation.set(c.roll, c.yaw, c.pitch);
      c.visual.visible = c.alpha > 0.01;
      return;
    }
    const r = WORLD_MAP.roads[c.road];
    const p = alongCached(r.pts, r.acc, c.s, c.seg, c.dir);
    c.seg = p.seg;
    const dx = p.tx * c.dir;
    const dz = p.ty * c.dir;
    const lane = r.oneway ? 0 : r.w * 0.25;
    c.x = p.x - dz * lane;
    c.z = p.y + dx * lane;
    const mr = this.mapRoads[c.road];
    c.y = (mr ? roadSurface(this.ground, mr, (c.s * mr.L) / r.len, c.x, c.z) : this.ground.at(c.x, c.z) + ROAD_LIFT) + 0.005;
    const yaw = Math.atan2(-dz, dx);
    c.yaw = k >= 1 ? yaw : c.yaw + angle(yaw - c.yaw) * k;
    c.visual.position.set(c.x, c.y, c.z);
    c.visual.rotation.set(c.roll, c.yaw, c.pitch);
    c.visual.visible = c.alpha > 0.01;
  }

  private drive(c: RoadCar, dt: number) {
    let move = c.v * dt;
    for (let guard = 0; move > 0 && guard < 6; guard++) {
      const t = c.turn;
      if (t) {
        const left = t.acc[t.acc.length - 1] - t.d;
        if (move < left) {
          t.d += move;
          break;
        }
        // out of the junction, on the next road
        move -= left;
        c.road = t.road;
        c.dir = t.dir;
        c.s = t.s;
        c.turn = null;
        c.seg = c.dir > 0 ? 0 : Math.max(0, WORLD_MAP.roads[c.road].pts.length - 2);
        continue;
      }
      const { node, stop } = this.ahead(c);
      const left = (stop - c.s) * c.dir;
      if (move < left) {
        c.s += move * c.dir;
        break;
      }
      move -= Math.max(0, left);
      c.s = stop;
      const back = c.road;
      const pick = this.choose(c, node);
      if (!pick) {
        c.life = Math.max(c.life, 0.01);
        break;
      }
      // waits at the line until the junction is free
      if (!this.mayEnter(c, node)) break;
      const plan = c.plan;
      c.next = null;
      c.plan = null;
      if (this.cut[node] > 0 || pick[0] === back) c.turn = plan ?? this.makeTurn(c, node, pick);
      else {
        // a bend between two roads: straight on
        c.road = pick[0];
        c.dir = pick[1] ? 1 : -1;
        c.s = pick[1] ? 0 : WORLD_MAP.roads[c.road].len;
        c.seg = c.dir > 0 ? 0 : Math.max(0, WORLD_MAP.roads[c.road].pts.length - 2);
      }
    }
    this.place(c, Math.min(1, dt * 8));
  }

  // ───────────────────────── shipments ─────────────────────────

  /** The road route between two lots with heights, driving on the right, yard to yard. */
  private route(a: Plot, b: Plot): P3[] {
    const ea = a.entry;
    const eb = b.entry;
    const pts: P3[] = [];
    const push = (x: number, z: number, y?: number) => pts.push([x, y ?? this.ground.at(x, z) + 0.01, z]);
    const slice = (i: number, s0: number, s1: number) => {
      const rd = WORLD_MAP.roads[i];
      const mr = this.mapRoads[i];
      const lane = rd.oneway ? 0 : rd.w * 0.25;
      const fwd = s1 >= s0;
      const ss: number[] = [s0];
      if (fwd) {
        for (let k = 0; k < rd.pts.length; k++) if (rd.acc[k] > s0 + 1e-6 && rd.acc[k] < s1 - 1e-6) ss.push(rd.acc[k]);
      } else for (let k = rd.pts.length - 1; k >= 0; k--) if (rd.acc[k] < s0 - 1e-6 && rd.acc[k] > s1 + 1e-6) ss.push(rd.acc[k]);
      ss.push(s1);
      for (const s of ss) {
        const p = along(rd.pts, rd.acc, s);
        const d = fwd ? 1 : -1;
        const x = p.x - p.ty * d * lane;
        const z = p.y + p.tx * d * lane;
        push(x, z, (mr ? roadSurface(this.ground, mr, (s * mr.L) / rd.len, x, z) : this.ground.at(x, z) + ROAD_LIFT) + 0.005);
      }
    };
    const [yax, yaz] = yard(a);
    const [fax, faz] = yard(a, 0);
    push(yax, yaz);
    push(fax, faz);
    const r = roadRoute(ea, eb);
    if (r.from === null || r.to === null) slice(ea.edge, ea.s, eb.s);
    else {
      const ra = WORLD_MAP.roads[ea.edge];
      const rb = WORLD_MAP.roads[eb.edge];
      slice(ea.edge, ea.s, r.from === ra.b ? ra.len : 0);
      for (const { road, forward } of roadsBetween(r.from, r.to)) slice(road, forward ? 0 : WORLD_MAP.roads[road].len, forward ? WORLD_MAP.roads[road].len : 0);
      slice(eb.edge, r.to === rb.a ? 0 : rb.len, eb.s);
    }
    const [fbx, fbz] = yard(b, 0);
    const [ybx, ybz] = yard(b);
    push(fbx, fbz);
    push(ybx, ybz);
    // drop repeated points (slice ends meet at the junctions), then drive round the roundabouts on the way
    const line = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 1e-3);
    return aroundRings(line, this.rings.values(), (x, z) => this.ground.at(x, z) + ROAD_LIFT + 0.005);
  }

  private truckModel(v: ShipView) {
    const empty = v.back;
    const cabColors = ["#e11d48", "#2563eb", "#f59e0b", "#f2f4f7", "#334155", "#16a34a"];
    const cabColor = cabColors[Math.abs(v.id) % cabColors.length];
    // each kind of truck is built (and baked) once, with a placeholder cab paint that every copy swaps
    // for its own colour; the cars on a carrier's decks are simple shapes added to each copy. (A model per
    // cab colour, and per carrier load, kept building new trucks while playing.)
    const key = v.vehicle === "carrier" ? "carrier" : `${v.vehicle}|${v.color}|${empty}`;
    let base = this.models.get(key);
    if (!base) {
      base = bake(v.vehicle === "carrier" ? buildCarrier(THREE, this.kit, [], 0, CAB_PLACEHOLDER) : buildTruck(THREE, this.kit, { kind: v.vehicle, cargo: v.color, empty, cabColor: CAB_PLACEHOLDER }), VSCALE);
      this.models.set(key, base);
    }
    const m = base.clone();
    const placeholder = this.kit.paint(CAB_PLACEHOLDER, "gloss");
    const paint = this.kit.paint(cabColor, "gloss");
    if (!paint.userData.hazed) {
      hazed(paint);
      paint.userData.hazed = true;
    }
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material === placeholder) mesh.material = paint;
    });
    if (v.vehicle === "carrier" && !empty) {
      const slots: [number, number][] = [
        [-2.4, 0.95],
        [-6.0, 0.95],
        [-2.4, 2.65],
        [-6.0, 2.65],
      ];
      (v.models ?? []).slice(0, 4).forEach((model, i) => {
        const car = new THREE.Mesh(this.carGeo, this.carMat(CAR_COLORS[(model.length * 3 + i) % CAR_COLORS.length]));
        car.scale.setScalar(10 * VSCALE * 0.75);
        car.position.set(slots[i][0] * VSCALE + 1.4 * VSCALE, slots[i][1] * VSCALE, 0);
        m.add(car);
      });
    }
    // the truck's parts (and the cars on a carrier) only move with the truck; its shadow comes from its big parts
    for (const part of m.children) freezeStatic(part);
    shadowFromLargest(m, 0.35);
    return m;
  }

  private carMat(hex: string) {
    let m = this.carMats.get(hex);
    if (!m) {
      m = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, color: hex, roughness: 0.35, metalness: 0.35, envMapIntensity: 1.0 }));
      this.carMats.set(hex, m);
    }
    return m;
  }

  /** The engine's shipments: new trucks set off, trucks turn back, delivered ones leave. */
  setShipments(list: ShipView[]) {
    const seen = new Set<number>();
    for (const v of list) {
      seen.add(v.id);
      let tr = this.trucks.get(v.id);
      if (tr && tr.back !== v.back) {
        // turned round at the far end: unloaded, then the empty truck heads home (on the right, its own route back)
        if (!tr.back && tr.view.vehicle === "carrier") this.onArrive(tr.view.to.id);
        this.root.remove(tr.obj);
        tr.obj = this.truckModel(v);
        tr.size = undefined;
        this.root.add(tr.obj);
        tr.back = v.back;
        tr.path = v.back ? this.route(tr.b, tr.a) : this.route(tr.a, tr.b);
        tr.acc = cumulative(tr.path);
        tr.lt = tr.et = v.t;
      }
      if (!tr) {
        const a = plotOf(v.from.id);
        const b = plotOf(v.to.id);
        if (!a || !b) continue;
        const path = v.back ? this.route(b, a) : this.route(a, b);
        if (path.length < 2) continue;
        tr = { view: v, path, acc: cumulative(path), lt: v.t, et: v.t, a, b, back: v.back, obj: this.truckModel(v), x: 0, y: 0, z: 0, yaw: 0, gone: 0 };
        this.root.add(tr.obj);
        this.trucks.set(v.id, tr);
        this.placeTruck(tr, 1);
      }
      tr.view = v;
      // keep the local clock close to the engine's (it ticks 10× a second)
      if (Math.abs(v.t - tr.et) > 1.5) tr.et = v.t;
      else tr.et += (v.t - tr.et) * 0.25;
      if (tr.lt > tr.et) tr.lt = tr.et;
      tr.gone = 0;
    }
    for (const [id, tr] of this.trucks)
      if (!seen.has(id) && tr.gone === 0) {
        if (!tr.back && tr.view.vehicle === "carrier") this.onArrive(tr.view.to.id);
        tr.gone = 0.001;
      }
  }

  private placeTruck(tr: Truck, k: number) {
    const L = tr.acc[tr.acc.length - 1];
    const f = Math.max(0, Math.min(1, tr.lt / Math.max(0.01, tr.view.dur)));
    const p = at3(tr.path, tr.acc, f * L);
    const d = 1;
    tr.x = p.x;
    tr.y = p.y;
    tr.z = p.z;
    if (Math.abs(p.tx) + Math.abs(p.tz) > 1e-6) {
      const yaw = Math.atan2(-p.tz * d, p.tx * d);
      tr.yaw = k >= 1 ? yaw : tr.yaw + angle(yaw - tr.yaw) * k;
    }
    tr.obj.position.set(tr.x, tr.y, tr.z);
    tr.obj.rotation.y = tr.yaw;
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number) {
    this.clock += dt;
    // keep the town's traffic at its level
    const want = this.target();
    let ambient = 0;
    for (const c of this.cars) if (!c.life && !c.special) ambient++;
    for (let i = 0; i < 3 && ambient < want; i++, ambient++) this.spawnAmbient();
    let extra = ambient - want;
    // everyone keeps their distance: each car and truck slows for what is in front of it (red lights and pedestrians too)
    this.watchSignals();
    const bodies = this.bodies();
    for (const b of this.stops) bodies.push(b);
    for (const b of this.obstacles()) bodies.push(b);
    for (const c of this.cars) {
      let room = clearance(c, bodies, (d) => this.way(c, d), c.wait);
      if (!c.turn) {
        // nearing a junction it may not go into yet: it slows to stop at the line (short of the zebra crossing)
        const { node, stop } = this.ahead(c);
        const hold = this.holdAt(c, node);
        const left = (stop - c.s) * c.dir;
        if (left < 0.8 + hold && this.cut[node] > 0 && this.choose(c, node) && !this.mayEnter(c, node)) room = Math.min(room, Math.max(0, left - hold - 0.02) / 0.8);
      }
      const pace = this.cruise(c) * room;
      c.v = pace < c.v ? pace : Math.min(pace, c.v + ACCEL * dt);
      c.wait = c.v < 0.05 ? c.wait + dt : 0;
      // the body leans out of a turn and dips its nose when it brakes, eased so it never snaps
      if (dt > 0) {
        const acc = Math.max(-1, Math.min(0.6, (c.v - c.vPrev) / dt / ACCEL));
        const rate = Math.max(-1.5, Math.min(1.5, angle(c.yaw - c.yawPrev) / dt));
        const e = Math.min(1, dt * 6);
        c.pitch += (acc * 0.035 - c.pitch) * e;
        c.roll += (rate * 0.03 - c.roll) * e;
        c.vPrev = c.v;
        c.yawPrev = c.yaw;
      }
    }
    for (const c of this.cars) {
      if (extra > 0 && !c.life && !c.special && c.alpha >= 1) {
        c.life = 1;
        extra--;
      }
      if (c.life > 0) {
        c.life -= dt;
        if (c.life <= 1) c.alpha = Math.max(0, c.life);
        else c.alpha = Math.min(1, c.alpha + dt * 2);
      } else c.alpha = Math.min(1, c.alpha + dt);
      this.drive(c, dt);
    }
    this.cars = this.cars.filter((c) => {
      const keep = !(c.life < 0 || (c.life > 0 && c.alpha <= 0 && c.life < 1));
      if (!keep) this.root.remove(c.visual);
      return keep;
    });
    if (this.hero && !this.cars.includes(this.hero)) this.hero = null;

    // Real traffic models are individual cached GLB clones (close up).
    for (const car of this.cars) {
      const visible = car.alpha > 0.01 && !this.far;
      if (car.visual.visible !== visible) car.visual.visible = visible;
      const fade = car.life > 0 ? Math.max(0.05, car.alpha) : 1;
      if (Math.abs(fade - car.visualScale) > 0.001) {
        car.visualScale = fade;
        car.visual.scale.setScalar(fade);
      }
      if (visible && this.fx && car.v > 0.6) {
        if (Math.random() < 0.15) {
          if (car.model === "electric" || car.model === "robotaxi" || car.model === "supercar" || car.model === "hypercar") {
            this.fx.evAura(car.x, car.y, car.z);
          } else {
            this.fx.exhaustFume(car.x, car.y, car.z);
          }
        }
      }
    }

    for (const [id, tr] of this.trucks) {
      if (tr.gone > 0) {
        tr.gone += dt;
        tr.lt = tr.view.dur;
        tr.obj.scale.setScalar(Math.max(0.01, 1 - tr.gone / 0.8));
        if (tr.gone > 0.8) {
          this.root.remove(tr.obj);
          this.trucks.delete(id);
          this.truckBodies.delete(tr);
        }
      } else {
        // the shipment's clock runs on; the truck follows it unless the way in front is taken (then catches up)
        tr.et = Math.min(tr.view.dur, tr.et + dt);
        const L = tr.acc[tr.acc.length - 1];
        const at = (Math.max(0, Math.min(1, tr.lt / Math.max(0.01, tr.view.dur)))) * L;
        const room = tr.lt < 0.3 ? 1 : clearance(this.truckBody(tr), bodies, (d) => {
          const p = at3(tr.path, tr.acc, at + d);
          return [p.x, p.z];
        });
        tr.lt = Math.max(tr.et - TRUCK_LAG, Math.min(tr.et, tr.lt + dt * (room < 1 ? room : tr.lt < tr.et ? 1.35 : 1)));
      }
      this.placeTruck(tr, Math.min(1, dt * 6));
      if (tr.obj.visible === this.far) tr.obj.visible = !this.far;
    }
    this.drawFar();
  }

  /** Everything on the roads that keeps others behind it (cars just appearing or fading out don't). */
  private bodies(): Body[] {
    const out: Body[] = [];
    for (const c of this.cars) {
      if (c.alpha < 0.5 && c.life > 0) continue;
      c.half = 0.28 * c.scale * (c.special?.stretch ?? 1);
      out.push(c);
    }
    for (const tr of this.trucks.values()) if (!tr.gone) out.push(this.truckBody(tr));
    return out;
  }

  private truckBodies = new Map<Truck, Body>();
  private truckBody(tr: Truck): Body {
    let b = this.truckBodies.get(tr);
    if (!b) {
      b = { x: 0, z: 0, yaw: 0, half: 0.5 };
      this.truckBodies.set(tr, b);
    }
    b.x = tr.x;
    b.z = tr.z;
    b.yaw = tr.yaw;
    b.half = (tr.size ??= modelSize(tr.obj)).x / 2;
    return b;
  }

  /** Far out: every car and truck on the road as one instance of the simple shape, in its colour. */
  private drawFar() {
    const inst = this.inst;
    if (!this.far) {
      if (inst.visible) inst.visible = false;
      return;
    }
    const cap = inst.instanceMatrix.count;
    let n = 0;
    for (const car of this.cars) {
      if (car.alpha <= 0.01 || n >= cap) continue;
      const s = car.scale * (car.life > 0 ? Math.max(0.05, car.alpha) : 1);
      this.m4.compose(this.v.set(car.x, car.y, car.z), this.q.setFromAxisAngle(this.yAxis, car.yaw), this.sc.set(s, s, s));
      inst.setMatrixAt(n, this.m4);
      inst.setColorAt(n, car.color);
      n++;
    }
    // trucks: the same shape stretched to the truck's size, in its cargo's colour
    for (const tr of this.trucks.values()) {
      if (n >= cap) break;
      const size = (tr.size ??= modelSize(tr.obj));
      const f = tr.gone > 0 ? Math.max(0.01, 1 - tr.gone / 0.8) : 1;
      this.m4.compose(this.v.set(tr.x, tr.y, tr.z), this.q.setFromAxisAngle(this.yAxis, tr.yaw), this.sc.set((size.x / SHAPE.x) * f, (size.y / SHAPE.y) * f, (size.z / SHAPE.z) * f));
      inst.setMatrixAt(n, this.m4);
      inst.setColorAt(n, this.col.set(tr.view.color));
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.visible = n > 0;
  }

  /** Releases GPU resources owned by this traffic layer when the map is unmounted. */
  dispose() {
    this.root.clear();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const model of this.models.values()) {
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        geometries.add(m.geometry);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat);
      });
    }
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.models.clear();
    for (const m of this.carMats.values()) m.dispose();
    this.carMats.clear();
    this.carGeo.dispose();
    for (const value of Object.values(this.kit)) {
      if (typeof value !== "function") value.dispose();
    }
    this.cars = [];
    this.trucks.clear();
    this.truckBodies.clear();
    this.hero = null;
  }

  /** Everything that can be tapped: [world position, what it is]. */
  *pickables(): Generator<[number, number, number, VehiclePick]> {
    for (const tr of this.trucks.values()) {
      if (tr.gone) continue;
      const v = tr.view;
      yield [tr.x, tr.y + 0.2, tr.z, { ref: tr, kind: v.vehicle, model: v.models?.[0] ?? "sedan", color: v.color, models: v.back ? [] : v.models, item: v.item, empty: v.back }];
    }
    for (const c of this.cars) if (c.alpha > 0.5 && !c.special) yield [c.x, c.y + 0.1, c.z, { ref: c, kind: "car", model: c.model, color: c.hex }];
  }

  /** Where a tapped vehicle is now (null once it is gone). */
  positionOf(ref: object): [number, number, number] | null {
    if (this.cars.includes(ref as RoadCar)) {
      const c = ref as RoadCar;
      return [c.x, c.y, c.z];
    }
    for (const tr of this.trucks.values()) if (tr === ref && !tr.gone) return [tr.x, tr.y, tr.z];
    return null;
  }

  /** The entry of a lot as a site (for buyers and the first car). */
  static site(id: string): Site | null {
    const p = plotOf(id);
    return p ? { id, entry: p.entry as Entry, weight: 1 } : null;
  }
}
