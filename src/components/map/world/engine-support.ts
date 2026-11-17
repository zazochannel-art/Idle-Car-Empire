// Small parts of the map engine (engine.ts): the traffic before the world has loaded, image loading,
// the blur of the height field, and the street lamps' light pools and glows.
import * as THREE from "three";
import type { ShipView, Site } from "../map-types";
import type { CarModel } from "../vehicles";
import { Traffic3D } from "./traffic";

/**
 * The traffic as the map component sees it: shipments and buyers can be
 * handed over before the world has loaded (they wait until it has).
 */
export class TrafficFacade {
  private ships: ShipView[] | null = null;
  constructor(private layer: () => Traffic3D | null) {}

  setShipments(list: ShipView[]) {
    const l = this.layer();
    if (l) l.setShipments(list);
    else this.ships = list;
  }

  spawnBuyer(site: Site, model: CarModel) {
    this.layer()?.spawnBuyer(site, model);
  }

  rollOut(site: Site, model: CarModel, color: string) {
    this.layer()?.rollOut(site, model, color);
  }

  /** The world has loaded: hand over what arrived before. */
  flush() {
    if (this.ships) this.layer()?.setShipments(this.ships);
    this.ships = null;
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Box blur of a W×H field (one pass across, one down). */
export function blur(a: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / n;
      acc += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / n;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/** The warm pools of light the street lamps lay on the road and pavement below (shown at night, one draw call). */
export function lampPools(lamps: [number, number, number, number][]) {
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,214,140,0.95)");
  grad.addColorStop(0.45, "rgba(255,190,110,0.4)");
  grad.addColorStop(1, "rgba(255,170,90,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  const m = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(cv),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(plane, m, Math.max(1, lamps.length));
  mesh.count = lamps.length;
  const d = new THREE.Object3D();
  lamps.forEach(([x, z, a, y], i) => {
    d.position.set(x - 0.2 * Math.cos(a), y + 0.025, z + 0.2 * Math.sin(a));
    d.scale.set(1.5, 1, 1.5);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 4;
  return mesh;
}

/** Warm glows over the street lamps (shown at night). */
export function lampGlows(lamps: [number, number, number, number][]) {
  const pos = new Float32Array(lamps.length * 3);
  lamps.forEach(([x, z, a, y], i) => {
    pos[3 * i] = x - 0.18 * Math.cos(a);
    pos[3 * i + 1] = y + 0.6;
    pos[3 * i + 2] = z + 0.18 * Math.sin(a);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,236,180,1)");
  grad.addColorStop(0.25, "rgba(255,214,140,0.6)");
  grad.addColorStop(1, "rgba(255,200,120,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.PointsMaterial({ map: tex, size: 1.1, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const p = new THREE.Points(g, m);
  p.visible = false;
  p.renderOrder = 5;
  return p;
}
