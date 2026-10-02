// Visual traffic on the Empire Map: customers driving to garages, trucks
// bringing parts, car carriers taking new cars to dealers, and pedestrians.
// Purely cosmetic — income is computed by the engine — but every trip follows
// the real production chain on the real road network.
import { BLOCKS, NODES, ROAD_STEP, segmentOpen, type Entry } from "@/game/city/layout";
import type { ZoneId } from "@/game/types";
import { rand, type Painter } from "./iso";
import { CAR_COLORS, drawCar, drawCarrier, drawTruck, type Dir } from "./vehicles";

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

type Kind = "customer" | "ambient" | "truck" | "carrier";

interface Pt {
  x: number;
  y: number;
}

interface Agent {
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
}

interface Walker {
  bx: number;
  by: number;
  s: number;
  speed: number;
  shirt: string;
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

  update(dt: number) {
    const w = this.world;
    if (!w) return;
    const cap = Math.min(46, 8 + w.garages.length * 4 + w.factories.length * 3 + w.dealers.length * 2 + w.unlocked.size * 2);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.agents.length < cap) {
      this.spawn();
      this.spawnClock = 0.5 + Math.random() * 0.8;
    }

    const moving = this.agents.filter((a) => a.phase !== "inside" && !a.fading && a.alpha > 0.3);
    for (const a of this.agents) {
      if (a.phase === "inside") {
        a.wait -= dt;
        if (a.wait <= 0) this.leave(a);
        continue;
      }
      a.alpha = a.fading ? Math.max(0, a.alpha - dt * 2.5) : Math.min(1, a.alpha + dt * 2.5);
      let move = a.speed * dt * this.clearance(a, moving);
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
        this.arrive(a);
        continue;
      }
      const p0 = a.path[a.seg];
      const p1 = a.path[a.seg + 1];
      const len = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) || 1;
      const t = a.pos / len;
      const dx = Math.sign(p1.x - p0.x);
      const dy = Math.sign(p1.y - p0.y);
      a.dir = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3;
      // keep right: offset perpendicular to the direction of travel
      const lane = 0.2;
      const onDriveway = a.seg >= a.path.length - 2 && a.phase === "go" && a.kind !== "ambient";
      const lx = onDriveway ? 0 : -dy * lane;
      const ly = onDriveway ? 0 : dx * lane;
      a.x = p0.x + (p1.x - p0.x) * t + lx;
      a.y = p0.y + (p1.y - p0.y) * t + ly;
    }
    this.agents = this.agents.filter((a) => !(a.fading && a.alpha <= 0));

    for (const wk of this.walkers) wk.s = (wk.s + wk.speed * dt + 24) % 24;
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
  drawables(): { depth: number; x: number; y: number; draw: (p: Painter) => void }[] {
    const out: { depth: number; x: number; y: number; draw: (p: Painter) => void }[] = [];
    for (const a of this.agents) {
      if (a.phase === "inside" || a.alpha <= 0) continue;
      out.push({
        depth: a.x + a.y,
        x: a.x,
        y: a.y,
        draw: (p) => {
          p.ctx.globalAlpha = a.alpha;
          if (a.kind === "truck") drawTruck(p, a.x, a.y, a.dir, a.color2 === a.color ? "#f97316" : "#f8fafc");
          else if (a.kind === "carrier") drawCarrier(p, a.x, a.y, a.dir, [a.color, a.color2]);
          else drawCar(p, a.x, a.y, a.dir, a.color, 1, 0, rand(a.color.length, a.speed) > 0.8);
          p.ctx.globalAlpha = 1;
        },
      });
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
