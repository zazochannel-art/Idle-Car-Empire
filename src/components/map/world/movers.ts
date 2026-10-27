// What moves round the island besides the traffic: container ships sailing
// in from the open sea to the port's quay and out again, an airliner landing,
// taxiing back and taking off from the airport's runway, cargo planes
// passing over once the company exports by air, and a freight train on the
// railway once it runs trains. How busy it gets follows the company's
// transport tier (Logistics: Truck → Train → Port → Export).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { C, box, freezeStatic, paint, plainUv, type MapMaterials } from "./kit";
import type { MapLines } from "./rail-line";
import { planeParts, shipParts } from "./scenery";
import type { Ground } from "./terrain";

const smooth = (k: number) => {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
};
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A path on the ground plane with its running length. */
class Path {
  readonly acc: number[] = [0];
  constructor(readonly pts: [number, number][]) {
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  get length() {
    return this.acc[this.acc.length - 1];
  }
  /** Point and heading (yaw, the model's nose along +x) at distance s. */
  at(s: number): { x: number; z: number; yaw: number } {
    const n = this.pts.length;
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.acc[m] <= s) lo = m;
      else hi = m;
    }
    const a = this.pts[lo];
    const b = this.pts[hi];
    const f = (s - this.acc[lo]) / (this.acc[hi] - this.acc[lo] || 1);
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
  }
}

/** A smooth curve through points, sampled every `step` units. */
function smoothLine(pts: [number, number][], step: number): [number, number][] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}

// ───────────────────────────── the sea lanes ─────────────────────────────

/** Open water on a coarse grid over the map (2 units a cell), for the ships' routes. */
class SeaGrid {
  readonly cell = 2;
  readonly nx: number;
  readonly nz: number;
  /** 1: deep enough for a ship, clear of the shore. */
  readonly sea: Uint8Array;
  constructor(
    private ground: Ground,
    private half: [number, number],
  ) {
    this.nx = Math.floor((half[0] * 2) / this.cell);
    this.nz = Math.floor((half[1] * 2) / this.cell);
    this.sea = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.pos(i, j);
        let deep = true;
        for (const [dx, dz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) if (ground.metres(x + dx, z + dz) > -1.2) deep = false;
        this.sea[j * this.nx + i] = deep ? 1 : 0;
      }
  }
  pos(i: number, j: number): [number, number] {
    return [-this.half[0] + (i + 0.5) * this.cell, -this.half[1] + (j + 0.5) * this.cell];
  }
  cellOf(x: number, z: number): [number, number] {
    return [Math.max(0, Math.min(this.nx - 1, Math.floor((x + this.half[0]) / this.cell))), Math.max(0, Math.min(this.nz - 1, Math.floor((z + this.half[1]) / this.cell)))];
  }
  /** The open-water cell nearest a point (null: none within 12 cells). */
  nearest(x: number, z: number): [number, number] | null {
    const [i0, j0] = this.cellOf(x, z);
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dj = -12; dj <= 12; dj++)
      for (let di = -12; di <= 12; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz || !this.sea[j * this.nx + i]) continue;
        const d = di * di + dj * dj;
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    return best;
  }
  /** Distances from a cell over open water (-1: not reachable). */
  flood(start: [number, number]): Int32Array {
    const dist = new Int32Array(this.nx * this.nz).fill(-1);
    const q = [start[1] * this.nx + start[0]];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const i = c % this.nx;
      const j = (c / this.nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const n = nj * this.nx + ni;
        if (!this.sea[n] || dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
    return dist;
  }
  /** Straight over open water from a to b (no cell of land on the way). */
  clear(a: [number, number], b: [number, number]): boolean {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cell * 0.5));
    for (let k = 0; k <= n; k++) {
      const [i, j] = this.cellOf(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
      if (!this.sea[j * this.nx + i]) return false;
    }
    return true;
  }
  /** A route over open water down the flood's distances from a cell to its start, straightened. */
  route(from: [number, number], dist: Int32Array): [number, number][] {
    const cells: [number, number][] = [this.pos(...from)];
    let [i, j] = from;
    for (let guard = 0; guard < 5000 && dist[j * this.nx + i] > 0; guard++) {
      let best: [number, number] | null = null;
      let bd = dist[j * this.nx + i];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const d = dist[nj * this.nx + ni];
        if (d >= 0 && d < bd) {
          bd = d;
          best = [ni, nj];
        }
      }
      if (!best) break;
      [i, j] = best;
      cells.push(this.pos(i, j));
    }
    // string-pulling: keep only the turns that open water needs
    const out: [number, number][] = [cells[0]];
    let k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--)
        if (this.clear(cells[k], cells[m])) {
          far = m;
          break;
        }
      out.push(cells[far]);
      k = far;
    }
    return out;
  }
}

