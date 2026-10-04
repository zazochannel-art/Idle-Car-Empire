// Shared building blocks for the factory-interior models (machines, parts,
// props): rounded boxes, cylinders, rollers, fences and control cabinets.
// Units are tiles; one map pixel of height is 1/39 tile.
import type * as THREE_NS from "three";
import type { MaterialKit } from "./car-models";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type Three = typeof THREE_NS;
export type Mat = THREE_NS.Material;

export const H = 1 / 39;

export function std(T: Three, color: string, metal = 0.3, rough = 0.5) {
  return new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
}

/** A box with softly rounded edges (machined castings, not cubes); thin parts stay sharp. */
export function box(T: Three, m: Mat, x: number, y: number, z: number, w: number, h: number, d: number) {
  const r = Math.min(0.03, Math.min(w, h, d) * 0.18);
  const geo = r > 0.006 ? new RoundedBoxGeometry(w, h, d, 2, r) : new T.BoxGeometry(w, h, d);
  const b = new T.Mesh(geo, m);
  b.position.set(x + w / 2, y + h / 2, z + d / 2);
  return b;
}

export function cyl(T: Three, m: Mat, x: number, y: number, z: number, r: number, h: number, seg = 14) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m);
  c.position.set(x, y + h / 2, z);
  return c;
}

/** A lying cylinder along x (a steel coil, a roller). */
export function roll(T: Three, m: Mat, x: number, y: number, z: number, r: number, len: number, alongZ = false) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r, len, 20), m);
  c.rotation.z = alongZ ? 0 : Math.PI / 2;
  if (alongZ) c.rotation.x = Math.PI / 2;
  c.position.set(x, y + r, z);
  return c;
}

/** Safety fence panels along a rectangle's back and sides (open toward the camera). */
export function fence(T: Three, x0: number, x1: number, z0: number, z1: number, h: number, sides: ("back" | "left" | "right" | "front")[]) {
  const g = new T.Group();
  const post = std(T, "#f5b301", 0.3, 0.45);
  const mesh = new T.MeshStandardMaterial({ color: "#3b4250", metalness: 0.6, roughness: 0.45, transparent: true, opacity: 0.5 });
  const run = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.5));
    for (let i = 0; i <= n; i++) g.add(box(T, post, ax + ((bx - ax) * i) / n - 0.015, 0, az + ((bz - az) * i) / n - 0.015, 0.03, h, 0.03));
    const p = new T.Mesh(new T.BoxGeometry(Math.max(0.01, Math.abs(bx - ax)), h * 0.8, Math.max(0.01, Math.abs(bz - az))), mesh);
    p.position.set((ax + bx) / 2, h * 0.45, (az + bz) / 2);
    g.add(p);
  };
  if (sides.includes("back")) run(x0, z0, x1, z0);
  if (sides.includes("left")) run(x0, z0, x0, z1);
  if (sides.includes("right")) run(x1, z0, x1, z1);
  if (sides.includes("front")) run(x0, z1, x1, z1);
  return g;
}

/** A control cabinet with a screen and a status light. */
export function cabinet(T: Three, kit: MaterialKit, x: number, z: number, light: string) {
  const g = new T.Group();
  g.add(box(T, std(T, "#d5dae1", 0.3, 0.4), x, 0, z, 0.22, 9 * H, 0.14));
  g.add(box(T, kit.glass, x + 0.03, 4 * H, z + 0.071, 0.14, 3 * H, 0.004));
  const lamp = new T.MeshStandardMaterial({ color: light, emissive: light, emissiveIntensity: 1.2 });
  g.add(cyl(T, lamp, x + 0.11, 9 * H, z + 0.07, 0.018, 3 * H, 8));
  return g;
}

/** Roller conveyor section (part of a station, under the stopping point). */
export function rollers(T: Three, x0: number, x1: number, y: number) {
  const g = new T.Group();
  const frame = std(T, "#5b6470", 0.6, 0.4);
  const r = std(T, "#a5adb8", 0.9, 0.25);
  g.add(box(T, frame, x0, 0, -0.32, x1 - x0, y, 0.05));
  g.add(box(T, frame, x0, 0, 0.27, x1 - x0, y, 0.05));
  for (let x = x0 + 0.06; x < x1; x += 0.12) g.add(roll(T, r, x, y - 0.03, 0, 0.025, 0.56, true));
  return g;
}

