// Building blocks for the island map's 3D scene: coloured primitives that
// merge into a few big meshes (one per material), the procedural facades
// (windows, shutters, cladding) and the "locked land" haze every material of
// the map shares. Units are world units (about 10 m); y is up.
import * as THREE from "three";

export const ALB = new THREE.Color("#ffffff");
export const NEGRU = new THREE.Color("#1d2430");
export const C = (h: string) => new THREE.Color(h);

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const SC = new THREE.Vector3(1, 1, 1);
const YAX = new THREE.Vector3(0, 1, 0);
const ZAX = new THREE.Vector3(0, 0, 1);

/** Gives every vertex one colour (a non-indexed copy, with a uv set so it merges with textured parts). */
export function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const n = out.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[3 * i] = c.r;
    a[3 * i + 1] = c.g;
    a[3 * i + 2] = c.b;
  }
  out.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (!out.attributes.uv) out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return out;
}

/** Points every uv at the white corner of a facade texture (parts without windows). */
export function plainUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.003, 0.997);
  return g;
}

/** A box standing on y, turned by `rot` about the vertical. */
export function box(w: number, h: number, d: number, c: THREE.Color, x: number, y: number, z: number, rot: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, rot), SC.set(1, 1, 1)));
  return paint(g, c);
}

export function cylinder(r: number, h: number, c: THREE.Color, x: number, y: number, z: number, seg = 14, r2: number | null = null) {
  const g = new THREE.CylinderGeometry(r2 ?? r, r, h, seg);
  g.translate(x, y + h / 2, z);
  return paint(g, c);
}

export function cone(r: number, h: number, c: THREE.Color, x: number, y: number, z: number, seg = 12, rot = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.rotateY(rot);
  g.translate(x, y + h / 2, z);
  return paint(g, c);
}

export function sphere(r: number, c: THREE.Color, x: number, y: number, z: number, half = false, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 18, half ? 8 : 12, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, c);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
/** A beam between two points. */
export function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, thick: number, c: THREE.Color, wide: number | null = null) {
  _a.set(ax, ay, az);
  _b.set(bx, by, bz);
  _d.subVectors(_b, _a);
  const L = _d.length();
  if (L < 1e-5) return null;
  const g = new THREE.BoxGeometry(wide ?? thick, thick, L);
  g.applyMatrix4(M4.compose(V.addVectors(_a, _b).multiplyScalar(0.5), Q.setFromUnitVectors(ZAX, _d.normalize()), SC.set(1, 1, 1)));
  return paint(g, c);
}

/** A gable roof: a triangular prism with its ridge along the local x. */
export function gableRoof(w: number, d: number, hr: number, c: THREE.Color, x: number, y: number, z: number, rot: number) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, hr);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, rot), SC.set(1, 1, 1)));
  return paint(g, c);
}

/** A hipped roof (four slopes). */
export function hipRoof(w: number, d: number, hr: number, c: THREE.Color, x: number, y: number, z: number, rot: number) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  g.scale(w, hr, d);
  g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, rot), SC.set(1, 1, 1)));
  return paint(g, c);
}

// ───────────────────────────── tiled roofs ─────────────────────────────

/** One roof-tile texture repeat covers this much roof (world units): 8 columns × 8 rows of tiles. */
const TILE_U = 0.42;
const TILE_V = 0.5;

/** Flat-shaded triangles with their own uvs and one colour. */
function tris(p: number[], uv: number[], c: THREE.Color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return paint(g, c);
}

/** A slope (triangle or quad as two triangles) with uvs running along its eave and up the slope. */
function slope(pts: THREE.Vector3[], eaveA: THREE.Vector3, eaveB: THREE.Vector3, p: number[], uv: number[]) {
  const along = new THREE.Vector3().subVectors(eaveB, eaveA).normalize();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const v of [a, b, c]) {
      p.push(v.x, v.y, v.z);
      const d = new THREE.Vector3().subVectors(v, eaveA);
      const u = d.dot(along);
      const up = d.sub(along.clone().multiplyScalar(u)).length();
      uv.push(u / TILE_U, up / TILE_V);
    }
  };
  if (pts.length === 3) tri(pts[0], pts[1], pts[2]);
  else {
    tri(pts[0], pts[1], pts[2]);
    tri(pts[0], pts[2], pts[3]);
  }
}

