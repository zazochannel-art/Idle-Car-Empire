// Procedural 3D homes and city blocks for the Empire Map: family houses with
// tiled hip/gable roofs, apartment blocks with balconies, glass office towers
// and modern villas with a pool. Units are tiles (x along the lot's x, z along
// its y, y up); the origin is the centre of the lot. Only the +x and +z faces
// are ever seen (the map camera looks from there), so the detail goes there.
import type * as THREE_NS from "three";
import { buildCar, type BodyModel, type MaterialKit } from "./car-models";
import { PX } from "./building-models";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Three = typeof THREE_NS;
type Mat = THREE_NS.Material;

// ───────────────────────────── helpers ─────────────────────────────

function std(T: Three, color: string, rough = 0.8, metal = 0) {
  return new T.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(T: Three, m: Mat, x: number, y: number, z: number, w: number, h: number, d: number) {
  const b = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  b.position.set(x + w / 2, y + h / 2, z + d / 2);
  return b;
}

function cyl(T: Three, m: Mat, x: number, y: number, z: number, r: number, h: number, seg = 14, r2 = r) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r2, h, seg), m);
  c.position.set(x, y + h / 2, z);
  return c;
}

/** Deterministic 0..1 from a seed and a salt. */
function rnd(seed: number, i: number) {
  const s = Math.sin(seed * 9301.17 + i * 49297.3) * 233280.5;
  return s - Math.floor(s);
}

/** Canvas textures shared by every build (materials die, textures stay). */
const texCache = new Map<string, THREE_NS.Texture>();
function canvasTex(T: Three, key: string, size: number, draw: (g: CanvasRenderingContext2D, n: number) => void, repeat = true) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  t = new T.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Clay/slate roof tiles: rows of rounded tiles with a shadow under each course. */
function tileTex(T: Three) {
  return canvasTex(T, "tiles", 128, (g, n) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, n, n);
    const rows = 8;
    const rh = n / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const grd = g.createLinearGradient(0, y, 0, y + rh);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.75, "#d9d9d9");
      grd.addColorStop(1, "#6f6f6f");
      g.fillStyle = grd;
      g.fillRect(0, y, n, rh);
      const off = r % 2 ? rh * 0.5 : 0;
      g.fillStyle = "rgba(0,0,0,0.28)";
      for (let x = -rh; x < n + rh; x += rh) g.fillRect(x + off, y, 1.2, rh);
      // a little colour variation per tile
      for (let x = -rh; x < n + rh; x += rh) {
        const v = Math.sin(x * 12.9898 + r * 78.233) * 43758.5453;
        const k = v - Math.floor(v);
        g.fillStyle = k > 0.5 ? `rgba(255,255,255,${(k - 0.5) * 0.18})` : `rgba(0,0,0,${k * 0.14})`;
        g.fillRect(x + off + 1, y, rh - 1, rh - 1);
      }
    }
  });
}

/** Plaster/render: a soft mottled noise. */
function plasterTex(T: Three) {
  return canvasTex(T, "plaster", 64, (g, n) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) {
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12543.123;
      const x = (a - Math.floor(a)) * n;
      const y = (b - Math.floor(b)) * n;
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
      g.fillRect(x, y, 2, 2);
    }
  });
}

/** Lawn: fine grass speckle with mowing stripes. */
function lawnTex(T: Three) {
  return canvasTex(T, "lawn", 128, (g, n) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, n, n);
    for (let s = 0; s < 4; s++) {
      g.fillStyle = s % 2 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
      g.fillRect((s * n) / 4, 0, n / 4, n);
    }
    for (let i = 0; i < 1400; i++) {
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12543.123;
      const x = (a - Math.floor(a)) * n;
      const y = (b - Math.floor(b)) * n;
      g.fillStyle = i % 3 ? "rgba(10,50,10,0.16)" : "rgba(255,255,200,0.14)";
      g.fillRect(x, y, 1, 2);
    }
  });
}

/** Pavers: a herringbone-ish brick grid for drives and terraces. */
function paverTex(T: Three) {
  return canvasTex(T, "pavers", 64, (g, n) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, n, n);
    g.fillStyle = "rgba(0,0,0,0.22)";
    const s = n / 8;
    for (let r = 0; r < 8; r++) {
      g.fillRect(0, r * s, n, 1);
      const off = r % 2 ? s : 0;
      for (let x = off; x < n; x += s * 2) g.fillRect(x, r * s, 1, s);
    }
  });
}

/** Curtain wall: glass panes with floor slabs and mullions, sky reflection on top. */
function curtainTex(T: Three, floors: number) {
  return canvasTex(
    T,
    `curtain${floors}`,
    128,
    (g, n) => {
      const sky = g.createLinearGradient(0, 0, n * 0.3, n);
      sky.addColorStop(0, "#b9d7ee");
      sky.addColorStop(0.5, "#5f88ab");
      sky.addColorStop(1, "#2a425c");
      g.fillStyle = sky;
      g.fillRect(0, 0, n, n);
      // a few panes with the blinds down / lit inside
      for (let i = 0; i < 40; i++) {
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12543.123;
        const px = Math.floor((a - Math.floor(a)) * 8) * (n / 8);
        const py = Math.floor((b - Math.floor(b)) * 8) * (n / 8);
        g.fillStyle = i % 3 ? "rgba(20,30,45,0.35)" : "rgba(230,240,250,0.25)";
        g.fillRect(px, py, n / 8, n / 8);
      }
      g.fillStyle = "rgba(225,232,240,0.9)";
      for (let i = 0; i <= 8; i++) g.fillRect(0, (i * n) / 8 - 1, n, 2.5);
      g.fillStyle = "rgba(200,210,222,0.75)";
      for (let i = 0; i <= 8; i++) g.fillRect((i * n) / 8 - 0.5, 0, 1.2, n);
    },
    true,
  );
}

