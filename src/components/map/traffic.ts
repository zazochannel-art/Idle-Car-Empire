// Traffic on the Empire Map. The supply-chain trucks are the game's real
// shipments (engine/chain.ts): each one is drawn driving its route between
// the two lots, loaded on the way out and empty on the way back. Around
// them: customers driving to garages, buyers leaving dealerships with their
// new car, city traffic and pedestrians.
import { BLOCKS, NODES, ROAD_STEP, segmentOpen, type Entry } from "@/game/city/layout";
import type { ZoneId } from "@/game/types";
import { sx, sy, type Painter } from "./iso";
import { CAR_COLORS, CAR_MODELS, DIR_YAW, drawCarrier, drawModel, drawTruck, type CarModel, type Dir } from "./vehicles";
import { trafficLight } from "./props";

export interface Site {
  id: string;
  entry: Entry;
  /** Relative attractiveness (garage income, factory output…). */
  weight: number;
}

export interface TrafficWorld {
  unlocked: ReadonlySet<ZoneId>;
  garages: Site[];
  factories: Site[];
  dealers: Site[];
  /** Parts suppliers: factories, warehouses, parts plants, logistics. */
  suppliers: Site[];
  /** Blocks with something going on, for pedestrians. */
  busyBlocks: [number, number][];
}

type Kind = "customer" | "ambient" | "truck" | "carrier" | "hero";

/** A real shipment as the map needs it. */
export interface ShipView {
  id: number;
  from: Site;
  to: Site;
  t: number;
  dur: number;
  back: boolean;
  vehicle: "van" | "truck" | "semi" | "trailer" | "carrier";
  /** Cargo colour (component), or car models for transporters. */
  color: string;
  /** What it carries: a component id, "raw" or "car". */
  item?: string;
  models?: CarModel[];
}

interface Ship extends ShipView {
  path: Pt[];
  len: number;
  /** Local clock, resynced with the engine when it drifts. */
  lt: number;
  x: number;
  y: number;
  dir: Dir;
  yaw?: number;
  steer?: number;
  odo: number;
}

const VEHICLE_SCALE = { van: 0.8, truck: 1, semi: 1.12, trailer: 1.25, carrier: 1 };
/** Matches DOCK_TIME in config/chain.ts: loading and unloading. */
const DOCK = 2;

interface Pt {
  x: number;
  y: number;
}

export interface Agent {
  kind: Kind;
  path: Pt[];
  seg: number;
  pos: number;
  speed: number;
  color: string;
  color2: string;
  x: number;
  y: number;
  dir: Dir;
  alpha: number;
  /** Seconds left parked inside a building. */
  wait: number;
  phase: "go" | "inside" | "leave";
  target?: Site;
  next?: Site;
  fading: boolean;
  /** Current speed (eases toward the cruising speed). */
  cur: number;
  model: CarModel;
  /** Drawn position: trails the exact one a little so turns are rounded. */
  rx: number;
  ry: number;
  braking: boolean;
  puffs: { x: number; y: number; age: number }[];
  /** Heading (radians) easing toward the direction of travel, front-wheel angle, distance driven. */
  yaw?: number;
  steer?: number;
  odo?: number;
}

/** Turns `cur` toward `target` (radians) at `rate` rad/s; returns the new angle and the steering side. */
function turnToward(cur: number | undefined, target: number, rate: number, dt: number): [number, number] {
  if (cur === undefined) return [target, 0];
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  return [cur + step, Math.abs(d) > 0.12 ? Math.sign(d) : 0];
}

interface Walker {
  bx: number;
  by: number;
  s: number;
  speed: number;
  shirt: string;
}

/** A vehicle the player tapped on the map, for the showcase. */
export interface VehiclePick {
  /** The live agent or shipment, to follow it with the camera. */
  ref: object;
  kind: "car" | "van" | "truck" | "semi" | "trailer" | "carrier";
  model: CarModel;
  color: string;
  models?: CarModel[];
  item?: string;
  empty?: boolean;
}

export type ArriveFn = (kind: Kind, site: Site) => void;

const node = (i: number, j: number): Pt => ({ x: i * ROAD_STEP + 0.5, y: j * ROAD_STEP + 0.5 });
const key = (i: number, j: number) => j * NODES + i;