/**
 * A gable roof of tiles: ridge along the local x, slopes facing ±z. The two
 * gable ends are wall (wallW × wallD is the house under it), so they come
 * back separately in the walls' colour.
 */
export function tiledGable(w: number, d: number, hr: number, roofC: THREE.Color, wallC: THREE.Color, wallW: number, wallD: number, x: number, y: number, z: number, rot: number) {
  const P = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
  const p: number[] = [];
  const uv: number[] = [];
  // front slope (+z), back slope (−z), counter-clockwise seen from outside
  slope([P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), P(w / 2, hr, 0), P(-w / 2, hr, 0)], P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), p, uv);
  slope([P(w / 2, 0, -d / 2), P(-w / 2, 0, -d / 2), P(-w / 2, hr, 0), P(w / 2, hr, 0)], P(w / 2, 0, -d / 2), P(-w / 2, 0, -d / 2), p, uv);
  const roof = tris(p, uv, roofC);
  const eh = hr * (wallD / d);
  const e: number[] = [];
  for (const sx of [-1, 1]) {
    const xx = (sx * wallW) / 2;
    if (sx > 0) e.push(xx, 0, wallD / 2, xx, 0, -wallD / 2, xx, eh, 0);
    else e.push(xx, 0, -wallD / 2, xx, 0, wallD / 2, xx, eh, 0);
  }
  const ends = plainUv(tris(e, new Array((e.length / 3) * 2).fill(0), wallC));
  const m = M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, rot), SC.set(1, 1, 1));
  roof.applyMatrix4(m);
  ends.applyMatrix4(m);
  return { roof, ends };
}

/** A hipped roof of tiles (four slopes to one peak). */
export function tiledHip(w: number, d: number, hr: number, c: THREE.Color, x: number, y: number, z: number, rot: number) {
  const P = (a: number, b: number, cc: number) => new THREE.Vector3(a, b, cc);
  const top = P(0, hr, 0);
  const A = P(-w / 2, 0, d / 2);
  const B = P(w / 2, 0, d / 2);
  const Cc = P(w / 2, 0, -d / 2);
  const D = P(-w / 2, 0, -d / 2);
  const p: number[] = [];
  const uv: number[] = [];
  for (const [a, b] of [
    [A, B],
    [B, Cc],
    [Cc, D],
    [D, A],
  ])
    slope([a, b, top], a, b, p, uv);
  const g = tris(p, uv, c);
  g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, rot), SC.set(1, 1, 1)));
  return g;
}