/** Builds triangles with explicit uv into a flat-shaded geometry. */
class GeoBuilder {
  pos: number[] = [];
  uv: number[] = [];
  groups: { start: number; count: number; mat: number }[] = [];
  tri(a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[], mat = 0) {
    const start = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
    const last = this.groups[this.groups.length - 1];
    if (last && last.mat === mat && last.start + last.count === start) last.count += 3;
    else this.groups.push({ start, count: 3, mat });
  }
  build(T: Three) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(this.uv, 2));
    for (const gr of this.groups) g.addGroup(gr.start, gr.count, gr.mat);
    g.computeVertexNormals();
    return g;
  }
}

/**
 * A pitched roof over a w×d footprint at height y, with eaves overhang `o`.
 * hip = true slopes all four sides; otherwise the gable ends are wall (mat 1).
 * The ridge runs along the longer side.
 */
function pitchedRoof(T: Three, tiles: Mat, gableWall: Mat, x: number, y: number, z: number, w: number, d: number, rise: number, hip: boolean, o = 0.06) {
  const alongX = w >= d;
  // work in a local frame where the ridge runs along "L" and the span is "S"
  const L = (alongX ? w : d) + o * 2;
  const S = (alongX ? d : w) + o * 2;
  const inset = hip ? Math.min(S / 2, L / 2 - 0.01) : 0;
  const k = 6; // tile courses per tile of slope
  const slope = Math.hypot(S / 2, rise);
  const P = (l: number, h: number, s: number) => (alongX ? [x - o + l, y + h, z - o + s] : [x - o + s, y + h, z - o + l]);
  const gb = new GeoBuilder();
  const drop = -0.02; // the eaves dip a little below the wall top
  const a = P(0, drop, 0);
  const b = P(L, drop, 0);
  const c = P(L, drop, S);
  const e = P(0, drop, S);
  const r1 = P(inset, rise, S / 2);
  const r2 = P(L - inset, rise, S / 2);
  const U = (l: number, sd: number) => [l * k * 0.7, sd * k];
  // winding flips with the frame so the faces stay outward
  const tri = (p: number[][], u: number[][], mat = 0) => {
    if (alongX) gb.tri(p[0], p[1], p[2], u[0], u[1], u[2], mat);
    else gb.tri(p[0], p[2], p[1], u[0], u[2], u[1], mat);
  };
  // the two long slopes (front at s = S, back at s = 0)
  tri([e, c, r2], [U(0, 0), U(L, 0), U(L - inset, slope)]);
  tri([e, r2, r1], [U(0, 0), U(L - inset, slope), U(inset, slope)]);
  tri([b, a, r1], [U(L, 0), U(0, 0), U(inset, slope)]);
  tri([b, r1, r2], [U(L, 0), U(inset, slope), U(L - inset, slope)]);
  // ends: tiled hips, or wall gables
  const hs = Math.hypot(inset, rise);
  const endUv = hip ? [U(0, 0), U(S, 0), U(S / 2, hs)] : [[0, 0], [1, 0], [0.5, 1]];
  tri([a, e, r1], endUv, hip ? 0 : 1);
  tri([c, b, r2], endUv, hip ? 0 : 1);
  const mesh = new T.Mesh(gb.build(T), [tiles, gableWall]);
  return mesh;
}

/** Window glass for homes: lighter than car glass, catching the sky. */
const paneCache = new WeakMap<Three, Mat>();
function pane(T: Three) {
  let m = paneCache.get(T);
  if (!m) {
    m = new T.MeshPhysicalMaterial({ color: "#6f8fa8", metalness: 0.3, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.5 });
    m.userData.keep = true;
    paneCache.set(T, m);
  }
  return m;
}

/** A framed window with a sill on a +z wall (face 1) or +x wall (face 0). */
function windowZ(T: Three, kit: MaterialKit, frame: Mat, x: number, y: number, z: number, w: number, h: number) {
  const g = new T.Group();
  g.add(box(T, frame, x - 0.012, y - 0.012, z - 0.004, w + 0.024, h + 0.024, 0.012));
  g.add(box(T, pane(T), x, y, z + 0.004, w, h, 0.006));
  g.add(box(T, frame, x + w / 2 - 0.005, y, z + 0.006, 0.01, h, 0.008));
  g.add(box(T, frame, x, y + h * 0.62, z + 0.006, w, 0.008, 0.008));
  g.add(box(T, frame, x - 0.02, y - 0.022, z, w + 0.04, 0.012, 0.03)); // sill
  return g;
}
function windowX(T: Three, kit: MaterialKit, frame: Mat, x: number, y: number, z: number, d: number, h: number) {
  const g = new T.Group();
  g.add(box(T, frame, x - 0.004, y - 0.012, z - 0.012, 0.012, h + 0.024, d + 0.024));
  g.add(box(T, pane(T), x + 0.004, y, z, 0.006, h, d));
  g.add(box(T, frame, x + 0.006, y, z + d / 2 - 0.005, 0.008, h, 0.01));
  g.add(box(T, frame, x + 0.006, y + h * 0.62, z, 0.008, 0.008, d));
  g.add(box(T, frame, x, y - 0.022, z - 0.02, 0.03, 0.012, d + 0.04));
  return g;
}

