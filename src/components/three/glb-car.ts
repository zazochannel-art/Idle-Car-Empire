// Ready-made 3D cars (glTF / .glb files, e.g. downloaded from Sketchfab)
// brought into the game's conventions: metres, +X forward, +Y up, the
// wheels standing on y = 0, centred on the origin and scaled to a set
// length (measured from the vertices: compressed files carry quantised
// positions whose quick bounds can be off). Their paint can be recoloured.
import type * as THREE_NS from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type Three = typeof THREE_NS;

/** Which way the file's car faces (glTF has no rule for it; Sketchfab models vary). */
export type Facing = "+x" | "-x" | "+z" | "-z";

export interface GlbCarOptions {
  /** Bumper-to-bumper length after scaling, metres. */
  length?: number;
  /** Which way the car's nose points in the file; found from its shape when left out. */
  facing?: Facing;
  /** Parts to leave out, by material name (badges, plates, mascots...). */
  hide?: RegExp;
}

const TURN: Record<Facing, number> = { "+x": 0, "-x": Math.PI, "+z": Math.PI / 2, "-z": -Math.PI / 2 };

export async function loadGlbCar(T: Three, url: string | ArrayBuffer, opts: GlbCarOptions = {}): Promise<THREE_NS.Group> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = typeof url === "string" ? await loader.loadAsync(url) : await loader.parseAsync(url, "");
  const model = gltf.scene;

  // lay it along +X: the longer horizontal side is the length
  const box = new T.Box3().setFromObject(model, true);
  const size = box.getSize(new T.Vector3());
  const facing = opts.facing ?? (size.z > size.x ? "+z" : "+x");
  const pivot = new T.Group();
  pivot.add(model);
  pivot.rotation.y = TURN[facing];
  pivot.updateMatrixWorld(true);

  // scale to length, wheels on the ground, centred
  const b = new T.Box3().setFromObject(pivot, true);
  const s = b.getSize(new T.Vector3());
  const k = (opts.length ?? 4.2) / s.x;
  const car = new T.Group();
  car.add(pivot);
  pivot.scale.setScalar(k);
  pivot.updateMatrixWorld(true);
  const c = new T.Box3().setFromObject(pivot, true);
  pivot.position.set(-(c.min.x + c.max.x) / 2, -c.min.y, -(c.min.z + c.max.z) / 2);

  car.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (opts.hide && mats.some((mm) => opts.hide!.test(mm.name))) m.visible = false;
      // see-through glass without a transmission pass (one pass is far cheaper on phones)
      for (const mm of mats)
        if (mm instanceof T.MeshPhysicalMaterial && mm.transmission > 0) {
          mm.transmission = 0;
          mm.transparent = true;
          mm.opacity = 0.42;
          mm.color.multiplyScalar(0.35);
          mm.depthWrite = false;
        }
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return car;
}

/**
 * The body paint: a material named like paint, or else the coloured,
 * opaque material covering the most surface (glass, tyres and chrome are
 * dark, see-through or grey, so they are skipped).
 */
export function paintMaterials(T: Three, car: THREE_NS.Object3D): THREE_NS.MeshStandardMaterial[] {
  const area = new Map<THREE_NS.MeshStandardMaterial, number>();
  const named: THREE_NS.MeshStandardMaterial[] = [];
  const hsl = { h: 0, s: 0, l: 0 };
  car.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!(mat instanceof T.MeshStandardMaterial)) continue;
      if (/paint|body|carpaint|exterior/i.test(mat.name) && !named.includes(mat)) named.push(mat);
      mat.color.getHSL(hsl);
      if (mat.transparent || hsl.s < 0.25 || hsl.l < 0.12) continue;
      const g = m.geometry;
      g.computeBoundingBox();
      const sz = g.boundingBox!.getSize(new T.Vector3());
      area.set(mat, (area.get(mat) ?? 0) + sz.x * sz.y + sz.y * sz.z + sz.x * sz.z);
    }
  });
  if (named.length) return named;
  const best = [...area.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? [best[0]] : [];
}

/** Repaints the body (keeps glass, tyres, lights and trim as they are). */
export function repaintCar(T: Three, car: THREE_NS.Object3D, color: string) {
  for (const m of paintMaterials(T, car)) m.color.set(color);
}
