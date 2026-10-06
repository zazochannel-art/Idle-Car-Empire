// 3D models of the player's buildings on the island map. Plants, garages and
// dealerships come from the game's model library (three/building-models.ts);
// the other structures, the Parts Market, the Materials Depot, the racing
// paddock and the building sites are built here from coloured blocks.
// Every model is baked into one mesh per material and cached by its look, so
// a lot costs a handful of draw calls however detailed its building is.
// Units: world units (one lot is 3 × 3); the origin is the lot's centre and
// the road is on the +z side.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildDealer, buildGarage, buildPlant } from "../../three/building-models";
import { materialKit, type MaterialKit } from "../../three/car-models";
import { ALB, C, box, cone, cylinder, gableRoof, hazeAll, hazed, paint, plainUv, rnd, sphere } from "./kit";
import { carGeometry } from "./scenery";

let KIT: MaterialKit | null = null;
const kit = () => (KIT ??= materialKit(THREE));

const plain = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.6 }));
const metal = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.1 }));
const glass = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 }));
const lit = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.15 }));

/** Bakes a model: one mesh per material, transforms applied, shared by every copy with the same look. */
export function bake(root: THREE.Object3D, scale = 1): THREE.Group {
  if (scale !== 1) root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv" && k !== "color") g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const list = groups.get(m.material) ?? [];
    list.push(g);
    groups.set(m.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, list] of groups) {
    // colour attributes must match across the merged parts
    const withColor = list.some((g) => g.attributes.color);
    for (const g of list)
      if (withColor && !g.attributes.color) {
        const a = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      } else if (!withColor && g.attributes.color) g.deleteAttribute("color");
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = !(mat as THREE.Material).transparent;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  hazeAll(out);
  return out;
}

