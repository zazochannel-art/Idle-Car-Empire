// The island map's ground: heights on a regular grid (public/world/heights.bin),
// six terrain tiles with their painted textures, the sea with slow waves and
// the sea floor beyond the map. Heights are in metres; the scene draws them
// 1.5× taller than life (EXAG) so the relief reads from far away.
import * as THREE from "three";
import { hazed, noiseLayer } from "./kit";

export const EXAG = 1.5;
/** Terrain tiles across and down (one 2048 px texture each). */
export const NTX = 3;
export const NTY = 2;

export interface WorldJson {
  grid: [number, number];
  /** Canvas the map was drawn on (px). */
  panza: [number, number];
  size: [number, number];
  cladiri: Building[];
  copaci: number[][];
  tufe: number[][];
  parcate: number[][];
  props: Record<string, (number[] | Record<string, number[]>)[]>;
  vii: { c: [number, number]; w: number; h: number; a: number; dir: number }[];
  drumuri: {
    noduri: { id: string; p: [number, number]; tip: string; o: number; raza?: number }[];
    muchii: RoadData[];
    parcari: { c: [number, number]; t: [number, number]; L: number; W: number; o: number }[];
  };
  /** The railway, the runway's ends and the ships' berths, on maps made after the first (rail-line.ts holds the first map's). */
  linie?: [number, number][];
  pista?: { a: [number, number]; b: [number, number] };
  cheiuri?: [number, number][];
}

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  r: number;
  h: number;
  k: string;
  c: string;
  ds?: string;
  v?: number;
  s: number;
  o?: number;
  alee?: number;
}

export interface RoadData {
  a: number;
  b: number;
  nume: string;
  l: number;
  u: boolean;
  inel: boolean;
  o: number;
  urb: number;
  p: [number, number][];
  pod: [number, number, number][];
  podet: [number, number][];
}

export class Ground {
  readonly GW: number;
  readonly GH: number;
  readonly SX: number;
  readonly SZ: number;
  /** Metres above sea level on the grid. */
  readonly m: Float32Array;
  private normals: Float32Array;

  constructor(data: WorldJson, raw: ArrayBuffer) {
    [this.GW, this.GH] = data.grid;
    [this.SX, this.SZ] = data.size;
    const u16 = new Uint16Array(raw);
    this.m = new Float32Array(this.GW * this.GH);
    for (let i = 0; i < this.m.length; i++) this.m[i] = u16[i] / 10 - 40;
    this.normals = new Float32Array(this.GW * this.GH * 3);
    this.computeNormals();
  }