interface Ship {
  obj: THREE.Object3D;
  berth: [number, number];
  /** Where the ship lies at the quay, and its heading there. */
  dock: { x: number; z: number; yaw: number };
  dist: Int32Array;
  /** The leg now: in, at the quay, out, gone (out of sight before the next one). */
  leg: "in" | "dock" | "out" | "gone";
  path: Path | null;
  s: number;
  wait: number;
}

const SHIP_SPEED = 2.4;

// ───────────────────────────── the movers ─────────────────────────────

export class Movers {
  readonly root = new THREE.Group();
  private ships: Ship[] = [];
  private sea: SeaGrid | null = null;
  /** Ends of the sea lanes: open water at the map's edge. */
  private exits: [number, number][] = [];
  private plane: THREE.Object3D;
  private cargo: THREE.Object3D;
  private cargoT = 0;
  private cargoLine: { x0: number; z0: number; x1: number; z1: number } | null = null;
  private planeT = Math.random() * 40;
  private track: THREE.Group;
  private train: { cars: THREE.Object3D[]; path: Path; s: number; dir: 1 | -1; wait: number; v: number } | null = null;
  private trainPath: Path;
  private trainY: (s: number) => number;
  /** The company's transport tier (0 trucks, 1 trains, 2 port, 3 export). */
  private tier = -1;
  private low: boolean;
  private lines: MapLines;

  constructor(
    private ground: Ground,
    private mats: MapMaterials,
    private half: [number, number],
    opt: { low: boolean; lines: MapLines },
  ) {
    this.root.name = "movers";
    this.low = opt.low;
    this.lines = opt.lines;
    this.plane = this.planeObject("#2463b8");
    this.cargo = this.planeObject("#e57c2f");
    this.cargo.visible = false;
    this.root.add(this.plane, this.cargo);
    // the railway: its track is always there, the train comes with the Train tier
    this.trainPath = new Path(smoothLine(this.lines.rail, 0.3));
    const heights = this.trainPath.pts.map(([x, z]) => ground.at(x, z));
    // an even bed: the ground's heights averaged over a few units
    const bed = heights.map((_, i) => {
      let a = 0;
      let n = 0;
      for (let k = Math.max(0, i - 8); k <= Math.min(heights.length - 1, i + 8); k++, n++) a += heights[k];
      return Math.max(heights[i] - 0.02, a / n) + 0.03;
    });
    this.trainY = (s: number) => {
      const f = (Math.max(0, Math.min(this.trainPath.length, s)) / this.trainPath.length) * (bed.length - 1);
      const i = Math.floor(f);
      const j = Math.min(bed.length - 1, i + 1);
      return bed[i] + (bed[j] - bed[i]) * (f - i);
    };
    this.track = this.buildTrack(bed);
    this.root.add(this.track);
  }

  /** The things that move and are drawn every frame (the rest is frozen). */
  movingParts(): THREE.Object3D[] {
    return [this.plane, this.cargo, ...this.ships.map((s) => s.obj), ...(this.train?.cars ?? [])];
  }

  private planeObject(livery: string) {
    const m = new THREE.Mesh(mergeGeometries(planeParts(livery).map(plainUv)), this.mats.byKind.plain);
    m.castShadow = true;
    const g = new THREE.Group();
    g.add(m);
    g.scale.setScalar(1.15);
    g.rotation.order = "YZX";
    return g;
  }

  /** The company's transport tier: more ships, the train, cargo flights. */
  setTier(tier: number) {
    if (tier === this.tier) return;
    this.tier = tier;
    const want = tier >= 2 ? 2 : 1;
    if (this.ships.length < want) this.addShips(want);
    this.cargo.visible = tier >= 3;
    if (tier >= 1 && !this.train) this.train = this.buildTrain();
    if (tier < 1 && this.train) {
      for (const c of this.train.cars) this.root.remove(c);
      this.train = null;
    }
  }

  // ───────────────────────── ships ─────────────────────────

