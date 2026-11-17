// The New Year city's decorations (config/cities.ts `festive`: Nordheim): a giant decorated fir on
// the main square (where the fountain stood), strings of coloured lights along the eaves of the
// town's houses and round the firs near them, a star on every decorated fir. The lights twinkle
// and shine brighter at night. Built once when the map loads; the engine calls update() each frame.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Ground, WorldJson } from "./terrain";
import { CITIES } from "@/game/config/cities";
import { seasonAt } from "@/game/engine/season";
import type { CityId } from "@/game/types";

/**
 * Whether a city's map is dressed for the holidays now: the New Year city always, every other city
 * through the winter festival (1 December – 6 January, engine/season.ts), or all year with the shop's
 * holiday decor (engine/cosmetics.ts). Read when the map loads.
 */
export const isFestive = (city: CityId, now: number, allYear = false) => allYear || CITIES[city].festive || seasonAt(now) === "winter";

/** Building kinds that get lights along their eaves (homes, blocks of flats and hotels, not halls, towers or silos). */
const LIT_KINDS = new Set(["casa", "vila", "cabana", "hotel", "bloc"]);
/** The fir species of the island's trees (scenery.ts SPECIES: plain and snowy firs). */
const FIRS = new Set([0, 3]);
/** One map unit of building height in scene units (scenery.ts VH). */
const VH = 1.3;

export const FESTIVE = {
  /** Firs within this distance of a lit house get lights, at most `maxTrees` of them. */
  treeNear: 5,
  maxTrees: 900,
  maxTreesLow: 300,
  /** Space between two bulbs along an eave (scene units). */
  eaveStep: 0.2,
  /** The giant tree: height and base radius (scene units). */
  giant: { h: 4.4, r: 1.4 },
  bulbs: ["#ff3b3b", "#ffd23b", "#3bff6a", "#3bb7ff", "#ff5ad8", "#ffffff"],
};

export interface FestiveDecor {
  root: THREE.Group;
  /** Where the giant tree stands (for the fireworks over the square). */
  square: { x: number; z: number } | null;
  /** t: the map's clock (s); dark: 0 day … 1 night. */
  update(t: number, dark: number): void;
  dispose(): void;
}

/** Points on a spiral round a cone (a fir's lights): from the bottom up, `turns` times round. */
export function spiral(x: number, y: number, z: number, h: number, r: number, n: number, turns: number, phase = 0): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const a = phase + k * turns * Math.PI * 2;
    const rr = r * (1 - k) + 0.02;
    out.push([x + Math.cos(a) * rr, y + k * h, z + Math.sin(a) * rr]);
  }
  return out;
}

/** Points along the four eaves of a building's roof (x, z: its centre; r: its turn). */
export function eaves(x: number, z: number, w: number, d: number, r: number, y: number, step: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const cs = Math.cos(r), sn = Math.sin(r);
  const hw = w / 2 + 0.04, hd = d / 2 + 0.04;
  const corners: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s];
    const [bx, bz] = corners[(s + 1) % 4];
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i < n; i++) {
      const lx = ax + ((bx - ax) * i) / n, lz = az + ((bz - az) * i) / n;
      out.push([x + lx * cs + lz * sn, y, z - lx * sn + lz * cs]);
    }
  }
  return out;
}

/** A round bulb with a soft glow round it (Points draw squares without one). */
let bulbTexture: THREE.CanvasTexture | null = null;
function bulbMap() {
  if (bulbTexture) return bulbTexture;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.95)");
  g.addColorStop(0.6, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  bulbTexture = new THREE.CanvasTexture(cv);
  return bulbTexture;
}

