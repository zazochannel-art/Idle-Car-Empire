// The island's roads in 3D, laid over the painted ground: asphalt with grain
// and worn patches, white edge lines and dashed centre lines (a double
// yellow line on the highway), zebra crossings at the town junctions, and
// raised kerbs with paved sidewalks along the town streets. Everything is
// draped over the terrain and merged into a few meshes per terrain tile;
// bridges keep their own decks (scenery.ts).
import * as THREE from "three";
import { hazed, noiseLayer } from "./kit";
import { ROAD_LIFT, pointOn, type MapRoad } from "./scenery";
import { NTX, NTY, type Ground, type WorldJson } from "./terrain";

/** Markings and kerbs sit this far over the asphalt. */
const MARK_LIFT = ROAD_LIFT + 0.007;
const KERB_H = 0.035;
const WALK = 0.17;
const KERB = 0.035;
/** Highway markings are yellow; everything else white. */
const WHITE = new THREE.Color("#f3f3ee");
const YELLOW = new THREE.Color("#f2c12e");

/** One strip of quads along a road, with its own vertex colour. */
class Strip {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Adds a ribbon through rows of vertices (each row: [x, y, z][] across the road). */
  ribbon(rows: [number, number, number][][], ground: Ground, c: THREE.Color, uvScale: number) {
    if (rows.length < 2) return;
    const base = this.pos.length / 3;
    const n = rows[0].length;
    for (const row of rows)
      for (const [x, y, z] of row) {
        this.pos.push(x, y, z);
        const [nx, ny, nz] = groundNormal(ground, x, z);
        this.nor.push(nx, ny, nz);
        this.uv.push(x * uvScale, z * uvScale);
        this.col.push(c.r, c.g, c.b);
      }
    for (let i = 0; i < rows.length - 1; i++)
      for (let j = 0; j < n - 1; j++) {
        const a = base + i * n + j;
        const b = a + n;
        // counter-clockwise seen from above (rows run along the road, columns left to right)
        this.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }

  /** A flat fan (junction and road-end pads). */
  disc(cx: number, cz: number, r: number, ground: Ground, lift: number, c: THREE.Color, uvScale: number, seg = 20) {
    const base = this.pos.length / 3;
    const put = (x: number, z: number) => {
      this.pos.push(x, ground.at(x, z) + lift, z);
      const [nx, ny, nz] = groundNormal(ground, x, z);
      this.nor.push(nx, ny, nz);
      this.uv.push(x * uvScale, z * uvScale);
      this.col.push(c.r, c.g, c.b);
    };
    put(cx, cz);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      put(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
    for (let k = 0; k < seg; k++) this.idx.push(base, base + 2 + k, base + 1 + k);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** The terrain's normal at a point (the same everywhere it is asked, so overlapping pieces shade alike). */
function groundNormal(g: Ground, x: number, z: number): [number, number, number] {
  const e = 0.25;
  const dx = (g.at(x + e, z) - g.at(x - e, z)) / (2 * e);
  const dz = (g.at(x, z + e) - g.at(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  return [-dx / l, 1 / l, -dz / l];
}

function canvasTexture(px: number, draw: (g: CanvasRenderingContext2D, px: number) => void, aniso: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  draw(cv.getContext("2d")!, px);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Asphalt: fine grain, darker patched and worn areas, a few sealed cracks (all computed, tiling). */
function asphaltTexture(aniso: number) {
  return canvasTexture(
    512,
    (g, px) => {
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const big = noiseLayer(px, 4, 3);
      const mid = noiseLayer(px, 12, 5);
      const fine = noiseLayer(px, 64, 9);
      const img = g.createImageData(px, px);
      const d = img.data;
      for (let i = 0; i < px * px; i++) {
        // worn (lighter) and patched (darker) areas, then the stones of the grain
        const wear = (big[i] - 0.5) * 18 + (mid[i] - 0.5) * 12;
        const patch = mid[i] > 0.78 ? -14 : 0;
        const grain = (fine[i] - 0.5) * 10 + (rnd() - 0.5) * 20 + (rnd() < 0.035 ? 24 : 0) - (rnd() < 0.04 ? 16 : 0);
        const v = 90 + wear + patch + grain;
        d[4 * i] = Math.max(0, Math.min(255, v));
        d[4 * i + 1] = Math.max(0, Math.min(255, v + 5));
        d[4 * i + 2] = Math.max(0, Math.min(255, v + 12));
        d[4 * i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // sealed cracks
      g.strokeStyle = "rgba(25,27,31,0.45)";
      g.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) {
        let x = 30 + rnd() * (px - 60);
        let y = 30 + rnd() * (px - 60);
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (rnd() - 0.5) * 30;
          y += (rnd() - 0.5) * 30;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    },
    aniso,
  );
}

/** Pavement slabs. */
function pavingTexture(aniso: number) {
  return canvasTexture(
    256,
    (g, px) => {
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const n = 8;
      const s = px / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = 200 + Math.floor((rnd() - 0.5) * 14);
          g.fillStyle = `rgb(${v},${v - 5},${v - 14})`;
          g.fillRect(i * s, j * s, s, s);
        }
      g.strokeStyle = "rgba(120,112,100,0.55)";
      g.lineWidth = 1.5;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, px);
        g.moveTo(0, i * s);
        g.lineTo(px, i * s);
        g.stroke();
      }
    },
    aniso,
  );
}

interface NodeInfo {
  x: number;
  z: number;
  deg: number;
  /** Widest road meeting here. */
  wmax: number;
  /** On the roundabout's ring. */
  ring: boolean;
}

export interface RoadMeshes {
  root: THREE.Group;
  /** Lines and crossings: hidden from far away, where they would only shimmer. */
  markings: THREE.Group;
}

export function buildRoads(data: WorldJson, ground: Ground, roads: MapRoad[], aniso: number): RoadMeshes {
  const nodes: NodeInfo[] = data.drumuri.noduri.map((n) => ({ x: n.p[0], z: n.p[1], deg: 0, wmax: 0, ring: false }));
  for (const r of roads)
    for (const k of [r.a, r.b]) {
      nodes[k].deg++;
      nodes[k].wmax = Math.max(nodes[k].wmax, r.l);
      if (r.ring) nodes[k].ring = true;
    }

  const tiles = NTX * NTY;
  const asphalt = Array.from({ length: tiles }, () => new Strip());
  const marks = Array.from({ length: tiles }, () => new Strip());
  const walks = Array.from({ length: tiles }, () => new Strip());
  const tileOf = (x: number, z: number) => {
    const tx = Math.min(NTX - 1, Math.max(0, Math.floor((x / ground.SX + 0.5) * NTX)));
    const tz = Math.min(NTY - 1, Math.max(0, Math.floor((z / ground.SZ + 0.5) * NTY)));
    return tz * NTX + tx;
  };
  const o = { x: 0, z: 0, tx: 0, tz: 0 };
  const ASPH_UV = 1 / 4;
  const WALK_UV = 1;

  /** The parts of [s0, s1] that are not on a bridge deck. */
  const offDeck = (r: MapRoad, s0: number, s1: number): [number, number][] => {
    let parts: [number, number][] = [[s0, s1]];
    for (const [d0, d1] of r.decks)
      parts = parts.flatMap(([a, b]) => {
        if (d1 <= a || d0 >= b) return [[a, b]] as [number, number][];
        const out: [number, number][] = [];
        if (d0 > a) out.push([a, d0]);
        if (d1 < b) out.push([d1, b]);
        return out;
      });
    return parts.filter(([a, b]) => b - a > 0.05);
  };

  /** Distances along [a, b] to sample: every road point, plus both ends. */
  const samples = (r: MapRoad, a: number, b: number, step = 0) => {
    const ss = [a];
    if (step > 0) for (let s = a + step; s < b - 1e-3; s += step) ss.push(s);
    else for (const c of r.cum) if (c > a + 1e-3 && c < b - 1e-3) ss.push(c);
    ss.push(b);
    return ss;
  };

  /** A band across the road between offsets u0..u1 (from the centre line, to the right), lifted by `lift`. */
  const band = (r: MapRoad, a: number, b: number, u0: number, u1: number, lift: number, cols = 2, step = 0) => {
    const rows: [number, number, number][][] = [];
    for (const s of samples(r, a, b, step)) {
      pointOn(r, s, o);
      const nx = -o.tz;
      const nz = o.tx;
      const row: [number, number, number][] = [];
      for (let k = 0; k < cols; k++) {
        const u = u0 + ((u1 - u0) * k) / (cols - 1);
        const x = o.x + nx * u;
        const z = o.z + nz * u;
        row.push([x, ground.at(x, z) + lift, z]);
      }
      rows.push(row);
    }
    return rows;
  };

  roads.forEach((r) => {
    pointOn(r, r.L / 2, o);
    const t = tileOf(o.x, o.z);
    const A = nodes[r.a];
    const B = nodes[r.b];
    const hw = r.l / 2;
    // asphalt (a little wider than the painted road, so its edges stay clean)
    for (const [a, b] of offDeck(r, 0, r.L)) asphalt[t].ribbon(band(r, a, b, -hw - 0.03, hw + 0.03, ROAD_LIFT, 3), ground, WHITE, ASPH_UV);

    // where the lines stop: before a junction (after its crossing) or a road end
    const cross = (n: NodeInfo) => n.wmax / 2 + 0.32;
    const cut = (n: NodeInfo) => (n.deg >= 3 ? cross(n) + (r.urban && !n.ring ? 0.32 : 0.1) : n.deg === 1 ? 0.25 : 0);
    const m0 = cut(A);
    const m1 = r.L - cut(B);
    if (m1 - m0 > 0.4) {
      const parts = offDeck(r, m0, m1);
      const line = (u: number, w: number, c: THREE.Color) => {
        for (const [a, b] of parts) marks[t].ribbon(band(r, a, b, u - w / 2, u + w / 2, MARK_LIFT, 2), ground, c, 1);
      };
      if (r.l >= 0.6) for (const sd of [-1, 1]) line(sd * (hw - 0.07), 0.035, WHITE);
      if (r.name === "Highway 66") for (const sd of [-1, 1]) line(sd * 0.03, 0.025, YELLOW);
      else if (!r.oneway && !r.ring) {
        // dashed centre line: 3.5 m dashes, 5.5 m gaps
        for (const [a, b] of parts)
          for (let s = a + 0.1; s < b - 0.2; s += 0.9) marks[t].ribbon(band(r, s, Math.min(b, s + 0.35), -0.018, 0.018, MARK_LIFT, 2, 0.12), ground, WHITE, 1);
      }
    }

    // zebra crossings on the town streets, just before their junctions
    if (r.urban && !r.ring)
      for (const [n, end] of [
        [A, 0],
        [B, 1],
      ] as const) {
        if (n.deg < 3 || n.ring) continue;
        const s = end === 0 ? cross(n) : r.L - cross(n);
        if (s < 0.3 || s > r.L - 0.3 || r.L < 2 * cross(n) + 0.6) continue;
        if (r.decks.some(([d0, d1]) => s > d0 - 0.4 && s < d1 + 0.4)) continue;
        for (let u = -hw + 0.1; u < hw - 0.08; u += 0.13) marks[t].ribbon(band(r, s - 0.13, s + 0.13, u, u + 0.065, MARK_LIFT, 2, 0.13), ground, WHITE, 1);
      }

    // kerbs and sidewalks along the town streets
    if (r.urban && !r.ring) {
      const k0 = A.deg >= 3 ? A.wmax / 2 + WALK + 0.02 : 0;
      const k1 = r.L - (B.deg >= 3 ? B.wmax / 2 + WALK + 0.02 : 0);
      if (k1 - k0 > 0.3)
        for (const [a, b] of offDeck(r, k0, k1))
          for (const sd of [-1, 1]) {
            const u0 = sd * (hw + 0.02);
            const u1 = sd * (hw + 0.02 + KERB);
            const u2 = sd * (hw + 0.02 + KERB + WALK);
            // kerb face (from the asphalt up), kerb top, then the paved walk
            const face = band(r, a, b, u0, u0, ROAD_LIFT - 0.01, 2);
            const top = band(r, a, b, u0, u0, ROAD_LIFT + KERB_H, 2);
            const rows = face.map((row, i) => (sd < 0 ? [top[i][0], row[0]] : [row[0], top[i][0]]));
            walks[t].ribbon(rows, ground, new THREE.Color("#c9c6bf"), WALK_UV * 4);
            walks[t].ribbon(band(r, a, b, sd < 0 ? u1 : u0, sd < 0 ? u0 : u1, ROAD_LIFT + KERB_H, 2), ground, new THREE.Color("#e4e1d9"), WALK_UV * 4);
            walks[t].ribbon(band(r, a, b, sd < 0 ? u2 : u1, sd < 0 ? u1 : u2, ROAD_LIFT + KERB_H - 0.004, 2), ground, WHITE, WALK_UV);
          }
    }
  });

  // junction pads (fill the corners where roads meet) and rounded road ends
  nodes.forEach((n) => {
    if (n.deg === 0) return;
    const r = n.deg >= 3 ? n.wmax * (n.ring ? 0.55 : 0.62) : n.wmax / 2 + 0.03;
    asphalt[tileOf(n.x, n.z)].disc(n.x, n.z, r, ground, ROAD_LIFT, WHITE, ASPH_UV);
  });

  const asphaltMat = hazed(
    new THREE.MeshStandardMaterial({ map: asphaltTexture(aniso), vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  const markMat = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const walkMat = hazed(new THREE.MeshStandardMaterial({ map: pavingTexture(aniso), vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));

  const root = new THREE.Group();
  root.name = "roads";
  const markings = new THREE.Group();
  const add = (parent: THREE.Group, strips: Strip[], mat: THREE.Material) => {
    const geos = strips.map((s) => s.geometry()).filter((g): g is THREE.BufferGeometry => !!g);
    for (const g of geos) {
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      parent.add(m);
    }
  };
  add(root, asphalt, asphaltMat);
  add(root, walks, walkMat);
  add(markings, marks, markMat);
  root.add(markings);
  return { root, markings };
}
