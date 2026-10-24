// The ground of a 3D circuit: the rolling height every part of the scene stands on, the
// textures drawn once on canvases (grass mown in stripes, sand, concrete, asphalt, gravel,
// kerbs), the ground itself, the sky and, on the coast, the sea. One track tile is U metres.
import * as THREE from "three";
import type { TrackTheme } from "@/game/config/racing";
import type { Track } from "@/game/racing/tracks";

/** Metres per track tile (a car is about 4.5 m long, the asphalt 11–14 m wide). */
export const U = 10;

/** Tiles of ground drawn beyond the circuit's frame on every side. */
export const PAD = 14;

const fract = (v: number) => v - Math.floor(v);
const hash = (x: number, y: number, seed: number) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in 0..1. */
export function noise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A seeded random number in 0..1 for item `i` (scenery scatter). */
export const rand = (i: number, k: number) => hash(i * 1.37, k * 7.13, 3.1);

export type Height = (x: number, y: number) => number;

/**
 * The ground's height in metres at a point of the track frame (tiles): rolling hills of the
 * layout's `hills` metres, flattened along the main straight (the grid, the pits and the
 * stands stand level), and on the coast a beach sloping down into the sea.
 */
export function heightOf(tr: Track, theme: TrackTheme): Height {
  const L = tr.layout;
  const amp = L.hills ?? 0;
  const seed = tr.id.length * 13.7;
  const edge = -edgeDepth(tr, theme);
  return (x, y) => {
    let h = 0;
    if (amp > 0) {
      const n = noise(x * 0.09, y * 0.09, seed) * 0.7 + noise(x * 0.21, y * 0.21, seed + 5) * 0.3;
      // the main straight lies along the top of every frame: level there
      const level = smooth(Math.min(1, Math.max(0, (y - 3.5) / 5)));
      h = (n - 0.45) * 2 * amp * level;
    }
    if (theme === "coastal") h -= smooth(Math.min(1, Math.max(0, (y - L.d * 0.74) / (L.d * 0.12)))) * 5;
    // beyond the frame the land eases down to the far plain (farGround), with no step at the edge
    const out = Math.max(0, -x, x - L.w, -y, y - L.d);
    const e = smooth(Math.min(1, out / (PAD * 0.85)));
    return h * (1 - e) + edge * e;
  };
}

/** How far below the circuit the far plain lies (m): under the deepest valley, and the sea bed. */
export function edgeDepth(tr: Track, theme: TrackTheme): number {
  return (tr.layout.hills ?? 0) + (theme === "coastal" ? 6 : 1);
}

// ───────────────────────────── textures ─────────────────────────────

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  return [cv, cv.getContext("2d")!];
}

function speckle(g: CanvasRenderingContext2D, size: number, n: number, colors: string[], r0: number, r1: number, seed: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    const r = r0 + rand(i, seed) * (r1 - r0);
    g.globalAlpha = 0.25 + rand(i, seed + 1) * 0.5;
    g.fillRect(rand(i, seed + 2) * size, rand(i, seed + 3) * size, r, r);
  }
  g.globalAlpha = 1;
}