  /** Normals from the whole grid, so the tiles meet without seams. */
  private computeNormals() {
    const { GW, GH, m } = this;
    const du = this.SX / (GW - 1);
    const dv = this.SZ / (GH - 1);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const il = Math.max(0, i - 1), ir = Math.min(GW - 1, i + 1), ju = Math.max(0, j - 1), jd = Math.min(GH - 1, j + 1);
        const dx = ((m[j * GW + ir] - m[j * GW + il]) / 10) * EXAG / ((ir - il) * du);
        const dz = ((m[jd * GW + i] - m[ju * GW + i]) / 10) * EXAG / ((jd - ju) * dv);
        const n = Math.hypot(dx, 1, dz);
        const k = 3 * (j * GW + i);
        this.normals[k] = -dx / n;
        this.normals[k + 1] = 1 / n;
        this.normals[k + 2] = -dz / n;
      }
  }

  /**
   * Levels the ground under lots that were placed after the map was made (the
   * landmark works): flat at `h` metres over each, easing back to the land
   * within `margin` units round it. Call before the terrain is built.
   */
  level(lots: { x: number; y: number; w: number; d: number; rot: number; h: number }[], margin = 1.5) {
    const { GW, GH, m } = this;
    for (const l of lots) {
      const c = Math.cos(l.rot);
      const s = Math.sin(l.rot);
      const R = Math.hypot(l.w, l.d) / 2 + margin;
      const i0 = Math.max(0, Math.floor(((l.x - R) / this.SX + 0.5) * (GW - 1)));
      const i1 = Math.min(GW - 1, Math.ceil(((l.x + R) / this.SX + 0.5) * (GW - 1)));
      const j0 = Math.max(0, Math.floor(((l.y - R) / this.SZ + 0.5) * (GH - 1)));
      const j1 = Math.min(GH - 1, Math.ceil(((l.y + R) / this.SZ + 0.5) * (GH - 1)));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = (i / (GW - 1) - 0.5) * this.SX;
          const z = (j / (GH - 1) - 0.5) * this.SZ;
          // how far outside the lot (0 inside), in its own frame
          const u = Math.abs((x - l.x) * c - (z - l.y) * s) - l.w / 2;
          const v = Math.abs((x - l.x) * s + (z - l.y) * c) - l.d / 2;
          const out = Math.hypot(Math.max(0, u), Math.max(0, v));
          if (out >= margin) continue;
          const k = out <= 0 ? 1 : 1 - out / margin;
          const e = k * k * (3 - 2 * k);
          m[j * GW + i] += (l.h - m[j * GW + i]) * e;
        }
    }
    this.computeNormals();
  }

  /** Metres at a world point (bilinear). */
  metres(x: number, z: number): number {
    const { GW, GH, m } = this;
    const gx = Math.min(GW - 1, Math.max(0, (x / this.SX + 0.5) * (GW - 1)));
    const gy = Math.min(GH - 1, Math.max(0, (z / this.SZ + 0.5) * (GH - 1)));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(GW - 1, x0 + 1), y1 = Math.min(GH - 1, y0 + 1);
    const fx = gx - x0, fy = gy - y0;
    const a = m[y0 * GW + x0], b = m[y0 * GW + x1], c = m[y1 * GW + x0], d = m[y1 * GW + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /** Ground height in scene units (never below the sea surface). */
  at(x: number, z: number): number {
    return (Math.max(this.metres(x, z), 0.3) / 10) * EXAG;
  }

  /** The sea floor too (bridge piers). */
  floor(x: number, z: number): number {
    return (this.metres(x, z) / 10) * EXAG;
  }

  /** A piece of the grid: columns i0..i0+ni, rows j0..j0+nj. */
  tile(i0: number, j0: number, ni: number, nj: number, mat: THREE.Material): THREE.Mesh {
    const du = this.SX / (this.GW - 1), dv = this.SZ / (this.GH - 1);
    const w = ni * du, d = nj * dv;
    const g = new THREE.PlaneGeometry(w, d, ni, nj);
    g.rotateX(-Math.PI / 2);
    g.translate(-this.SX / 2 + i0 * du + w / 2, 0, -this.SZ / 2 + j0 * dv + d / 2);
    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let j = 0; j <= nj; j++)
      for (let i = 0; i <= ni; i++) {
        const v = j * (ni + 1) + i, k = (j0 + j) * this.GW + (i0 + i);
        pos.setY(v, (this.m[k] / 10) * EXAG);
        nor.setXYZ(v, this.normals[3 * k], this.normals[3 * k + 1], this.normals[3 * k + 2]);
      }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return new THREE.Mesh(g, mat);
  }
}

