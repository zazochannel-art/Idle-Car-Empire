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
};
import { hazed } from "./kit";
import { ROAD_LIFT, carGeometry, roadSurface, type MapRoad } from "./scenery";
import { bake } from "./structures";
import type { Ground } from "./terrain";

/** World units per metre for the vehicle models (a touch over life size, so they read from above). */
const VSCALE = 0.12;
/** Town cars keep about the trucks' pace (the engine times trucks at ROAD_SPEED tiles/s, with stops). */
const TOWN_SPEED = 1.9;
const COUNTRY_SPEED = 3.6;
/** Town cars at most: each is a full 3D model (several draw calls), so phones stay smooth. */
const MAX_CARS = 48;
/** Buyers driving off at once, and the gap between two at the same dealership (s): a busy dealer sells several cars a second. */
const MAX_BUYERS = 10;
const BUYER_GAP = 2.5;

type P3 = [number, number, number];

/** A car driving the roads on its own. */
interface RoadCar {
  road: number;
  s: number;
  dir: 1 | -1;
  speed: number;
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
  private inst: THREE.InstancedMesh;
  private kit: MaterialKit = materialKit(THREE);
  private models = new Map<string, THREE.Group>();
  private carMats = new Map<string, THREE.Material>();
  private carGeo = carGeometry();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);
  hero: RoadCar | null = null;
  /** Seconds since start, and when each dealership last sent a buyer off. */
  private clock = 0;
  private lastBuyer = new Map<string, number>();

  constructor(
    private ground: Ground,
    private mapRoads: MapRoad[],
    carMat: THREE.Material,
  ) {
    this.root.name = "traffic";
    this.inst = new THREE.InstancedMesh(this.carGeo, carMat, MAX_CARS + 24);
    this.inst.count = 0;
    this.inst.castShadow = true;
    this.inst.frustumCulled = false;
    this.inst.count = 0;
    this.inst.visible = false;
    void loadHeroes(THREE).then(() => {
      for (const car of this.cars) this.refreshCarVisual(car);
    });
    const N = WORLD_MAP.nodes.length;
    this.exits = Array.from({ length: N }, () => []);
    WORLD_MAP.roads.forEach((r, i) => {
      this.exits[r.a].push([i, true]);
      if (!r.oneway) this.exits[r.b].push([i, false]);
    });
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
    return Math.round(Math.min(MAX_CARS, this.openLen / 11) * this.density);
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
    const c: RoadCar = {
      road, s, dir,
      speed: (r.fast ? COUNTRY_SPEED : TOWN_SPEED) * (0.85 + Math.random() * 0.3),
      color: new THREE.Color(hex), hex, model, x: 0, y: 0, z: 0, yaw: 0,
      alpha: life ? 0 : 1, life, scale, paint, visual: new THREE.Group(), seg: 0, visualScale: -1,
    };
    c.visual.name = `traffic-car-${model}`;
    this.root.add(c.visual);
    this.refreshCarVisual(c);
    this.place(c, 1);
    return c;
  }

  private spawnAmbient() {
    const road = this.randomRoad();
    if (road < 0) return;
    const r = WORLD_MAP.roads[road];
    const hex = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const model = TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)];
    const c = this.newCar(road, Math.random() * r.len, Math.random() < 0.5 ? 1 : -1, hex, model, 0, TRAFFIC_SCALE[model], true);
    c.alpha = 0;
    this.cars.push(c);
  }

  /** A buyer drives off from a dealership in the car they bought. */
  spawnBuyer(site: Site, model: CarModel, color?: string) {
    // a few buyers stand for all the sales: one per dealership every few seconds, ten on the roads at most
    if (this.clock - (this.lastBuyer.get(site.id) ?? -Infinity) < BUYER_GAP) return;
    let buyers = 0;
    for (const c of this.cars) if (c.buyer) buyers++;
    if (buyers >= MAX_BUYERS) return;
    this.lastBuyer.set(site.id, this.clock);
    const e = site.entry;
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

  /** Replace the generic traffic silhouette with the actual GLB-backed model. */
  private refreshCarVisual(c: RoadCar) {
    const model = buildCar(THREE, { model: c.model, color: c.hex, finish: "gloss", build: c.paint ? { color: c.hex } : undefined });
    if (!model.children.length) return;
    c.visual.clear();
    model.scale.setScalar(0.118 * c.scale);
    c.visual.add(model);
    c.visual.visible = c.alpha > 0.01;
  }

  /** Sets a car's position from its road and distance; `k` eases the heading. */
  private place(c: RoadCar, k: number) {
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
    c.visual.rotation.y = c.yaw;
    c.visual.visible = c.alpha > 0.01;
  }

  private drive(c: RoadCar, dt: number) {
    let r = WORLD_MAP.roads[c.road];
    c.s += c.speed * dt * c.dir;
    let guard = 0;
    while ((c.s > r.len || c.s < 0) && guard++ < 4) {
      const over = c.s > r.len ? c.s - r.len : -c.s;
      const node = c.s > r.len ? r.b : r.a;
      const back = c.road;
      const options = this.exits[node].filter(([i]) => (this.open[i] || c.life > 0) && i !== back);
      const pick = options.length ? options[Math.floor(Math.random() * options.length)] : r.oneway ? null : ([back, node === r.a] as [number, boolean]);
      if (!pick) {
        c.s = Math.max(0, Math.min(r.len, c.s));
        c.life = Math.max(c.life, 0.01);
        break;
      }
      c.road = pick[0];
      r = WORLD_MAP.roads[c.road];
      c.dir = pick[1] ? 1 : -1;
      c.seg = c.dir > 0 ? 0 : Math.max(0, r.pts.length - 2);
      c.s = pick[1] ? over : r.len - over;
      c.speed = (r.fast ? COUNTRY_SPEED : TOWN_SPEED) * (0.85 + Math.random() * 0.3) * (c.hero ? 0.6 : 1);
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
    // drop repeated points (slice ends meet at the junctions)
    return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 1e-3);
  }

  private truckModel(v: ShipView) {
    const empty = v.back;
    const cabColors = ["#e11d48", "#2563eb", "#f59e0b", "#f2f4f7", "#334155", "#16a34a"];
    const cabColor = cabColors[Math.abs(v.id) % cabColors.length];
    const key = v.vehicle === "carrier"
      ? `carrier|${cabColor}|${empty ? "" : (v.models ?? []).join(",")}`
      : `${v.vehicle}|${v.color}|${cabColor}|${empty}`;
    let m = this.models.get(key);
    if (!m) {
      if (v.vehicle === "carrier") {
        m = bake(buildCarrier(THREE, this.kit, [], 0, cabColor), VSCALE);
        // the cars on its decks (simple shapes, in the models' colours)
        const slots: [number, number][] = [
          [-2.4, 0.95],
          [-6.0, 0.95],
          [-2.4, 2.65],
          [-6.0, 2.65],
        ];
        if (!empty)
          (v.models ?? []).slice(0, 4).forEach((model, i) => {
            const car = new THREE.Mesh(this.carGeo, this.carMat(CAR_COLORS[(model.length * 3 + i) % CAR_COLORS.length]));
            car.scale.setScalar(10 * VSCALE * 0.75);
            car.position.set(slots[i][0] * VSCALE + 1.4 * VSCALE, slots[i][1] * VSCALE, 0);
            m!.add(car);
          });
      } else {
        const cabColors = ["#e11d48", "#2563eb", "#f59e0b", "#f2f4f7", "#334155", "#16a34a"];
        const cabColor = cabColors[Math.abs(v.id) % cabColors.length];
        m = bake(buildTruck(THREE, this.kit, {
          kind: v.vehicle,
          cargo: v.color,
          empty,
          cabColor,
        }), VSCALE);
      }
      this.models.set(key, m);
    }
    return m.clone();
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
        // turned round at the far end: unloaded, then the empty truck heads home
        if (!tr.back && tr.view.vehicle === "carrier") this.onArrive(tr.view.to.id);
        this.root.remove(tr.obj);
        tr.obj = this.truckModel(v);
        this.root.add(tr.obj);
        tr.back = v.back;
        tr.lt = v.t;
      }
      if (!tr) {
        const a = plotOf(v.from.id);
        const b = plotOf(v.to.id);
        if (!a || !b) continue;
        const path = this.route(a, b);
        if (path.length < 2) continue;
        tr = { view: v, path, acc: cumulative(path), lt: v.t, back: v.back, obj: this.truckModel(v), x: 0, y: 0, z: 0, yaw: 0, gone: 0 };
        this.root.add(tr.obj);
        this.trucks.set(v.id, tr);
        this.placeTruck(tr, 1);
      }
      tr.view = v;
      // keep the local clock close to the engine's (it ticks 10× a second)
      if (Math.abs(v.t - tr.lt) > 1.5) tr.lt = v.t;
      else tr.lt += (v.t - tr.lt) * 0.25;
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
    const s = (tr.back ? 1 - f : f) * L;
    const p = at3(tr.path, tr.acc, s);
    const d = tr.back ? -1 : 1;
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
    for (const c of this.cars) if (!c.life) ambient++;
    for (let i = 0; i < 3 && ambient < want; i++, ambient++) this.spawnAmbient();
    let extra = ambient - want;
    for (const c of this.cars) {
      if (extra > 0 && !c.life && c.alpha >= 1) {
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

    // Real traffic models are individual cached GLB clones.
    for (const car of this.cars) {
      const visible = car.alpha > 0.01;
      if (car.visual.visible !== visible) car.visual.visible = visible;
      const fade = car.life > 0 ? Math.max(0.05, car.alpha) : 1;
      if (Math.abs(fade - car.visualScale) > 0.001) {
        car.visualScale = fade;
        car.visual.scale.setScalar(fade);
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
        }
      } else tr.lt = Math.min(tr.view.dur, tr.lt + dt);
      this.placeTruck(tr, Math.min(1, dt * 6));
    }
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
    this.hero = null;
  }

  /** Everything that can be tapped: [world position, what it is]. */
  *pickables(): Generator<[number, number, number, VehiclePick]> {
    for (const tr of this.trucks.values()) {
      if (tr.gone) continue;
      const v = tr.view;
      yield [tr.x, tr.y + 0.2, tr.z, { ref: tr, kind: v.vehicle, model: v.models?.[0] ?? "sedan", color: v.color, models: v.back ? [] : v.models, item: v.item, empty: v.back }];
    }
    for (const c of this.cars) if (c.alpha > 0.5) yield [c.x, c.y + 0.1, c.z, { ref: c, kind: "car", model: c.model, color: c.hex }];
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