function texture(cv: HTMLCanvasElement, repeat: number, aniso: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

export interface GroundLook {
  /** Base colour of the ground and of its mown stripes. */
  base: string;
  stripe: string;
  /** Speckles drawn over it. */
  dots: string[];
}

export const GROUND: Record<TrackTheme, GroundLook> = {
  home: { base: "#3f8a36", stripe: "#428e38", dots: ["#357a2e", "#4f9a43", "#2f6f2a"] },
  industrial: { base: "#7d817b", stripe: "#797d77", dots: ["#666a64", "#8f938c", "#70746e"] },
  mountain: { base: "#3d6e34", stripe: "#3f7136", dots: ["#33602c", "#4c8242", "#5f7a49"] },
  coastal: { base: "#4a9440", stripe: "#4d9843", dots: ["#3f8537", "#5aa64e", "#6fae58"] },
  desert: { base: "#cfa766", stripe: "#cba262", dots: ["#bd9353", "#dcbb80", "#ad8247"] },
  night: { base: "#2f343d", stripe: "#2d323a", dots: ["#252930", "#3b414b", "#282c33"] },
  gp: { base: "#3d8a36", stripe: "#41903a", dots: ["#337a2e", "#4d9a45", "#2e6e2a"] },
  international: { base: "#428f3c", stripe: "#45933f", dots: ["#387f33", "#53a04b", "#336f2e"] },
};

/** The ground: mown stripes (grass) or plain, with speckles. One repeat covers 4 tiles. */
export function groundTexture(look: GroundLook, aniso: number): THREE.CanvasTexture {
  const [cv, g] = canvas(256);
  g.fillStyle = look.base;
  g.fillRect(0, 0, 256, 256);
  if (look.stripe !== look.base) {
    g.fillStyle = look.stripe;
    for (let i = 0; i < 4; i += 2) g.fillRect(0, i * 64, 256, 64);
  }
  speckle(g, 256, 2600, look.dots, 1, 3, 11);
  return texture(cv, 1, aniso);
}

/** Asphalt: dark grey with aggregate. */
export function asphaltTexture(color: string, aniso: number): THREE.CanvasTexture {
  const [cv, g] = canvas(256);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 5000, ["#1f2329", "#5b6270", "#2b3037", "#6b7280"], 1, 2, 21);
  return texture(cv, 1, aniso);
}

/** Gravel traps: pale stones. */
export function gravelTexture(color: string, aniso: number): THREE.CanvasTexture {
  const [cv, g] = canvas(128);
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 1800, ["#a8916a", "#efe2c0", "#8f7a55", "#d9c79f"], 1, 3, 31);
  return texture(cv, 1, aniso);
}

/** Kerbs: two stripes per repeat (red and white, or the theme's pair), with a dark seam. */
export function kerbTexture(a: string, b: string, aniso: number): THREE.CanvasTexture {
  const [cv, g] = canvas(64);
  g.fillStyle = a;
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = b;
  g.fillRect(32, 0, 32, 64);
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(0, 0, 64, 6);
  return texture(cv, 1, aniso);
}

/** A crowd seen from the track: rows of people in bright shirts. */
export function crowdTexture(aniso: number): THREE.CanvasTexture {
  const [cv, g] = canvas(256);
  g.fillStyle = "#475569";
  g.fillRect(0, 0, 256, 256);
  const shirts = ["#ef4444", "#facc15", "#3b82f6", "#f8fafc", "#22c55e", "#f97316", "#a855f7", "#ec4899"];
  for (let row = 0; row < 16; row++)
    for (let i = 0; i < 32; i++) {
      const x = i * 8 + (row % 2) * 4 + rand(row * 40 + i, 1) * 2;
      const y = row * 16 + 4;
      g.fillStyle = shirts[Math.floor(rand(row * 40 + i, 2) * shirts.length)];
      g.fillRect(x, y + 4, 6, 8);
      g.fillStyle = ["#f1c27d", "#8d5524", "#e0ac69", "#c68642"][Math.floor(rand(row * 40 + i, 3) * 4)];
      g.fillRect(x + 1, y, 4, 4);
    }
  return texture(cv, 1, aniso);
}

/** Text on a panel (banners, billboards, the start gantry). */
export function labelTexture(text: string, bg: string, fg: string, w = 512, h = 128, font = "900 64px system-ui, sans-serif"): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(0, 0, w, h * 0.45);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4, w * 0.92);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Windows of a tower block: lit at random (night) or reflecting (day). */
export function windowTexture(night: boolean): THREE.CanvasTexture {
  const [cv, g] = canvas(128);
  g.fillStyle = night ? "#111827" : "#64748b";
  g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 16; r++)
    for (let c = 0; c < 8; c++) {
      const lit = rand(r * 8 + c, 9) < (night ? 0.55 : 0);
      g.fillStyle = lit ? ["#fde68a", "#fef3c7", "#bae6fd", "#fdba74"][(r + c) % 4] : night ? "#1f2937" : "#94a3b8";
      g.fillRect(c * 16 + 3, r * 8 + 2, 10, 5);
    }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────────── meshes ─────────────────────────────

