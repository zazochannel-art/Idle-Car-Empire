// The lights of the streets: the traffic lights on their poles (signals.ts
// runs them) and, from dusk, the cars' and trucks' headlights and tail
// lights with a pool of light on the road ahead. Glows are additive sprites
// in a couple of batches, so the night costs a few draw calls only.
import * as THREE from "three";
import { WORLD_MAP, along } from "@/game/city/layout";
import { hazed } from "./kit";
import { ROAD_LIFT } from "./scenery";
import type { Arm, Light, Signal, Signals } from "./signals";
import type { Ground } from "./terrain";

const KERB_H = 0.035;
/** Pole height, and the light head on top of it. */
const POLE = 0.36;
const LAMP_R = 0.017;
const LAMP_GAP = 0.04;

const LIT: Record<Light, THREE.Color> = { red: new THREE.Color("#ff2d20"), amber: new THREE.Color("#ffb21a"), green: new THREE.Color("#1fe36b") };
const UNLIT: Record<Light, THREE.Color> = { red: new THREE.Color("#3b1512"), amber: new THREE.Color("#3a2a10"), green: new THREE.Color("#0f2e1b") };
const ORDER: Light[] = ["red", "amber", "green"];

function glowTexture(): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** The pool of light a car's headlights throw on the road: bright near the car, fading out ahead and to the sides. */
function beamTexture(): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      // u: 0 at the car … 1 ahead; v: −1 … 1 across
      const u = x / 63;
      const v = (y / 63) * 2 - 1;
      const spread = 0.35 + 0.65 * u;
      const across = Math.max(0, 1 - Math.abs(v) / spread);
      const a = Math.pow(across, 1.4) * (1 - u) * Math.min(1, u * 6);
      const i = (y * 64 + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 240;
      img.data[i + 2] = 200;
      img.data[i + 3] = Math.round(a * 255);
    }
  c.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}

function points(cap: number, size: number, tex: THREE.Texture) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0 });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 6;
  p.visible = false;
  return p;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The traffic lights: a pole by every way in, three lamps showing its light, and their glow at night. */
export class SignalLamps {
  readonly root = new THREE.Group();
  private lamps: THREE.InstancedMesh;
  private glow: THREE.Points;
  private heads: { x: number; y: number; z: number; tx: number; tz: number }[] = [];
  private shown: (Light | null)[] = [];
  private arms: { sig: Signal; arm: Arm }[];

