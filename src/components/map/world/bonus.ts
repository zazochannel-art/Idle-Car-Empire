// The bonus on the Empire Map (engine/map-bonus.ts) as the player sees it: a
// golden car or a VIP's limousine in the traffic, a drone flying a crate in
// to one of the plants, a truck broken down by the road with its hazard
// lights on. One at a time; it says where it is (for its label, the tap and
// the arrow at the screen's edge) and leaves with coins when it is taken.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WORLD_MAP } from "@/game/city/layout";
import type { MapBonus } from "@/game/engine/map-bonus";
import type { MapBonusKind } from "@/game/config/map-bonus";
import type { Fx } from "./fx";
import { C, box, cone, cylinder, freezeStatic, plainUv, sphere, type MapMaterials } from "./kit";
import type { Ground } from "./terrain";
import type { Traffic3D } from "./traffic";

/** The drone's flight (s): in, down, the crate lowered, away. */
const FLY_IN = 5;
const DESCEND = 2;
const LOWER = 1.5;
const FLY_OFF = 6;
/** Its cruising and hovering heights over the ground. */
const CRUISE = 13;
const HOVER = 2.6;

const smooth = (k: number) => {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
};

interface Shown {
  id: number;
  kind: MapBonusKind;
  /** Seconds since it turned up. */
  age: number;
  /** A car in the traffic (golden, vip). */
  car?: object;
  /** The drone, its rotors, the cable and the crate. */
  drone?: { obj: THREE.Group; rotors: THREE.Object3D[]; cable: THREE.Mesh; crate: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; away: THREE.Vector3; ground: number };
  /** The broken-down truck and its hazard lights. */
  truck?: { obj: THREE.Group; lights: THREE.Mesh[]; hood: THREE.Vector3 };
  /** Last sparkle or puff of smoke (s). */
  fxAt: number;
}

export class BonusLayer {
  readonly root = new THREE.Group();
  private cur: Shown | null = null;
  /** Things on their way out (shrinking). */
  private leaving: { obj: THREE.Object3D; t: number }[] = [];
  private pos = new THREE.Vector3();
  private lightOn: THREE.MeshBasicMaterial;
  private lightOff: THREE.MeshBasicMaterial;

  constructor(
    private ground: Ground,
    private traffic: Traffic3D,
    private mats: MapMaterials,
    private fx: Fx,
  ) {
    this.root.name = "bonus";
    this.lightOn = new THREE.MeshBasicMaterial({ color: "#ffb020" });
    this.lightOff = new THREE.MeshBasicMaterial({ color: "#6b4a10" });
  }

  get id() {
    return this.cur?.id ?? null;
  }

  get kind() {
    return this.cur?.kind ?? null;
  }

  /** The game's bonus on the map now (null: none). A new one is put on the map; a gone one leaves. */
  set(b: MapBonus | null) {
    if (this.cur && this.cur.id === b?.id) return;
    if (this.cur) this.leave(false);
    if (b) this.cur = this.build(b);
  }

  /** The player took it: coins, and it leaves. */
  taken() {
    const p = this.position();
    if (p) this.fx.coins(p.x, p.y, p.z);
    this.leave(true);
  }

  /** Where the thing to tap is now (null: nothing on the map). */
  position(): THREE.Vector3 | null {
    const c = this.cur;
    if (!c) return null;
    if (c.car) {
      const p = this.traffic.positionOf(c.car);
      return p ? this.pos.set(p[0], p[1] + 0.15, p[2]) : null;
    }
    if (c.drone) return c.drone.crate.getWorldPosition(this.pos);
    if (c.truck) return this.pos.copy(c.truck.obj.position).setY(c.truck.obj.position.y + 0.3);
    return null;
  }

  private build(b: MapBonus): Shown {
    const s: Shown = { id: b.id, kind: b.kind, age: 0, fxAt: 0 };
    if (b.kind === "golden") s.car = this.traffic.spawnSpecial("supercar", "#e8b923", "metallic", 1, 1.3) ?? undefined;
    else if (b.kind === "vip") s.car = this.traffic.spawnSpecial("luxury", "#16181d", "gloss", 1.5, 1.2) ?? undefined;
    else if (b.kind === "drone") s.drone = this.drone(b.plot);
    else s.truck = this.brokenTruck();
    return s;
  }