  private addShips(n: number) {
    this.sea ??= new SeaGrid(this.ground, this.half);
    const sea = this.sea;
    if (!this.exits.length) {
      // a berth to start from: the quay by the port's first crane
      const q0 = this.lines.quays[0];
      const quay = sea.nearest(q0[0], q0[1] + 1);
      if (!quay) return;
      const d = sea.flood(quay);
      // open water at the map's edge, reachable from the port
      for (let i = 0; i < sea.nx; i += 3)
        for (const j of [0, sea.nz - 1]) if (d[j * sea.nx + i] > 0) this.exits.push(sea.pos(i, j));
      for (let j = 0; j < sea.nz; j += 3)
        for (const i of [0, sea.nx - 1]) if (d[j * sea.nx + i] > 0) this.exits.push(sea.pos(i, j));
      if (!this.exits.length) return;
    }
    // berths off the quay (by the cranes), away from the ships moored there
    const quays = this.lines.quays;
    while (this.ships.length < n && this.ships.length < quays.length) {
      const q = quays[this.ships.length];
      const cell = sea.nearest(q[0], q[1]);
      if (!cell) break;
      const berth = sea.pos(...cell);
      const obj = new THREE.Mesh(mergeGeometries(shipParts().map(plainUv)), this.mats.byKind.plain);
      obj.castShadow = true;
      obj.scale.setScalar(1.1);
      obj.visible = false;
      this.root.add(obj);
      // moored side-on to the quay: across the line to the quay's crane
      const yaw = Math.atan2(-(q[1] - berth[1]), q[0] - berth[0]) + Math.PI / 2;
      this.ships.push({ obj, berth, dock: { x: berth[0], z: berth[1], yaw }, dist: sea.flood(cell), leg: "gone", path: null, s: 0, wait: 3 + this.ships.length * 25 });
    }
  }

  private sail(sh: Ship, dt: number) {
    const sea = this.sea!;
    if (sh.leg === "gone") {
      sh.obj.visible = false;
      sh.wait -= dt;
      if (sh.wait > 0) return;
      // in from a random end of the sea lanes
      const ex = this.exits[Math.floor(Math.random() * this.exits.length)];
      const pts = sea.route(sea.cellOf(ex[0], ex[1]), sh.dist);
      pts.push([sh.dock.x, sh.dock.z]);
      sh.path = new Path(smoothLine(pts, 0.6));
      sh.s = 0;
      sh.leg = "in";
    }
    const p = sh.path;
    if (sh.leg === "dock") {
      // swinging round alongside the quay
      sh.obj.rotation.y += angle(sh.dock.yaw - sh.obj.rotation.y) * Math.min(1, dt * 0.5);
      sh.wait -= dt;
      if (sh.wait <= 0) {
        const ex = this.exits[Math.floor(Math.random() * this.exits.length)];
        const pts = sea.route(sea.cellOf(ex[0], ex[1]), sh.dist).reverse();
        pts.unshift([sh.dock.x, sh.dock.z]);
        sh.path = new Path(smoothLine(pts, 0.6));
        sh.s = 0;
        sh.leg = "out";
      }
      return;
    }
    if (!p) return;
    // slow in the harbour, at sea speed out in the open
    const near = Math.min(sh.s, p.length - sh.s);
    sh.s += dt * SHIP_SPEED * (0.35 + 0.65 * smooth(near / 12));
    const at = p.at(sh.s);
    sh.obj.visible = true;
    sh.obj.position.set(at.x, 0.06, at.z);
    sh.obj.rotation.y += angle(at.yaw - sh.obj.rotation.y) * Math.min(1, dt * 2);
    if (sh.s >= p.length) {
      if (sh.leg === "in") {
        sh.leg = "dock";
        sh.wait = 25 + Math.random() * 15;
        sh.obj.position.set(sh.dock.x, 0.06, sh.dock.z);
      } else {
        sh.leg = "gone";
        sh.wait = 8 + Math.random() * 20;
      }
    }
  }

  // ───────────────────────── planes ─────────────────────────