/** Clay or slate tiles in rows, light grey (the roof's colour comes from its vertices). */
function roofTexture(anisotropy: number) {
  const px = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const g = cv.getContext("2d")!;
  let seed = 5;
  const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = 8;
  const s = px / n;
  g.fillStyle = "#7d7d7d";
  g.fillRect(0, 0, px, px);
  for (let row = 0; row < n; row++) {
    const off = row % 2 ? s / 2 : 0;
    for (let col = -1; col < n; col++) {
      const x = col * s + off;
      const y = px - (row + 1) * s;
      const v = 205 + Math.floor((rr() - 0.5) * 34);
      const gr = g.createLinearGradient(0, y, 0, y + s);
      // each tile catches the light at its lower, rounded edge and sits in the shadow of the row above
      gr.addColorStop(0, `rgb(${v - 48},${v - 48},${v - 48})`);
      gr.addColorStop(0.3, `rgb(${v - 8},${v - 8},${v - 8})`);
      gr.addColorStop(0.85, `rgb(${v},${v},${v})`);
      gr.addColorStop(1, `rgb(${v - 62},${v - 62},${v - 62})`);
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(x + 1, y, s - 2, s, [0, 0, s * 0.4, s * 0.4]);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Tileable value noise on a px×px grid with `cells` lattice cells across. */
export function noiseLayer(px: number, cells: number, seed: number) {
  let st = seed;
  const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647);
  const lat = new Float32Array(cells * cells).map(() => rnd());
  const out = new Float32Array(px * px);
  const k = cells / px;
  for (let y = 0; y < px; y++) {
    const fy = y * k;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const r0 = (y0 % cells) * cells;
    const r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < px; x++) {
      const fx = x * k;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const c0 = x0 % cells;
      const c1 = (x0 + 1) % cells;
      const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
      const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
      out[y * px + x] = a + (b - a) * sy;
    }
  }
  return out;
}

// ───────────────────────────── facades ─────────────────────────────

/** Every facade texture holds 4×4 bays; white walls take the building's colour from its vertices. */
const TN = 4;
type BayPainter = (g: CanvasRenderingContext2D, T: number, rr: () => number, ix: number, iy: number) => void;

function facadeTexture(draw: BayPainter, px = 512, ground = "#ffffff", anisotropy = 4, plaster = 0) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const g = cv.getContext("2d")!;
  const T = px / TN;
  g.fillStyle = ground;
  g.fillRect(0, 0, px, px);
  if (plaster > 0) {
    // rendered walls: soft stains and a fine sand grain (stays light, so the wall colour shows true)
    const big = noiseLayer(px, 6, 21);
    const fine = noiseLayer(px, 96, 23);
    // (written, never read back: a canvas readback can stall the GPU for seconds)
    const img = g.createImageData(px, px);
    const d = img.data;
    for (let i = 0; i < px * px; i++) {
      const v = 255 - plaster * (big[i] * 10 + fine[i] * 14);
      d[4 * i] = v;
      d[4 * i + 1] = v - plaster;
      d[4 * i + 2] = v - plaster * 3;
      d[4 * i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  let seed = 11;
  const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let iy = 0; iy < TN; iy++)
    for (let ix = 0; ix < TN; ix++) {
      g.save();
      g.translate(ix * T, iy * T);
      draw(g, T, rr, ix, iy);
      g.restore();
    }
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 4, 4); // a white corner for the parts without windows
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Glass with a soft reflection. */
function pane(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rr: () => number, dark = false) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  const b = dark ? 0.55 + rr() * 0.2 : 0.75 + rr() * 0.2;
  gr.addColorStop(0, `rgb(${(70 * b) | 0},${(100 * b) | 0},${(132 * b) | 0})`);
  gr.addColorStop(0.55, `rgb(${(120 * b) | 0},${(155 * b) | 0},${(190 * b) | 0})`);
  gr.addColorStop(1, `rgb(${(85 * b) | 0},${(115 * b) | 0},${(150 * b) | 0})`);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  if (rr() < 0.18) {
    g.fillStyle = "rgba(255,236,200,0.55)";
    g.fillRect(x, y, w, h);
  }
}

export type FacadeKind = "casa" | "bloc" | "birou" | "sticla" | "hala" | "lemn" | "adobe" | "clasic";

function makeFacades(anisotropy: number): Record<FacadeKind, THREE.CanvasTexture> {
  const tex: Record<FacadeKind, THREE.CanvasTexture> = {
    casa: facadeTexture((g, T, rr, ix) => {
      g.fillStyle = "#e6e1d8";
      g.fillRect(0, T - T * 0.1, T, T * 0.1);
      g.fillStyle = "#d8d2c8";
      g.fillRect(0, 0, T, T * 0.07);
      const x = T * 0.28, y = T * 0.25, w = T * 0.44, h = T * 0.44;
      g.fillStyle = "#f7f5f0";
      g.fillRect(x - 4, y - 4, w + 8, h + 8);
      pane(g, x, y, w, h, rr);
      g.fillStyle = "#f7f5f0";
      g.fillRect(x + w / 2 - 2, y, 4, h);
      g.fillRect(x, y + h / 2 - 2, w, 4);
      g.fillStyle = ix % 2 ? "#5d7a4e" : "#7b5a44";
      g.fillRect(x - 15, y - 2, 10, h + 4);
      g.fillRect(x + w + 5, y - 2, 10, h + 4);
      g.fillStyle = "#cfc8bc";
      g.fillRect(x - 6, y + h + 4, w + 12, 5);
      // shadow under the sill and the lintel
      g.fillStyle = "rgba(60,50,40,0.18)";
      g.fillRect(x - 6, y + h + 9, w + 12, 3);
      g.fillRect(x - 4, y - 7, w + 8, 3);
    }, 512, "#ffffff", anisotropy, 1),
    bloc: facadeTexture((g, T, rr) => {
      g.fillStyle = "#ebe7e1";
      g.fillRect(0, T - 3, T, 3);
      const x = T * 0.2, y = T * 0.22, w = T * 0.6, h = T * 0.5;
      pane(g, x, y, w, h, rr, true);
      g.fillStyle = "#f4f2ee";
      g.fillRect(x + w * 0.5 - 1.5, y, 3, h);
      g.fillStyle = "#d3cec6";
      g.fillRect(x - 4, y + h, w + 8, 5);
    }, 512, "#ffffff", anisotropy),
    birou: facadeTexture((g, T, rr) => {
      g.fillStyle = "#f1f1ef";
      g.fillRect(0, T * 0.62, T, T * 0.38);
      pane(g, 0, 0, T, T * 0.62, rr, true);
      g.fillStyle = "rgba(235,240,245,0.85)";
      for (let k = 0; k <= 4; k++) g.fillRect((k * T) / 4 - 1.5, 0, 3, T * 0.62);
      g.fillStyle = "#c9ccd0";
      g.fillRect(0, T * 0.62, T, 3);
    }, 512, "#ffffff", anisotropy),
    sticla: facadeTexture((g, T, rr) => {
      for (let k = 0; k < 4; k++) {
        const v = 0.72 + rr() * 0.28;
        const gr = g.createLinearGradient(0, 0, T / 4, T);
        gr.addColorStop(0, `rgb(${(215 * v) | 0},${(228 * v) | 0},${(240 * v) | 0})`);
        gr.addColorStop(1, `rgb(${(165 * v) | 0},${(185 * v) | 0},${(210 * v) | 0})`);
        g.fillStyle = gr;
        g.fillRect((k * T) / 4, 0, T / 4, T);
      }
      g.fillStyle = "rgba(255,255,255,0.9)";
      for (let k = 0; k <= 4; k++) g.fillRect((k * T) / 4 - 1, 0, 2, T);
      g.fillRect(0, 0, T, 4);
    }, 512, "#ffffff", anisotropy),
    hala: facadeTexture((g, T) => {
      for (let k = 0; k < T; k += 8) {
        g.fillStyle = "#e3e6ea";
        g.fillRect(k, 0, 3, T);
      }
      g.fillStyle = "#cfd3d8";
      g.fillRect(0, T * 0.9, T, T * 0.1);
    }, 512, "#ffffff", anisotropy),
    lemn: facadeTexture((g, T, rr, ix) => {
      g.fillStyle = "#8a5a36";
      g.fillRect(0, 0, T, T);
      for (let y = 0; y < T; y += 10) {
        g.fillStyle = y % 20 ? "#7b4f2e" : "#94633d";
        g.fillRect(0, y, T, 8);
        g.fillStyle = "#5a3820";
        g.fillRect(0, y + 8, T, 2);
      }
      const x = T * 0.3, y = T * 0.26, w = T * 0.4, h = T * 0.42;
      g.fillStyle = "#f4efe4";
      g.fillRect(x - 5, y - 5, w + 10, h + 10);
      pane(g, x, y, w, h, rr);
      g.fillStyle = "#f4efe4";
      g.fillRect(x + w / 2 - 2, y, 4, h);
      g.fillRect(x, y + h / 2 - 2, w, 4);
      g.fillStyle = ix % 2 ? "#c0392b" : "#d35400";
      g.fillRect(x - 6, y + h + 6, w + 12, 7);
    }, 512, "#8a5a36", anisotropy),
    adobe: facadeTexture((g, T, rr, ix, iy) => {
      g.fillStyle = "rgba(0,0,0,0.05)";
      for (let k = 0; k < 9; k++) g.fillRect(rr() * T, rr() * T, 6 + rr() * 14, 3 + rr() * 6);
      const x = T * 0.36, y = T * 0.3, w = T * 0.28, h = T * 0.3;
      g.fillStyle = "#3e8f8a";
      g.fillRect(x - 4, y - 4, w + 8, h + 8);
      pane(g, x, y, w, h, rr, true);
      if (ix === 1 && iy === 3) {
        g.fillStyle = "#6b4a2e";
        g.fillRect(T * 0.32, T * 0.35, T * 0.36, T * 0.65);
      }
    }, 512, "#ffffff", anisotropy),
    clasic: facadeTexture((g, T, rr) => {
      g.fillStyle = "#e9e3d6";
      g.fillRect(0, 0, 10, T);
      g.fillRect(T - 10, 0, 10, T);
      g.fillStyle = "#ded6c6";
      g.fillRect(0, T - 8, T, 8);
      const x = T * 0.3, y = T * 0.3, w = T * 0.4, h = T * 0.5;
      g.save();
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x, y + w / 2);
      g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      g.lineTo(x + w, y + h);
      g.closePath();
      g.clip();
      pane(g, x, y, w, h, rr, true);
      g.restore();
      g.strokeStyle = "#d9cfbb";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x - 3, y + h);
      g.lineTo(x - 3, y + w / 2);
      g.arc(x + w / 2, y + w / 2, w / 2 + 3, Math.PI, 0);
      g.lineTo(x + w + 3, y + h);
      g.stroke();
    }, 512, "#ffffff", anisotropy),
  };
  // a diagonal reflection across the glass
  const cv = tex.sticla.image as HTMLCanvasElement;
  const g = cv.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, cv.width, cv.height);
  gr.addColorStop(0.0, "rgba(255,255,255,0)");
  gr.addColorStop(0.42, "rgba(255,255,255,0)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.35)");
  gr.addColorStop(0.58, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 4, 4);
  tex.sticla.needsUpdate = true;
  return tex;
}