  /** The drone with its crate, on its way from out at sea to the plant's yard. */
  private drone(plotId?: string): Shown["drone"] {
    const plot = (plotId && WORLD_MAP.plotById[plotId]) || WORLD_MAP.plots[0];
    // the crate lands in the lot's yard, just inside its front edge
    const tx = plot.x + Math.sin(plot.rot) * (plot.d / 2 - 0.8);
    const tz = plot.y + Math.cos(plot.rot) * (plot.d / 2 - 0.8);
    const g = this.ground.at(tx, tz);
    const a = Math.random() * Math.PI * 2;
    const from = new THREE.Vector3(tx + Math.cos(a) * 45, g + CRUISE, tz + Math.sin(a) * 45);
    const away = new THREE.Vector3(tx - Math.cos(a + 0.8) * 50, g + CRUISE + 4, tz - Math.sin(a + 0.8) * 50);
    const D = C("#2b3138");
    const L = C("#e9edf2");
    const body = new THREE.Mesh(
      mergeGeometries(
        [
          box(0.46, 0.14, 0.46, L, 0, -0.07, 0, 0),
          sphere(0.16, D, 0, 0.07, 0, true),
          box(0.86, 0.045, 0.07, D, 0, 0, 0, Math.PI / 4),
          box(0.86, 0.045, 0.07, D, 0, 0, 0, -Math.PI / 4),
          ...[
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ].map(([sx, sz]) => cylinder(0.055, 0.09, D, sx * 0.3, 0, sz * 0.3, 10)),
          box(0.05, 0.05, 0.05, C("#ef4444"), 0.2, -0.1, 0.2, 0),
          box(0.05, 0.05, 0.05, C("#22c55e"), -0.2, -0.1, 0.2, 0),
        ].map(plainUv),
      ),
      this.mats.byKind.metal,
    );
    body.castShadow = true;
    const obj = new THREE.Group();
    obj.add(body);
    const rotors: THREE.Object3D[] = [];
    const disc = new THREE.MeshBasicMaterial({ color: "#cfd6de", transparent: true, opacity: 0.35, depthWrite: false });
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const r = new THREE.Group();
      r.position.set(sx * 0.3, 0.1, sz * 0.3);
      const blade = new THREE.Mesh(plainUv(box(0.34, 0.012, 0.035, D, 0, 0, 0, 0)), this.mats.byKind.metal);
      const blur = new THREE.Mesh(new THREE.CircleGeometry(0.18, 18).rotateX(-Math.PI / 2), disc);
      r.add(blade, blur);
      obj.add(r);
      rotors.push(r);
    }
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), this.mats.byKind.metal);
    cable.scale.y = 0.16;
    obj.add(cable);
    const crate = new THREE.Mesh(
      mergeGeometries(
        [
          box(0.52, 0.46, 0.52, C("#b9814a"), 0, 0, 0, 0),
          box(0.54, 0.07, 0.54, C("#7a5230"), 0, 0.06, 0, 0),
          box(0.54, 0.07, 0.54, C("#7a5230"), 0, 0.33, 0, 0),
          box(0.1, 0.48, 0.54, C("#e8b923"), 0, -0.01, 0, 0),
        ].map(plainUv),
      ),
      this.mats.byKind.plain,
    );
    crate.castShadow = true;
    obj.add(crate);
    obj.position.copy(from);
    obj.scale.setScalar(1.5);
    this.root.add(obj);
    return { obj, rotors, cable, crate, from, to: new THREE.Vector3(tx, g, tz), away, ground: g };
  }

  /** A truck pulled over on a road the deliveries drive, hazard lights blinking, a warning triangle behind. */
  private brokenTruck(): Shown["truck"] {
    const spot = this.traffic.roadSpot() ?? { x: WORLD_MAP.plots[0].x, y: this.ground.at(WORLD_MAP.plots[0].x, WORLD_MAP.plots[0].y), z: WORLD_MAP.plots[0].y, yaw: 0 };
    const obj = new THREE.Group();
    const truck = this.traffic.truckObject("truck");
    // a little down at one corner: a broken wheel
    truck.rotation.z = -0.035;
    truck.rotation.x = 0.03;
    obj.add(truck);
    const lights: THREE.Mesh[] = [];
    const geo = new THREE.SphereGeometry(0.045, 8, 6);
    for (const [x, z] of [
      [0.62, 0.14],
      [0.62, -0.14],
      [-0.62, 0.14],
      [-0.62, -0.14],
    ]) {
      const m = new THREE.Mesh(geo, this.lightOff);
      m.position.set(x, 0.16, z);
      obj.add(m);
      lights.push(m);
    }
    const tri = new THREE.Mesh(plainUv(cone(0.13, 0.22, C("#dc2626"), -1.25, 0, 0, 3, Math.PI / 2)), this.mats.byKind.plain);
    obj.add(tri);
    obj.position.set(spot.x, spot.y, spot.z);
    obj.rotation.y = spot.yaw;
    freezeStatic(truck);
    this.root.add(obj);
    const hood = new THREE.Vector3(0.55, 0.35, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw).add(obj.position);
    return { obj, lights, hood };
  }

  private leave(taken: boolean) {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    if (c.car) this.traffic.releaseSpecial(c.car);
    if (c.drone) {
      // the drone and the crate go (the crate is on its own once it has landed)
      this.leaving.push({ obj: c.drone.obj, t: taken ? 0 : 0.2 });
      if (c.drone.crate.parent === this.root) this.leaving.push({ obj: c.drone.crate, t: 0 });
    }
    if (c.truck) this.leaving.push({ obj: c.truck.obj, t: 0 });
  }

  update(dt: number, t: number) {
    for (const l of this.leaving) {
      l.t += dt;
      l.obj.scale.setScalar(Math.max(0.01, (l.obj.userData.s0 ??= l.obj.scale.x) * (1 - l.t / 0.6)));
    }
    this.leaving = this.leaving.filter((l) => {
      if (l.t < 0.6) return true;
      this.root.remove(l.obj);
      return false;
    });
    const c = this.cur;
    if (!c) return;
    c.age += dt;
    if (c.car) {
      // gone off the map (a dead end): another one takes its place
      if (!this.traffic.positionOf(c.car)) c.car = this.traffic.spawnSpecial(c.kind === "vip" ? "luxury" : "supercar", c.kind === "vip" ? "#16181d" : "#e8b923", c.kind === "vip" ? "gloss" : "metallic", c.kind === "vip" ? 1.5 : 1, 1.25) ?? undefined;
      const p = this.position();
      if (p && t - c.fxAt > (c.kind === "golden" ? 0.07 : 0.3)) {
        c.fxAt = t;
        this.fx.sparkle(p.x, p.y + 0.1, p.z, c.kind === "golden" ? 2 : 1, c.kind === "golden" ? "#ffd75e" : "#c4b5fd");
      }
    }
    if (c.drone) this.flyDrone(c, dt);
    if (c.truck) {
      const on = Math.sin(t * Math.PI * 3) > 0;
      for (const l of c.truck.lights) l.material = on ? this.lightOn : this.lightOff;
      if (t - c.fxAt > 0.22) {
        c.fxAt = t;
        this.fx.smoke(c.truck.hood.x, c.truck.hood.y, c.truck.hood.z);
      }
    }
  }

  private flyDrone(c: Shown, dt: number) {
    const d = c.drone!;
    for (const r of d.rotors) r.rotation.y += dt * 40;
    const a = c.age;
    const o = d.obj;
    const above = new THREE.Vector3(d.to.x, d.ground + CRUISE * 0.45, d.to.z);
    // the crate's bottom on the ground, in the drone's own units (it is drawn 1.5×)
    const hang = HOVER / 1.5;
    if (a < FLY_IN) {
      const k = smooth(a / FLY_IN);
      o.position.lerpVectors(d.from, above, k);
      o.rotation.z = Math.sin(k * Math.PI) * 0.12;
      d.crate.position.y = -0.62;
      d.cable.scale.y = 0.16;
    } else if (a < FLY_IN + DESCEND) {
      const k = smooth((a - FLY_IN) / DESCEND);
      o.position.set(d.to.x, above.y + (d.ground + HOVER - above.y) * k, d.to.z);
      o.rotation.z = 0;
    } else if (a < FLY_IN + DESCEND + LOWER) {
      // the cable pays out until the crate sits on the ground
      const k = smooth((a - FLY_IN - DESCEND) / LOWER);
      o.position.set(d.to.x, d.ground + HOVER, d.to.z);
      d.crate.position.y = -0.62 - (hang - 0.62) * k;
      d.cable.scale.y = -d.crate.position.y - 0.46;
    } else {
      // let go: the crate stays where it landed, the drone flies off
      if (d.crate.parent === o) {
        d.crate.getWorldPosition(this.pos);
        o.remove(d.crate);
        d.crate.position.copy(this.pos);
        d.crate.scale.setScalar(1.5);
        d.crate.rotation.y = Math.random() * 0.6;
        this.root.add(d.crate);
        o.remove(d.cable);
      }
      const k = smooth((a - FLY_IN - DESCEND - LOWER) / FLY_OFF);
      o.position.lerpVectors(new THREE.Vector3(d.to.x, d.ground + HOVER, d.to.z), d.away, k);
      o.visible = k < 0.98;
      // the crate bobs a little to say "tap me"
      d.crate.position.y = d.ground + 0.02 + Math.abs(Math.sin(a * 3)) * 0.08;
    }
  }

  /** The crate, once on the ground, leaves with the bonus (it isn't part of the drone any more). */
  dispose() {
    this.leave(false);
    this.root.clear();
  }
}