  constructor(
    ground: Ground,
    private signals: Signals,
    tex = glowTexture(),
  ) {
    this.root.name = "traffic-lights";
    const arms = (this.arms = signals.list.flatMap((sig) => sig.arms.map((arm) => ({ sig, arm }))));
    const n = arms.length;
    const poleGeo = new THREE.CylinderGeometry(0.009, 0.011, POLE, 6);
    poleGeo.translate(0, POLE / 2, 0);
    const headGeo = new THREE.BoxGeometry(0.04, 0.13, 0.045);
    const poles = new THREE.InstancedMesh(poleGeo, hazed(new THREE.MeshStandardMaterial({ color: "#5b6470", roughness: 0.5, metalness: 0.5 })), Math.max(1, n));
    const heads = new THREE.InstancedMesh(headGeo, hazed(new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.6 })), Math.max(1, n));
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(LAMP_R, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), Math.max(1, n * 3));
    const d = new THREE.Object3D();
    arms.forEach(({ sig, arm }, i) => {
      const r = WORLD_MAP.roads[arm.road];
      // by the right-hand kerb, just before the stop line (before the zebra at a crossing)
      let s: number;
      if (sig.node >= 0) {
        const line = arm.dir > 0 ? r.len : 0;
        s = line - arm.dir * Math.min(r.len / 2, r.w * 0.62 + 0.3);
      } else {
        const c = signals.crossings.find((x) => x.signal === sig)!;
        s = c.f * r.len - arm.dir * 0.3;
      }
      const p = along(r.pts, r.acc, Math.max(0, Math.min(r.len, s)));
      const tx = p.tx * arm.dir;
      const tz = p.ty * arm.dir;
      const off = r.w / 2 + 0.09;
      const x = p.x - tz * off;
      const z = p.y + tx * off;
      const y = Math.max(ground.at(x, z), 0) + ROAD_LIFT + KERB_H;
      d.position.set(x, y, z);
      d.rotation.set(0, Math.atan2(-tz, tx), 0);
      d.updateMatrix();
      poles.setMatrixAt(i, d.matrix);
      d.position.y = y + POLE;
      d.updateMatrix();
      heads.setMatrixAt(i, d.matrix);
      this.heads.push({ x, y: y + POLE, z, tx, tz });
      // the lamps face the cars coming
      for (let k = 0; k < 3; k++) {
        d.position.set(x - tx * 0.024, y + POLE + LAMP_GAP * (1 - k), z - tz * 0.024);
        d.updateMatrix();
        this.lamps.setMatrixAt(i * 3 + k, d.matrix);
        this.lamps.setColorAt(i * 3 + k, UNLIT[ORDER[k]]);
      }
      this.shown.push(null);
    });
    poles.count = heads.count = n;
    this.lamps.count = n * 3;
    poles.castShadow = true;
    this.root.add(poles, heads, this.lamps);
    this.glow = points(Math.max(1, n), 0.55, tex);
    this.root.add(this.glow);
    this.root.visible = n > 0;
  }

  /** Shows every light as it is now; `dark` (0 day … 1 night) brings out their glow. */
  update(dark: number) {
    const arms = this.arms;
    const k = smooth(0.3, 0.8, dark);
    const pos = this.glow.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = this.glow.geometry.getAttribute("color") as THREE.BufferAttribute;
    let changed = false;
    arms.forEach(({ sig, arm }, i) => {
      const light = this.signals.show(sig, arm);
      if (this.shown[i] !== light) {
        this.shown[i] = light;
        for (let j = 0; j < 3; j++) this.lamps.setColorAt(i * 3 + j, ORDER[j] === light ? LIT[light] : UNLIT[ORDER[j]]);
        changed = true;
      }
      if (k > 0.01) {
        const h = this.heads[i];
        const j = ORDER.indexOf(light);
        pos.setXYZ(i, h.x - h.tx * 0.04, h.y + LAMP_GAP * (1 - j), h.z - h.tz * 0.04);
        const c = LIT[light];
        col.setXYZ(i, c.r, c.g, c.b);
      }
    });
    if (changed && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    this.glow.visible = k > 0.01;
    if (this.glow.visible) {
      (this.glow.material as THREE.PointsMaterial).opacity = k;
      this.glow.geometry.setDrawRange(0, arms.length);
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.root.clear();
  }
}

/** One vehicle as the lights see it: position, heading, half its length and width, and how much it shows (0–1). */
export type Lamp = [number, number, number, number, number, number, number];

/** Headlights and tail lights from dusk, with the light they throw on the road ahead. */
export class Headlights {
  readonly root = new THREE.Group();
  private front: THREE.Points;
  private back: THREE.Points;
  private beams: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private white = new THREE.Color("#fff4d6");
  private red = new THREE.Color("#ff2a1a");
  /** No pools of light (low graphics). */
  low = false;

  constructor(private cap = 256) {
    this.root.name = "headlights";
    const tex = glowTexture();
    this.front = points(cap * 2, 0.38, tex);
    this.back = points(cap * 2, 0.2, tex);
    const plane = new THREE.PlaneGeometry(1, 1);
    // flat on the road, reaching from the car (x = 0) forward (+x)
    plane.rotateX(-Math.PI / 2);
    plane.translate(0.5, 0, 0);
    this.beams = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }), cap);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 4;
    this.root.add(this.beams, this.front, this.back);
    this.root.visible = false;
  }

  update(vehicles: Iterable<Lamp>, dark: number, far: boolean) {
    const k = smooth(0.35, 0.8, dark);
    this.root.visible = k > 0.01;
    if (!this.root.visible) return;
    const fp = this.front.geometry.getAttribute("position") as THREE.BufferAttribute;
    const fc = this.front.geometry.getAttribute("color") as THREE.BufferAttribute;
    const bp = this.back.geometry.getAttribute("position") as THREE.BufferAttribute;
    const bc = this.back.geometry.getAttribute("color") as THREE.BufferAttribute;
    const beams = !far && !this.low;
    let n = 0;
    for (const [x, y, z, yaw, half, side, alpha] of vehicles) {
      if (n >= this.cap) break;
      const fx = Math.cos(yaw);
      const fz = -Math.sin(yaw);
      // sideways (to the right of the heading)
      const sx = -fz;
      const sz = fx;
      const w = side * 0.7;
      for (let j = 0; j < 2; j++) {
        const sd = j === 0 ? 1 : -1;
        fp.setXYZ(n * 2 + j, x + fx * half * 0.98 + sx * w * sd, y + 0.08, z + fz * half * 0.98 + sz * w * sd);
        fc.setXYZ(n * 2 + j, this.white.r * alpha, this.white.g * alpha, this.white.b * alpha);
        bp.setXYZ(n * 2 + j, x - fx * half * 0.98 + sx * w * sd, y + 0.09, z - fz * half * 0.98 + sz * w * sd);
        bc.setXYZ(n * 2 + j, this.red.r * alpha, this.red.g * alpha, this.red.b * alpha);
      }
      if (beams) {
        const d = this.dummy;
        d.position.set(x + fx * half * 0.9, y + 0.012, z + fz * half * 0.9);
        d.rotation.set(0, yaw, 0);
        d.scale.set(1.15 * alpha, 1, Math.max(0.3, side * 5.5) * alpha);
        d.updateMatrix();
        this.beams.setMatrixAt(n, d.matrix);
      }
      n++;
    }
    for (const p of [this.front, this.back]) {
      p.geometry.setDrawRange(0, n * 2);
      (p.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (p.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      (p.material as THREE.PointsMaterial).opacity = k;
      p.visible = n > 0;
    }
    this.beams.count = beams ? n : 0;
    this.beams.visible = beams && n > 0;
    this.beams.instanceMatrix.needsUpdate = true;
    (this.beams.material as THREE.MeshBasicMaterial).opacity = 0.85 * k;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.root.clear();
  }
}