/** A broadleaf tree: trunk and a few overlapping leaf clumps. */
export function tree3d(T: Three, x: number, z: number, size: number, seed: number, autumn = false) {
  const g = new T.Group();
  const bark = std(T, "#5b4331", 0.95);
  const hues = autumn ? ["#c2410c", "#d97706", "#b45309"] : ["#3f7d35", "#4b8b3b", "#356d2e", "#5a9a42"];
  const leaf = new T.MeshStandardMaterial({ color: hues[Math.floor(rnd(seed, 1) * hues.length)], roughness: 0.85, flatShading: true });
  const leaf2 = new T.MeshStandardMaterial({ color: hues[Math.floor(rnd(seed, 2) * hues.length)], roughness: 0.85, flatShading: true });
  const h = 0.32 * size;
  g.add(cyl(T, bark, x, 0, z, 0.022 * size, h, 7, 0.03 * size));
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(seed, 3) * 3;
    const r = 0.1 * size;
    const s = new T.Mesh(new T.IcosahedronGeometry((0.13 + rnd(seed, i + 5) * 0.05) * size, 1), i % 2 ? leaf : leaf2);
    s.position.set(x + Math.cos(a) * r * 0.7, h + 0.1 * size + rnd(seed, i + 9) * 0.08 * size, z + Math.sin(a) * r * 0.7);
    s.scale.y = 0.85;
    g.add(s);
  }
  const top = new T.Mesh(new T.IcosahedronGeometry(0.15 * size, 1), leaf);
  top.position.set(x, h + 0.24 * size, z);
  g.add(top);
  return g;
}

/** A conifer: stacked cones. */
export function pine3d(T: Three, x: number, z: number, size: number) {
  const g = new T.Group();
  g.add(cyl(T, std(T, "#4a3527", 0.95), x, 0, z, 0.018 * size, 0.12 * size, 6));
  const m = new T.MeshStandardMaterial({ color: "#2f5d34", roughness: 0.9, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const c = new T.Mesh(new T.ConeGeometry((0.16 - i * 0.035) * size, 0.26 * size, 8), m);
    c.position.set(x, (0.2 + i * 0.13) * size, z);
    g.add(c);
  }
  return g;
}

function bush3d(T: Three, x: number, z: number, size: number, seed: number, flowers = false) {
  const g = new T.Group();
  const m = new T.MeshStandardMaterial({ color: rnd(seed, 1) > 0.5 ? "#3d7a33" : "#4e8a3a", roughness: 0.9, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const s = new T.Mesh(new T.IcosahedronGeometry(0.06 * size * (0.8 + rnd(seed, i) * 0.4), 0), m);
    s.position.set(x + (i - 1) * 0.05 * size, 0.045 * size, z + rnd(seed, i + 4) * 0.04 * size);
    g.add(s);
  }
  if (flowers) {
    const fm = std(T, ["#f472b6", "#facc15", "#f8fafc", "#ef4444"][Math.floor(rnd(seed, 7) * 4)], 0.6);
    for (let i = 0; i < 5; i++) g.add(box(T, fm, x + (rnd(seed, i + 11) - 0.5) * 0.14 * size, 0.08 * size, z + (rnd(seed, i + 17) - 0.3) * 0.06 * size, 0.014, 0.014, 0.014));
  }
  return g;
}

function picketFence(T: Three, m: Mat, x0: number, z0: number, len: number, alongX: boolean) {
  const g = new T.Group();
  const n = Math.floor(len / 0.06);
  for (let i = 0; i <= n; i++) {
    const u = (i * len) / n;
    g.add(alongX ? box(T, m, x0 + u, 0, z0, 0.012, 0.075, 0.008) : box(T, m, x0, 0, z0 + u, 0.008, 0.075, 0.012));
  }
  g.add(alongX ? box(T, m, x0, 0.045, z0 - 0.002, len, 0.012, 0.004) : box(T, m, x0 - 0.002, 0.045, z0, 0.004, 0.012, len));
  g.add(alongX ? box(T, m, x0, 0.02, z0 - 0.002, len, 0.012, 0.004) : box(T, m, x0 - 0.002, 0.02, z0, 0.004, 0.012, len));
  return g;
}

/** A parked car: the same detailed model the roads use, at map scale. */
function parkedCar(T: Three, kit: MaterialKit, x: number, z: number, color: string, alongX: boolean, model: BodyModel = "sedan") {
  const car = buildCar(T, kit, { model, color, finish: "metallic" });
  car.scale.setScalar(0.118);
  const g = new T.Group();
  g.add(car);
  g.position.set(x, 0.01, z);
  if (!alongX) g.rotation.y = Math.PI / 2;
  return g;
}

/**
 * Bakes every single-material mesh into one mesh per material, so a lot with
 * hundreds of windows renders in a few dozen draw calls (phones care).
 */
function shadowAll(T: Three, root: THREE_NS.Object3D) {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: Mat; geos: THREE_NS.BufferGeometry[] }>();
  const keep: THREE_NS.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry;
    if (Array.isArray(m.material) || !geo.getAttribute("normal") || !geo.getAttribute("uv")) {
      keep.push(m);
      return;
    }
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    g.clearGroups();
    const key = m.material.uuid;
    const b = buckets.get(key) ?? { mat: m.material, geos: [] };
    b.geos.push(g);
    buckets.set(key, b);
  });
  const out = new T.Group();
  for (const m of keep) {
    const c = m.clone();
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  }
  for (const { mat, geos } of buckets.values()) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    out.add(new T.Mesh(merged, mat));
  }
  // the originals are no longer needed
  root.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh && !keep.includes(m)) m.geometry.dispose();
  });
  out.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return out;
}