/** A group of vertex-coloured parts, one mesh per material. */
function parts(p: { plain?: (THREE.BufferGeometry | null)[]; metal?: (THREE.BufferGeometry | null)[]; glass?: (THREE.BufferGeometry | null)[]; lit?: (THREE.BufferGeometry | null)[] }) {
  const g = new THREE.Group();
  for (const [key, mat] of [["plain", plain], ["metal", metal], ["glass", glass], ["lit", lit]] as const) {
    const list = (p[key] ?? []).filter((x): x is THREE.BufferGeometry => !!x).map(plainUv);
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

const cache = new Map<string, THREE.Group>();
/** A copy of the cached model (geometry and materials shared). */
function cached(key: string, make: () => THREE.Group): THREE.Group {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g.clone();
}

// ───────────────────────────── the game's own models ─────────────────────────────

export interface PlantLook {
  type: string;
  level: number;
  big: boolean;
  wall: string;
  roof: string;
  accent: string;
}

/** Plants are drawn on the lot inside a small margin; the model library works in its own tile units. */
const MARGIN = 0.3;

export function plantModel(look: PlantLook, W: number, D: number) {
  return cached(`plant|${look.type}|${look.level}|${look.big}|${W}|${D}`, () => bake(buildPlant(THREE, kit(), { ...look, dockFront: true }, W - 2 * MARGIN, D - 2 * MARGIN)));
}

export function dealerModel(tier: number, W: number, D: number) {
  const brand = tier >= 3 ? "#eab308" : "#2563eb";
  return cached(`dealer|${tier}|${W}|${D}`, () => bake(buildDealer(THREE, kit(), { tier, brand }, W - 2 * MARGIN, D - 2 * MARGIN)));
}

export function garageModel(level: number, color: string, W: number, D: number) {
  return cached(`garage|${level}|${color}|${W}|${D}`, () => bake(buildGarage(THREE, kit(), level, color, W - 2 * MARGIN, D - 2 * MARGIN)));
}

// ───────────────────────────── structures ─────────────────────────────

const roofOf = (hex: string) => C(hex);
/** Yard slab under a building. */
const slab = (W: number, D: number, c = "#9ca3af") => box(W - 0.5, 0.02, D - 0.5, C(c), 0, 0, 0, 0);
const door = (x: number, w: number, h: number, z: number, c = "#475569") => box(w, h, 0.03, C(c), x, 0.02, z, 0);

/** Little cars parked in a row (one geometry, coloured per car). */
function carRow(n: number, x0: number, z: number, step: number, seed: number, yaw = Math.PI / 2) {
  const COLORS = ["#d8423a", "#2f7fd1", "#f4f5f6", "#20252c", "#f2b134", "#9aa4ae", "#3aa76d", "#e57c2f"];
  const r = rnd(seed);
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = carGeometry().clone();
    const col = g.attributes.color as THREE.BufferAttribute;
    const tint = C(COLORS[Math.floor(r() * COLORS.length)]);
    for (let k = 0; k < col.count; k++) if (col.getX(k) > 0.9 && col.getY(k) > 0.9 && col.getZ(k) > 0.9) col.setXYZ(k, tint.r, tint.g, tint.b);
    g.rotateY(yaw);
    g.scale(0.9, 0.9, 0.9);
    g.translate(x0 + i * step, 0.02, z);
    out.push(g);
  }
  return out;
}

export function structureModel(type: string, level: number, color: string, roofHex: string, W: number, D: number, seed: number) {
  return cached(`st|${type}|${level}|${W}|${D}`, () => buildStructure(type, level, color, roofHex, W, D, seed));
}

function buildStructure(type: string, L: number, color: string, roofHex: string, W: number, D: number, seed: number): THREE.Group {
  const wall = C(color);
  const roof = roofOf(roofHex);
  const k = 1 + (L - 1) * 0.07;
  const P: THREE.BufferGeometry[] = [], Mt: THREE.BufferGeometry[] = [], G: THREE.BufferGeometry[] = [], Li: THREE.BufferGeometry[] = [];
  const hw = Math.min(2.1, W - 0.9), hd = Math.min(1.3, D - 1.2);
  switch (type) {
    case "carWash": {
      P.push(slab(W, D, "#94a3b8"));
      const n = L >= 6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : (i - 0.5) * 1.15;
        P.push(box(1.0, 0.55 * k, hd, wall, x, 0, -0.2, 0));
        P.push(box(1.06, 0.06, hd + 0.06, roof, x, 0.55 * k, -0.2, 0));
        P.push(door(x, 0.7, 0.42 * k, -0.2 + hd / 2 + 0.01, "#0c4a6e"));
        for (const sx of [-0.25, 0.25]) Mt.push(cylinder(0.09, 0.4, C(i % 2 ? "#facc15" : "#0ea5e9"), x + sx, 0.03, -0.2, 10));
      }
      P.push(box(0.9 * n + 0.3, 0.16, 0.05, C("#0ea5e9"), 0, 0.62 * k, -0.2 + hd / 2 + 0.04, 0));
      P.push(...carRow(1, 0.3, 0.95, 0, seed));
      break;
    }
    case "parking": {
      P.push(slab(W, D, "#475569"));
      for (let i = 0; i <= 5; i++) {
        P.push(box(0.02, 0.005, 0.6, ALB, -1.1 + i * 0.44, 0.02, -0.5, 0));
        P.push(box(0.02, 0.005, 0.6, ALB, -1.1 + i * 0.44, 0.02, 0.5, 0));
      }
      P.push(...carRow(Math.min(5, 2 + L), -0.88, -0.5, 0.44, seed));
      P.push(...carRow(Math.min(5, 1 + L), -0.88, 0.5, 0.44, seed + 3, -Math.PI / 2));
      if (L >= 5) {
        // a parking deck over the bays
        const levels = Math.min(3, Math.floor((L - 3) / 2));
        for (let f = 1; f <= levels; f++) {
          P.push(box(W - 0.7, 0.06, D - 0.9, C("#9ca3af"), 0, f * 0.36, 0, 0));
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(box(0.08, 0.36, 0.08, C("#6b7280"), sx * (W / 2 - 0.45), (f - 1) * 0.36, sz * (D / 2 - 0.55), 0));
        }
      }
      P.push(box(0.25, 0.4, 0.05, C("#2563eb"), W / 2 - 0.5, 0, D / 2 - 0.35, 0));
      break;
    }
    case "serviceCenter": {
      P.push(slab(W, D));
      P.push(box(hw, 0.6 * k, hd, wall, 0, 0, -0.25, 0));
      P.push(box(hw + 0.06, 0.08, hd + 0.06, roof, 0, 0.6 * k, -0.25, 0));
      for (let i = 0; i < 3; i++) P.push(door(-hw / 3 + (i * hw) / 3, hw / 3.6, 0.38 * k, -0.25 + hd / 2 + 0.01, "#f97316"));
      for (let i = 0; i < 3; i++) P.push(cylinder(0.1, 0.06, C("#111827"), hw / 2 + 0.25, 0.02 + i * 0.07, 0.6, 12));
      P.push(...carRow(1, -0.4, 0.75, 0, seed));
      break;
    }
    case "warehouse": {
      P.push(slab(W, D, "#a8a29e"));
      const len = Math.min(W - 0.6, 2.0 + L * 0.05);
      P.push(box(len, 0.62 * k, hd + 0.2, wall, 0, 0, -0.3, 0));
      P.push(gableRoof(len + 0.08, hd + 0.3, 0.22, roof, 0, 0.62 * k, -0.3, 0));
      for (let i = 0; i < 3; i++) P.push(door(-len / 3 + (i * len) / 3, 0.4, 0.36 * k, -0.3 + (hd + 0.2) / 2 + 0.01));
      for (let i = 0; i < 4; i++) P.push(box(0.3, 0.16, 0.24, C("#d97706"), -0.75 + i * 0.5, 0.02, 0.75, 0));
      break;
    }
    case "partsFactory": {
      P.push(slab(W, D));
      P.push(box(hw, 0.62 * k, hd + 0.2, wall, 0, 0, -0.3, 0));
      for (let i = 0; i < 4; i++) P.push(gableRoof(hd + 0.2, hw / 4, 0.16, C("#a8a29e"), -hw / 2 + hw / 8 + (i * hw) / 4, 0.62 * k, -0.3, Math.PI / 2));
      Mt.push(cylinder(0.12, 1.2 * k, C("#78716c"), -hw / 2 + 0.3, 0, -0.75, 12));
      P.push(door(0.4, 0.5, 0.36, -0.3 + (hd + 0.2) / 2 + 0.01));
      break;
    }
    case "logistics": {
      P.push(slab(W, D, "#94a3b8"));
      P.push(box(hw, 0.55 * k, hd, wall, 0, 0, -0.35, 0));
      P.push(box(hw + 0.06, 0.07, hd + 0.06, roof, 0, 0.55 * k, -0.35, 0));
      for (let i = 0; i < 4; i++) P.push(door(-hw / 2 + 0.3 + i * (hw - 0.6) / 3, 0.32, 0.34, -0.35 + hd / 2 + 0.01, "#1e3a8a"));
      // trucks backed up to the docks
      for (let i = 0; i < Math.min(3, 1 + Math.floor(L / 3)); i++) {
        const x = -hw / 2 + 0.3 + i * (hw - 0.6) / 3;
        P.push(box(0.26, 0.28, 0.7, C("#f4f5f6"), x, 0.02, 0.55, 0), box(0.26, 0.24, 0.22, C("#2563eb"), x, 0.02, 1.0, 0));
      }
      break;
    }
    case "truckDepot": {
      P.push(slab(W, D, "#6b7280"));
      P.push(box(hw, 0.08, hd + 0.3, roof, 0, 0.55, -0.2, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(box(0.06, 0.55, 0.06, C("#e5e7eb"), sx * (hw / 2 - 0.05), 0, -0.2 + sz * ((hd + 0.3) / 2 - 0.05), 0));
      for (let i = 0; i < Math.min(4, 2 + Math.floor(L / 3)); i++) {
        const x = -hw / 2 + 0.3 + i * 0.5;
        P.push(box(0.26, 0.3, 0.75, C(["#dc2626", "#f4f5f6", "#2563eb", "#f59e0b"][i % 4]), x, 0.02, -0.25, 0), box(0.26, 0.26, 0.24, C("#1f2937"), x, 0.02, 0.25, 0));
      }
      P.push(box(0.6, 0.45, 0.4, wall, W / 2 - 0.6, 0, D / 2 - 0.55, 0));
      break;
    }
    case "researchCenter": {
      P.push(slab(W, D, "#cbd5e1"));
      P.push(box(hw, 0.5 * k, hd, wall, 0, 0, -0.25, 0));
      G.push(box(hw * 0.98, 0.32 * k, 0.02, C("#7dd3fc"), 0, 0.1, -0.25 + hd / 2 + 0.01, 0));
      P.push(box(hw * 0.55, 0.32 * k, hd * 0.7, wall, -hw * 0.18, 0.5 * k, -0.35, 0));
      Mt.push(sphere(0.32, C("#e2e8f0"), hw * 0.28, 0.5 * k, -0.35, true));
      Mt.push(cylinder(0.02, 0.6, C("#94a3b8"), -hw * 0.38, 0.82 * k, -0.4, 6));
      P.push(box(hw + 0.04, 0.05, hd + 0.04, roof, 0, 0.5 * k, -0.25, 0));
      break;
    }
    case "exportTerminal": {
      P.push(slab(W, D, "#64748b"));
      const cols = ["#d9473b", "#2f7fd1", "#f2b134", "#3aa76d", "#e57c2f", "#6b4fb3"];
      const r = rnd(seed + 5);
      for (let ix = 0; ix < 3; ix++)
        for (let iz = 0; iz < 2; iz++) {
          const st = 1 + Math.floor(r() * Math.min(3, 1 + L / 3));
          for (let q = 0; q < st; q++) P.push(box(0.62, 0.22, 0.26, C(cols[Math.floor(r() * cols.length)]), -0.8 + ix * 0.7, 0.02 + q * 0.23, -0.55 + iz * 0.32, 0));
        }
      // gantry crane over the stacks
      const H = 1.3 + L * 0.05;
      for (const sx of [-1.15, 1.15]) for (const sz of [-0.85, 0.25]) P.push(box(0.07, H, 0.07, C("#0f766e"), sx, 0, sz, 0));
      P.push(box(2.45, 0.12, 0.12, C("#0f766e"), 0, H, -0.85, 0), box(2.45, 0.12, 0.12, C("#0f766e"), 0, H, 0.25, 0));
      P.push(box(0.3, 0.2, 1.2, C("#facc15"), 0.2, H - 0.05, -0.3, 0));
      break;
    }
    case "hq": {
      P.push(slab(W, D, "#cbd5e1"));
      const H = 1.4 + L * 0.35;
      G.push(box(1.2, H, 1.0, C("#bfdbfe").lerp(wall, 0.3), 0, 0, -0.3, 0));
      for (let f = 0.35; f < H; f += 0.35) P.push(box(1.22, 0.025, 1.02, C("#e2e8f0"), 0, f, -0.3, 0));
      P.push(box(1.26, 0.12, 1.06, roof, 0, H, -0.3, 0));
      P.push(box(1.8, 0.4, 1.4, wall.clone().lerp(ALB, 0.4), 0, 0, -0.3, 0));
      if (L >= 6) Mt.push(cylinder(0.02, 0.9, C("#e2e8f0"), 0.3, H + 0.12, -0.3, 6), sphere(0.06, C("#ef4444"), 0.3, H + 1.02, -0.3));
      P.push(box(0.9, 0.04, 0.4, C("#e5e7eb"), 0, 0.02, 0.75, 0));
      break;
    }
    case "fleetPlant": {
      P.push(slab(W, D));
      P.push(box(hw, 0.65 * k, hd + 0.1, wall, 0, 0, -0.35, 0));
      P.push(gableRoof(hw + 0.08, hd + 0.2, 0.18, roof, 0, 0.65 * k, -0.35, 0));
      P.push(door(0, 0.8, 0.45, -0.35 + (hd + 0.1) / 2 + 0.01));
      for (let i = 0; i < Math.min(3, 1 + Math.floor(L / 3)); i++) P.push(box(0.9, 0.3, 0.26, C(["#ca8a04", "#2563eb", "#f4f5f6"][i % 3]), -0.6 + i * 0.6, 0.02, 0.7, Math.PI / 2 * 0));
      break;
    }
    case "museum": {
      P.push(slab(W, D, "#e7e5e4"));
      const H = 0.55 * k;
      P.push(box(hw, 0.08, hd + 0.2, C("#d6d3d1"), 0, 0, -0.3, 0));
      P.push(box(hw - 0.2, H, hd - 0.2, wall, 0, 0.08, -0.38, 0));
      const nc = 6;
      for (let i = 0; i < nc; i++) P.push(cylinder(0.04, H, ALB, -hw / 2 + 0.2 + (i * (hw - 0.4)) / (nc - 1), 0.08, -0.3 + (hd + 0.2) / 2 - 0.12, 10));
      P.push(box(hw, 0.08, hd + 0.2, C("#f5f0e6"), 0, 0.08 + H, -0.3, 0));
      P.push(gableRoof(hw, hd + 0.2, 0.24, roof, 0, 0.16 + H, -0.3, 0));
      for (let i = 0; i < 3; i++) P.push(box(hw * 0.6 + i * 0.1, 0.03, 0.12, C("#e8e2d4"), 0, 0.08 - i * 0.03, -0.3 + (hd + 0.2) / 2 + 0.06 + i * 0.1, 0));
      break;
    }
    case "airport": {
      P.push(slab(W, D, "#94a3b8"));
      // a hangar with an arched roof and a control tower
      const arch = new THREE.CylinderGeometry(0.75, 0.75, 1.6, 16, 1, false, -Math.PI / 2, Math.PI);
      arch.rotateZ(Math.PI / 2);
      arch.rotateY(Math.PI / 2);
      arch.translate(-0.3, 0, -0.35);
      P.push(paint(arch, wall));
      P.push(door(-0.3, 1.0, 0.55, 0.46, "#475569"));
      P.push(cylinder(0.12, 1.2 + L * 0.05, ALB, 0.95, 0, -0.6, 10));
      G.push(cylinder(0.26, 0.24, C("#38bdf8"), 0.95, 1.2 + L * 0.05, -0.6, 12));
      P.push(cylinder(0.29, 0.05, roof, 0.95, 1.44 + L * 0.05, -0.6, 12));
      break;
    }
    default: {
      P.push(slab(W, D));
      P.push(box(hw, 0.55 * k, hd, wall, 0, 0, -0.25, 0));
      P.push(box(hw + 0.06, 0.07, hd + 0.06, roof, 0, 0.55 * k, -0.25, 0));
      P.push(door(0, 0.5, 0.35, -0.25 + hd / 2 + 0.01));
    }
  }
  return parts({ plain: P, metal: Mt, glass: G, lit: Li });
}

// ───────────────────────────── market, depot, paddock ─────────────────────────────

export function marketModel(W: number, D: number) {
  return cached(`market|${W}|${D}`, () => {
    const P: THREE.BufferGeometry[] = [slab(W, D, "#a8a29e")];
    const cols = ["#16a34a", "#f59e0b", "#2563eb", "#dc2626"];
    for (let i = 0; i < 4; i++) {
      const x = -0.9 + i * 0.6;
      P.push(box(0.5, 0.3, 0.45, C("#f5f5f4"), x, 0, -0.6, 0));
      P.push(gableRoof(0.56, 0.55, 0.14, C(cols[i]), x, 0.3, -0.6, 0));
    }
    P.push(box(2.2, 0.55, 0.7, C("#e7e5e4"), 0, 0, 0.25, 0));
    P.push(box(2.3, 0.08, 0.8, C("#15803d"), 0, 0.55, 0.25, 0));
    for (let i = 0; i < 6; i++) P.push(box(0.2, 0.16, 0.2, C(i % 2 ? "#a16207" : "#94a3b8"), -1.0 + i * 0.4, 0.02, 0.85, 0));
    return parts({ plain: P });
  });
}

export function depotModel(W: number, D: number) {
  return cached(`depot|${W}|${D}`, () => {
    const P: THREE.BufferGeometry[] = [slab(W, D, "#a8a29e")];
    const Mt: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) Mt.push(cylinder(0.26, 1.0, C("#cbd5e1"), -0.8 + i * 0.6, 0, -0.65, 16), cone(0.27, 0.2, C("#94a3b8"), -0.8 + i * 0.6, 1.0, -0.65, 16));
    for (let i = 0; i < 4; i++) for (let q = 0; q < 3; q++) Mt.push(box(0.8, 0.06, 0.08, C("#64748b"), 0.6, 0.02 + q * 0.07, -0.1 + i * 0.12, 0));
    P.push(cone(0.45, 0.35, C("#78716c"), -0.5, 0, 0.45, 10), cone(0.35, 0.28, C("#a16207"), 0.2, 0, 0.6, 10));
    P.push(box(0.6, 0.5, 0.45, C("#fef3c7"), 0.95, 0, 0.75, 0), box(0.66, 0.06, 0.5, C("#92400e"), 0.95, 0.5, 0.75, 0));
    return parts({ plain: P, metal: Mt });
  });
}

/** The racing paddock: pit garages under one roof, a canopy and team flags. */
export function paddockModel(W: number, D: number, open: boolean) {
  return cached(`paddock|${W}|${D}|${open}`, () => {
    const P: THREE.BufferGeometry[] = [slab(W, D, open ? "#6b7280" : "#a8a29e")];
    if (!open) {
      for (let i = 0; i < 8; i++) P.push(box(0.04, 0.3, 0.04, C("#f59e0b"), -W / 2 + 0.35 + (i * (W - 0.7)) / 7, 0, D / 2 - 0.4, 0));
      P.push(box(W - 0.7, 0.05, 0.03, C("#f59e0b"), 0, 0.22, D / 2 - 0.4, 0));
      P.push(box(1.2, 0.5, 0.8, C("#d6d3d1"), 0, 0, -0.3, 0));
      return parts({ plain: P });
    }
    P.push(box(W - 0.8, 0.5, 1.2, C("#f1f5f9"), 0, 0, -0.5, 0));
    P.push(box(W - 0.7, 0.08, 1.4, C("#dc2626"), 0, 0.5, -0.45, 0));
    for (let i = 0; i < 4; i++) P.push(door(-(W - 1.2) / 2 + i * ((W - 1.2) / 3), 0.5, 0.36, 0.11, "#1f2937"));
    P.push(box(W - 0.8, 0.04, 0.7, C("#f8fafc"), 0, 0.62, 0.45, 0));
    for (const sx of [-1, 1]) P.push(box(0.05, 0.62, 0.05, C("#94a3b8"), sx * (W / 2 - 0.5), 0, 0.75, 0));
    for (let i = 0; i < 3; i++) {
      P.push(box(0.02, 0.9, 0.02, C("#e5e7eb"), -0.9 + i * 0.9, 0, D / 2 - 0.35, 0));
      P.push(box(0.3, 0.18, 0.01, C(["#ef4444", "#facc15", "#3b82f6"][i]), -0.75 + i * 0.9, 0.7, D / 2 - 0.35, 0));
    }
    return parts({ plain: P });
  });
}

/** A dealership lot not bought yet: a fenced empty forecourt. */
export function emptyDealerModel(W: number, D: number) {
  return cached(`dealer-empty|${W}|${D}`, () => {
    const P: THREE.BufferGeometry[] = [slab(W, D, "#cbd5c0")];
    for (let i = 0; i < 7; i++) P.push(box(0.04, 0.22, 0.04, C("#f59e0b"), -W / 2 + 0.35 + (i * (W - 0.7)) / 6, 0, D / 2 - 0.35, 0));
    P.push(box(W - 0.7, 0.04, 0.03, C("#f59e0b"), 0, 0.16, D / 2 - 0.35, 0));
    P.push(box(0.5, 0.3, 0.04, C("#fef3c7"), 0.6, 0.25, D / 2 - 0.4, 0), box(0.03, 0.3, 0.03, C("#78716c"), 0.6, 0, D / 2 - 0.4, 0));
    return parts({ plain: P });
  });
}

// ───────────────────────────── building sites ─────────────────────────────

export interface SiteModel {
  root: THREE.Group;
  /** Sets how far the building has grown (0..1) and turns the crane. */
  update(progress: number, t: number): void;
}

/** A building site: fence, scaffolding rising with the work, a tower crane and stacked materials. */
export function siteModel(W: number, D: number, big: boolean, seed: number): SiteModel {
  const root = new THREE.Group();
  const fence: THREE.BufferGeometry[] = [slab(W, D, "#a8a29e")];
  for (let i = 0; i <= 8; i++) {
    const x = -W / 2 + 0.3 + (i * (W - 0.6)) / 8;
    fence.push(box(0.03, 0.2, 0.03, C("#f59e0b"), x, 0, -D / 2 + 0.3, 0), box(0.03, 0.2, 0.03, C("#f59e0b"), x, 0, D / 2 - 0.3, 0));
  }
  fence.push(box(W - 0.6, 0.03, 0.02, C("#f59e0b"), 0, 0.16, -D / 2 + 0.3, 0), box(W - 0.6, 0.03, 0.02, C("#f59e0b"), 0, 0.16, D / 2 - 0.3, 0));
  for (let i = 0; i < 3; i++) fence.push(box(0.5, 0.06 + i * 0.03, 0.25, C(["#a16207", "#64748b", "#d6d3d1"][i]), W / 2 - 0.7, 0.02, -0.4 + i * 0.35, 0));
  root.add(parts({ plain: fence }));
  // the frame grows with the work
  const fw = big ? W - 1.6 : W - 1.0, fd = big ? D - 1.8 : D - 1.3, H = big ? 1.1 : 0.75;
  const frame = parts({ plain: [box(fw, 1, fd, C("#d6d3d1"), 0, 0, -0.15, 0)] });
  const scaffold = parts({
    plain: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.04, 1, 0.04, C("#f97316"), sx * (fw / 2 + 0.06), 0, -0.15 + sz * (fd / 2 + 0.06), 0))),
      box(fw + 0.16, 0.03, 0.04, C("#f97316"), 0, 0.5, -0.15 + fd / 2 + 0.06, 0),
      box(fw + 0.16, 0.03, 0.04, C("#f97316"), 0, 0.98, -0.15 + fd / 2 + 0.06, 0),
    ],
  });
  root.add(frame, scaffold);
  // tower crane
  const r = rnd(seed);
  const cx = -W / 2 + 0.55, cz = -D / 2 + 0.55, CH = H + 0.9;
  const mast = parts({ plain: [box(0.1, CH, 0.1, C("#facc15"), cx, 0, cz, 0)] });
  root.add(mast);
  const jib = parts({ plain: [box(1.9, 0.08, 0.08, C("#facc15"), 0.75, 0, 0, 0), box(0.4, 0.12, 0.12, C("#475569"), -0.35, -0.02, 0, 0), box(0.02, 0.5, 0.02, C("#1f2937"), 1.2, -0.5, 0, 0)] });
  jib.position.set(cx, CH, cz);
  jib.rotation.y = r() * Math.PI * 2;
  root.add(jib);
  return {
    root,
    update(progress, t) {
      const h = Math.max(0.05, progress) * H;
      frame.scale.set(1, h, 1);
      scaffold.scale.set(1, Math.min(H, h + 0.15), 1);
      jib.rotation.y = Math.sin(t * 0.25 + seed * 6) * 1.2 + seed * 6;
    },
  };
}

