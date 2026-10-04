// Traffic on the Empire Map. The supply-chain trucks are the game's real
// shipments (engine/chain.ts): each one is drawn driving its route between
// the two lots, loaded on the way out and empty on the way back. Around
// them: customers driving to garages, buyers leaving dealerships with their
// new car, city traffic and pedestrians.
//
// Every vehicle (shipments included) is one Agent: they all drive the same
// road speed, keep to their lane on smooth curves, stop at red lights and
// keep their distance, so nothing ever drives through anything else.
import { BLOCKS, DRIVEWAY, NODES, ROAD_STEP, roadRoute, segmentOpen, type Entry } from "@/game/city/layout";
import { ROAD_SPEED } from "@/game/config/chain";
import type { ZoneId } from "@/game/types";
import { sx, sy, type Painter } from "./iso";
import { CAR_COLORS, CAR_MODELS, DIR_YAW, drawCarrier, drawModel, drawTruck, type CarModel, type Dir } from "./vehicles";
import { trafficLight } from "./props";
import { DRIVE_LANE, LANE, LanePath } from "./lane-path";

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

type Kind = "customer" | "ambient" | "truck" | "carrier" | "hero" | "ship";
type Vehicle = "van" | "truck" | "semi" | "trailer" | "carrier";

/** A real shipment as the map needs it. */
export interface ShipView {
  id: number;
  from: Site;
  to: Site;
  t: number;
  dur: number;
  back: boolean;
  vehicle: Vehicle;
  /** Cargo colour (component), or car models for transporters. */
  color: string;
  /** What it carries: a component id, "raw" or "car". */
  item?: string;
  models?: CarModel[];
}

interface Ship extends ShipView {
  /** The route out (the trip back drives it reversed, in the other lane). */
  route: Pt[];
  /** The trip back, waiting for this truck to reach the dock first. */
  pending?: ShipView;
  /** The engine finished this trip; the truck just drives to its dock. */
  done?: boolean;
  /** Its loading bay in both yards. */
  bay: number;
  /** Reached the dock at the end of this leg. */
  arrived?: boolean;
  /** Local clock, resynced with the engine when it drifts. */
  lt: number;
  agent: Agent;
}

const VEHICLE_SCALE = { van: 0.8, truck: 1, semi: 1.12, trailer: 1.25, carrier: 1 };
/** Axle spread (tiles): how far the body swings out through a bend. */
const WHEELBASE = { car: 0.3, van: 0.34, truck: 0.42, semi: 0.55, trailer: 0.65, carrier: 0.6 };
/** Half the body length (tiles), for keeping distance. */
const HALF = { car: 0.27, van: 0.3, truck: 0.36, semi: 0.45, trailer: 0.52, carrier: 0.48 };
/** Loading bays across a yard (offsets from the gate, tiles): trucks spread out at the docks. */
const BAYS = [0, -0.55, 0.55, -1.0, 1.0];
/** A late shipment may catch up to this share above the road speed. */
const CATCH_UP = 1.6;

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
  /** Drawn position: on the smooth driving line through the bends. */
  rx: number;
  ry: number;
  braking: boolean;
  puffs: { x: number; y: number; age: number }[];
  /** Heading (radians), front-wheel curvature, distance driven. */
  yaw?: number;
  steer?: number;
  odo?: number;
  /** The smooth driving line of `path` (rebuilt when the path changes). */
  lane?: LanePath;
  laneFor?: Pt[];
  /** Body size for spacing, axle spread for the bend, wide corners for long vehicles. */
  half: number;
  wb: number;
  big: boolean;
  /** Who goes first when two vehicles are in each other's way (lower wins). */
  prio: number;
  /** Seconds spent blocked by another vehicle, and waiting for a junction. */
  stuck: number;
  waitJ: number;
  /** The shipment this vehicle is (kind "ship"). */
  ship?: Ship;
  /** Off the road, inside a lot (docking or pulling out): nobody has to wait for it. */
  parked?: boolean;
  /** Distance along the driving line. */
  s: number;
  /** Who it is waiting behind. */
  blocker?: Agent;
  /** Someone it squeezes past to untie a waiting circle. */
  ignore?: Agent;
}

/** A vehicle crossing a junction: it came in heading `inDir` and leaves heading `outDir`. */
interface Hold {
  a: Agent;
  path: Pt[];
  /** Index of the junction in the vehicle's path. */
  at: number;
  inDir: Dir;
  outDir: Dir;
}

/**
 * Two movements can share a junction when they come from the same side, or
 * from opposite sides with neither turning left across the other.
 */