export class Traffic {
  agents: Agent[] = [];
  walkers: Walker[] = [];
  private world: TrafficWorld | null = null;
  private adj: number[][] = [];
  private openNodes: number[] = [];
  private edgeNodes: number[] = [];
  private spawnClock = 0;
  /** Share of the usual town traffic (low graphics halves it). */
  density = 1;
  private clock = 0;
  private ships = new Map<number, Ship>();
  /** The first car rolling out of the assembly plant (the camera follows it). */
  hero: Agent | null = null;
  onArrive: ArriveFn = () => {};

  setWorld(w: TrafficWorld) {
    const zonesChanged = !this.world || [...w.unlocked].join() !== [...this.world.unlocked].join();
    this.world = w;
    if (zonesChanged) this.buildGraph();
    const want = Math.min(40, w.busyBlocks.length * 2);
    while (this.walkers.length < want) {
      const [bx, by] = w.busyBlocks[this.walkers.length % w.busyBlocks.length];
      this.walkers.push({ bx, by, s: Math.random() * 24, speed: (0.3 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1), shirt: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] });
    }
    if (this.walkers.length > want) this.walkers.length = want;
  }

  private buildGraph() {
    const u = this.world!.unlocked;
    this.adj = Array.from({ length: NODES * NODES }, () => []);
    for (let j = 0; j < NODES; j++)
      for (let i = 0; i < NODES; i++) {
        if (i < BLOCKS && segmentOpen("x", j, i, u)) {
          this.adj[key(i, j)].push(key(i + 1, j));
          this.adj[key(i + 1, j)].push(key(i, j));
        }
        if (j < BLOCKS && segmentOpen("y", i, j, u)) {
          this.adj[key(i, j)].push(key(i, j + 1));
          this.adj[key(i, j + 1)].push(key(i, j));
        }
      }
    this.openNodes = [];
    this.edgeNodes = [];
    for (let k = 0; k < this.adj.length; k++) {
      if (!this.adj[k].length) continue;
      this.openNodes.push(k);
      const i = k % NODES;
      const j = Math.floor(k / NODES);
      // Where the open road network meets the world edge or locked land.
      if (i === 0 || j === 0 || i === BLOCKS || j === BLOCKS || this.adj[k].length < 3) this.edgeNodes.push(k);
    }
    this.agents = this.agents.filter((a) => a.path.every((p) => this.reachablePoint(p)));
  }

  private reachablePoint(p: Pt) {
    const i = Math.round((p.x - 0.5) / ROAD_STEP);
    const j = Math.round((p.y - 0.5) / ROAD_STEP);
    return i >= 0 && j >= 0 && i < NODES && j < NODES && this.adj[key(i, j)]?.length > 0;
  }

  private route(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const prev = new Map<number, number>([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      // shuffle a little so cars don't all take the same streets
      const nb = [...this.adj[cur]].sort(() => Math.random() - 0.5);
      for (const n of nb) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        if (n === to) {
          const out = [n];
          let k = cur;
          while (k !== -1) {
            out.push(k);
            k = prev.get(k)!;
          }
          return out.reverse();
        }
        queue.push(n);
      }
    }
    return null;
  }

  private toPts(nodes: number[]): Pt[] {
    return nodes.map((k) => node(k % NODES, Math.floor(k / NODES)));
  }

  /** Path from a node into a site's driveway. */
  private pathTo(from: number, site: Site): Pt[] | null {
    const e = site.entry;
    const end = Math.random() < 0.5 ? key(e.i0, e.line) : key(e.i1, e.line);
    const alt = end === key(e.i0, e.line) ? key(e.i1, e.line) : key(e.i0, e.line);
    const r = this.route(from, end) ?? this.route(from, alt);
    if (!r) return null;
    return [...this.toPts(r), { x: e.x, y: e.y }, { x: e.x, y: e.y + e.inward * 1.25 }];
  }

  /** Path out of a site's driveway to a node. */
  private pathFrom(site: Site, to: number): Pt[] | null {
    const e = site.entry;
    const start = Math.random() < 0.5 ? key(e.i0, e.line) : key(e.i1, e.line);
    const r = this.route(start, to);
    if (!r) return null;
    return [{ x: e.x, y: e.y + e.inward * 1.25 }, { x: e.x, y: e.y }, ...this.toPts(r)];
  }

  private pick<T extends { weight: number }>(list: T[]): T | null {
    const total = list.reduce((a, b) => a + b.weight, 0);
    if (!list.length || total <= 0) return null;
    let r = Math.random() * total;
    for (const s of list) if ((r -= s.weight) <= 0) return s;
    return list[list.length - 1];
  }

  private randomNode(list: number[]) {
    return list[Math.floor(Math.random() * list.length)];
  }

  private spawn() {
    const w = this.world;
    if (!w || !this.openNodes.length) return;
    const roll = Math.random();
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const color2 = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    let agent: Agent | null = null;
    const make = (kind: Kind, path: Pt[], speed: number, target?: Site, next?: Site): Agent => ({
      kind, path, seg: 0, pos: 0, speed, color, color2, x: path[0].x, y: path[0].y, dir: 0, alpha: 0, wait: 0, phase: "go", target, next, fading: false,
      cur: speed * 0.4, model: pickModel(), rx: path[0].x, ry: path[0].y, braking: false, puffs: [],
    });

    if (roll < 0.5 && w.garages.length) {
      const g = this.pick(w.garages);
      const path = g && this.pathTo(this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes), g);
      if (g && path) agent = make("customer", path, 1.6 + Math.random() * 0.6, g, this.pick(w.dealers) ?? undefined);
    } else if (roll < 0.65 && w.suppliers.length && w.garages.length) {
      const from = this.pick(w.suppliers)!;
      const to = this.pick(w.garages)!;
      if (from.id !== to.id) {
        const a = this.pathFrom(from, key(to.entry.i0, to.entry.line));
        const b = a && this.pathTo(key(to.entry.i0, to.entry.line), to);
        if (a && b) agent = make("truck", [...a, ...b.slice(1)], 1.2, to);
      }
    } else if (roll < 0.8 && w.factories.length && w.dealers.length) {
      const from = this.pick(w.factories)!;
      const to = this.pick(w.dealers)!;
      const a = this.pathFrom(from, key(to.entry.i1, to.entry.line));
      const b = a && this.pathTo(key(to.entry.i1, to.entry.line), to);
      if (a && b) agent = make("carrier", [...a, ...b.slice(1)], 1.1, to);
    }
    if (!agent) {
      const from = this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes);
      const to = this.randomNode(this.openNodes);
      const r = this.route(from, to);
      if (r && r.length > 1) agent = make("ambient", this.toPts(r), 1.8 + Math.random() * 0.8);
    }
    // Don't stack a new vehicle on top of one that is still pulling out.
    if (agent && this.agents.some((o) => Math.abs(o.x - agent!.path[0].x) + Math.abs(o.y - agent!.path[0].y) < 1)) return;
    if (agent) this.agents.push(agent);
  }

  /** Syncs the trucks with the engine's shipments (called on every game tick). */
  setShipments(list: ShipView[]) {
    const seen = new Set<number>();
    for (const v of list) {
      seen.add(v.id);
      const old = this.ships.get(v.id);
      if (old && old.back === v.back) {
        if (Math.abs(old.lt - v.t) > 0.6) old.lt = v.t;
        old.dur = v.dur;
        continue;
      }
      const path = old?.path ?? this.shipPath(v.from, v.to);
      const len = path.reduce((a, q, i) => (i ? a + Math.abs(q.x - path[i - 1].x) + Math.abs(q.y - path[i - 1].y) : 0), 0);
      this.ships.set(v.id, { ...v, path, len, lt: v.t, x: path[0].x, y: path[0].y, dir: 0, odo: 0, yaw: old?.yaw });
    }
    for (const id of this.ships.keys()) if (!seen.has(id)) this.ships.delete(id);
  }

  private shipPath(from: Site, to: Site): Pt[] {
    const target = key(to.entry.i0, to.entry.line);
    const a = this.adj.length ? this.pathFrom(from, target) : null;
    const b = a && this.pathTo(target, to);
    if (a && b) return [...a, ...b.slice(1)];
    // no road yet: drive straight between the driveways
    return [
      { x: from.entry.x, y: from.entry.y + from.entry.inward * 1.25 },
      { x: from.entry.x, y: from.entry.y },
      { x: to.entry.x, y: from.entry.y },
      { x: to.entry.x, y: to.entry.y },
      { x: to.entry.x, y: to.entry.y + to.entry.inward * 1.25 },
    ];
  }

  private moveShips(dt: number) {
    for (const sh of this.ships.values()) {
      sh.lt = Math.min(sh.dur, sh.lt + dt);
      const drive = Math.max(0.1, sh.dur - DOCK);
      const f = Math.max(0, Math.min(1, (sh.lt - DOCK / 2) / drive));
      let d = (sh.back ? 1 - f : f) * sh.len;
      let i = 0;
      while (i < sh.path.length - 2) {
        const seg = Math.abs(sh.path[i + 1].x - sh.path[i].x) + Math.abs(sh.path[i + 1].y - sh.path[i].y);
        if (d <= seg) break;
        d -= seg;
        i++;
      }
      const p0 = sh.path[i];
      const p1 = sh.path[i + 1] ?? p0;
      const seg = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) || 1;
      const k = Math.min(1, d / seg);
      let dx = Math.sign(p1.x - p0.x);
      let dy = Math.sign(p1.y - p0.y);
      if (sh.back) {
        dx = -dx;
        dy = -dy;
      }
      sh.dir = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3;
      // keep right, except on the driveways at either end
      const drive2 = i === 0 || i >= sh.path.length - 2;
      const lane = drive2 ? 0 : 0.2;
      const nx = p0.x + (p1.x - p0.x) * k - dy * lane;
      const ny = p0.y + (p1.y - p0.y) * k + dx * lane;
      sh.odo += Math.abs(nx - sh.x) + Math.abs(ny - sh.y);
      sh.x = nx;
      sh.y = ny;
      [sh.yaw, sh.steer] = turnToward(sh.yaw, DIR_YAW[sh.dir], 3.2, dt);
    }
  }

  /** A buyer drives off from a dealership in the car they just bought. */
  spawnBuyer(dealer: Site, model: CarModel) {
    if (!this.openNodes.length) return;
    const out = this.pathFrom(dealer, this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes));
    if (!out) return;
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.agents.push({
      kind: "customer", path: out, seg: 0, pos: 0, speed: 1.4, color, color2: color, x: out[0].x, y: out[0].y, dir: 0, alpha: 0, wait: 0, phase: "leave", fading: false,
      cur: 0.2, model, rx: out[0].x, ry: out[0].y, braking: false, puffs: [],
    });
  }

  /** The first car rolls slowly out of the assembly plant onto the street. */
  rollOut(site: Site, model: CarModel, color: string): Agent | null {
    const e = site.entry;
    const path: Pt[] = [{ x: e.x, y: e.y + e.inward * 1.6 }, { x: e.x, y: e.y }, { x: e.x + 2.5, y: e.y }];
    const a: Agent = {
      kind: "hero", path, seg: 0, pos: 0, speed: 0.55, color, color2: color, x: path[0].x, y: path[0].y, dir: 0, alpha: 1, wait: 0, phase: "leave", fading: false,
      cur: 0.05, model, rx: path[0].x, ry: path[0].y, braking: false, puffs: [],
    };
    this.agents.push(a);
    this.hero = a;
    return a;
  }

  update(dt: number) {
    const w = this.world;
    if (!w) return;
    this.moveShips(dt);
    const cap = this.density * Math.min(46, 8 + w.garages.length * 4 + w.factories.length * 3 + w.dealers.length * 2 + w.unlocked.size * 2);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.agents.length < cap) {
      this.spawn();
      this.spawnClock = 0.5 + Math.random() * 0.8;
    }

    const moving = this.agents.filter((a) => a.phase !== "inside" && !a.fading && a.alpha > 0.3);
    if (this.hero && !this.agents.includes(this.hero)) this.hero = null;
    for (const a of this.agents) {
      if (a.phase === "inside") {
        a.wait -= dt;
        if (a.wait <= 0) this.leave(a);
        continue;
      }
      a.alpha = a.fading ? Math.max(0, a.alpha - dt * 2.5) : Math.min(1, a.alpha + dt * 2.5);
      // cruise, slow for turns and red lights, queue behind others
      const target = a.speed * this.clearance(a, moving) * this.ahead(a);
      const prev = a.cur;
      a.cur += Math.max(-4.5 * dt, Math.min(1.6 * dt, target - a.cur));
      a.braking = a.cur < prev - 0.01 || a.cur < 0.15;
      if (prev < 0.3 && a.cur > prev && a.puffs.length < 4 && Math.random() < dt * 6) a.puffs.push({ x: a.rx, y: a.ry, age: 0 });
      for (const pf of a.puffs) pf.age += dt;
      a.puffs = a.puffs.filter((pf) => pf.age < 1.2);
      let move = a.cur * dt;
      while (move > 0 && a.seg < a.path.length - 1) {
        const p0 = a.path[a.seg];
        const p1 = a.path[a.seg + 1];
        const len = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y);
        const left = len - a.pos;
        if (move < left) {
          a.pos += move;
          move = 0;
        } else {
          move -= left;
          a.seg += 1;
          a.pos = 0;
        }
      }
      if (a.seg >= a.path.length - 1) {
        if (a.kind === "hero") {
          // the first car waits at the kerb for its moment of glory
          a.cur = 0;
          a.seg = a.path.length - 2;
          a.pos = Math.abs(a.path[a.seg + 1].x - a.path[a.seg].x) + Math.abs(a.path[a.seg + 1].y - a.path[a.seg].y);
        } else {
          this.arrive(a);
          continue;
        }
      }
      const p0 = a.path[a.seg];
      const p1 = a.path[a.seg + 1];
      const len = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) || 1;
      const t = a.pos / len;
      const dx = Math.sign(p1.x - p0.x);
      const dy = Math.sign(p1.y - p0.y);
      a.dir = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3;
      [a.yaw, a.steer] = turnToward(a.yaw, DIR_YAW[a.dir], 4.5, dt);
      a.odo = (a.odo ?? 0) + a.cur * dt;
      // keep right: offset perpendicular to the direction of travel
      const lane = 0.2;
      const onDriveway = a.seg >= a.path.length - 2 && a.phase === "go" && a.kind !== "ambient";
      const lx = onDriveway ? 0 : -dy * lane;
      const ly = onDriveway ? 0 : dx * lane;
      a.x = p0.x + (p1.x - p0.x) * t + lx;
      a.y = p0.y + (p1.y - p0.y) * t + ly;
      const k = Math.min(1, dt * 9);
      if (Math.abs(a.rx - a.x) + Math.abs(a.ry - a.y) > 1.5) {
        a.rx = a.x;
        a.ry = a.y;
      } else {
        a.rx += (a.x - a.rx) * k;
        a.ry += (a.y - a.ry) * k;
      }
    }
    this.clock += dt;
    this.agents = this.agents.filter((a) => !(a.fading && a.alpha <= 0));

    for (const wk of this.walkers) wk.s = (wk.s + wk.speed * dt + 24) % 24;
  }

  /** Signal state at a node: which axis has green (or amber between). */
  signal(i: number, j: number): "x" | "y" | "amber" {
    const ph = (this.clock + hashNode(i, j) * 10) % 10;
    return ph < 4.2 ? "x" : ph < 5 ? "amber" : ph < 9.2 ? "y" : "amber";
  }

  private signalized(i: number, j: number) {
    return (this.adj[key(i, j)]?.length ?? 0) >= 3;
  }

  /** Speed factor for what's ahead on the path: a turn or a red light. */
  private ahead(a: Agent): number {
    const nxt = a.path[a.seg + 1];
    if (!nxt) return 1;
    const dist = Math.abs(nxt.x - a.x) + Math.abs(nxt.y - a.y);
    const i = Math.round((nxt.x - 0.5) / ROAD_STEP);
    const j = Math.round((nxt.y - 0.5) / ROAD_STEP);
    const isNode = Math.abs(i * ROAD_STEP + 0.5 - nxt.x) < 0.01 && Math.abs(j * ROAD_STEP + 0.5 - nxt.y) < 0.01;
    let k = 1;
    if (isNode && this.signalized(i, j)) {
      const axis = a.dir === 0 || a.dir === 2 ? "x" : "y";
      const s = this.signal(i, j);
      // stop at the line; past it, keep going
      if (s !== axis && dist > 0.55 && dist < 1.4) k = Math.min(k, Math.max(0, (dist - 0.65) / 0.75));
    }
    const after = a.path[a.seg + 2];
    if (after && dist < 0.9) {
      const turning = Math.sign(after.x - nxt.x) !== Math.sign(nxt.x - a.path[a.seg].x) || Math.sign(after.y - nxt.y) !== Math.sign(nxt.y - a.path[a.seg].y);
      if (turning) k = Math.min(k, 0.45 + dist * 0.5);
    }
    return k;
  }

  /** 1 = road ahead is clear, 0 = queue behind the vehicle in front. */
  private clearance(a: Agent, others: Agent[]): number {
    const fx = a.dir === 0 ? 1 : a.dir === 2 ? -1 : 0;
    const fy = a.dir === 1 ? 1 : a.dir === 3 ? -1 : 0;
    const gap = a.kind === "carrier" || a.kind === "truck" ? 1.05 : 0.8;
    let k = 1;
    const me = others.indexOf(a);
    for (const [i, o] of others.entries()) {
      if (o === a || o.dir !== a.dir) continue;
      const dx = o.x - a.x;
      const dy = o.y - a.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(dx * fy - dy * fx);
      const before = ahead > 0 || (ahead === 0 && i < me);
      if (before && ahead < gap && side < 0.15) k = Math.min(k, Math.max(0, (ahead - 0.45) / (gap - 0.45)));
    }
    return k;
  }

  private arrive(a: Agent) {
    if (a.phase === "go" && a.target && a.kind !== "ambient") {
      this.onArrive(a.kind, a.target);
      if (a.kind === "customer") {
        a.phase = "inside";
        a.wait = 3 + Math.random() * 5;
        a.alpha = 0;
        return;
      }
    }
    a.fading = true;
  }

  private leave(a: Agent) {
    const w = this.world;
    const from = a.target;
    if (!w || !from) {
      a.fading = true;
      return;
    }
    const to = a.next && w.dealers.includes(a.next) && Math.random() < 0.5 ? a.next : null;
    const dest = to ? key(to.entry.i0, to.entry.line) : this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes);
    const out = this.pathFrom(from, dest);
    if (!out) {
      a.fading = true;
      return;
    }
    a.path = out;
    a.seg = 0;
    a.pos = 0;
    a.phase = "leave";
    a.alpha = 0;
    a.target = undefined;
    // serviced cars come out shiny in a new colour
    a.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  }

  /** Things to depth-sort with the buildings. */
  /** The vehicle under a point of the map (world px), front-most first. */
  pickVehicle(wx: number, wy: number, tol: number): VehiclePick | null {
    let best: VehiclePick | null = null;
    let bestD = tol;
    let bestDepth = -Infinity;
    const test = (x: number, y: number, z: number, make: () => VehiclePick) => {
      const d = Math.hypot(sx(x, y) - wx, sy(x, y, z) - wy);
      if (d < bestD || (d < tol && x + y > bestDepth && d < bestD + 4)) {
        bestD = Math.min(bestD, d);
        bestDepth = x + y;
        best = make();
      }
    };
    for (const sh of this.ships.values())
      test(sh.x, sh.y, 9, () => ({
        ref: sh,
        kind: sh.vehicle,
        model: sh.models?.[0] ?? "sedan",
        color: sh.vehicle === "carrier" ? CAR_COLORS[sh.id % CAR_COLORS.length] : sh.color,
        models: sh.vehicle === "carrier" && !sh.back ? (sh.models?.length ? sh.models : (["sedan", "sedan"] as CarModel[])) : undefined,
        item: sh.item,
        empty: sh.back,
      }));
    for (const a of this.agents) {
      if (a.phase === "inside" || a.alpha <= 0.3) continue;
      test(a.rx, a.ry, a.kind === "truck" || a.kind === "carrier" ? 8 : 5, () =>
        a.kind === "truck"
          ? { ref: a, kind: "van", model: a.model, color: a.color2 === a.color ? "#f97316" : "#f8fafc", empty: true }
          : a.kind === "carrier"
            ? { ref: a, kind: "carrier", model: a.model, color: a.color, models: [a.model, CAR_MODELS[(CAR_MODELS.indexOf(a.model) + 3) % CAR_MODELS.length]] }
            : { ref: a, kind: "car", model: a.model, color: a.color },
      );
    }
    return best;
  }

  /** Where a picked vehicle is now (tiles), or null once it has gone. */
  positionOf(ref: object): [number, number] | null {
    for (const sh of this.ships.values()) if (sh === ref) return [sh.x, sh.y];
    for (const a of this.agents) if (a === ref) return a.phase === "inside" || a.alpha <= 0 ? null : [a.rx, a.ry];
    return null;
  }

  drawables(): { depth: number; x: number; y: number; draw: (p: Painter) => void }[] {
    const out: { depth: number; x: number; y: number; draw: (p: Painter) => void }[] = [];
    for (const sh of this.ships.values()) {
      out.push({
        depth: sh.x + sh.y,
        x: sh.x,
        y: sh.y,
        draw: (p) => {
          const scale = VEHICLE_SCALE[sh.vehicle];
          const look = { yaw: sh.yaw, odo: sh.odo };
          if (sh.vehicle === "carrier") {
            const m = sh.models?.length ? sh.models : (["sedan", "sedan"] as CarModel[]);
            drawCarrier(p, sh.x, sh.y, sh.dir, [CAR_COLORS[sh.id % CAR_COLORS.length], CAR_COLORS[(sh.id * 3 + 2) % CAR_COLORS.length]], 1, [m[0], m[1] ?? m[0]], { ...look, empty: sh.back });
          } else drawTruck(p, sh.x, sh.y, sh.dir, sh.color, scale, false, { ...look, kind: sh.vehicle, empty: sh.back });
          if (p.night > 0.35) p.light(sx(sh.x, sh.y), sy(sh.x, sh.y, 4), 14, "#fef3c7", 0.5);
        },
      });
    }
    for (const a of this.agents) {
      if (a.phase === "inside" || a.alpha <= 0) continue;
      out.push({
        depth: a.rx + a.ry,
        x: a.rx,
        y: a.ry,
        draw: (p) => {
          // exhaust when pulling away
          for (const pf of a.puffs) p.circle(pf.x, pf.y, 3 + pf.age * 8, 1.5 + pf.age * 3, `rgba(203,213,225,${0.4 * (1 - pf.age / 1.2)})`);
          p.ctx.globalAlpha = a.alpha;
          const look = { yaw: a.yaw, steer: a.steer, odo: a.odo };
          if (a.kind === "truck") drawTruck(p, a.rx, a.ry, a.dir, a.color2 === a.color ? "#f97316" : "#f8fafc", 1, a.braking, { ...look, kind: "van" });
          else if (a.kind === "carrier") drawCarrier(p, a.rx, a.ry, a.dir, [a.color, a.color2], 1, [a.model, CAR_MODELS[(CAR_MODELS.indexOf(a.model) + 3) % CAR_MODELS.length]], look);
          else drawModel(p, a.rx, a.ry, a.dir, a.model, a.color, 1, { ...look, brake: a.braking, lights: p.night > 0.35 });
          p.ctx.globalAlpha = 1;
        },
      });
    }
    // traffic lights on busy junctions
    for (let j = 0; j < NODES; j++)
      for (let i = 0; i < NODES; i++) {
        if (!this.signalized(i, j)) continue;
        const lx = i * ROAD_STEP + 1.12;
        const ly = j * ROAD_STEP - 0.12;
        const s = this.signal(i, j);
        out.push({ depth: lx + ly, x: lx, y: ly, draw: (p) => trafficLight(p, lx, ly, s) });
      }
    for (const wk of this.walkers) {
      const { x, y } = ringPoint(wk.bx, wk.by, wk.s);
      out.push({ depth: x + y, x, y, draw: (p) => p.person(x, y, wk.shirt, wk.s * 9) });
    }
    return out;
  }
}

/** A point on the sidewalk ring around block (bx, by); s in [0, 24). */
function ringPoint(bx: number, by: number, s: number): Pt {
  const x0 = bx * ROAD_STEP + 1.11;
  const y0 = by * ROAD_STEP + 1.11;
  const side = 5.78;
  const k = (s / 24) * side * 4;
  if (k < side) return { x: x0 + k, y: y0 };
  if (k < side * 2) return { x: x0 + side, y: y0 + (k - side) };
  if (k < side * 3) return { x: x0 + side - (k - side * 2), y: y0 + side };
  return { x: x0, y: y0 + side - (k - side * 3) };
}

function hashNode(i: number, j: number) {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Mostly everyday cars, now and then something special. */
function pickModel(): CarModel {
  const r = Math.random();
  if (r < 0.22) return "city";
  if (r < 0.48) return "sedan";
  if (r < 0.66) return "suv";
  if (r < 0.74) return "sports";
  if (r < 0.8) return "muscle";
  if (r < 0.87) return "luxury";
  if (r < 0.93) return "electric";
  if (r < 0.98) return "supercar";
  return "hypercar";
}