/** A crane beside a building being upgraded. */
export function worksModel(W: number, D: number, seed: number): SiteModel {
  const root = new THREE.Group();
  const cx = W / 2 - 0.35, cz = -D / 2 + 0.35, CH = 1.9;
  root.add(parts({ plain: [box(0.1, CH, 0.1, C("#facc15"), cx, 0, cz, 0), box(0.4, 0.06, 0.4, C("#9ca3af"), cx, 0, cz, 0)] }));
  const jib = parts({ plain: [box(1.6, 0.08, 0.08, C("#facc15"), -0.6, 0, 0, 0), box(0.35, 0.12, 0.12, C("#475569"), 0.3, -0.02, 0, 0), box(0.02, 0.45, 0.02, C("#1f2937"), -1.0, -0.45, 0, 0)] });
  jib.position.set(cx, CH, cz);
  root.add(jib);
  return {
    root,
    update(_p, t) {
      jib.rotation.y = Math.sin(t * 0.3 + seed * 5) * 0.9 + 0.6;
    },
  };
}

/** A flat coloured outline over a lot (build mode, selection). */
export function lotMarker(W: number, D: number, color: string, opacity: number) {
  const g = new THREE.PlaneGeometry(W - 0.25, D - 0.25);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.position.y = 0.04;
  m.renderOrder = 2;
  return m;
}

export function lotOutline(W: number, D: number, color: string) {
  const w = W / 2 - 0.1, d = D / 2 - 0.1;
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, 0.06, -d), new THREE.Vector3(w, 0.06, -d), new THREE.Vector3(w, 0.06, d), new THREE.Vector3(-w, 0.06, d)]);
  const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
  line.renderOrder = 3;
  return line;
}