/** The ground over the frame and PAD tiles round it, following the height. */
export function groundMesh(tr: Track, H: Height, mat: THREE.Material, hilly: boolean): THREE.Mesh {
  const L = tr.layout;
  const W = L.w + PAD * 2;
  const D = L.d + PAD * 2;
  // a vertex every tile on hills, every two on flat land (its edges still ease down)
  const segX = hilly ? Math.ceil(W) : Math.ceil(W / 2);
  const segZ = hilly ? Math.ceil(D) : Math.ceil(D / 2);
  const g = new THREE.PlaneGeometry(W * U, D * U, segX, segZ);
  g.rotateX(-Math.PI / 2);
  g.translate((L.w / 2) * U, 0, (L.d / 2) * U);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / U;
    const y = pos.getZ(i) / U;
    pos.setY(i, H(x, y) - 0.02);
    // one repeat of the texture every 4 tiles
    uv.setXY(i, x / 4, y / 4);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/**
 * The land beyond, out to the horizon: one big plane under the detailed ground (lower than its
 * lowest valley), so no edge of the world shows from any camera; the fog melts it away.
 */
export function farGround(tr: Track, mat: THREE.MeshStandardMaterial, below: number): THREE.Mesh {
  const L = tr.layout;
  const size = 6000;
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // the same texture scale as the near ground: a repeat every 4 tiles
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size) / (4 * U), (uv.getY(i) * size) / (4 * U));
  const m = new THREE.Mesh(g, mat);
  m.position.set((L.w / 2) * U, -below, (L.d / 2) * U);
  return m;
}

/** A sky dome: a gradient from the horizon up, and stars at night. */
export function skyDome(top: string, horizon: string, night: number): THREE.Object3D {
  const g = new THREE.SphereGeometry(1800, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const cTop = new THREE.Color(top);
  const cHor = new THREE.Color(horizon);
  const col: number[] = [];
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.pow(Math.max(0, pos.getY(i)) / 1800, 0.55);
    c.copy(cHor).lerp(cTop, k);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  const root = new THREE.Group();
  root.add(dome);
  if (night > 0.5) {
    const n = 500;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand(i, 41) * Math.PI * 2;
      const e = 0.15 + rand(i, 42) * 1.3;
      p[i * 3] = Math.cos(a) * Math.cos(e) * 1700;
      p[i * 3 + 1] = Math.sin(e) * 1700;
      p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 1700;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    root.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#e2e8f0", size: 2.2, sizeAttenuation: false, fog: false })));
  }
  return root;
}

/** The sea south of a coastal circuit, gently moving (its texture scrolls). */
export function seaMesh(tr: Track, aniso: number): { mesh: THREE.Mesh; tex: THREE.CanvasTexture } {
  const L = tr.layout;
  const [cv, g] = canvas(256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#2aa6d6");
  grad.addColorStop(1, "#1d8fc4");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.08 + rand(i, 51) * 0.18})`;
    g.lineWidth = 1 + rand(i, 52) * 1.5;
    const x = rand(i, 53) * 256;
    const y = rand(i, 54) * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 8, y - 3, x + 16 + rand(i, 55) * 12, y);
    g.stroke();
  }
  const tex = texture(cv, 1, aniso);
  // out to the horizon: a repeat every 40 m
  const W = 6000;
  const D = 3000;
  tex.repeat.set(W / 40, D / 40);
  const geo = new THREE.PlaneGeometry(W, D);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.94, envMapIntensity: 1.2 }));
  // from where the beach is still above the water: the ground hides it until the shore
  mesh.position.set((L.w / 2) * U, -1.1, L.d * 0.72 * U + D / 2);
  mesh.receiveShadow = true;
  return { mesh, tex };
}