function lot(T: Three, W: number, D: number) {
  const root = new T.Group();
  const g = new T.Group();
  g.position.set(-W / 2, 0, -D / 2);
  root.add(g);
  return { root, g };
}

/** A cached copy of a texture with its own repeat. */
function repeated(T: Three, base: THREE_NS.Texture, key: string, rx: number, ry: number) {
  const k = `${key}@${rx.toFixed(2)}x${ry.toFixed(2)}`;
  let t = texCache.get(k);
  if (!t) {
    t = base.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    texCache.set(k, t);
  }
  return t;
}

function lawn(T: Three, color: string, W: number, D: number) {
  return new T.MeshStandardMaterial({ color, roughness: 1, map: repeated(T, lawnTex(T), "lawn", W * 1.5, D * 1.5) });
}

// ───────────────────────────── family houses ─────────────────────────────

const WALLS = ["#efe6d2", "#f3efe7", "#e9dcc5", "#dfe6ea", "#efe1d6", "#e6e2d0"];
const ROOFS = ["#9c3b24", "#7a3020", "#4b5563", "#3b3f46", "#8a4b2a", "#5b2f22"];

interface HouseSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  hip: boolean;
  wall: string;
  roof: string;
  seed: number;
  garage: boolean;
}

function familyHouse(T: Three, kit: MaterialKit, s: HouseSpec) {
  const g = new T.Group();
  const wall = new T.MeshStandardMaterial({ color: s.wall, roughness: 0.9, map: plasterTex(T) });
  const tiles = new T.MeshStandardMaterial({ color: s.roof, roughness: 0.75, map: tileTex(T) });
  const frame = std(T, "#f8fafc", 0.5);
  const plinth = std(T, "#8b8f94", 0.9);
  const door = std(T, ["#6b3a1f", "#1f3a5f", "#2f4f2f", "#7a1f1f"][Math.floor(rnd(s.seed, 3) * 4)], 0.5);
  const fh = 0.2;
  const H = s.floors * fh + 0.02;
  const { x, z, w, d } = s;
  g.add(box(T, plinth, x - 0.01, 0, z - 0.01, w + 0.02, 0.035, d + 0.02));
  g.add(box(T, wall, x, 0.035, z, w, H, d));
  // windows on the front (+z) and the right (+x) walls
  for (let f = 0; f < s.floors; f++) {
    const y = 0.035 + f * fh + 0.075;
    const nz = Math.max(2, Math.floor(w / 0.22));
    for (let i = 0; i < nz; i++) {
      const u = x + ((i + 0.5) * w) / nz - 0.045;
      if (f === 0 && i === 0) continue; // the door goes here
      g.add(windowZ(T, kit, frame, u, y, z + d, 0.09, 0.1));
    }
    const nx = Math.max(1, Math.floor(d / 0.24));
    for (let i = 0; i < nx; i++) g.add(windowX(T, kit, frame, x + w, y, z + ((i + 0.5) * d) / nx - 0.045, 0.09, 0.1));
  }
  // front door with a small canopy and a step
  const dx = x + w / Math.max(2, Math.floor(w / 0.22)) / 2 - 0.04;
  g.add(box(T, frame, dx - 0.012, 0.035, z + d - 0.002, 0.104, 0.172, 0.01));
  g.add(box(T, door, dx, 0.035, z + d + 0.004, 0.08, 0.16, 0.008));
  g.add(box(T, std(T, "#c9a227", 0.3, 0.9), dx + 0.065, 0.11, z + d + 0.01, 0.008, 0.008, 0.008));
  g.add(box(T, std(T, "#b8bcc2", 0.9), dx - 0.03, 0, z + d, 0.14, 0.03, 0.06));
  g.add(box(T, tiles, dx - 0.035, 0.22, z + d, 0.15, 0.012, 0.07));
  // roof and chimney
  const rise = Math.min(w, d) * 0.42;
  g.add(pitchedRoof(T, tiles, wall, x, 0.035 + H, z, w, d, rise, s.hip));
  const cx = x + w * (0.62 + rnd(s.seed, 4) * 0.2);
  g.add(box(T, std(T, "#8a3b26", 0.9), cx, 0.035 + H + rise * 0.3, z + d * 0.25, 0.07, rise * 0.85, 0.07));
  g.add(box(T, std(T, "#5d5f63", 0.8), cx - 0.008, 0.035 + H + rise * 1.15, z + d * 0.25 - 0.008, 0.086, 0.014, 0.086));
  // gutters along the eaves
  g.add(box(T, std(T, "#d4d7dc", 0.4, 0.6), x - 0.06, 0.035 + H - 0.03, z + d + 0.05, w + 0.12, 0.016, 0.014));
  // garage annex with an up-and-over door on the right
  if (s.garage) {
    const gw = 0.34;
    const gx = x + w;
    const gd = Math.min(d, 0.44);
    const gz = z + d - gd;
    g.add(box(T, wall, gx, 0, gz, gw, 0.17, gd));
    g.add(box(T, std(T, "#d1d5db", 0.5, 0.3), gx + 0.04, 0, gz + gd + 0.002, gw - 0.08, 0.13, 0.006));
    for (let i = 1; i < 5; i++) g.add(box(T, std(T, "#9ca3af", 0.5), gx + 0.04, (i * 0.13) / 5, gz + gd + 0.006, gw - 0.08, 0.004, 0.003));
    g.add(box(T, tiles, gx - 0.01, 0.17, gz - 0.02, gw + 0.04, 0.02, gd + 0.05));
  }
  return g;
}

