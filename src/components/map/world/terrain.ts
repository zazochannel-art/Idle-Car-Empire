// The island map's ground: heights on a regular grid (public/world/heights.bin),
// six terrain tiles with their painted textures, the sea with slow waves and
// the sea floor beyond the map. Heights are in metres; the scene draws them
// 1.5× taller than life (EXAG) so the relief reads from far away.
import * as THREE from "three";
import { hazed } from "./kit";

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
    // normals from the whole grid, so the tiles meet without seams
    const { GW, GH, m } = this;
    const du = this.SX / (GW - 1);
    const dv = this.SZ / (GH - 1);
    this.normals = new Float32Array(GW * GH * 3);
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

export interface TerrainParts {
  tiles: THREE.Mesh[];
  sea: THREE.Mesh;
  floor: THREE.Mesh;
  waves: THREE.Texture;
}

/** The six tiles (their textures load in the background), the sea and the floor beyond. */
export function buildTerrain(ground: Ground, textures: THREE.Texture[]): TerrainParts {
  const tiles: THREE.Mesh[] = [];
  const segX = (ground.GW - 1) / NTX, segY = (ground.GH - 1) / NTY;
  for (let ty = 0; ty < NTY; ty++)
    for (let tx = 0; tx < NTX; tx++) {
      const mat = hazed(new THREE.MeshStandardMaterial({ map: textures[ty * NTX + tx], roughness: 0.92, metalness: 0, envMapIntensity: 0.45 }));
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
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ color: "#3a9be0", transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0, normalMap: waves, normalScale: new THREE.Vector2(0.38, 0.38), envMapIntensity: 1.25 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.05;
  sea.receiveShadow = true;
  return { tiles, sea, floor, waves };
}
