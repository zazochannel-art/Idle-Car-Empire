// The supply-chain trucks, drawn in batches. A truck model is about fifteen meshes (a paint, the
// glass, the lamps, the tyres, rims and trim each have their own material), so 68 trucks on the
// road were about a thousand draw calls, and as many again in the shadow pass. Trucks of one kind
// share their meshes' geometry and materials, so each part of a kind is one InstancedMesh and
// every truck of the kind is one instance of it: the cost is the kinds' parts, not the trucks.
//
// All the parts of a kind share one instance-matrix attribute (a truck's parts move together), so
// a truck is one matrix written per frame, and the cab paint's own colour per truck is the
// instance colour on the cab part (its material is white; no truck's cab is painted twice).
import * as THREE from "three";

/** One kind of truck: its parts as instanced meshes, and how many trucks are in the batch this frame. */
export interface TruckKind {
  readonly parts: THREE.InstancedMesh[];
  n: number;
  cap: number;
  /** The part whose paint is each truck's own (instance colour), or -1. */
  cab: number;
}

const WHITE = new THREE.Color(1, 1, 1);

export class TruckBatch {
  readonly root = new THREE.Group();
  private kinds = new Map<string, TruckKind>();
  private sources = new Map<string, THREE.Mesh[]>();

  constructor() {
    this.root.name = "truck-batch";
  }

  /**
   * The kind for `key`, made from `model`'s meshes the first time (a built truck, with the shadow
   * casters chosen); `cabMaterial` is the material the cab's paint placeholder stands on.
   */
  kind(key: string, model: THREE.Object3D, cabMaterial: THREE.Material, whiten: (m: THREE.Material) => THREE.Material = (m) => m.clone()): TruckKind {
    let k = this.kinds.get(key);
    if (k) return k;
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const cab = meshes.findIndex((m) => m.material === cabMaterial);
    k = { parts: [], n: 0, cap: 0, cab };
    this.kinds.set(key, k);
    // a part keeps the matrix it was baked with: a truck's meshes sit at the model's origin
    this.sources.set(key, meshes);
    const mats = meshes.map((m, i) => {
      if (i !== k.cab) return m.material as THREE.Material;
      // the cab's paint turns white here: each truck's own colour comes as the instance colour
      const white = whiten(m.material as THREE.Material);
      (white as THREE.MeshStandardMaterial).color.set(WHITE);
      this.cabMaterials.push(white);
      return white;
    });
    this.materials.set(key, mats);
    this.grow(key, k, 16);
    return k;
  }

  private materials = new Map<string, THREE.Material[]>();
  /** The white cab paints made here (the others belong to the model). */
  private cabMaterials: THREE.Material[] = [];

  /** Rebuilds the kind's instanced meshes with room for `cap` trucks, keeping the `k.n` already in this frame's batch. */
  private grow(key: string, k: TruckKind, cap: number) {
    const meshes = this.sources.get(key)!;
    const mats = this.materials.get(key)!;
    const keptM = k.n > 0 ? k.parts[0].instanceMatrix.array.slice(0, k.n * 16) : null;
    const keptC = k.n > 0 && k.cab >= 0 ? k.parts[k.cab].instanceColor!.array.slice(0, k.n * 3) : null;
    for (const p of k.parts) {
      this.root.remove(p);
      p.dispose();
    }
    k.parts.length = 0;
    let matrices: THREE.InstancedBufferAttribute | null = null;
    let colors: THREE.InstancedBufferAttribute | null = null;
    meshes.forEach((src, i) => {
      const part = new THREE.InstancedMesh(src.geometry, mats[i], cap);
      part.count = 0;
      part.castShadow = src.castShadow;
      part.receiveShadow = src.receiveShadow;
      // instances span the island: the batch is filled with the trucks in view, so nothing to cull here
      part.frustumCulled = false;
      part.matrixAutoUpdate = false;
      if (matrices) part.instanceMatrix = matrices;
      else matrices = part.instanceMatrix;
      if (i === k.cab) {
        part.setColorAt(0, WHITE);
        if (colors) part.instanceColor = colors;
        else colors = part.instanceColor;
      }
      k.parts.push(part);
      this.root.add(part);
    });
    if (keptM) k.parts[0].instanceMatrix.array.set(keptM);
    if (keptC) k.parts[k.cab].instanceColor!.array.set(keptC);
    k.cap = cap;
  }

  /** Starts a frame: every kind is empty. */
  begin() {
    for (const k of this.kinds.values()) k.n = 0;
  }

  /** A truck of this kind at `matrix` (its own cab colour `cab`) in this frame's batch. */
  add(key: string, k: TruckKind, matrix: THREE.Matrix4, cab: THREE.Color) {
    if (k.n >= k.cap) this.grow(key, k, k.cap * 2);
    const first = k.parts[0];
    first.setMatrixAt(k.n, matrix);
    if (k.cab >= 0) k.parts[k.cab].setColorAt(k.n, cab);
    k.n++;
  }

  /** Ends the frame: each part draws the trucks added, and the GPU is sent what changed. */
  end() {
    for (const k of this.kinds.values()) {
      for (const p of k.parts) {
        p.count = k.n;
        p.visible = k.n > 0;
      }
      if (k.n === 0) continue;
      k.parts[0].instanceMatrix.needsUpdate = true;
      if (k.cab >= 0) {
        const c = k.parts[k.cab].instanceColor;
        if (c) c.needsUpdate = true;
      }
    }
  }

  /** How many trucks each kind draws now (tests and benchmarks). */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, k] of this.kinds) out[key] = k.n;
    return out;
  }

  dispose() {
    for (const k of this.kinds.values()) for (const p of k.parts) p.dispose();
    for (const m of this.cabMaterials) m.dispose();
    this.root.clear();
    this.kinds.clear();
    this.sources.clear();
    this.materials.clear();
    this.cabMaterials = [];
  }
}