export function buildHouseLot(T: Three, kit: MaterialKit, W: number, D: number, seed: number, autumn = false) {
  const { root, g } = lot(T, W, D);
  g.add(box(T, lawn(T, "#7cad5c", W, D), 0, 0, 0, W, 0.01, D));
  const pavers = new T.MeshStandardMaterial({ color: "#c9c2b5", roughness: 0.9, map: paverTex(T) });
  const fence = std(T, "#f5f5f4", 0.6);
  // a paved path and driveway
  g.add(box(T, pavers, W * 0.36, 0.01, D * 0.62, 0.16, 0.004, D * 0.38));
  g.add(box(T, pavers, W - 0.62, 0.01, D * 0.62, 0.44, 0.004, D * 0.38));
  g.add(picketFence(T, fence, 0.02, D - 0.03, W * 0.34, true));
  g.add(picketFence(T, fence, W * 0.36 + 0.18, D - 0.03, W - 0.62 - (W * 0.36 + 0.18) - 0.04, true));
  g.add(picketFence(T, fence, W - 0.03, 0.02, D * 0.6, false));
  const variant = Math.floor(rnd(seed, 1) * 4);
  const homes: HouseSpec[] = [];
  const pick = (i: number) => ({
    wall: WALLS[Math.floor(rnd(seed, i + 10) * WALLS.length)],
    roof: ROOFS[Math.floor(rnd(seed, i + 20) * ROOFS.length)],
    hip: rnd(seed, i + 30) > 0.5,
    seed: seed + i,
  });
  if (variant === 0) {
    homes.push({ x: 0.12, z: 0.15, w: 1.1, d: 0.8, floors: 2, garage: true, ...pick(0) });
  } else if (variant === 1) {
    homes.push({ x: 0.1, z: 0.12, w: 0.85, d: 0.7, floors: 2, garage: false, ...pick(0) });
    homes.push({ x: 1.12, z: 0.3, w: 0.78, d: 0.62, floors: 1, garage: false, ...pick(1) });
  } else if (variant === 2) {
    homes.push({ x: 0.15, z: 0.15, w: 1.3, d: 0.75, floors: 1, garage: true, ...pick(0) });
  } else {
    homes.push({ x: 0.12, z: 0.12, w: 0.95, d: 0.9, floors: 2, garage: false, ...pick(0) });
  }
  for (const h of homes) g.add(familyHouse(T, kit, h));
  // the car on the drive
  const carCols = ["#c0392b", "#1f4e79", "#e5e7eb", "#2d2d2d", "#7f8c8d", "#0f766e"];
  if (rnd(seed, 40) > 0.25) g.add(parkedCar(T, kit, W - 0.4, D * 0.8, carCols[Math.floor(rnd(seed, 41) * carCols.length)], false, (["city", "sedan", "suv", "electric"] as const)[Math.floor(rnd(seed, 42) * 4)]));
  // garden: trees, hedges, flowers
  g.add(tree3d(T, W - 0.3, 0.35, 1.1, seed, autumn));
  if (variant !== 1) g.add(tree3d(T, 0.35, D - 0.4, 0.85, seed + 3, autumn));
  for (let i = 0; i < 3; i++) g.add(bush3d(T, 0.2 + i * 0.22, D * 0.6 + 0.02, 1, seed + i, i === 1));
  g.add(bush3d(T, W * 0.36 - 0.08, D - 0.15, 1, seed + 9, true));
  return shadowAll(T, root);
}

// ───────────────────────────── apartments ─────────────────────────────

const BLOCK_WALLS = ["#e8dcc4", "#d9c3b0", "#e3e6e8", "#cfd8dc", "#e9d8c8"];