/** Bay width and storey height of each facade, in world units. */
const BAYS: Record<FacadeKind, [number, number]> = { casa: [0.55, 0.32], bloc: [0.6, 0.62], birou: [0.6, 0.62], sticla: [0.5, 0.85], hala: [0.4, 2.0], lemn: [0.5, 0.33], adobe: [0.5, 0.34], clasic: [0.6, 0.55] };

/** A box with the facade's bays mapped on its walls (roof and floor on the white corner). */
export function facade(kind: FacadeKind, w: number, h: number, d: number, c: THREE.Color, x: number, y: number, z: number, rot: number, storey: number | null = null) {
  const [tu, tv0] = BAYS[kind];
  const tv = storey || tv0;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nu = Math.max(1, Math.round(w / tu));
  const nd = Math.max(1, Math.round(d / tu));
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nor.getY(i)) > 0.5) {
      uv.setXY(i, 0.003, 0.997);
      continue;
    }
    const run = Math.abs(nor.getX(i)) > 0.5 ? ((pos.getZ(i) + d / 2) / d) * nd : ((pos.getX(i) + w / 2) / w) * nu;
    uv.setXY(i, run / TN, (pos.getY(i) - 0.6) / tv / TN);
  }
  g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, rot), SC.set(1, 1, 1)));
  return paint(g, c);
}