  /**
   * The airliner's round (s): lined up, take-off roll, climb out, away,
   * approach, landing roll, turn, taxi back, turn.
   */
  private fly(dt: number) {
    const T = [4, 7, 14, 20, 15, 8, 3, 12, 3];
    const total = T.reduce((a, b) => a + b, 0);
    this.planeT = (this.planeT + dt) % total;
    let t = this.planeT;
    let leg = 0;
    while (t >= T[leg]) t -= T[leg++];
    const k = t / T[leg];
    const [ax, az] = this.lines.runway.a;
    const [bx, bz] = this.lines.runway.b;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    const yaw = Math.atan2(-uz, ux);
    const S0 = 2.5;
    const S1 = L - 5;
    const at = (s: number, h = 0) => {
      const x = ax + ux * s;
      const z = az + uz * s;
      return [x, this.ground.at(x, z) + h, z] as const;
    };
    const p = this.plane;
    let pos: readonly [number, number, number];
    let heading = yaw;
    let pitch = 0;
    p.visible = true;
    switch (leg) {
      case 0: // lined up at the runway's start
        pos = at(S0);
        break;
      case 1: {
        // take-off roll: speeding up, the nose lifting at the end
        const s = S0 + (S1 - S0) * k * k;
        pos = at(s, Math.max(0, (k - 0.85) / 0.15) * 0.4);
        pitch = Math.max(0, (k - 0.75) / 0.25) * 0.14;
        break;
      }
      case 2: {
        // climbing out over the sea
        const s = S1 + k * 95;
        pos = at(s, 0.4 + k * 30);
        pitch = 0.14 * (1 - k * 0.5);
        break;
      }
      case 3: // far away
        p.visible = false;
        pos = at(S1 + 95, 30);
        break;
      case 4: {
        // the approach, gliding down to the runway's start
        const s = -95 + k * (95 + S0 + 2);
        pos = at(s, (1 - k) * 22 + 0.02);
        pitch = -0.04;
        break;
      }
      case 5: {
        // the landing roll, slowing down
        const s = S0 + 2 + (S1 - S0 - 2) * (1 - (1 - k) * (1 - k));
        pos = at(s);
        break;
      }
      case 6: // turning round at the far end
        pos = at(S1);
        heading = yaw + Math.PI * smooth(k);
        break;
      case 7: // taxiing back
        pos = at(S1 + (S0 - S1) * smooth(k));
        heading = yaw + Math.PI;
        break;
      default:
        pos = at(S0);
        heading = yaw + Math.PI * (1 + smooth(k));
    }
    p.position.set(pos[0], pos[1], pos[2]);
    p.rotation.y = heading;
    p.rotation.z = pitch;
    // a cargo flight passes high over the island now and then (exports by air)
    if (this.cargo.visible) {
      this.cargoT -= dt;
      if (this.cargoT <= 0 || !this.cargoLine) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.max(this.half[0], this.half[1]) + 40;
        this.cargoLine = { x0: Math.cos(a) * r, z0: Math.sin(a) * r, x1: -Math.cos(a + 0.4) * r, z1: -Math.sin(a + 0.4) * r };
        this.cargoT = 55;
      }
      const c = this.cargoLine;
      const f = 1 - this.cargoT / 55;
      this.cargo.position.set(c.x0 + (c.x1 - c.x0) * f, 34, c.z0 + (c.z1 - c.z0) * f);
      this.cargo.rotation.y = Math.atan2(-(c.z1 - c.z0), c.x1 - c.x0);
    }
  }

  // ───────────────────────── the railway ─────────────────────────

  /** Ballast, sleepers and two rails along the line, on an even bed. */
  private buildTrack(bed: number[]) {
    const g = new THREE.Group();
    g.name = "railway";
    const pts = this.trainPath.pts;
    const n = pts.length;
    const side = (i: number): [number, number] => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    };
    const ribbon = (off: number, half: number, lift: number, col: THREE.Color) => {
      const pos: number[] = [];
      const colr: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i < n; i++) {
        const [sx, sz] = side(i);
        const [x, z] = pts[i];
        for (const k of [-1, 1]) {
          pos.push(x + sx * (off + k * half), bed[i] + lift, z + sz * (off + k * half));
          colr.push(col.r, col.g, col.b);
        }
        if (i) idx.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i - 1, 2 * i, 2 * i + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      // the ribbons face up whichever way they were wound
      const nrm = geo.attributes.normal as THREE.BufferAttribute;
      if (nrm.getY(0) < 0) {
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
        geo.setIndex(idx);
        geo.computeVertexNormals();
      }
      return plainUv(geo);
    };
    const ballast = new THREE.Mesh(ribbon(0, 0.42, 0, C("#8b8178")), this.mats.byKind.plain);
    ballast.receiveShadow = true;
    const rails = new THREE.Mesh(mergeGeometries([ribbon(0.24, 0.025, 0.075, C("#c8ccd2")), ribbon(-0.24, 0.025, 0.075, C("#c8ccd2"))]), this.mats.byKind.metal);
    const sleeper = plainUv(box(0.66, 0.05, 0.1, C("#5a4636"), 0, 0, 0, 0));
    const every = 0.24;
    const count = Math.floor(this.trainPath.length / every);
    const inst = new THREE.InstancedMesh(sleeper, this.mats.byKind.plain, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const s = i * every;
      const at = this.trainPath.at(s);
      inst.setMatrixAt(i, m4.compose(v.set(at.x, this.trainY(s) + 0.01, at.z), q.setFromAxisAngle(up, at.yaw + Math.PI / 2), one));
    }
    inst.receiveShadow = true;
    g.add(ballast, inst, rails);
    // the bed sits a touch over the ground (and over the road markings it never crosses)
    for (const m of [ballast, inst, rails]) m.renderOrder = 1;
    freezeStatic(g);
    return g;
  }

  /** Two locomotives (one at each end, so it runs both ways) and container wagons between them. */
  private buildTrain() {
    const loco = (col: string) => {
      const body = C(col);
      const dark = C("#2b3138");
      return mergeGeometries(
        [
          box(1.5, 0.12, 0.46, dark, 0, 0.06, 0, 0),
          box(1.05, 0.42, 0.42, body, -0.18, 0.18, 0, 0),
          box(0.36, 0.5, 0.44, body, 0.53, 0.18, 0, 0),
          box(0.05, 0.16, 0.36, C("#9fd3f0"), 0.72, 0.46, 0, 0),
          box(1.0, 0.04, 0.3, dark, -0.18, 0.6, 0, 0),
          box(1.52, 0.04, 0.48, C("#f2f4f7"), 0, 0.3, 0, 0),
        ].map(plainUv),
      );
    };
    const COLS = ["#d8423a", "#2f7fd1", "#f2b134", "#3aa76d", "#9aa4ae", "#e57c2f"];
    const wagon = (i: number) => {
      const parts = [box(1.3, 0.1, 0.42, C("#3a3f45"), 0, 0.06, 0, 0)];
      // a tank wagon now and then, container flats otherwise
      if (i % 4 === 3) parts.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 1.15, 12).rotateZ(Math.PI / 2).translate(0, 0.38, 0), C("#c9d0d8")));
      else parts.push(box(0.6, 0.34, 0.4, C(COLS[i % COLS.length]), -0.31, 0.16, 0, 0), box(0.6, 0.34, 0.4, C(COLS[(i * 3 + 1) % COLS.length]), 0.31, 0.16, 0, 0));
      return mergeGeometries(parts.map(plainUv));
    };
    const cars: THREE.Object3D[] = [];
    const add = (geo: THREE.BufferGeometry, flip = false) => {
      const m = new THREE.Mesh(geo, this.mats.byKind.metal);
      m.castShadow = true;
      if (flip) m.rotation.y = Math.PI;
      const g = new THREE.Group();
      g.add(m);
      this.root.add(g);
      cars.push(g);
    };
    add(loco("#f59e0b"));
    for (let i = 0; i < (this.low ? 5 : 8); i++) add(wagon(i));
    add(loco("#f59e0b"), true);
    return { cars, path: this.trainPath, s: 6, dir: 1 as 1 | -1, wait: 0, v: 0 };
  }

  /** Runs the train along the line: off from one end, slowing into the other, a wait, then back. */
  private run(dt: number) {
    const tr = this.train!;
    const L = tr.path.length;
    const GAP = 1.45;
    const span = GAP * (tr.cars.length - 1);
    // the lead car's distance; the train keeps within the line
    const lo = 1;
    const hi = L - 1 - span;
    if (tr.wait > 0) {
      tr.wait -= dt;
      if (tr.wait <= 0) tr.dir = tr.dir > 0 ? -1 : 1;
    } else {
      const left = tr.dir > 0 ? hi - tr.s : tr.s - lo;
      const want = left < 8 ? Math.max(0.35, (left / 8) * 3) : 3;
      tr.v += (want - tr.v) * Math.min(1, dt * 0.8);
      tr.s += tr.v * dt * tr.dir;
      if (tr.s >= hi || tr.s <= lo) {
        tr.s = Math.max(lo, Math.min(hi, tr.s));
        tr.v = 0;
        tr.wait = 12;
      }
    }
    tr.cars.forEach((car, i) => {
      const s = tr.s + i * GAP;
      // heading from the car's two bogies
      const a = tr.path.at(s - 0.5);
      const b = tr.path.at(s + 0.5);
      car.position.set((a.x + b.x) / 2, this.trainY(s) + 0.08, (a.z + b.z) / 2);
      car.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    });
  }

  update(dt: number) {
    if (this.tier < 0) return;
    for (const sh of this.ships) this.sail(sh, dt);
    this.fly(dt);
    if (this.train) this.run(dt);
  }
}