export function buildApartmentLot(T: Three, kit: MaterialKit, W: number, D: number, seed: number, hpx: number) {
  const { root, g } = lot(T, W, D);
  g.add(box(T, lawn(T, "#83a866", W, D), 0, 0, 0, W, 0.01, D));
  const paving = new T.MeshStandardMaterial({ color: "#bfc3c7", roughness: 0.9, map: paverTex(T) });
  g.add(box(T, paving, 0, 0.01, D - 0.4, W, 0.004, 0.4));
  const H = hpx * PX;
  const wall = new T.MeshStandardMaterial({ color: BLOCK_WALLS[Math.floor(rnd(seed, 1) * BLOCK_WALLS.length)], roughness: 0.9, map: plasterTex(T) });
  const accent = std(T, ["#9a5b3c", "#5b6b7a", "#6b5a4a", "#7d8a6a"][Math.floor(rnd(seed, 2) * 4)], 0.85);
  const frame = std(T, "#2b2f35", 0.5, 0.4);
  const slab = std(T, "#eef0f2", 0.7);
  const rail = new T.MeshPhysicalMaterial({ color: "#a8c4d8", roughness: 0.1, transmission: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.2 });
  const x = 0.22;
  const z = 0.22;
  const w = Math.min(W - 0.45, 1.85);
  const d = Math.min(D - 0.75, 1.55);
  const floors = Math.max(3, Math.round(H / 0.28));
  const fh = H / floors;
  // ground floor: darker plinth with a glazed lobby
  g.add(box(T, accent, x, 0.01, z, w, fh, d));
  g.add(box(T, wall, x, 0.01 + fh, z, w, H - fh, d));
  // vertical accent strips (stair core)
  g.add(box(T, accent, x + w * 0.42, 0.01 + fh, z + d - 0.005, w * 0.16, H - fh, 0.012));
  g.add(box(T, pane(T), x + w * 0.44, 0.03, z + d + 0.001, w * 0.12, fh * 0.75, 0.006));
  g.add(box(T, slab, x + w * 0.38, fh * 0.85, z + d, w * 0.24, 0.015, 0.12));
  // windows, floor by floor; balconies on the front
  const cols = Math.max(4, Math.round(w / 0.24));
  for (let f = 1; f < floors; f++) {
    const y = 0.01 + f * fh + fh * 0.22;
    const wh = fh * 0.55;
    for (let i = 0; i < cols; i++) {
      const u = x + ((i + 0.5) * w) / cols;
      if (Math.abs(u - (x + w * 0.5)) < w * 0.09) continue;
      g.add(windowZ(T, kit, frame, u - 0.05, y, z + d, 0.1, wh));
    }
    const rows = Math.max(3, Math.round(d / 0.26));
    for (let i = 0; i < rows; i++) g.add(windowX(T, kit, frame, x + w, y, z + ((i + 0.5) * d) / rows - 0.05, 0.1, wh));
    // balconies: concrete slab + glass balustrade, on alternate bays
    for (const bu of [0.08, 0.66]) {
      const bx = x + w * bu;
      const bw = w * 0.26;
      g.add(box(T, slab, bx, 0.01 + f * fh, z + d, bw, 0.018, 0.1));
      g.add(box(T, rail, bx, 0.01 + f * fh + 0.018, z + d + 0.092, bw, fh * 0.32, 0.006));
      g.add(box(T, frame, bx, 0.01 + f * fh + 0.018 + fh * 0.32, z + d + 0.09, bw, 0.008, 0.01));
    }
  }
  // flat roof: parapet, lift room, AC units, solar panels
  const top = 0.01 + H;
  g.add(box(T, slab, x - 0.015, top, z - 0.015, w + 0.03, 0.03, d + 0.03));
  g.add(box(T, std(T, "#6b7075", 0.9), x + 0.02, top, z + 0.02, w - 0.04, 0.012, d - 0.04));
  g.add(box(T, accent, x + w * 0.4, top, z + d * 0.3, w * 0.2, 0.12, d * 0.3));
  for (let i = 0; i < 3; i++) g.add(box(T, std(T, "#d6d9dd", 0.5, 0.4), x + 0.1 + i * 0.14, top + 0.012, z + 0.12, 0.1, 0.06, 0.08));
  const pv = new T.MeshPhysicalMaterial({ color: "#1b2a4a", roughness: 0.2, metalness: 0.4, clearcoat: 1 });
  for (let i = 0; i < 4; i++) {
    const p = box(T, pv, x + w * 0.66 + (i % 2) * 0.2, top + 0.04, z + 0.1 + Math.floor(i / 2) * 0.22, 0.18, 0.01, 0.18);
    p.rotation.x = -0.25;
    g.add(p);
  }
  // street furniture: benches, a lamp and trees
  const wood = std(T, "#8b5a2b", 0.8);
  g.add(box(T, wood, 0.3, 0.04, D - 0.2, 0.3, 0.015, 0.07));
  g.add(box(T, std(T, "#3f3f46", 0.5, 0.6), 0.32, 0, D - 0.2, 0.02, 0.04, 0.07));
  g.add(box(T, std(T, "#3f3f46", 0.5, 0.6), 0.56, 0, D - 0.2, 0.02, 0.04, 0.07));
  g.add(tree3d(T, W - 0.22, D - 0.25, 1, seed));
  g.add(tree3d(T, W - 0.2, 0.3, 0.9, seed + 2));
  g.add(bush3d(T, 0.9, D - 0.25, 1, seed + 4, true));
  return shadowAll(T, root);
}

// ───────────────────────────── offices ─────────────────────────────

export interface OfficeSpec {
  towers: { x: number; z: number; w: number; d: number; h: number }[];
  tint: string;
  helipad: boolean;
  mast: boolean;
}