// ───────────────────────────── locked land ─────────────────────────────

/**
 * Locked districts and territories fade into a blue-grey haze. A small
 * texture over the whole map says how locked each spot is (soft at the
 * borders); every material of the map reads it at its world position.
 */
export const LOCK = {
  map: null as THREE.Texture | null,
  uniforms: {
    uLockMap: { value: null as THREE.Texture | null },
    uLockOn: { value: 0 },
    uLockSize: { value: new THREE.Vector2(1, 1) },
    uLockCol: { value: new THREE.Color("#a9b8c6") },
  },
};

/** Lets a material fade under the locked-land haze (programs are shared between materials of a kind). */
export function hazed<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LOCK.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLockUv;\nuniform vec2 uLockSize;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vec4 lkW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
lkW = instanceMatrix * lkW;
#endif
lkW = modelMatrix * lkW;
vLockUv = vec2(lkW.x / uLockSize.x + 0.5, lkW.z / uLockSize.y + 0.5);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLockUv;\nuniform sampler2D uLockMap;\nuniform float uLockOn;\nuniform vec3 uLockCol;")
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
{
  float lk = texture2D(uLockMap, vLockUv).r * uLockOn;
  if (lk > 0.003) {
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l), 0.7 * lk);
    gl_FragColor.rgb = mix(c, uLockCol * (0.55 + 0.45 * l), 0.5 * lk);
  }
}`,
      );
  };
  m.customProgramCacheKey = () => "hazed";
  return m;
}

/** Turns a mesh's materials (and its children's) into hazed ones. */
export function hazeAll(o: THREE.Object3D) {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (!m.userData.hazed) {
      hazed(m);
      m.userData.hazed = true;
    }
  });
}

// ───────────────────────────── shared materials ─────────────────────────────

export interface MapMaterials {
  facades: Record<FacadeKind, THREE.CanvasTexture>;
  byKind: Record<FacadeKind | "plain" | "metal" | "roof", THREE.MeshStandardMaterial>;
  leaves: THREE.MeshStandardMaterial;
  car: THREE.MeshStandardMaterial;
}

export function mapMaterials(anisotropy: number): MapMaterials {
  const facades = makeFacades(anisotropy);
  const std = (p: THREE.MeshStandardMaterialParameters) => hazed(new THREE.MeshStandardMaterial({ vertexColors: true, ...p }));
  return {
    facades,
    byKind: {
      casa: std({ map: facades.casa, roughness: 0.85, envMapIntensity: 0.6 }),
      bloc: std({ map: facades.bloc, roughness: 0.7, envMapIntensity: 0.7 }),
      birou: std({ map: facades.birou, roughness: 0.45, metalness: 0.15, envMapIntensity: 1.0 }),
      sticla: std({ map: facades.sticla, roughness: 0.12, metalness: 0.55, envMapIntensity: 1.4 }),
      hala: std({ map: facades.hala, roughness: 0.75, envMapIntensity: 0.6 }),
      lemn: std({ map: facades.lemn, roughness: 0.85, envMapIntensity: 0.5 }),
      adobe: std({ map: facades.adobe, roughness: 0.92, envMapIntensity: 0.5 }),
      clasic: std({ map: facades.clasic, roughness: 0.6, envMapIntensity: 0.7 }),
      plain: std({ roughness: 0.78, metalness: 0.02, envMapIntensity: 0.6 }),
      metal: std({ roughness: 0.32, metalness: 0.55, envMapIntensity: 1.1 }),
      roof: std({ map: roofTexture(anisotropy), roughness: 0.78, envMapIntensity: 0.6, side: THREE.DoubleSide }),
    },
    leaves: std({ roughness: 0.86, envMapIntensity: 0.45 }),
    car: std({ roughness: 0.35, metalness: 0.35, envMapIntensity: 1.0 }),
  };
}

/** A small deterministic random sequence. */
export function rnd(seed: number) {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
