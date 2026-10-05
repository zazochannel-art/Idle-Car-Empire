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
  /**
   * One car out of a pack of several: the prefix of its body's node names
   * ("Sedan Body"). Its wheels are the wheel nodes standing under it; it is
   * turned straight along its own length whatever angle it stands at.
   */
  pick?: string;
}

const files = new Map<string, Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>>();

/** Each file is fetched and parsed once, however many cars are taken from it. */
function load(url: string) {
  let p = files.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    p = loader.loadAsync(url);
    files.set(url, p);
  }
  return p;
}

/**
 * Takes one car out of a pack: its body meshes and the wheels under them,
 * moved into a new group with their world placement, then turned so the
 * body's longest horizontal direction (its principal axis) runs along X.
 */
function pickCar(T: Three, scene: THREE_NS.Object3D, prefix: string): THREE_NS.Group {
  scene.updateMatrixWorld(true);
  const meshes: THREE_NS.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE_NS.Mesh).isMesh) meshes.push(o as THREE_NS.Mesh);
  });
  // three.js turns spaces in node names into underscores
  const key = prefix.replace(/\s+/g, "_");
  const body = meshes.filter((m) => m.name.startsWith(key));
  if (!body.length) throw new Error(`no "${prefix}" in the file`);
  const bb = new T.Box3();
  for (const m of body) bb.expandByObject(m, true);
  // wheels: wheel meshes whose centre stands inside the body's footprint
  const c = new T.Vector3();
  const wheels = meshes.filter((m) => {
    if (!/^wheel/i.test(m.name)) return false;
    new T.Box3().setFromObject(m, true).getCenter(c);
    return c.x > bb.min.x && c.x < bb.max.x && c.z > bb.min.z && c.z < bb.max.z;
  });
  // principal axis of the body in plan: its heading
  const v = new T.Vector3();
  let n = 0;
  let mx = 0;
  let mz = 0;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (const m of body) {
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      n++;
      mx += v.x;
      mz += v.z;
      sxx += v.x * v.x;
      szz += v.z * v.z;
      sxz += v.x * v.z;
    }
  }
  mx /= n;
  mz /= n;
  const cxx = sxx / n - mx * mx;
  const czz = szz / n - mz * mz;
  const cxz = sxz / n - mx * mz;
  const heading = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const out = new T.Group();
  const turn = new T.Matrix4().makeRotationY(heading).multiply(new T.Matrix4().makeTranslation(-mx, 0, -mz));
  for (const m of [...body, ...wheels]) {
    const k = m.clone();
    k.matrixAutoUpdate = true;
    turn.clone().multiply(m.matrixWorld).decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  return out;
}

const TURN: Record<Facing, number> = { "+x": 0, "-x": Math.PI, "+z": Math.PI / 2, "-z": -Math.PI / 2 };

export async function loadGlbCar(T: Three, url: string | ArrayBuffer, opts: GlbCarOptions = {}): Promise<THREE_NS.Group> {
  let model: THREE_NS.Object3D;
  if (typeof url === "string") {
    const gltf = await load(url);
    model = opts.pick ? pickCar(T, gltf.scene, opts.pick) : gltf.scene.clone(true);
  } else {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(url, "");
    model = opts.pick ? pickCar(T, gltf.scene, opts.pick) : gltf.scene;
  }

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

/**
 * Paint drawn into a coloured texture (packs often do this) can't simply be
 * recoloured: the colour multiplies the old one. This turns those textures
 * grey, keeping their shading, panel lines and dark trim, with the paint
 * itself near white, so the material colour becomes the paint colour.
 */
export function neutralizePaint(T: Three, mats: THREE_NS.MeshStandardMaterial[]) {
  for (const mat of mats) {
    const img = mat.map?.image as CanvasImageSource & { width: number; height: number } | undefined;
    if (!mat.map || !img || !img.width) continue;
    const k = Math.min(1, 512 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, c.width, c.height);
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    const lum = new Float32Array(d.length / 4);
    for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    // the paint is the bright bulk of the texture: lift its 80th percentile to white
    const sorted = Float32Array.from(lum).sort();
    const top = Math.max(1, sorted[Math.floor(sorted.length * 0.8)]);
    for (let i = 0; i < lum.length; i++) {
      const v = Math.min(255, (lum[i] / top) * 245);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
    g.putImageData(data, 0, 0);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = mat.map.colorSpace;
    tex.flipY = mat.map.flipY;
    tex.wrapS = mat.map.wrapS;
    tex.wrapT = mat.map.wrapT;
    tex.offset.copy(mat.map.offset);
    tex.repeat.copy(mat.map.repeat);
    tex.channel = mat.map.channel;
    mat.map = tex;
    mat.color.set("#ffffff");
    mat.needsUpdate = true;
  }
}