export function buildOfficeLot(T: Three, kit: MaterialKit, W: number, D: number, seed: number, spec: OfficeSpec) {
  const { root, g } = lot(T, W, D);
  const plaza = new T.MeshStandardMaterial({ color: "#d4d7db", roughness: 0.85, map: paverTex(T) });
  g.add(box(T, plaza, 0, 0, 0, W, 0.01, D));
  const stone = std(T, "#c8ccd2", 0.6);
  const dark = std(T, "#2c3440", 0.45, 0.6);
  const frame = std(T, "#9aa4b0", 0.3, 0.8);
  for (const tw of spec.towers) {
    const H = tw.h * PX;
    const floors = Math.max(4, Math.round(H / 0.12));
    // stone podium with a glazed lobby
    g.add(box(T, stone, tw.x - 0.08, 0.01, tw.z - 0.08, tw.w + 0.16, 0.24, tw.d + 0.16));
    g.add(box(T, pane(T), tw.x + 0.05, 0.02, tw.z + tw.d + 0.081, tw.w - 0.1, 0.17, 0.004));
    g.add(box(T, dark, tw.x - 0.1, 0.22, tw.z - 0.1, tw.w + 0.2, 0.025, tw.d + 0.2));
    // the curtain wall: reflective glass mapped with floors and mullions
    const tex = repeated(T, curtainTex(T, 8), "curtain", Math.max(1, Math.round(tw.w / 0.16)) / 8, floors / 8);
    const glass = new T.MeshPhysicalMaterial({
      color: spec.tint,
      map: tex,
      metalness: 0.55,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.6,
    });
    const texX = repeated(T, curtainTex(T, 8), "curtain", Math.max(1, Math.round(tw.d / 0.16)) / 8, floors / 8);
    const glassX = glass.clone();
    glassX.map = texX;
    const shaft = new T.Mesh(new T.BoxGeometry(tw.w, H - 0.24, tw.d), [glassX, glassX, dark, dark, glass, glass]);
    shaft.position.set(tw.x + tw.w / 2, 0.245 + (H - 0.24) / 2, tw.z + tw.d / 2);
    g.add(shaft);
    // corner fins
    for (const [cx, cz] of [
      [tw.x - 0.01, tw.z + tw.d - 0.01],
      [tw.x + tw.w - 0.01, tw.z + tw.d - 0.01],
      [tw.x + tw.w - 0.01, tw.z - 0.01],
    ])
      g.add(box(T, frame, cx, 0.245, cz, 0.022, H - 0.24, 0.022));
    // crown: setback plant room and a lit edge
    g.add(box(T, frame, tw.x - 0.012, 0.01 + H, tw.z - 0.012, tw.w + 0.024, 0.03, tw.d + 0.024));
    g.add(box(T, stone, tw.x + tw.w * 0.2, 0.04 + H, tw.z + tw.d * 0.2, tw.w * 0.6, 0.12, tw.d * 0.6));
    for (let i = 0; i < 2; i++) g.add(box(T, std(T, "#9aa1a9", 0.5, 0.5), tw.x + tw.w * 0.25 + i * 0.16, 0.16 + H, tw.z + tw.d * 0.3, 0.12, 0.05, 0.12));
    if (spec.helipad && tw === spec.towers[0]) {
      const pad = cyl(T, std(T, "#2f3640", 0.7), tw.x + tw.w / 2, 0.16 + H, tw.z + tw.d / 2, Math.min(tw.w, tw.d) * 0.42, 0.015, 24);
      g.add(pad);
      const ring = new T.Mesh(new T.TorusGeometry(Math.min(tw.w, tw.d) * 0.3, 0.008, 6, 32), std(T, "#facc15", 0.5));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(tw.x + tw.w / 2, 0.178 + H, tw.z + tw.d / 2);
      g.add(ring);
    }
  }
  if (spec.mast) {
    const t0 = spec.towers[0];
    const H = t0.h * PX;
    g.add(cyl(T, std(T, "#e5e7eb", 0.4, 0.7), t0.x + t0.w / 2, 0.16 + H, t0.z + t0.d / 2, 0.012, 0.5, 8, 0.02));
  }
  // planters with trees on the plaza
  const planter = std(T, "#8a8f96", 0.8);
  for (const [px, pz] of [
    [W - 0.25, D - 0.25],
    [0.25, D - 0.2],
  ]) {
    g.add(box(T, planter, px - 0.08, 0, pz - 0.08, 0.16, 0.05, 0.16));
    g.add(tree3d(T, px, pz, 0.8, seed + px));
  }
  return shadowAll(T, root);
}

// ───────────────────────────── villas ─────────────────────────────

export function buildVillaLot(T: Three, kit: MaterialKit, W: number, D: number, seed: number, carColor: string) {
  const { root, g } = lot(T, W, D);
  g.add(box(T, lawn(T, "#76b25d", W, D), 0, 0, 0, W, 0.01, D));
  const white = new T.MeshStandardMaterial({ color: "#f4f2ee", roughness: 0.8, map: plasterTex(T) });
  const wood = std(T, "#8a5a36", 0.7);
  const stone = std(T, "#d8d2c6", 0.85);
  const dark = std(T, "#2b2e33", 0.5, 0.5);
  // terrace deck and the pool
  const deck = new T.MeshStandardMaterial({ color: "#c49a6c", roughness: 0.8 });
  g.add(box(T, deck, 1.25, 0.01, 1.3, 1.0, 0.012, 0.95));
  g.add(box(T, stone, 1.35, 0.01, 1.4, 0.8, 0.02, 0.7));
  const water = new T.MeshPhysicalMaterial({ color: "#21b6d6", roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.5, emissive: "#0b6d86", emissiveIntensity: 0.25 });
  g.add(box(T, water, 1.4, 0.012, 1.45, 0.7, 0.02, 0.6));
  for (let i = 0; i < 2; i++) {
    g.add(box(T, std(T, "#f8fafc", 0.5), 1.42 + i * 0.25, 0.022, 2.12, 0.2, 0.02, 0.08));
    g.add(box(T, std(T, "#f8fafc", 0.5), 1.42 + i * 0.25, 0.042, 2.12, 0.05, 0.03, 0.08));
  }
  // ground floor: a glass pavilion between stone walls
  const x = 0.15;
  const z = 0.15;
  g.add(box(T, stone, x, 0.01, z, 0.12, 0.26, 1.0));
  g.add(box(T, pane(T), x + 0.12, 0.01, z + 0.98, 1.36, 0.26, 0.01));
  g.add(box(T, white, x + 0.12, 0.01, z, 1.48, 0.26, 0.98));
  for (let i = 1; i < 6; i++) g.add(box(T, dark, x + 0.12 + i * 0.226, 0.01, z + 0.985, 0.012, 0.26, 0.012));
  g.add(box(T, pane(T), x + 1.6, 0.03, z + 0.15, 0.006, 0.2, 0.7));
  // first floor: a white cantilevered box with wooden slats
  g.add(box(T, white, x + 0.25, 0.27, z - 0.05, 1.2, 0.26, 0.86));
  g.add(box(T, pane(T), x + 0.4, 0.32, z + 0.812, 0.9, 0.17, 0.006));
  for (let i = 0; i < 14; i++) g.add(box(T, wood, x + 0.4 + i * 0.066, 0.31, z + 0.82, 0.018, 0.19, 0.012));
  g.add(box(T, pane(T), x + 1.452, 0.32, z + 0.1, 0.006, 0.17, 0.5));
  // flat roofs with thin overhanging slabs
  g.add(box(T, stone, x + 0.05, 0.265, z - 0.02, 1.62, 0.012, 1.08));
  g.add(box(T, stone, x + 0.2, 0.53, z - 0.1, 1.3, 0.02, 0.98));
  // the drive, a supercar, palms/trees and hedges
  const drive = new T.MeshStandardMaterial({ color: "#bdb6aa", roughness: 0.9, map: paverTex(T) });
  g.add(box(T, drive, 0.15, 0.01, 1.4, 0.95, 0.004, D - 1.4));
  g.add(parkedCar(T, kit, 0.6, 1.95, carColor, true, seed > 0.5 ? "supercar" : "luxury"));
  g.add(tree3d(T, W - 0.25, 0.35, 1.15, seed));
  g.add(pine3d(T, W - 0.2, 0.9, 1.1));
  for (let i = 0; i < 4; i++) g.add(box(T, std(T, "#3f7a36", 0.9), 1.25, 0, 1.3 + i * 0.25, 0.04, 0.08, 0.2));
  return shadowAll(T, root);
}