function bulbs(points: [number, number, number][], size: number) {
  const pos = new Float32Array(points.length * 3);
  const col = new Float32Array(points.length * 3);
  const c = new THREE.Color();
  points.forEach((p, i) => {
    pos.set(p, i * 3);
    c.set(FESTIVE.bulbs[(i * 7 + Math.floor(Math.abs(p[0] * 3 + p[2] * 5))) % FESTIVE.bulbs.length]);
    col.set([c.r, c.g, c.b], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size, map: bulbMap(), vertexColors: true, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

/** The giant fir: snowy tiers, a trunk, a gold star, and its own lights. */
function giantTree(x: number, y: number, z: number) {
  const { h, r } = FESTIVE.giant;
  const parts: THREE.BufferGeometry[] = [];
  /** Paints a part one colour, or (snow) whitens it towards its top: snow on the tips of the boughs. */
  const paint = (g: THREE.BufferGeometry, hex: string, snow?: { y0: number; h: number }) => {
    const out = g.index ? g.toNonIndexed() : g;
    const base = new THREE.Color(hex), white = new THREE.Color("#f4f8fb"), c = new THREE.Color();
    const pos = out.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = snow ? THREE.MathUtils.smoothstep((pos.getY(i) - snow.y0) / snow.h, 0.45, 0.8) * 0.85 : 0;
      c.copy(base).lerp(white, k);
      col.set([c.r, c.g, c.b], i * 3);
    }
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return out;
  };
  parts.push(paint(new THREE.CylinderGeometry(0.16, 0.24, 0.7, 10).translate(0, 0.35, 0), "#6e4a31"));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const tr = r * (1 - k * 0.78);
    const th = (h * 0.34) * (1 - k * 0.35);
    const ty = 0.5 + k * h * 0.78;
    parts.push(paint(new THREE.ConeGeometry(tr, th, 18, 3).translate(0, ty + th / 2, 0), i % 2 ? "#1f5a30" : "#2b6f3c", { y0: ty, h: th }));
  }
  // a red-and-gold skirt round the foot
  parts.push(paint(new THREE.CylinderGeometry(r * 0.55, r * 0.6, 0.18, 18).translate(0, 0.09, 0), "#b91c1c"));
  const body = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.set(x, y, z);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: "#ffd84a", emissive: "#ffb800", emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 }));
  star.scale.set(1, 1.35, 0.45);
  star.position.set(x, y + 0.5 + h * 0.98 + 0.25, z);
  // presents round the foot
  const gifts = new THREE.Group();
  const GIFT = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#db2777"];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const s = 0.22 + (i % 3) * 0.06;
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), new THREE.MeshStandardMaterial({ color: GIFT[i % GIFT.length], roughness: 0.6 }));
    b.position.set(x + Math.cos(a) * (r * 0.75), y + s * 0.4, z + Math.sin(a) * (r * 0.75));
    b.rotation.y = a * 1.7;
    b.castShadow = true;
    gifts.add(b);
  }
  const lights = [0, 1, 2].flatMap((j) => spiral(x, y + 0.6, z, h * 0.9, r * 1.04, 60, 4.5, j * 2.1));
  return { body, star, gifts, lights };
}

export function buildFestive(data: WorldJson, ground: Ground, opt: { low: boolean }): FestiveDecor {
  const root = new THREE.Group();
  const lit: [number, number, number][] = [];
  const giantLights: [number, number, number][] = [];
  const tops: [number, number, number][] = [];
  // houses: lights along the eaves
  const houses = data.cladiri.filter((b) => LIT_KINDS.has(b.k));
  for (const b of houses) lit.push(...eaves(b.x, b.z, Math.max(b.w, 0.35), Math.max(b.d, 0.35), b.r, ground.at(b.x, b.z) + b.h * VH - 0.02, FESTIVE.eaveStep));
  // firs near the houses: a spiral of lights and a star on top
  const near = FESTIVE.treeNear * FESTIVE.treeNear;
  const cap = opt.low ? FESTIVE.maxTreesLow : FESTIVE.maxTrees;
  let trees = 0;
  for (const tr of data.copaci) {
    if (trees >= cap) break;
    if (!FIRS.has(tr[4] ?? 0)) continue;
    if (!houses.some((b) => (b.x - tr[0]) ** 2 + (b.z - tr[1]) ** 2 < near)) continue;
    const s = tr[2] * 0.92;
    const y = ground.at(tr[0], tr[1]);
    lit.push(...spiral(tr[0], y + 0.3 * s, tr[1], 1.0 * s, 0.4 * s, 9, 2.2, tr[0]));
    tops.push([tr[0], y + 1.38 * s, tr[1]]);
    trees++;
  }
  // the giant tree on the main square
  const fountain = ((data.props as Record<string, number[][]>).fantani ?? [])[0];
  let square: FestiveDecor["square"] = null;
  if (fountain) {
    const [x, z] = fountain;
    const t = giantTree(x, ground.at(x, z) - 0.02, z);
    root.add(t.body, t.star, t.gifts);
    giantLights.push(...t.lights);
    square = { x, z };
  }
  // two strings that twinkle in turn
  const a = bulbs(lit.filter((_, i) => i % 2 === 0), 0.1);
  const b = bulbs(lit.filter((_, i) => i % 2 === 1), 0.1);
  const big = bulbs(giantLights, 0.2);
  const stars = bulbs(tops, 0.16);
  (stars.material as THREE.PointsMaterial).vertexColors = false;
  (stars.material as THREE.PointsMaterial).color.set("#ffd84a");
  root.add(a, b, big, stars);
  const ma = a.material as THREE.PointsMaterial, mb = b.material as THREE.PointsMaterial, ms = stars.material as THREE.PointsMaterial, mg = big.material as THREE.PointsMaterial;
  return {
    root,
    square,
    update(t, dark) {
      // by day the bulbs are small and soft; at night they are bigger and bright
      const base = 0.6 + 0.4 * dark;
      const size = 0.21 + 0.15 * dark;
      ma.opacity = base * (0.65 + 0.35 * Math.max(0, Math.sin(t * 2.6)));
      mb.opacity = base * (0.65 + 0.35 * Math.max(0, Math.sin(t * 2.6 + Math.PI)));
      ma.size = mb.size = size;
      mg.size = 0.32 + 0.14 * dark;
      mg.opacity = base * (0.75 + 0.25 * Math.sin(t * 1.7));
      ms.size = 0.28 + 0.12 * dark;
      ms.opacity = 0.75 + 0.25 * dark;
    },
    dispose() {
      bulbTexture?.dispose();
      bulbTexture = null;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}