function compatible(h: { inDir: Dir; outDir: Dir }, g: { inDir: Dir; outDir: Dir }) {
  if (h.inDir === g.inDir) return true;
  if ((h.inDir + 2) % 4 !== g.inDir) return false;
  const left = (x: { inDir: Dir; outDir: Dir }) => x.outDir === (x.inDir + 3) % 4;
  return !left(h) && !left(g);
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
/** Extra cost of a turn when routing (tiles): drivers prefer fewer turns, never a longer way. */
const TURN_COST = 3;

const pathLength = (path: Pt[]) => path.reduce((a, q, i) => (i ? a + Math.abs(q.x - path[i - 1].x) + Math.abs(q.y - path[i - 1].y) : 0), 0);

let nextPrio = 1;

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
  /** Who is crossing each junction right now, and which way. */
  private holds = new Map<number, Hold[]>();
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
    this.agents = this.agents.filter((a) => a.kind === "ship" || a.path.every((p) => this.reachablePoint(p)));
  }

  private reachablePoint(p: Pt) {
    const i = Math.round((p.x - 0.5) / ROAD_STEP);
    const j = Math.round((p.y - 0.5) / ROAD_STEP);
    return i >= 0 && j >= 0 && i < NODES && j < NODES && this.adj[key(i, j)]?.length > 0;
  }

  /**
   * Shortest way between two junctions that avoids needless turns (a staircase
   * of left-right-left is never chosen over one clean turn). `jitter` adds a
   * little randomness so city cars spread over parallel streets.
   */
  private route(from: number, to: number, jitter = 0): number[] | null {
    if (from === to) return [from];
    if (!this.adj[from]?.length || !this.adj[to]?.length) return null;
    // state = junction × direction we arrived in (4 = start)
    const S = this.adj.length * 5;
    const dist = new Float64Array(S).fill(Infinity);
    const prev = new Int32Array(S).fill(-1);
    const start = from * 5 + 4;
    dist[start] = 0;
    const heap: [number, number][] = [[0, start]];
    const push = (d: number, s: number) => {
      heap.push([d, s]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    let end = -1;
    while (heap.length) {
      const [d, s] = pop();
      if (d > dist[s]) continue;
      const n = Math.floor(s / 5);
      const inDir = s % 5;
      if (n === to) {
        end = s;
        break;
      }
      const ni = n % NODES;
      const nj = Math.floor(n / NODES);
      for (const m of this.adj[n]) {
        const mi = m % NODES;
        const mj = Math.floor(m / NODES);
        const dir = mi > ni ? 0 : mi < ni ? 2 : mj > nj ? 1 : 3;
        if (inDir !== 4 && dir === (inDir + 2) % 4) continue; // no U-turns at a junction
        const cost = d + ROAD_STEP + (inDir !== 4 && dir !== inDir ? TURN_COST : 0) + (jitter ? Math.random() * jitter : 0);
        const ms = m * 5 + dir;
        if (cost < dist[ms]) {
          dist[ms] = cost;
          prev[ms] = s;
          push(cost, ms);
        }
      }
    }
    if (end < 0) return null;
    const out: number[] = [];
    for (let s = end; s >= 0; s = prev[s]) out.push(Math.floor(s / 5));
    return out.reverse();
  }

  private toPts(nodes: number[]): Pt[] {
    return nodes.map((k) => node(k % NODES, Math.floor(k / NODES)));
  }

  /** Of a road segment's two junctions, the nearer one to junction `n` (so nobody drives past the lot and U-turns). */
  private nearEnd(e: Entry, n: number): [number, number] {
    const ni = n % NODES;
    const nj = Math.floor(n / NODES);
    const cost = (i: number) => (Math.abs(ni - i) + Math.abs(nj - e.line)) * ROAD_STEP + Math.abs(i * ROAD_STEP + 0.5 - e.x);
    return cost(e.i0) <= cost(e.i1) ? [key(e.i0, e.line), key(e.i1, e.line)] : [key(e.i1, e.line), key(e.i0, e.line)];
  }

  /**
   * Junctions at the ends of a route that would take the vehicle past its own
   * gate (to turn back): drop them, so it turns straight into the driveway.
   */
  private trim(pts: Pt[], from: Entry | null, to: Entry | null): Pt[] {
    const between = (e: Entry, p: Pt, q: Pt) => p.y === e.y && q.y === e.y && (e.x - p.x) * (e.x - q.x) < 0;
    let out = pts;
    if (from && out.length > 1 && between(from, out[0], out[1])) out = out.slice(1);
    if (to && out.length > 1 && between(to, out[out.length - 2], out[out.length - 1])) out = out.slice(0, -1);
    return out;
  }

  /** Path from a node into a site's driveway. */
  private pathTo(from: number, site: Site): Pt[] | null {
    const e = site.entry;
    const [near, far] = this.nearEnd(e, from);
    const r = this.route(from, near, 1.5) ?? this.route(from, far, 1.5);
    if (!r) return null;
    return [...this.trim(this.toPts(r), null, e), { x: e.x, y: e.y }, { x: e.x, y: e.y + e.inward * DRIVEWAY }];
  }

  /** Path out of a site's driveway to a node. */
  private pathFrom(site: Site, to: number): Pt[] | null {
    const e = site.entry;
    const [near, far] = this.nearEnd(e, to);
    const r = this.route(near, to, 1.5) ?? this.route(far, to, 1.5);
    if (!r) return null;
    return [{ x: e.x, y: e.y + e.inward * DRIVEWAY }, { x: e.x, y: e.y }, ...this.trim(this.toPts(r), e, null)];
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

  private agent(kind: Kind, path: Pt[], o: Partial<Agent> = {}): Agent {
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const size = kind === "carrier" ? "carrier" : kind === "truck" ? "van" : "car";
    return {
      kind, path, seg: 0, pos: 0, speed: ROAD_SPEED, color, color2: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      x: path[0].x, y: path[0].y, dir: 0, alpha: 0, wait: 0, phase: "go", fading: false,
      cur: ROAD_SPEED * 0.4, model: pickModel(), rx: path[0].x, ry: path[0].y, braking: false, puffs: [],
      half: HALF[size], wb: WHEELBASE[size], big: size !== "car", prio: nextPrio++, stuck: 0, waitJ: 0, s: 0,
      ...o,
    };
  }

  private spawn() {
    const w = this.world;
    if (!w || !this.openNodes.length) return;
    const roll = Math.random();
    let agent: Agent | null = null;

    if (roll < 0.5 && w.garages.length) {
      const g = this.pick(w.garages);
      const path = g && this.pathTo(this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes), g);
      if (g && path) agent = this.agent("customer", path, { target: g, next: this.pick(w.dealers) ?? undefined });
    }
    if (!agent) {
      const from = this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes);
      const to = this.randomNode(this.openNodes);
      const r = this.route(from, to, 1.5);
      if (r && r.length > 1) agent = this.agent("ambient", this.toPts(r));
    }
    // Don't stack a new vehicle on top of one that is still pulling out.
    if (agent && this.agents.some((o) => Math.abs(o.rx - agent!.path[0].x) + Math.abs(o.ry - agent!.path[0].y) < 2)) return;
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
      // turned around by the engine while still on its way: finish the trip
      // first if it is nearly there, otherwise it fades out and starts back
      if (old && !atEnd(old.agent) && remaining(old.agent) < 2.5) {
        old.pending = v;
        continue;
      }
      if (old && !atEnd(old.agent)) {
        const gone = old.agent;
        this.launch(v, old.route, gone);
        gone.fading = true;
        old.done = true;
        continue;
      }
      if (old) this.agents = this.agents.filter((x) => x !== old.agent);
      this.launch(v, old?.route, old?.agent);
    }
    for (const [id, sh] of this.ships)
      if (!seen.has(id)) {
        this.ships.delete(id);
        // trip over: nearly home it drives to the dock, otherwise it fades out
        if (atEnd(sh.agent)) this.agents = this.agents.filter((x) => x !== sh.agent);
        else if (remaining(sh.agent) < 1.5) sh.done = true;
        else sh.agent.fading = true;
      }
  }

  /** Puts a shipment's truck on the road (out from its dock, or back from the other one). */
  private launch(v: ShipView, route?: Pt[], prev?: Agent) {
    // a free loading bay at both yards (one no other truck there is using)
    let bay = prev?.ship?.bay ?? -1;
    if (bay < 0) {
      const used = new Set<number>();
      for (const o of this.ships.values()) if (o.id !== v.id && [o.from.id, o.to.id].some((id) => id === v.from.id || id === v.to.id)) used.add(o.bay);
      bay = BAYS.findIndex((_, i) => !used.has(i));
      if (bay < 0) bay = v.id % BAYS.length;
    }
    route ??= this.shipPath(v.from, v.to, 0, bay) ?? this.straightPath(v.from, v.to);
    const path = v.back ? [...route].reverse() : route;
    const sh = { ...v, route, lt: v.t, bay } as Ship;
    const size = v.vehicle;
    sh.agent = this.agent("ship", path, {
      ship: sh, alpha: 1, cur: 0, half: HALF[size], wb: WHEELBASE[size], big: size !== "van", yaw: prev?.yaw, odo: prev?.odo,
    });
    this.ships.set(v.id, sh);
    this.agents.push(sh.agent);
  }

  /**
   * The road route between two lots: the one the engine times deliveries by.
   * With a `bay`, the truck parks at its own loading bay in each yard (so
   * trucks at a busy dock stand side by side, not on top of each other).
   */
  private shipPath(from: Site, to: Site, jitter: number, bay?: number): Pt[] | null {
    const A = from.entry;
    const B = to.entry;
    const yard = (e: Entry, out: boolean): Pt[] => {
      const dock = { x: e.x, y: e.y + e.inward * DRIVEWAY };
      if (bay === undefined) return [dock];
      const off = BAYS[bay % BAYS.length];
      if (!off) return [dock];
      // drive in along the front of the yard, then back into the bay at the rear
      const mid = e.y + e.inward * 0.6;
      const pts = [{ x: e.x, y: mid }, { x: e.x + off, y: mid }, { x: e.x + off, y: e.y + e.inward * 1.75 }];
      return out ? pts.reverse() : pts;
    };
    const inA = yard(A, true);
    const inB = yard(B, false);
    const r = roadRoute(A, B);
    if (r.from === null || r.to === null) return [...inA, { x: A.x, y: A.y }, { x: B.x, y: B.y }, ...inB];
    if (!this.adj.length) return null;
    const nodes = this.route(key(r.from, A.line), key(r.to, B.line), jitter);
    if (!nodes) return null;
    return [...inA, { x: A.x, y: A.y }, ...this.trim(this.toPts(nodes), A, B), { x: B.x, y: B.y }, ...inB];
  }

  /** No road yet: drive straight between the driveways. */
  private straightPath(from: Site, to: Site): Pt[] {
    return [
      { x: from.entry.x, y: from.entry.y + from.entry.inward * DRIVEWAY },
      { x: from.entry.x, y: from.entry.y },
      { x: to.entry.x, y: from.entry.y },
      { x: to.entry.x, y: to.entry.y },
      { x: to.entry.x, y: to.entry.y + to.entry.inward * DRIVEWAY },
    ];
  }

  /**
   * A shipment drives like everyone else, but keeps to the engine's
   * timetable: it waits at the dock while loading, and if lights or traffic
   * held it up it drives a little faster until it is back on time.
   */
  private schedule(a: Agent, dt: number) {
    const sh = a.ship!;
    sh.lt = Math.min(sh.dur, sh.lt + dt);
    const L = pathLength(a.path);
    const drive = Math.max(0.1, Math.min(sh.dur, L / ROAD_SPEED));
    const f = Math.max(0, Math.min(1, (sh.lt - (sh.dur - drive) / 2) / drive));
    let done = a.pos;
    // the engine already moved on (sent it back or finished): hurry to the end
    if (sh.pending || sh.done) {
      a.speed = ROAD_SPEED * CATCH_UP;
      return;
    }
    for (let i = 0; i < a.seg; i++) done += Math.abs(a.path[i + 1].x - a.path[i].x) + Math.abs(a.path[i + 1].y - a.path[i].y);
    const want = f * L;
    a.speed = f <= 0 ? 0 : ROAD_SPEED * Math.max(0, Math.min(CATCH_UP, 1 + (want - done) * 0.8));
  }

  /** A buyer drives off from a dealership in the car they just bought. */
  spawnBuyer(dealer: Site, model: CarModel) {
    if (!this.openNodes.length) return;
    const out = this.pathFrom(dealer, this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes));
    if (!out) return;
    // one buyer at a time on the forecourt: busy dealers don't stack cars on one spot
    if (this.agents.some((o) => o.kind !== "ship" && Math.hypot(o.rx - out[0].x, o.ry - out[0].y) < 1.2)) return;
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.agents.push(this.agent("customer", out, { phase: "leave", color, color2: color, model, cur: 0.2 }));
  }

  /** The first car rolls slowly out of the assembly plant onto the street. */
  rollOut(site: Site, model: CarModel, color: string): Agent | null {
    const e = site.entry;
    const path: Pt[] = [{ x: e.x, y: e.y + e.inward * 1.6 }, { x: e.x, y: e.y }, { x: e.x + 2.5, y: e.y }];
    const a = this.agent("hero", path, { speed: 0.55, color, color2: color, model, alpha: 1, phase: "leave", cur: 0.05, prio: 0 });
    this.agents.push(a);
    this.hero = a;
    return a;
  }

  update(dt: number) {
    const w = this.world;
    if (!w) return;
    const town = this.agents.reduce((n, a) => (a.kind === "ship" ? n : n + 1), 0);
    // the town makes room when the empire's trucks fill the roads
    const trucks = this.agents.length - town;
    const cap = this.density * Math.max(4, Math.min(46, 8 + w.garages.length * 4 + w.dealers.length * 2 + w.unlocked.size * 2) - trucks * 0.7);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && town < cap) {
      this.spawn();
      this.spawnClock = 0.5 + Math.random() * 0.8;
    }

    // parked at a dock, inside a lot: out of everyone's way
    for (const a of this.agents) a.parked = inLot(a.rx, a.ry) && a.cur < 0.05;
    this.releaseJunctions();
    const moving = this.agents.filter((a) => a.phase !== "inside" && !a.fading && a.alpha > 0);
    if (this.hero && !this.agents.includes(this.hero)) this.hero = null;
    for (const a of this.agents) {
      if (a.phase === "inside") {
        a.wait -= dt;
        if (a.wait <= 0) this.leave(a);
        continue;
      }
      if (a.ship) this.schedule(a, dt);
      a.alpha = a.fading ? Math.max(0, a.alpha - dt * 2.5) : Math.min(1, a.alpha + dt * 2.5);
      // cruise, slow for turns, stop for red lights, busy junctions and anyone in the way
      const road = this.ahead(a, dt);
      const cap = Math.min(road.cap, this.clearance(a, moving, dt));
      const target = Math.min(a.speed * road.k, cap);
      const prev = a.cur;
      a.cur += Math.max(-3.2 * dt, Math.min(1.1 * dt, target - a.cur));
      // the braking curve is a hard limit: never past a stop line or into someone
      a.cur = Math.max(0, Math.min(a.cur, cap));
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
        if (a.ship?.pending) {
          // at the dock at last: start the trip back the engine already began
          this.launch(a.ship.pending, a.ship.route, a);
          a.fading = true;
          a.alpha = 0;
          continue;
        }
        if (a.ship?.done) {
          a.fading = true;
          a.alpha = 0;
          continue;
        }
        if (a.ship && !a.ship.arrived) {
          // a transporter unloading new cars at the dealership
          a.ship.arrived = true;
          if (!a.ship.back && a.ship.vehicle === "carrier") this.onArrive("carrier", a.ship.to);
        }
        if (a.kind === "hero" || a.kind === "ship") {
          // the first car waits at the kerb for its moment of glory; a truck
          // waits at the dock until the engine sends it back
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
      // keep right: offset perpendicular to the direction of travel (driveways run down the middle)
      const lane = !onRoad(p0) || !onRoad(p1) ? DRIVE_LANE : LANE;
      a.x = p0.x + (p1.x - p0.x) * t - dy * lane;
      a.y = p0.y + (p1.y - p0.y) * t + dx * lane;
      // drawn on the smooth driving line: the body follows the bend
      const lp = this.laneOf(a);
      a.s = lp.along(a.seg, t);
      const pose = lp.pose(a.s, a.wb);
      a.odo = (a.odo ?? 0) + Math.hypot(pose.x - a.rx, pose.y - a.ry);
      a.rx = pose.x;
      a.ry = pose.y;
      a.yaw = pose.yaw;
      a.steer = pose.curv;
    }
    this.clock += dt;
    this.agents = this.agents.filter((a) => !(a.fading && a.alpha <= 0));

    for (const wk of this.walkers) wk.s = (wk.s + wk.speed * dt + 24) % 24;
  }

  /** Signal state at a node: which axis has green (or amber between). */
  signal(i: number, j: number): "x" | "y" | "amber" {
    const ph = (this.clock + hashNode(i, j) * 11) % 11;
    return ph < 4.2 ? "x" : ph < 5.5 ? "amber" : ph < 9.7 ? "y" : "amber";
  }

  private signalized(i: number, j: number) {
    return (this.adj[key(i, j)]?.length ?? 0) >= 3;
  }

  /** Frees junctions once a vehicle has cleared them (or is gone). */
  private releaseJunctions() {
    const alive = new Set(this.agents);
    for (const [n, list] of this.holds) {
      const keep = list.filter(({ a, path, at }) => {
        if (!alive.has(a) || a.path !== path || a.fading || a.phase === "inside") return false;
        if (a.seg > at) return false;
        // stopped in the queue before the line: let the others go meanwhile
        if (a.seg === at - 1 && a.cur < 0.05) {
          const n = a.path[at];
          if (Math.abs(n.x - a.x) + Math.abs(n.y - a.y) > 0.98 + a.half - 0.05) return false;
        }
        // past the junction box with the whole body
        return !(a.seg === at && a.pos > 0.55 + a.half);
      });
      if (keep.length) this.holds.set(n, keep);
      else this.holds.delete(n);
    }
  }

  private holding(a: Agent, n: number) {
    return !!this.holds.get(n)?.some((h) => h.a === a && h.path === a.path);
  }

  /**
   * Asks to cross junction `n` (index `at` in the path). Granted when every
   * vehicle already in it is going a compatible way.
   */
  private reserve(a: Agent, n: number, at: number, force: boolean): boolean {
    const list = this.holds.get(n) ?? [];
    if (list.some((h) => h.a === a && h.path === a.path)) return true;
    const p = a.path[at];
    const q = a.path[at + 1];
    const inDir = a.dir;
    const outDir: Dir = q ? (q.x > p.x ? 0 : q.x < p.x ? 2 : q.y > p.y ? 1 : 3) : inDir;
    const me = { inDir, outDir };
    if (!force && !list.every((h) => compatible(me, h))) return false;
    // don't block the box: only go in when there is room on the far side
    if (!force) {
      const lp = this.laneOf(a);
      const out = lp.pose(lp.knots[at] + 0.55 + a.half + 0.1, a.wb);
      const room = boxOf(out.x, out.y, out.yaw, a.half + 0.05, widthOf(a));
      if (this.agents.some((o) => o !== a && !o.parked && o.alpha > 0.3 && o.phase !== "inside" && overlaps(room, boxOf(o.rx, o.ry, o.yaw ?? DIR_YAW[o.dir], o.half, widthOf(o))))) return false;
    }
    list.push({ a, path: a.path, at, inDir, outDir });
    this.holds.set(n, list);
    return true;
  }

  /** What's ahead on the path: a turn (a speed factor) and a red light or busy junction (a speed cap). */
  private ahead(a: Agent, dt: number): { k: number; cap: number } {
    const nxt = a.path[a.seg + 1];
    if (!nxt) return { k: 1, cap: Infinity };
    const dist = Math.abs(nxt.x - a.x) + Math.abs(nxt.y - a.y);
    // pulling out of a driveway: wait at the kerb for a gap in the traffic
    // (trucks just go: the town gives way to them)
    if (!a.ship && waitingToExit(a)) {
      const room = dist - a.half - MOUTH;
      const busy = this.agents.some((o) => {
        if (o === a || o.parked || o.alpha <= 0.3 || o.phase === "inside" || waitingToExit(o)) return false;
        const dx = nxt.x - o.rx;
        const dy = nxt.y - o.ry;
        if (Math.abs(dx) + Math.abs(dy) > 2) return false;
        // coming toward the gate (or crossing it right now)
        const yaw = o.yaw ?? DIR_YAW[o.dir];
        return dx * Math.cos(yaw) + dy * Math.sin(yaw) > -o.half - 0.35;
      });
      if (busy) return { k: 1, cap: stopSpeed(room) };
    }
    const i = Math.round((nxt.x - 0.5) / ROAD_STEP);
    const j = Math.round((nxt.y - 0.5) / ROAD_STEP);
    const isNode = Math.abs(i * ROAD_STEP + 0.5 - nxt.x) < 0.01 && Math.abs(j * ROAD_STEP + 0.5 - nxt.y) < 0.01;
    let k = 1;
    let cap = Infinity;
    if (isNode && this.signalized(i, j) && a.kind !== "hero") {
      const axis = a.dir === 0 || a.dir === 2 ? "x" : "y";
      const s = this.signal(i, j);
      // the stop line: the front bumper stays out of the crossing lanes
      const line = 0.98 + a.half;
      const before = dist > line - 0.05;
      const n = key(i, j);
      const held = this.holding(a, n);
      if (s !== axis && before && !held) cap = stopSpeed(dist - line);
      // ask for the junction only when about to need it (just enough to brake);
      // trucks go by the lights alone
      else if (!a.ship && dist < line + 0.25 + (a.cur * a.cur) / (2 * DECEL) && !held) {
        // cross only when nobody is going across our way inside the junction
        // (and there is room on the far side); past the line it must go on
        if (this.reserve(a, n, a.seg + 1, !before)) a.waitJ = 0;
        else {
          a.waitJ += dt;
          cap = stopSpeed(dist - line);
        }
      }
    }
    const after = a.path[a.seg + 2];
    if (after && dist < 0.9) {
      const turning = Math.sign(after.x - nxt.x) !== Math.sign(nxt.x - a.path[a.seg].x) || Math.sign(after.y - nxt.y) !== Math.sign(nxt.y - a.path[a.seg].y);
      if (turning) k = Math.min(k, 0.45 + dist * 0.5);
    }
    return { k, cap };
  }

  /**
   * The highest speed at which `a` can still stop before touching anyone.
   * Its body is moved forward along its own driving line (through bends,
   * across junctions, out of a driveway) and tested against every vehicle
   * nearby; the first touch sets how far it may go. When two are about to
   * drive into each other, the one with priority goes and the other waits.
   */
  private clearance(a: Agent, others: Agent[], dt: number): number {
    const lane = this.laneOf(a);
    const mine0 = waitingToExit(a);
    // someone still in a driveway gives way to the road: those on it don't wait for them
    // a waiting circle (A waits for B, B for A…) that won't untie: the first in it squeezes on
    if (a.ignore && Math.hypot(a.ignore.rx - a.rx, a.ignore.ry - a.ry) > a.half + a.ignore.half + 0.3) a.ignore = undefined;
    if (a.blocker && a.blocker !== a.ignore && a.stuck > 2) {
      const ring: Agent[] = [a];
      for (let b: Agent | undefined = a.blocker; b && ring.length < 7 && !ring.includes(b); b = b.blocker) ring.push(b);
      const closed = ring[ring.length - 1].blocker === a;
      if (closed && ring.every((x) => x.prio >= a.prio)) a.ignore = a.blocker;
    }
    // last resort after a long wait: squeeze past whoever is standing still and waiting too
    const squeeze = a.stuck > 4;
    const near = others.filter(
      (o) =>
        o !== a &&
        o !== a.ignore &&
        // trucks standing at their bay only matter to those in the yard with them
        (!o.parked || inLot(a.rx, a.ry, 0.45)) &&
        Math.abs(o.rx - a.rx) + Math.abs(o.ry - a.ry) < 2.4 &&
        (mine0 || !waitingToExit(o)) &&
        !(squeeze && o.cur < 0.05 && (o.waitJ > 0 || o.stuck > 0)) &&
        (!a.ship || this.truckSees(a, o) || !!o.ship),
    );
    let cap = Infinity;
    a.blocker = undefined;
    if (near.length) {
      const mine = boxOf(a.rx, a.ry, a.yaw ?? DIR_YAW[a.dir], a.half, widthOf(a));
      const boxes = near
        .map((o) => ({ o, b: boxOf(o.rx, o.ry, o.yaw ?? DIR_YAW[o.dir], o.half, widthOf(o)) }))
        // already touching one behind (it pulled in too close): driving on separates them
        .filter(({ o, b }) => !(overlaps(mine, b) && (o.rx - a.rx) * mine.c + (o.ry - a.ry) * mine.s < 0));
      let hit = -1;
      // waited a long time: look only at the bare body (no safety margin) so a
      // near miss with someone waiting at a stop line doesn't hold up a junction
      const pad = a.stuck > 3 ? 0 : 1;
      for (const look of LOOKS) {
        const p = lane.pose(a.s + look, a.wb);
        const me = boxOf(p.x, p.y, p.yaw, a.half + 0.05 * pad, widthOf(a) + 0.03 * pad);
        for (const { o, b } of boxes) {
          if (!overlaps(me, b)) continue;
          // in each other's way: the one with priority goes, if the other is not yet in its path
          if (a.prio < o.prio && o.lane) {
            const q = o.lane.pose(o.s + 0.3, o.wb);
            if (overlaps(boxOf(q.x, q.y, q.yaw, o.half, widthOf(o)), mine) && !overlaps(boxOf(p.x, p.y, p.yaw, a.half, widthOf(a)), b)) continue;
          }
          hit = look;
          a.blocker = o;
          break;
        }
        if (hit >= 0) break;
      }
      if (hit >= 0) cap = stopSpeed(hit - LOOKS[0]);
    }
    // a knot nobody can untie (rare): after a long wait, this one goes first
    a.stuck = cap < 0.05 && a.speed > 0 ? a.stuck + dt : Math.max(0, a.stuck - dt * 2);
    if (a.stuck > 6 && a.prio > 0) a.prio = -nextPrio++;
    return cap;
  }

  /**
   * The empire's trucks keep the timetable: they queue behind whoever is in
   * front of them in their lane and stop at red lights, while town cars give
   * way to them everywhere else (so a busy road never locks up).
   */
  private truckSees(a: Agent, o: Agent) {
    // trucks leaving the same dock together: the first one out leads
    if (o.ship && Math.hypot(o.rx - a.rx, o.ry - a.ry) < 0.05) return o.prio < a.prio;
    const d = Math.atan2(Math.sin((o.yaw ?? 0) - (a.yaw ?? 0)), Math.cos((o.yaw ?? 0) - (a.yaw ?? 0)));
    if (Math.abs(d) < 0.7) return true; // the one in front, same way
    return !o.ship; // a car in its path
  }

  private laneOf(a: Agent): LanePath {
    if (a.laneFor !== a.path || !a.lane) {
      a.lane = new LanePath(a.path, undefined, a.big);
      a.laneFor = a.path;
      a.s = a.lane.along(a.seg, 0);
    }
    return a.lane;
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
    const out = to ? this.shipPath(from, to, 1.5) : this.pathFrom(from, this.randomNode(this.edgeNodes.length ? this.edgeNodes : this.openNodes));
    if (!out) {
      a.fading = true;
      return;
    }
    a.path = out;
    a.seg = 0;
    a.pos = 0;
    a.phase = "leave";
    a.alpha = 0;
    a.yaw = undefined;
    a.target = undefined;
    // serviced cars come out shiny in a new colour
    a.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  }

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
    for (const a of this.agents) {
      if (a.phase === "inside" || a.alpha <= 0.3) continue;
      const sh = a.ship;
      if (sh) {
        test(a.rx, a.ry, 9, () => ({
          ref: sh,
          kind: sh.vehicle,
          model: sh.models?.[0] ?? "sedan",
          color: sh.vehicle === "carrier" ? CAR_COLORS[sh.id % CAR_COLORS.length] : sh.color,
          models: sh.vehicle === "carrier" && !sh.back ? (sh.models?.length ? sh.models : (["sedan", "sedan"] as CarModel[])) : undefined,
          item: sh.item,
          empty: sh.back,
        }));
        continue;
      }
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
    for (const a of this.agents) if (a === ref) return a.phase === "inside" || a.alpha <= 0 ? null : [a.rx, a.ry];
    // a shipment keeps its identity on the way back (a new trip object, same id)
    const id = (ref as Partial<Ship>).id;
    if (id !== undefined) {
      const sh = this.ships.get(id);
      if (sh) return [sh.agent.rx, sh.agent.ry];
    }
    return null;
  }

  drawables(): { depth: number; x: number; y: number; draw: (p: Painter) => void }[] {
    const out: { depth: number; x: number; y: number; draw: (p: Painter) => void }[] = [];
    // trucks waiting at the same dock queue inside the loading bay: show one
    const docked: Agent[] = [];
    for (const a of this.agents) {
      if (a.phase === "inside" || a.alpha <= 0) continue;
      const sh = a.ship;
      if (sh && a.parked) {
        if (docked.some((o) => Math.abs(o.rx - a.rx) + Math.abs(o.ry - a.ry) < 0.6)) continue;
        docked.push(a);
      }
      if (sh) {
        out.push({
          depth: a.rx + a.ry,
          x: a.rx,
          y: a.ry,
          draw: (p) => {
            const scale = VEHICLE_SCALE[sh.vehicle];
            const look = { yaw: a.yaw, odo: a.odo };
            if (sh.vehicle === "carrier") {
              const m = sh.models?.length ? sh.models : (["sedan", "sedan"] as CarModel[]);
              drawCarrier(p, a.rx, a.ry, a.dir, [CAR_COLORS[sh.id % CAR_COLORS.length], CAR_COLORS[(sh.id * 3 + 2) % CAR_COLORS.length]], 1, [m[0], m[1] ?? m[0]], { ...look, empty: sh.back });
            } else drawTruck(p, a.rx, a.ry, a.dir, sh.color, scale, a.braking && a.cur < 0.3, { ...look, kind: sh.vehicle, empty: sh.back });
            if (p.night > 0.35) p.light(sx(a.rx, a.ry), sy(a.rx, a.ry, 4), 14, "#fef3c7", 0.5);
          },
        });
        continue;
      }
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

/** How far from the road centre a car waits at the kerb (its front bumper), tiles. */
const MOUTH = 0.38;
/** Still in the driveway on the way out, its front not yet over the kerb. */
const waitingToExit = (a: Agent) => {
  if (a.seg !== 0 || a.path.length < 3 || onRoad(a.path[0])) return false;
  const p = a.path[1];
  return Math.abs(p.x - a.x) + Math.abs(p.y - a.y) - a.half > MOUTH - 0.02;
};

/** Distance left along the path (tiles). */
const remaining = (a: Agent) => {
  let d = -a.pos;
  for (let i = a.seg; i < a.path.length - 1; i++) d += Math.abs(a.path[i + 1].x - a.path[i].x) + Math.abs(a.path[i + 1].y - a.path[i].y);
  return d;
};

/** At the last point of its path (parked at the dock). */
const atEnd = (a: Agent) => a.seg >= a.path.length - 2 && a.pos >= Math.abs(a.path[a.path.length - 1].x - a.path[a.path.length - 2].x) + Math.abs(a.path[a.path.length - 1].y - a.path[a.path.length - 2].y) - 1e-6;

/** How far ahead (tiles) a vehicle checks its way, nearest first. */
const LOOKS = [0.06, 0.2, 0.38, 0.6, 0.85];
/** Comfortable braking (tiles/s²). */
const DECEL = 2.6;
/** The speed from which a vehicle can still stop within `d` tiles. */
const stopSpeed = (d: number) => (d <= 0 ? 0 : Math.sqrt(2 * DECEL * d));

interface Box {
  x: number;
  y: number;
  a: number;
  c: number;
  s: number;
  hl: number;
  hw: number;
}
const boxOf = (x: number, y: number, a: number, hl: number, hw: number): Box => ({ x, y, a, c: Math.cos(a), s: Math.sin(a), hl, hw });
const widthOf = (a: Agent) => (a.half > 0.4 ? 0.13 : a.half > 0.28 ? 0.11 : 0.09);
/** Two vehicle bodies (oriented rectangles) touch. */
function overlaps(p: Box, q: Box) {
  for (const [ux, uy] of [[p.c, p.s], [-p.s, p.c], [q.c, q.s], [-q.s, q.c]]) {
    const d = Math.abs((q.x - p.x) * ux + (q.y - p.y) * uy);
    const rp = p.hl * Math.abs(p.c * ux + p.s * uy) + p.hw * Math.abs(-p.s * ux + p.c * uy);
    const rq = q.hl * Math.abs(q.c * ux + q.s * uy) + q.hw * Math.abs(-q.s * ux + q.c * uy);
    if (d > rp + rq) return false;
  }
  return true;
}

const onGridLine = (v: number) => Math.abs((v - 0.5) / ROAD_STEP - Math.round((v - 0.5) / ROAD_STEP)) < 1e-6;
/** A point on a road centre line (not inside a lot). */
const onRoad = (p: Pt) => onGridLine(p.x) || onGridLine(p.y);
/** Distance to the nearest road centre line. */
const fromRoad = (v: number) => {
  const k = (v - 0.5) / ROAD_STEP;
  return Math.abs(k - Math.round(k)) * ROAD_STEP;
};
/** Deep inside a lot, clear of the road and its pavement. */
const inLot = (x: number, y: number, edge = 0.75) => Math.min(fromRoad(x), fromRoad(y)) > edge;

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