/** A normal map of gentle crossing waves (tiles across the sea). */
function waveTexture(px = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(px, px);
  const W = [[3, 1, 0.9, 0.3], [1, 4, 0.7, 1.7], [5, -2, 0.45, 2.2], [-3, 5, 0.35, 0.8], [7, 3, 0.25, 4.1], [-6, -7, 0.18, 5.3]];
  const n = new THREE.Vector3();
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      let dx = 0, dy = 0;
      for (const [a, b, amp, ph] of W) {
        const k = (2 * Math.PI) / px, c = Math.cos((a * x + b * y) * k + ph) * amp;
        dx += a * c;
        dy += b * c;
      }
      n.set(-dx * 0.06, -dy * 0.06, 1).normalize();
      const i = (y * px + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(118, 118);
  return t;
}

/**
 * Ground detail at close range, tiling in world space: R is grass (blades
 * and clumps), G a medium mottle, B large patches. Data, not colour.
 */
function detailTexture(px = 256) {
  let seed = 41;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blades = new Float32Array(px * px).fill(0);
  // thousands of short strokes, mostly upright, light and dark, wrapping round the edges
  for (let i = 0; i < 9000; i++) {
    let x = rnd() * px;
    let y = rnd() * px;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.1;
    const len = 2 + rnd() * 5;
    const v = (rnd() - 0.45) * 1.3;
    for (let k = 0; k < len; k++) {
      const xi = ((Math.round(x) % px) + px) % px;
      const yi = ((Math.round(y) % px) + px) % px;
      blades[yi * px + xi] += v * (1 - k / len);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  const clumps = noiseLayer(px, 24, 43);
  const mottle = noiseLayer(px, 8, 47);
  const mottle2 = noiseLayer(px, 16, 51);
  const patches = noiseLayer(px, 3, 53);
  const data = new Uint8Array(px * px * 4);
  for (let i = 0; i < px * px; i++) {
    const r = 0.5 + blades[i] * 0.6 + (clumps[i] - 0.5) * 0.45;
    data[4 * i] = Math.max(0, Math.min(255, r * 255));
    data[4 * i + 1] = Math.max(0, Math.min(255, (mottle[i] * 0.65 + mottle2[i] * 0.35) * 255));
    data[4 * i + 2] = Math.max(0, Math.min(255, patches[i] * 255));
    data[4 * i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, px, px, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Adds the close-range ground detail to a (hazed) terrain material: grass
 * gets blades, clumps and drier or lusher patches; sand, rock and paving a
 * finer grain. Far away the detail averages out to the painted colour.
 */
function withDetail(m: THREE.MeshStandardMaterial, detail: THREE.Texture) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vDetXZ;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvDetXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vDetXZ;\nuniform sampler2D uDetail;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  vec3 c0 = diffuseColor.rgb;
  // one repeat: 3 units of blades, 8 of clumps, 26 of mottle, 130 of drier and lusher patches
  float fine = texture2D(uDetail, vDetXZ * 0.333).r;
  float fine2 = texture2D(uDetail, vDetXZ * 0.125 + vec2(0.37, 0.11)).r;
  float mid = texture2D(uDetail, vDetXZ * 0.0385 + vec2(0.13, 0.71)).g;
  float big = texture2D(uDetail, vDetXZ * 0.0077).b;
  float green = clamp((c0.g - max(c0.r, c0.b)) * 8.0, 0.0, 1.0);
  // a little richer than the painted pastel, then blades (dark gaps, light tips) and clumps
  float luma = dot(c0, vec3(0.299, 0.587, 0.114));
  vec3 rich = mix(vec3(luma), c0, 1.18) * 0.9;
  vec3 grass = rich * (0.5 + 0.42 * fine + 0.3 * fine2) * (0.84 + 0.32 * mid);
  grass *= mix(vec3(0.84, 0.97, 0.82), vec3(1.12, 1.04, 0.78), smoothstep(0.25, 0.8, big));
  vec3 other = c0 * (0.9 + 0.12 * fine2 + 0.08 * mid);
  diffuseColor.rgb = mix(other, grass, green);
  // the towns' paving (the map's pale grey: squares, yards, lots) is laid in slabs a quarter of a
  // unit across, each a shade of its own, with joints and the grime of use, a little warmer and
  // less bright than the paint, which read as white patches; far off, where a slab is a few
  // pixels, it evens out (fwidth) instead of shimmering
  float sat = max(c0.r, max(c0.g, c0.b)) - min(c0.r, min(c0.g, c0.b));
  float pave = (1.0 - smoothstep(0.035, 0.07, sat)) * smoothstep(0.38, 0.46, luma) * (1.0 - smoothstep(0.74, 0.82, luma));
  if (pave > 0.0) {
    vec2 q = vDetXZ * 4.0;
    vec2 f = fract(q);
    vec2 w = fwidth(q);
    vec2 edge = smoothstep(vec2(0.045) - w, vec2(0.045) + w, min(f, 1.0 - f));
    float joint = 1.0 - edge.x * edge.y;
    float h = fract(sin(dot(floor(q), vec2(127.1, 311.7))) * 43758.5453);
    float worn = (0.86 + 0.2 * mid) * (0.92 + 0.12 * big);
    vec3 laid = c0 * vec3(0.85, 0.83, 0.79) * worn;
    vec3 slabs = laid * (0.9 + 0.13 * h) * (0.93 + 0.1 * fine2) * (1.0 - 0.3 * joint);
    float far = smoothstep(0.12, 0.35, max(w.x, w.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(slabs, laid * 0.96, far), pave);
  }
}`,
      );
  };
  m.customProgramCacheKey = () => "hazed-detail";
  return m;
}

export interface TerrainParts {
  tiles: THREE.Mesh[];
  sea: THREE.Mesh;
  floor: THREE.Mesh;
  waves: THREE.Texture;
  /** The sea's clock (seconds): the foam laps the shore by it. */
  seaTime: { value: number };
}

/** How many grid cells out from the land the sea shades from shallows to deep. */
const SHORE_CELLS = 10;
/**
 * How far every spot of the sea is from the coast, as a texture (0 = land or the waterline, 1 = ten
 * cells out and beyond). The heights drop off a cliff at the coast, so the distance, not the depth, tells the shallows.
 */
function shoreTexture(ground: Ground) {
  const { GW, GH, m } = ground;
  const dist = new Float32Array(GW * GH);
  for (let i = 0; i < dist.length; i++) dist[i] = m[i] >= 0.33 ? 0 : 1e4;
  // two sweeps of a chamfer distance (1 for a side, √2 for a corner)
  const R = Math.SQRT2;
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      let v = dist[k];
      if (i > 0) v = Math.min(v, dist[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, dist[k - GW] + 1);
        if (i > 0) v = Math.min(v, dist[k - GW - 1] + R);
        if (i < GW - 1) v = Math.min(v, dist[k - GW + 1] + R);
      }
      dist[k] = v;
    }
  for (let j = GH - 1; j >= 0; j--)
    for (let i = GW - 1; i >= 0; i--) {
      const k = j * GW + i;
      let v = dist[k];
      if (i < GW - 1) v = Math.min(v, dist[k + 1] + 1);
      if (j < GH - 1) {
        v = Math.min(v, dist[k + GW] + 1);
        if (i < GW - 1) v = Math.min(v, dist[k + GW + 1] + R);
        if (i > 0) v = Math.min(v, dist[k + GW - 1] + R);
      }
      dist[k] = v;
    }
  const d = new Uint8Array(GW * GH);
  for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.min(1, dist[i] / SHORE_CELLS) * 255);
  const t = new THREE.DataTexture(d, GW, GH, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * The sea reads its own distance from the coast: clear turquoise shallows over the sand, deeper blue beyond, and foam
 * that laps the shore in slow rings. One more texture read on one plane; no extra draw.
 */
function withShore(m: THREE.MeshStandardMaterial, ground: Ground, time: { value: number }) {
  const shore = shoreTexture(ground);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uShore = { value: shore };
    sh.uniforms.uSeaSize = { value: new THREE.Vector2(ground.SX, ground.SZ) };
    sh.uniforms.uSeaTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSeaXZ;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSeaXZ;\nuniform sampler2D uShore;\nuniform vec2 uSeaSize;\nuniform float uSeaTime;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec2 suv = vSeaXZ / uSeaSize + 0.5;
  float inMap = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float d = mix(1.0, texture2D(uShore, suv).r, inMap);
  // the shallows: turquoise and clear, so the sand shows through; deeper water takes the blue
  float shal = 1.0 - smoothstep(0.08, 0.85, d);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.62, 0.62), shal * 0.75);
  diffuseColor.a = mix(diffuseColor.a, 0.3, shal);
  // foam: a ragged line at the water's edge and slow rings that run in and fade
  float rag = 0.5 + 0.5 * sin(vSeaXZ.x * 2.7 + uSeaTime * 0.6) * sin(vSeaXZ.y * 3.3 - uSeaTime * 0.45);
  float edge = 1.0 - smoothstep(0.04, 0.2 + 0.1 * rag, d);
  float ring = smoothstep(0.5, 1.0, sin(d * 30.0 - uSeaTime * 1.0 + rag * 1.8)) * (1.0 - smoothstep(0.25, 0.7, d)) * smoothstep(0.12, 0.3, d);
  float foam = clamp(edge * 0.95 + ring * 0.5, 0.0, 1.0) * inMap;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.96, 1.0), foam);
  diffuseColor.a = max(diffuseColor.a, foam * 0.9);
}`,
      );
  };
  m.customProgramCacheKey = () => "sea-shore";
  return m;
}

/** The six tiles (their textures load in the background), the sea and the floor beyond. */
export function buildTerrain(ground: Ground, textures: THREE.Texture[]): TerrainParts {
  const tiles: THREE.Mesh[] = [];
  const segX = (ground.GW - 1) / NTX, segY = (ground.GH - 1) / NTY;
  const detail = detailTexture();
  for (let ty = 0; ty < NTY; ty++)
    for (let tx = 0; tx < NTX; tx++) {
      const mat = withDetail(hazed(new THREE.MeshStandardMaterial({ map: textures[ty * NTX + tx], roughness: 0.92, metalness: 0, envMapIntensity: 0.45 })), detail);
      const m = ground.tile(tx * segX, ty * segY, segX, segY, mat);
      m.receiveShadow = true;
      m.castShadow = true;
      m.name = `terrain-${tx}-${ty}`;
      tiles.push(m);
    }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: "#1b5ea4", roughness: 0.92, envMapIntensity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.2 * EXAG - 0.05;
  const waves = waveTexture();
  const seaTime = { value: 0 };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    withShore(new THREE.MeshStandardMaterial({ color: "#3a9be0", transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0, normalMap: waves, normalScale: new THREE.Vector2(0.38, 0.38), envMapIntensity: 1.25 }), ground, seaTime),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.05;
  sea.receiveShadow = true;
  return { tiles, sea, floor, waves, seaTime };
}