// ───────────────────────────── shops ─────────────────────────────

export function buildShopLot(T: Three, kit: MaterialKit, W: number, D: number, seed: number, colors: string[], cars: string[]) {
  const { root, g } = lot(T, W, D);
  const paving = new T.MeshStandardMaterial({ color: "#c9cbcf", roughness: 0.9, map: paverTex(T) });
  g.add(box(T, paving, 0, 0, 0, W, 0.01, D));
  // a car park in front, with painted bays
  const tar = std(T, "#4b515b", 0.95);
  const paint = std(T, "#f1f5f9", 0.6);
  g.add(box(T, tar, 0.05, 0.01, 1.62, W - 0.1, 0.004, D - 1.67));
  for (let i = 0; i <= 5; i++) g.add(box(T, paint, 0.15 + i * 0.4, 0.015, 1.7, 0.012, 0.001, 0.4));
  const units = [0.15, 1.3];
  units.forEach((ux, i) => {
    const col = colors[i];
    const wall = new T.MeshStandardMaterial({ color: i ? "#e8e1d6" : "#efe9e1", roughness: 0.9, map: plasterTex(T) });
    const accent = std(T, col, 0.5);
    const w = 1.0;
    const d = 1.2;
    const z = 0.2;
    const H = 0.42;
    g.add(box(T, wall, ux, 0.01, z, w, H, d));
    // shopfront: full-height glazing with a door and a dark frame
    const frame = std(T, "#2b2f35", 0.45, 0.5);
    g.add(box(T, frame, ux + 0.04, 0.01, z + d, w - 0.08, 0.26, 0.008));
    g.add(box(T, pane(T), ux + 0.055, 0.025, z + d + 0.006, w - 0.11, 0.23, 0.004));
    for (let k = 1; k < 4; k++) g.add(box(T, frame, ux + 0.04 + (k * (w - 0.08)) / 4, 0.01, z + d + 0.008, 0.01, 0.26, 0.006));
    // sign band and a striped awning
    g.add(box(T, accent, ux, 0.3, z + d, w, 0.09, 0.012));
    g.add(box(T, std(T, "#ffffff", 0.4), ux + w * 0.25, 0.32, z + d + 0.012, w * 0.5, 0.05, 0.004));
    for (let k = 0; k < 8; k++) {
      const a = box(T, k % 2 ? std(T, "#f8fafc", 0.7) : accent, ux + (k * w) / 8, 0, 0, w / 8, 0.008, 0.16);
      a.position.y = 0.28;
      a.position.z = z + d + 0.08;
      a.rotation.x = 0.35;
      g.add(a);
    }
    // side windows, flat roof with parapet and plant
    g.add(windowX(T, kit, frame, ux + w, 0.12, z + 0.3, 0.5, 0.12));
    g.add(box(T, std(T, "#9ca3af", 0.8), ux - 0.01, 0.01 + H, z - 0.01, w + 0.02, 0.03, d + 0.02));
    g.add(box(T, std(T, "#6b7075", 0.9), ux + 0.02, 0.01 + H, z + 0.02, w - 0.04, 0.012, d - 0.04));
    g.add(box(T, std(T, "#d6d9dd", 0.5, 0.4), ux + 0.2, 0.02 + H, z + 0.3, 0.16, 0.08, 0.12));
    g.add(box(T, std(T, "#d6d9dd", 0.5, 0.4), ux + 0.5, 0.02 + H, z + 0.5, 0.12, 0.06, 0.12));
  });
  const models = ["city", "sedan", "suv", "electric"] as const;
  cars.forEach((c, i) => g.add(parkedCar(T, kit, 0.35 + i * 0.8, 1.9, c, false, models[Math.floor(rnd(seed, i + 50) * 4)])));
  g.add(tree3d(T, W - 0.15, 1.45, 0.75, seed));
  return shadowAll(T, root);
}
