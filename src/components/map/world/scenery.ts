// The island map's scenery, built from public/world/world.json: the city and
// village buildings, trees and bushes, bridges, street lamps, parked cars,
// vineyards and the landmarks (lighthouse, ships, planes, wind turbines,
// oil pumps, the cable car, the observatory...). Everything merges into a
// few meshes per terrain tile and material, so the whole island is a few
// hundred draw calls. A handful of parts move (rotors, pumps, cable cars).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ALB, C, NEGRU, beam, box, cone, cylinder, facade, gableRoof, hipRoof, paint, plainUv, rnd, sphere, tiledGable, tiledHip, type FacadeKind, type MapMaterials } from "./kit";
import { EXAG, NTX, NTY, type Building, type Ground, type RoadData, type WorldJson } from "./terrain";

/** Buildings are drawn a little taller than to scale, so they read from above. */
const VH = 1.3;
const YAX = new THREE.Vector3(0, 1, 0);
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const SC = new THREE.Vector3();

const STRIPE: Record<string, string> = {
  automotive: "#d8423a", racing: "#d8423a", dealer: "#2f7fd1", airport: "#2f7fd1", industrial: "#e08a2e", port: "#3d6f9e",
  speed: "#d8423a", farm: "#3aa76d", red: "#e08a2e", riviera: "#2f7fd1", alpine: "#c74a3a",
};
const GREY = C("#a7b0ba");
const GREY_D = C("#7d8794");

/** One road of the map, ready for walking along it. */
export interface MapRoad {
  p: [number, number][];
  cum: number[];
  L: number;
  /** Carriageway width. */
  l: number;
  a: number;
  b: number;
  oneway: boolean;
  ring: boolean;
  urban: boolean;
  /** Bridges: [s0, s1, kind (1 sea, 2 valley), h0, h1, arch]. */
  decks: [number, number, number, number, number, number][];
  culverts: [number, number][];
  name: string;
}

export function pointOn(r: MapRoad, s: number, out: { x: number; z: number; tx: number; tz: number }) {
  const { p, cum } = r;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const seg = Math.max(1e-6, cum[hi] - cum[lo]), t = (s - cum[lo]) / seg;
  out.x = p[lo][0] + (p[hi][0] - p[lo][0]) * t;
  out.z = p[lo][1] + (p[hi][1] - p[lo][1]) * t;
  out.tx = (p[hi][0] - p[lo][0]) / seg;
  out.tz = (p[hi][1] - p[lo][1]) / seg;
  return out;
}

/** The 3D road surface lies this far over the ground (roads.ts). */
export const ROAD_LIFT = 0.03;

/** Where wheels touch the road: the deck on a bridge, else the road surface over the ground. */
export function roadSurface(ground: Ground, r: MapRoad, s: number, x: number, z: number) {
  for (const [s0, s1] of r.decks) if (s >= s0 && s <= s1) return roadHeight(ground, r, s, x, z);
  return ground.at(x, z) + ROAD_LIFT;
}

/** Height of the carriageway: the ground, or the deck on a bridge (sea bridges arch gently). */
export function roadHeight(ground: Ground, r: MapRoad, s: number, x: number, z: number) {
  for (const [s0, s1, , h0, h1, arch] of r.decks)
    if (s >= s0 && s <= s1) {
      const t = (s - s0) / Math.max(1e-6, s1 - s0), sn = Math.sin(Math.PI * t);
      return h0 + (h1 - h0) * t + arch * sn * sn;
    }
  return ground.at(x, z);
}

export function mapRoads(data: WorldJson, ground: Ground): MapRoad[] {
  const o = { x: 0, z: 0, tx: 0, tz: 0 };
  return data.drumuri.muchii.map((e: RoadData) => {
    const cum = [0];
    for (let i = 1; i < e.p.length; i++) cum.push(cum[i - 1] + Math.hypot(e.p[i][0] - e.p[i - 1][0], e.p[i][1] - e.p[i - 1][1]));
    const r: MapRoad = { p: e.p, cum, L: cum[cum.length - 1], l: e.l, a: e.a, b: e.b, oneway: e.u, ring: e.inel, urban: !!e.urb, decks: [], culverts: e.podet ?? [], name: e.nume };
    r.decks = (e.pod ?? []).map(([s0, s1, kind]) => {
      pointOn(r, s0, o);
      const h0 = ground.at(o.x, o.z);
      pointOn(r, s1, o);
      const h1 = ground.at(o.x, o.z);
      const L = s1 - s0;
      const arch = kind === 1 ? (THREE.MathUtils.clamp(0.036 * L, 0.25, 0.58) * EXAG) / 1.5 : 0;
      return [s0, s1, kind, h0 + 0.05, h1 + 0.05, arch];
    });
    return r;
  });
}

type Pieces = THREE.BufferGeometry[];

export interface Animated {
  rotors: [THREE.Object3D, number, "x" | "y" | "z"][];
  pumps: [THREE.Object3D, number][];
  cabins: { c: THREE.Object3D; f: number[][]; cum: number[]; u: number; dir: number }[];
}

export interface SceneryOptions {
  /** Phones: thinner forests in the new regions, fewer shadows. */
  low: boolean;
  /** Skip parked cars and scenery standing on these lots (world rectangles). */
  lots?: { x: number; y: number; w: number; d: number; rot: number }[];
}

export class Scenery {
  readonly root = new THREE.Group();
  readonly roads: MapRoad[];
  readonly animated: Animated = { rotors: [], pumps: [], cabins: [] };
  /** Lamp posts along town streets and on bridges, [x, z, yaw, y]. */
  readonly lamps: [number, number, number, number][] = [];

  constructor(
    private data: WorldJson,
    private ground: Ground,
    private mats: MapMaterials,
    private opt: SceneryOptions,
  ) {
    this.roads = mapRoads(data, ground);
    this.buildings();
    this.bridges();
    this.streetLamps();
    this.vines();
    this.trees();
    this.parked();
    this.landmarks();
    this.cableCar();
  }

  private tileOf(x: number, z: number) {
    const tx = Math.min(NTX - 1, Math.max(0, Math.floor((x / this.ground.SX + 0.5) * NTX)));
    const tz = Math.min(NTY - 1, Math.max(0, Math.floor((z / this.ground.SZ + 0.5) * NTY)));
    return tz * NTX + tx;
  }

  private add(geos: Pieces, mat: THREE.Material, shadow = true) {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  // ───────────────────────────── buildings ─────────────────────────────

  private buildings() {
    const B: Record<string, Pieces> = {};
    const g = this.ground;
    const trucks: [number, number, number][] = [];
    for (const b of this.data.cladiri) {
      const tile = this.tileOf(b.x, b.z);
      const put = (mat: FacadeKind | "plain" | "metal" | "roof", geo: THREE.BufferGeometry | null) => {
        if (geo) (B[`${tile}|${mat}`] ||= []).push(geo);
      };
      const plain = (geo: THREE.BufferGeometry | null) => put("plain", geo);
      const metal = (geo: THREE.BufferGeometry | null) => put("metal", geo);
      const r = rnd(b.s + 7);
      const c = new THREE.Color(b.c);
      {
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        c.setHSL(hsl.h, Math.min(hsl.s, 0.75), THREE.MathUtils.clamp(hsl.l, b.k === "turn" ? 0.38 : 0.32, 0.8));
      }
      const sol = g.at(b.x, b.z), y0 = sol - 0.6;
      const H = b.h * VH + 0.6;
      const w = Math.max(b.w, 0.35), d = Math.max(b.d, 0.35);
      const cs = Math.cos(b.r), sn = Math.sin(b.r);
      const loc = (lx: number, lz: number): [number, number] => [b.x + lx * cs + lz * sn, b.z - lx * sn + lz * cs];
      this.building(b, { put, plain, metal, r, c, sol, y0, H, w, d, loc, trucks });
    }
    for (const [x, z, rot] of trucks) {
      const y = g.at(x, z);
      const cab = C(["#d8423a", "#2f7fd1", "#f2f2f2", "#f2b134"][Math.floor(Math.abs(x * 13 + z * 7)) % 4]);
      (B[`${this.tileOf(x, z)}|plain`] ||= []).push(box(0.32, 0.26, 0.86, C("#f4f5f6"), x, y, z, rot), box(0.32, 0.24, 0.28, cab, x + Math.sin(rot) * 0.6, y, z + Math.cos(rot) * 0.6, rot));
    }
    for (const key in B) {
      const mat = key.split("|")[1] as FacadeKind | "plain" | "metal" | "roof";
      this.add(B[key], this.mats.byKind[mat]);
    }
  }

  private building(
    b: Building,
    k: {
      put: (mat: FacadeKind | "plain" | "metal" | "roof", geo: THREE.BufferGeometry | null) => void;
      plain: (geo: THREE.BufferGeometry | null) => void;
      metal: (geo: THREE.BufferGeometry | null) => void;
      r: () => number;
      c: THREE.Color;
      sol: number;
      y0: number;
      H: number;
      w: number;
      d: number;
      loc: (lx: number, lz: number) => [number, number];
      trucks: [number, number, number][];
    },
  ) {
    const { put, plain, metal, r, c, sol, y0, H, w, d, loc } = k;
    const at = (lx: number, lz: number) => loc(lx, lz);
    switch (b.k) {
      case "casa": {
        const med = b.v === 1;
        const walls = new THREE.Color(med ? "#fbf8f2" : "#f6f0e6").lerp(c, 0.05);
        const roof = c.clone();
        roof.offsetHSL(0, 0.08, -0.06);
        const hw = 0.6 + 0.44;
        put("casa", facade("casa", w, hw, d, walls, b.x, y0, b.z, b.r, 0.44));
        {
          const [fx, fz] = loc(-w * 0.3, d / 2);
          plain(box(Math.min(0.18, w * 0.16), 0.3, 0.05, C(med ? "#3f6f9e" : "#6e4a31"), fx, y0 + 0.6, fz, b.r));
        }
        {
          const [fx, fz] = loc(-w * 0.3, d / 2 + 0.12);
          plain(box(Math.min(0.3, w * 0.25), 0.04, 0.2, C("#c9c2b6"), fx, y0 + 0.6, fz, b.r));
        }
        // tiled roofs over a thin eave board
        plain(box(w * 1.06, 0.035, d * 1.06, roof.clone().lerp(NEGRU, 0.45), b.x, y0 + hw - 0.035, b.z, b.r));
        if (med) put("roof", tiledHip(w * 1.1, d * 1.1, 0.24, roof, b.x, y0 + hw, b.z, b.r));
        else {
          const { roof: tiles, ends } = tiledGable(w * 1.12, d * 1.16, 0.4, roof, walls, w, d, b.x, y0 + hw, b.z, b.r);
          put("roof", tiles);
          put("casa", ends);
          plain(box(w * 1.13, 0.035, 0.05, roof.clone().lerp(NEGRU, 0.3), b.x, y0 + hw + 0.39, b.z, b.r));
          const [hx, hz] = loc(w * 0.28, -d * 0.12);
          plain(box(0.12, 0.52, 0.12, C("#a0654c"), hx, y0 + hw, hz, b.r));
          plain(box(0.15, 0.03, 0.15, C("#5d4a40"), hx, y0 + hw + 0.52, hz, b.r));
        }
        if (b.alee) {
          const [ax, az] = loc(-w * 0.3, d / 2 + b.alee / 2);
          plain(box(0.2, 0.03, b.alee, C("#c9c4ba"), ax, y0 + 0.6, az, b.r));
          const [gx2, gz2] = loc(w * 0.2, d / 2 + b.alee * 0.55);
          plain(box(w * 0.42, 0.07, 0.06, C("#4f8f3c"), gx2, y0 + 0.6, gz2, b.r));
        }
        if (!med && r() < 0.45) {
          const [gx, gz] = loc(w / 2 + 0.18, d * 0.12);
          plain(box(0.36, 0.22 + 0.6, d * 0.62, walls.clone().lerp(GREY, 0.15), gx, y0, gz, b.r));
          plain(box(0.38, 0.03, d * 0.66, roof.clone().lerp(NEGRU, 0.2), gx, y0 + 0.82, gz, b.r));
        }
        return;
      }
      case "turn": {
        if (b.v === 1) {
          put("birou", facade("birou", w, H, d, c, b.x, y0, b.z, b.r));
          plain(box(w * 1.03, 0.14, d * 1.03, c.clone().lerp(NEGRU, 0.25), b.x, y0 + H, b.z, b.r));
          plain(box(w * 1.04, 0.3, d * 1.04, c.clone().lerp(NEGRU, 0.15), b.x, y0 + 0.6, b.z, b.r));
          const n = 1 + Math.floor(r() * 3);
          for (let i = 0; i < n; i++) {
            const [vx, vz] = loc((r() - 0.5) * w * 0.6, (r() - 0.5) * d * 0.6);
            plain(box(0.22, 0.2, 0.3, GREY, vx, y0 + H + 0.1, vz, b.r));
          }
        } else {
          const steps: [number, number][] = b.v === 2 ? [[1, 0.5], [0.74, 0.3], [0.48, 0.2]] : [[1, 1]];
          let y = y0;
          const frame = c.clone().lerp(ALB, 0.65);
          for (const [f, frac] of steps) {
            const hh = H * frac;
            put("sticla", facade("sticla", w * f, hh, d * f, c.clone().lerp(ALB, 0.35), b.x, y, b.z, b.r));
            plain(box(w * f * 1.03, 0.14, d * f * 1.03, frame, b.x, y + hh, b.z, b.r));
            y += hh;
          }
          plain(box(w * 1.05, 0.36, d * 1.05, frame.clone().lerp(NEGRU, 0.12), b.x, y0 + 0.6, b.z, b.r));
          if (H > 14) {
            plain(cylinder(Math.min(w, d) * 0.36, 0.05, C("#3b4450"), b.x, y + 0.14, b.z, 20));
            plain(cylinder(Math.min(w, d) * 0.3, 0.06, C("#f2b134"), b.x, y + 0.15, b.z, 20));
            plain(cylinder(Math.min(w, d) * 0.26, 0.07, C("#3b4450"), b.x, y + 0.15, b.z, 20));
          } else {
            plain(box(w * 0.42, 0.45, d * 0.42, C("#c9d2dc"), b.x, y, b.z, b.r));
            if (H > 9 && r() > 0.35) plain(cylinder(0.045, 1.4 + r() * 1.2, ALB, b.x, y + 0.4, b.z, 6));
          }
        }
        return;
      }
      case "hala": {
        const walls = C("#eef0f3");
        const roof = C("#b7bec7").lerp(c, 0.25);
        put("hala", facade("hala", w, H, d, walls, b.x, y0, b.z, b.r, Math.max(0.5, H - 0.6)));
        plain(box(w * 1.008, 0.22, d * 1.008, C(STRIPE[b.ds ?? ""] || "#3d6f9e"), b.x, y0 + H * 0.74, b.z, b.r));
        plain(box(w * 1.02, 0.14, d * 1.02, roof.clone().lerp(NEGRU, 0.15), b.x, y0 + H, b.z, b.r));
        plain(box(w * 0.96, 0.06, d * 0.96, roof, b.x, y0 + H + 0.08, b.z, b.r));
        const nl = Math.max(1, Math.min(6, Math.round(w / 1.0)));
        for (let i = 0; i < nl; i++) {
          const [lx, lz] = loc(-w / 2 + ((i + 0.5) * w) / nl, 0);
          plain(box(Math.min(0.3, (w / nl) * 0.35), 0.14, d * 0.62, C("#9cc0e0"), lx, y0 + H + 0.1, lz, b.r));
        }
        const nv = 1 + Math.floor(r() * 3);
        for (let i = 0; i < nv; i++) {
          const [vx, vz] = loc((r() - 0.5) * w * 0.8, (r() - 0.5) * d * 0.7);
          plain(cylinder(0.09, 0.28, GREY_D, vx, y0 + H + 0.1, vz, 8));
        }
        const nu = Math.min(4, nl);
        for (let i = 0; i < nu; i++) {
          const [ux, uz] = loc(-w / 2 + ((i + 0.5) * w) / nu, d / 2);
          plain(box(Math.min(0.48, w / 6), Math.min(0.85, H * 0.42), 0.05, C("#7a8591"), ux, y0 + 0.6, uz, b.r));
          if (b.o && r() < 0.3) {
            const [cx4, cz4] = loc(-w / 2 + ((i + 0.5) * w) / nu, d / 2 + 0.55);
            if (this.distToRoads(cx4, cz4, -1) > 0.75) k.trucks.push([cx4, cz4, b.r]);
          }
        }
        return;
      }
      case "container": {
        const cols = ["#d9473b", "#2f7fd1", "#f2b134", "#3aa76d", "#e57c2f", "#6b4fb3"];
        const CL = 1.25, CW = 0.48, GAP = 0.08;
        const nx = Math.max(1, Math.floor(w / (CL + GAP))), nz = Math.max(1, Math.floor(d / (CW + GAP)));
        for (let ix = 0; ix < nx; ix++)
          for (let iz = 0; iz < nz; iz++) {
            const [cx2, cz2] = loc((ix - (nx - 1) / 2) * (CL + GAP), (iz - (nz - 1) / 2) * (CW + GAP));
            const st = 1 + Math.floor(r() * 3);
            for (let q = 0; q < st; q++) put("hala", facade("hala", CL, 0.44, CW, C(cols[Math.floor(r() * cols.length)]), cx2, y0 + 0.6 + q * 0.46 - 0.6, cz2, b.r, 0.44));
          }
        return;
      }
      case "tribuna": {
        for (let i = 0; i < 4; i++) {
          const [tx, tz] = loc(0, -d / 2 + ((i + 0.5) * d) / 4);
          plain(box(w, 0.6 + 0.24 * (4 - i), d / 4, i % 2 ? c : c.clone().lerp(ALB, 0.35), tx, y0, tz, b.r));
        }
        const [rx, rz] = loc(0, -d * 0.1);
        plain(box(w * 1.02, 0.08, d * 1.1, ALB, rx, y0 + 0.6 + 1.6, rz, b.r));
        for (const fx of [-0.45, -0.15, 0.15, 0.45]) {
          const [px2, pz2] = loc(w * fx, -d / 2);
          plain(box(0.07, 1.6, 0.07, ALB, px2, y0 + 0.6, pz2, b.r));
        }
        return;
      }
      case "rezervor": {
        const rr = Math.max(w, d) / 2;
        plain(cylinder(rr, H, C("#eef1f4"), b.x, y0, b.z, 24));
        plain(cylinder(rr * 1.01, 0.2, C("#d8423a"), b.x, y0 + H * 0.7, b.z, 24));
        plain(cylinder(rr * 1.01, 0.06, C("#c3c9d0"), b.x, y0 + H * 0.4, b.z, 24));
        plain(cone(rr, 0.3, C("#d5dae0"), b.x, y0 + H, b.z, 24));
        plain(box(0.05, H, 0.05, GREY_D, b.x + rr, y0, b.z, 0));
        return;
      }
      case "biserica": {
        const walls = C("#f4f1ea"), roof = C("#8a3b2e"), hN = 1.2;
        plain(box(w, hN, d, walls, b.x, y0, b.z, b.r));
        {
          const { roof: tiles, ends } = tiledGable(d * 1.06, w * 1.14, 0.42, roof, walls, d, w, b.x, y0 + hN, b.z, b.r + Math.PI / 2);
          put("roof", tiles);
          plain(ends);
        }
        for (const sd of [-1, 1])
          for (let i = 0; i < 3; i++) {
            const [fx, fz] = loc(sd * (w / 2 + 0.005), -d * 0.3 + i * d * 0.25);
            plain(box(0.02, 0.26, 0.09, C("#3d4f63"), fx, y0 + 0.78, fz, b.r));
          }
        const [tx, tz] = loc(0, d / 2 - 0.16);
        plain(box(0.36, 1.75, 0.36, walls, tx, y0, tz, b.r));
        plain(box(0.38, 0.04, 0.38, C("#d9d2c4"), tx, y0 + 1.75, tz, b.r));
        for (const [lx, lz] of [[0, 0.181], [0, -0.181], [0.181, 0], [-0.181, 0]]) {
          const [wx, wz] = loc(lx, d / 2 - 0.16 + lz);
          plain(box(0.1, 0.16, 0.1, C("#3d4f63"), wx, y0 + 1.48, wz, b.r));
        }
        plain(hipRoof(0.4, 0.4, 0.62, C("#5c6b7a"), tx, y0 + 1.79, tz, b.r));
        plain(box(0.02, 0.22, 0.02, C("#d9b44a"), tx, y0 + 2.41, tz, b.r));
        plain(box(0.1, 0.02, 0.02, C("#d9b44a"), tx, y0 + 2.55, tz, b.r));
        const [ux, uz] = loc(0, d / 2 + 0.02);
        plain(box(0.14, 0.28, 0.03, C("#6e4a31"), ux, y0 + 0.6, uz, b.r));
        return;
      }
      case "hambar": {
        const hw = 1.22;
        plain(box(w, hw, d, c, b.x, y0, b.z, b.r));
        plain(gableRoof(w * 1.06, d * 1.12, 0.5, C("#6f767e"), b.x, y0 + hw, b.z, b.r));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const [cx2, cz2] = loc((sx * w) / 2, (sz * d) / 2);
          plain(box(0.05, hw - 0.6, 0.05, ALB, cx2, y0 + 0.6, cz2, b.r));
        }
        for (const sd of [-1, 1]) {
          const [px2, pz2] = loc(sd * (w / 2 + 0.01), 0);
          plain(box(0.02, 0.48, 0.52, ALB, px2, y0 + 0.6, pz2, b.r));
          plain(box(0.025, 0.42, 0.46, c.clone().lerp(NEGRU, 0.15), px2, y0 + 0.63, pz2, b.r));
          plain(beam(px2, y0 + 0.64, pz2 - 0.2 * Math.cos(b.r), px2, y0 + 1.03, pz2 + 0.2 * Math.cos(b.r), 0.03, ALB));
        }
        return;
      }
      case "siloz": {
        const rr = Math.max(w, d) / 2;
        metal(cylinder(rr, H, C("#c9ced4"), b.x, y0, b.z, 18));
        for (let e = 1; e < 4; e++) metal(cylinder(rr * 1.02, 0.03, C("#9ea6b0"), b.x, y0 + 0.6 + ((H - 0.6) * e) / 4, b.z, 18));
        metal(cone(rr * 1.04, 0.3, C("#b5bcc4"), b.x, y0 + H, b.z, 18));
        plain(box(0.04, H - 0.6, 0.04, GREY_D, b.x + rr + 0.02, y0 + 0.6, b.z, 0));
        return;
      }
      case "statie": {
        plain(box(w, 0.9, d, C("#d9d6cf"), b.x, y0, b.z, b.r));
        plain(box(w * 0.86, 0.32, d * 0.86, c, b.x, y0 + 0.9, b.z, b.r));
        plain(box(w * 1.12, 0.07, d * 1.12, C("#3b4450"), b.x, y0 + 1.22, b.z, b.r));
        const [fx, fz] = loc(w / 2 + 0.01, 0);
        plain(box(0.02, 0.22, d * 0.5, C("#2a3440"), fx, y0 + 0.95, fz, b.r));
        return;
      }
      case "cabana": {
        const big = b.v === 3;
        const floors = big ? 3 : 1, he = 0.36, hw = 0.6 + floors * he;
        put("lemn", facade("lemn", w, hw, d, c.clone().lerp(ALB, 0.55), b.x, y0, b.z, b.r, he));
        const snow = sol > 3.6 * EXAG;
        const roof = C(snow ? "#eef3f8" : "#4a3b33");
        if (snow) plain(gableRoof(w * 1.16, d * 1.22, big ? 0.7 : 0.48, roof, b.x, y0 + hw, b.z, b.r));
        else {
          const { roof: tiles, ends } = tiledGable(w * 1.16, d * 1.22, big ? 0.7 : 0.48, roof, C("#8a5a36"), w, d, b.x, y0 + hw, b.z, b.r);
          put("roof", tiles);
          plain(ends);
        }
        if (snow) plain(box(w * 1.17, 0.05, d * 0.06, C("#4a3b33"), b.x, y0 + hw - 0.02, b.z, b.r));
        for (let e = 0; e < floors; e++) {
          const [bx, bz] = loc(0, d / 2 + 0.1);
          plain(box(w * 0.8, 0.03, 0.2, C("#6b4328"), bx, y0 + 0.6 + e * he + 0.02, bz, b.r));
          const [rx2, rz2] = at(0, d / 2 + 0.2);
          plain(box(w * 0.8, 0.09, 0.02, C("#5a3820"), rx2, y0 + 0.6 + e * he + 0.05, rz2, b.r));
        }
        const [hx, hz] = loc(w * 0.25, -d * 0.15);
        plain(box(0.12, big ? 0.8 : 0.55, 0.12, C("#8d8a84"), hx, y0 + hw, hz, b.r));
        return;
      }
      case "motel": {
        const hw = 1.0;
        put("casa", facade("casa", w, hw, d, c, b.x, y0, b.z, b.r, 0.4));
        {
          const [ax, az] = at(0, d * 0.1);
          plain(box(w * 1.04, 0.06, d * 1.25, C("#c96f43"), ax, y0 + hw, az, b.r));
        }
        const nu = Math.max(3, Math.round(w / 0.42));
        for (let i = 0; i < nu; i++) {
          const [ux, uz] = loc(-w / 2 + ((i + 0.5) * w) / nu, d / 2 + 0.01);
          plain(box(0.12, 0.24, 0.02, C(i % 2 ? "#2f8f8a" : "#d8423a"), ux, y0 + 0.6, uz, b.r));
        }
        const [sx, sz] = loc(w / 2 + 0.4, d / 2 + 0.3);
        plain(box(0.06, 1.5, 0.06, C("#6d7580"), sx, y0 + 0.6, sz, b.r));
        plain(box(0.12, 0.42, 0.75, C("#d8423a"), sx, y0 + 1.9, sz, b.r));
        plain(box(0.13, 0.1, 0.6, C("#ffd34d"), sx, y0 + 1.82, sz, b.r));
        return;
      }
      case "benzinarie": {
        const [mx, mz] = loc(0, -d * 0.3);
        plain(box(w * 0.7, 0.96, d * 0.34, C("#f2f2ee"), mx, y0, mz, b.r));
        plain(box(w * 0.72, 0.08, d * 0.36, c, mx, y0 + 0.92, mz, b.r));
        const [kx, kz] = loc(0, d * 0.15);
        for (const [sx, sz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) {
          const [px2, pz2] = loc(w * sx, d * 0.15 + d * sz);
          plain(box(0.06, 0.62, 0.06, ALB, px2, y0 + 0.6, pz2, b.r));
        }
        plain(box(w * 0.9, 0.05, d * 0.66, ALB, kx, y0 + 1.22, kz, b.r));
        plain(box(w * 0.91, 0.08, d * 0.67, c, kx, y0 + 1.14, kz, b.r));
        for (const sx of [-0.2, 0.2]) {
          const [px2, pz2] = loc(w * sx, d * 0.15);
          plain(box(0.08, 0.18, 0.05, C("#d8423a"), px2, y0 + 0.6, pz2, b.r));
          plain(box(0.3, 0.03, 0.12, C("#c9c4ba"), px2, y0 + 0.6, pz2, b.r));
        }
        const [fx, fz] = loc(-w / 2 - 0.2, d / 2);
        plain(box(0.05, 0.9, 0.05, C("#6d7580"), fx, y0 + 0.6, fz, b.r));
        plain(box(0.08, 0.34, 0.3, c, fx, y0 + 1.42, fz, b.r));
        return;
      }
      case "diner": {
        const hw = 0.96;
        metal(box(w, hw, d * 0.8, C("#d9e2ea"), b.x, y0, b.z, b.r));
        for (const sd of [-1, 1]) {
          const [ex, ez] = loc((sd * w) / 2, 0);
          const geo = new THREE.CylinderGeometry(d * 0.4, d * 0.4, hw, 16, 1, false, sd > 0 ? 0 : Math.PI, Math.PI);
          geo.rotateY(b.r);
          geo.translate(ex, y0 + hw / 2, ez);
          metal(paint(geo, C("#d9e2ea")));
        }
        plain(box(w * 1.01, 0.05, d * 0.81, C("#d8423a"), b.x, y0 + 0.78, b.z, b.r));
        {
          const [ax, az] = at(0, d * 0.4);
          plain(box(w * 0.9, 0.1, d * 0.06, C("#2a3440"), ax, y0 + 0.66, az, b.r));
        }
        plain(box(w * 0.5, 0.2, 0.05, C("#d8423a"), b.x, y0 + hw, b.z, b.r));
        plain(box(w * 0.42, 0.06, 0.06, C("#ffd34d"), b.x, y0 + hw + 0.07, b.z, b.r));
        return;
      }
      case "adobe": {
        const hw = 0.6 + b.h * VH;
        put("adobe", facade("adobe", w, hw, d, c, b.x, y0, b.z, b.r, 0.34));
        for (const [sx, sz, lw, ld] of [[0, -1, w, 0.06], [0, 1, w, 0.06], [-1, 0, 0.06, d], [1, 0, 0.06, d]]) {
          const [px2, pz2] = loc(sx * (w / 2 - 0.03), sz * (d / 2 - 0.03));
          plain(box(lw, 0.08, ld, c.clone().lerp(ALB, 0.1), px2, y0 + hw, pz2, b.r));
        }
        for (let i = 0; i < Math.max(2, Math.round(w / 0.25)); i++) {
          const [vx, vz] = loc(-w / 2 + 0.12 + i * 0.25, d / 2 + 0.06);
          plain(box(0.035, 0.035, 0.14, C("#5b3a22"), vx, y0 + hw - 0.1, vz, b.r));
        }
        if (b.v === 2) {
          const [ux, uz] = loc(w * 0.18, -d * 0.1);
          plain(box(w * 0.45, 0.28, d * 0.5, c, ux, y0 + hw, uz, b.r));
        }
        return;
      }
      case "cazino": {
        const walls = C("#f6f1e6"), hw = 0.6 + b.h * VH * 0.55;
        put("clasic", facade("clasic", w, hw, d, walls, b.x, y0, b.z, b.r, 0.55));
        plain(box(w * 1.03, 0.1, d * 1.03, C("#e2d8c4"), b.x, y0 + hw, b.z, b.r));
        plain(box(w * 0.98, 0.14, d * 0.98, walls, b.x, y0 + hw + 0.1, b.z, b.r));
        const rc = Math.min(w, d) * 0.24;
        plain(cylinder(rc, 0.35, walls, b.x, y0 + hw + 0.24, b.z, 24));
        metal(sphere(rc * 1.02, C("#d9b44a"), b.x, y0 + hw + 0.59, b.z, true));
        plain(cylinder(0.03, 0.3, C("#d9b44a"), b.x, y0 + hw + 0.59 + rc, b.z, 6));
        const nc = 8;
        for (let i = 0; i < nc; i++) {
          const [cx2, cz2] = loc(-w * 0.32 + (i * w * 0.64) / (nc - 1), d / 2 + 0.22);
          plain(cylinder(0.05, hw - 0.6, ALB, cx2, y0 + 0.6, cz2, 10));
        }
        {
          const [ax, az] = at(0, d / 2 + 0.2);
          plain(box(w * 0.72, 0.1, 0.36, C("#efe8da"), ax, y0 + hw - 0.02, az, b.r));
          plain(gableRoof(w * 0.74, 0.4, 0.28, C("#efe8da"), ax, y0 + hw + 0.08, az, b.r));
        }
        for (let i = 0; i < 3; i++) {
          const [ax, az] = at(0, d / 2 + 0.5 + i * 0.14);
          plain(box(w * 0.6 + i * 0.08, 0.05, 0.16, C("#e8e2d4"), ax, y0 + 0.6 - i * 0.05, az, b.r));
        }
        return;
      }
      case "vila": {
        const walls = C("#fbf8f2"), hw = 0.96;
        put("casa", facade("casa", w, hw, d, walls, b.x, y0, b.z, b.r, 0.36));
        const [ux, uz] = loc(-w * 0.18, -d * 0.12);
        put("casa", facade("casa", w * 0.58, 0.36, d * 0.62, walls, ux, y0 + hw, uz, b.r, 0.36));
        if (b.v === 1) {
          put("roof", tiledHip(w * 0.64, d * 0.68, 0.22, C("#c8643c"), ux, y0 + hw + 0.36, uz, b.r));
          put("roof", tiledHip(w * 1.06, d * 1.06, 0.2, C("#c0603a"), b.x, y0 + hw, b.z, b.r));
        } else {
          plain(box(w * 0.6, 0.05, d * 0.64, C("#e9e2d6"), ux, y0 + hw + 0.36, uz, b.r));
          for (const [sx, sz, lw, ld] of [[0, -1, w, 0.04], [0, 1, w, 0.04], [-1, 0, 0.04, d], [1, 0, 0.04, d]]) {
            const [px2, pz2] = loc(sx * (w / 2 - 0.02), sz * (d / 2 - 0.02));
            plain(box(lw, 0.07, ld, walls, px2, y0 + hw, pz2, b.r));
          }
          const [px2, pz2] = loc(w * 0.28, d * 0.18);
          plain(box(w * 0.34, 0.03, d * 0.4, C("#8a6a4a"), px2, y0 + hw + 0.24, pz2, b.r));
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const [qx, qz] = loc(w * 0.28 + sx * w * 0.16, d * 0.18 + sz * d * 0.19);
            plain(box(0.03, 0.24, 0.03, C("#8a6a4a"), qx, y0 + hw, qz, b.r));
          }
        }
        const [px3, pz3] = loc(-w * 0.3, d / 2 + 0.01);
        plain(box(0.14, 0.26, 0.02, C("#3f6f9e"), px3, y0 + 0.6, pz3, b.r));
        return;
      }
      case "hotel":
      case "bloc": {
        const hotel = b.k === "hotel";
        const walls = C("#eeeae3").lerp(c, hotel ? 0.5 : 0.2);
        const roof = c.clone().lerp(C("#8d97a3"), 0.45);
        put("bloc", facade("bloc", w, H, d, walls, b.x, y0, b.z, b.r));
        plain(box(w * 1.03, 0.16, d * 1.03, roof.clone().lerp(NEGRU, 0.2), b.x, y0 + H, b.z, b.r));
        plain(box(w * 0.95, 0.05, d * 0.95, roof, b.x, y0 + H + 0.1, b.z, b.r));
        if (H > 2.4 && (hotel || r() < 0.6)) {
          const nb = Math.max(1, Math.round(w / 0.6));
          for (const sd of hotel ? [-1, 1] : [1])
            for (let e = 1.22; e < H - 0.4; e += 0.62)
              for (let i = 0; i < nb; i += hotel ? 1 : 2) {
                const [bx, bz] = loc(-w / 2 + ((i + 0.5) * w) / nb, sd * (d / 2 + 0.07));
                plain(box((w / nb) * 0.8, 0.035, 0.14, walls.clone().lerp(NEGRU, 0.08), bx, y0 + e, bz, b.r));
                const [gx3, gz3] = loc(-w / 2 + ((i + 0.5) * w) / nb, sd * (d / 2 + 0.135));
                plain(box((w / nb) * 0.8, 0.09, 0.012, hotel ? C("#b9d7e6") : C("#5b6672"), gx3, y0 + e + 0.035, gz3, b.r));
              }
        }
        if (hotel) {
          const [cx2, cz2] = loc(0, d / 2 + 0.3);
          plain(box(w * 0.5, 0.05, 0.5, C(["#2f7fd1", "#d8423a", "#3aa76d"][b.s % 3]), cx2, y0 + 0.95, cz2, b.r));
          plain(box(w * 0.45, 0.24, 0.06, C("#f4f6f8"), b.x, y0 + H + 0.15, b.z, b.r));
        } else {
          const n = 1 + Math.floor(r() * 3);
          for (let i = 0; i < n; i++) {
            const [vx, vz] = loc((r() - 0.5) * w * 0.6, (r() - 0.5) * d * 0.6);
            plain(box(0.24, 0.2, 0.24, GREY, vx, y0 + H + 0.12, vz, b.r));
          }
          if (r() < 0.25) {
            const [vx, vz] = loc(w * 0.25, -d * 0.2);
            plain(cylinder(0.13, 0.32, C("#8a6f55"), vx, y0 + H + 0.12, vz, 10));
          }
        }
        return;
      }
      default: {
        put("bloc", facade("bloc", w, H, d, C("#eeeae3").lerp(c, 0.2), b.x, y0, b.z, b.r));
        plain(box(w * 1.03, 0.16, d * 1.03, c.clone().lerp(NEGRU, 0.2), b.x, y0 + H, b.z, b.r));
      }
    }
  }

  /** Distance from a point to the nearest carriageway edge (skipping road `except`). */
  distToRoads(x: number, z: number, except: number) {
    let best = 1e9;
    this.roads.forEach((r, i) => {
      if (i === except) return;
      const p = r.p;
      for (let k = 0; k < p.length - 1; k++) {
        const ax = p[k][0], az = p[k][1], bx = p[k + 1][0] - ax, bz = p[k + 1][1] - az;
        if (Math.abs(x - ax) > 6 && Math.abs(x - p[k + 1][0]) > 6) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / Math.max(1e-9, bx * bx + bz * bz)));
        const d = Math.hypot(x - ax - bx * t, z - az - bz * t) - r.l / 2;
        if (d < best) best = d;
      }
    });
    return best;
  }

  // ───────────────────────────── bridges ─────────────────────────────

  private bridges() {
    const P: Pieces = [];
    const o = { x: 0, z: 0, tx: 0, tz: 0 };
    const g = this.ground;
    const ASPH = C("#4f555d"), CONC = C("#c8c6bf"), RAIL = C("#e9edf1"), MARK = C("#f4f4f0");
    const ARCH = [C("#e9edf1"), C("#d8423a"), C("#e9edf1"), C("#2f7fd1"), C("#e9edf1"), C("#e08a2e"), C("#e9edf1")];
    let iArch = 0;
    for (const dr of this.roads) {
      for (const [s0, s1, kind] of dr.decks) {
        const Hs = (s: number) => roadHeight(g, dr, s, 0, 0);
        const step = 0.2, L = s1 - s0;
        for (let s = s0; s < s1 - 1e-6; s += step) {
          const se = Math.min(s1, s + step), sm = (s + se) / 2, h = Hs(sm);
          pointOn(dr, sm, o);
          const ang = Math.atan2(-o.tz, o.tx), slope = Math.atan2(Hs(se) - Hs(s), se - s);
          const seg = (hh: number, d: number, c: THREE.Color, dy: number, ox = 0, oz = 0) => {
            const q = new THREE.BoxGeometry(se - s + 0.03, hh, d);
            q.translate(0, hh / 2, 0);
            q.rotateZ(slope);
            q.applyMatrix4(M4.compose(V.set(o.x + ox, h + dy, o.z + oz), Q.setFromAxisAngle(YAX, ang), SC.set(1, 1, 1)));
            P.push(paint(q, c));
          };
          seg(0.07, dr.l + 0.22, ASPH, -0.07);
          seg(kind === 1 ? 0.24 : 0.16, dr.l + 0.34, CONC, kind === 1 ? -0.31 : -0.23);
          for (const sd of [-1, 1]) {
            const ox = -o.tz * (dr.l / 2 + 0.13) * sd, oz = o.tx * (dr.l / 2 + 0.13) * sd;
            seg(0.05, 0.08, CONC, 0, ox, oz);
            seg(0.02, 0.04, RAIL, 0.13, ox, oz);
          }
          if (Math.floor((s - s0) / 0.6) % 2 === 0) {
            const q = new THREE.BoxGeometry((se - s) * 0.9, 0.006, 0.05);
            q.translate(0, 0.003, 0);
            q.rotateZ(slope);
            q.applyMatrix4(M4.compose(V.set(o.x, h, o.z), Q.setFromAxisAngle(YAX, ang), SC.set(1, 1, 1)));
            P.push(paint(q, MARK));
          }
        }
        for (let s = s0; s <= s1 + 1e-6; s += 0.3) {
          pointOn(dr, Math.min(s, s1), o);
          const h = Hs(Math.min(s, s1));
          for (const sd of [-1, 1]) {
            const ox = -o.tz * (dr.l / 2 + 0.13) * sd, oz = o.tx * (dr.l / 2 + 0.13) * sd;
            P.push(box(0.025, 0.13, 0.025, RAIL, o.x + ox, h, o.z + oz, 0));
          }
        }
        for (const se of [s0, s1]) {
          pointOn(dr, se, o);
          const hb = g.at(o.x, o.z), h = Hs(se);
          P.push(box(0.3, Math.max(0.1, h - 0.07 - hb + 0.6), dr.l + 0.6, CONC, o.x, hb - 0.6, o.z, Math.atan2(-o.tz, o.tx)));
        }
        if (kind === 1) {
          const np = Math.max(1, Math.round(L / 2.3) - 1);
          for (let k = 1; k <= np; k++) {
            const s = s0 + (L * k) / (np + 1);
            pointOn(dr, s, o);
            const ang = Math.atan2(-o.tz, o.tx), h = Hs(s), low = Math.min(g.floor(o.x, o.z), -0.5) - 0.3;
            for (const sd of [-1, 1]) {
              const ox = -o.tz * dr.l * 0.3 * sd, oz = o.tx * dr.l * 0.3 * sd;
              P.push(cylinder(0.1, Math.max(0.1, h - 0.31 - low), CONC, o.x + ox, low, o.z + oz, 12));
            }
            P.push(box(0.22, 0.14, dr.l + 0.2, CONC, o.x, h - 0.45, o.z, ang));
            P.push(cylinder(0.32, 0.08, C("#b9b6ad"), o.x, 0.02, o.z, 16));
          }
          if (L > 9) {
            const cA = ARCH[iArch++ % ARCH.length], ha = THREE.MathUtils.clamp(0.16 * L, 1.4, 2.6), n = 28;
            for (const sd of [-1, 1]) {
              let prev: [number, number, number] | null = null;
              for (let k = 0; k <= n; k++) {
                const s = s0 + 0.35 + ((L - 0.7) * k) / n;
                pointOn(dr, s, o);
                const ox = -o.tz * (dr.l / 2 + 0.2) * sd, oz = o.tx * (dr.l / 2 + 0.2) * sd;
                const y = Hs(s) + ha * Math.sin((Math.PI * k) / n);
                const cur: [number, number, number] = [o.x + ox, y, o.z + oz];
                if (prev) {
                  const bm = beam(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], 0.13, cA, 0.16);
                  if (bm) P.push(bm);
                }
                if (k > 0 && k < n && k % 2 === 0) {
                  const bm = beam(cur[0], Hs(s) + 0.13, cur[2], cur[0], y, cur[2], 0.022, RAIL);
                  if (bm) P.push(bm);
                }
                prev = cur;
              }
            }
            for (let k = 6; k <= n - 6; k += 4) {
              const s = s0 + 0.35 + ((L - 0.7) * k) / n;
              pointOn(dr, s, o);
              const y = Hs(s) + ha * Math.sin((Math.PI * k) / n), ox = -o.tz * (dr.l / 2 + 0.2), oz = o.tx * (dr.l / 2 + 0.2);
              const bm = beam(o.x - ox, y, o.z - oz, o.x + ox, y, o.z + oz, 0.06, cA);
              if (bm) P.push(bm);
            }
          }
          for (let s = s0 + 1.0, k = 0; s < s1 - 0.8; s += 2.2, k++) {
            pointOn(dr, s, o);
            const side = k % 2 ? 1 : -1, off = dr.l / 2 + 0.16;
            this.lamps.push([o.x - o.tz * off * side, o.z + o.tx * off * side, Math.atan2(-o.tz, o.tx) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), Hs(s) + 0.05]);
          }
        } else {
          const np = Math.max(0, Math.round(L / (kind === 2 ? 1.6 : 0.9)) - 1);
          for (let k = 1; k <= np; k++) {
            const s = s0 + (L * k) / (np + 1);
            pointOn(dr, s, o);
            const bed = g.at(o.x, o.z) - 0.6, h = Hs(s);
            for (const sd of [-1, 1]) {
              const ox = -o.tz * dr.l * 0.28 * sd, oz = o.tx * dr.l * 0.28 * sd;
              P.push(cylinder(kind === 2 ? 0.1 : 0.07, Math.max(0.1, h - 0.23 - bed), CONC, o.x + ox, bed, o.z + oz, 10));
            }
            if (kind === 2) P.push(box(0.2, 0.12, dr.l + 0.2, CONC, o.x, h - 0.35, o.z, Math.atan2(-o.tz, o.tx)));
          }
        }
      }
      for (const [s, len] of dr.culverts) {
        pointOn(dr, s, o);
        const ang = Math.atan2(-o.tz, o.tx), h = g.at(o.x, o.z);
        for (const sd of [-1, 1]) {
          const ox = -o.tz * (dr.l / 2 + 0.2) * sd, oz = o.tx * (dr.l / 2 + 0.2) * sd;
          P.push(box(Math.max(0.5, len * 1.6), 0.16, 0.08, CONC, o.x + ox, h - 0.06, o.z + oz, ang));
          P.push(box(Math.max(0.3, len), 0.05, 0.1, C("#2a3440"), o.x + ox * 1.06, h - 0.06, o.z + oz * 1.06, ang));
        }
      }
    }
    this.add(P.map(plainUv), this.mats.byKind.plain);
  }

  // ───────────────────────────── street lamps ─────────────────────────────

  private nearLot(x: number, z: number, margin: number) {
    for (const l of this.opt.lots ?? []) {
      const dx = x - l.x, dz = z - l.y, c = Math.cos(l.rot), s = Math.sin(l.rot);
      const u = dx * c - dz * s, v = dx * s + dz * c;
      if (Math.abs(u) < l.w / 2 + margin && Math.abs(v) < l.d / 2 + margin * 3) return true;
    }
    return false;
  }

  private streetLamps() {
    const o = { x: 0, z: 0, tx: 0, tz: 0 };
    const degree = this.data.drumuri.noduri.map(() => 0);
    for (const r of this.roads) {
      degree[r.a]++;
      degree[r.b]++;
    }
    this.roads.forEach((dr, i) => {
      if (dr.ring || !dr.urban) return;
      const libA = degree[dr.a] >= 3 ? 1.6 : 0.6, libB = degree[dr.b] >= 3 ? 1.6 : 0.6;
      for (let s = libA + 0.6, k = 0; s < dr.L - libB; s += 4.2, k++) {
        if (dr.decks.some(([s0, s1]) => s > s0 - 0.4 && s < s1 + 0.4)) continue;
        pointOn(dr, s, o);
        const side = k % 2 ? 1 : -1, off = dr.l / 2 + 0.22;
        const x = o.x - o.tz * off * side, z = o.z + o.tx * off * side;
        if (this.distToRoads(x, z, i) < 0.25 || this.nearLot(x, z, 0.4)) continue;
        this.lamps.push([x, z, Math.atan2(-o.tz, o.tx) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), this.ground.at(x, z) - 0.02]);
      }
    });
    const geo = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.018, 0.026, 0.62, 5).translate(0, 0.31, 0), C("#5d6672")),
      paint(new THREE.BoxGeometry(0.2, 0.018, 0.02).translate(-0.09, 0.62, 0), C("#5d6672")),
      paint(new THREE.BoxGeometry(0.08, 0.03, 0.05).translate(-0.18, 0.605, 0), C("#fff3c4")),
    ].map(plainUv));
    const m = new THREE.InstancedMesh(geo, this.mats.byKind.plain, Math.max(1, this.lamps.length));
    m.count = this.lamps.length;
    this.lamps.forEach(([x, z, a, y], i) => m.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, a), SC.set(1, 1, 1))));
    m.castShadow = true;
    m.computeBoundingSphere();
    this.root.add(m);
  }

  // ───────────────────────────── vineyards ─────────────────────────────

  private vines() {
    const parts: Pieces = [], row = C("#4f7d33"), post = C("#8a6a4a");
    const g = this.ground;
    for (const v of this.data.vii) {
      const a = v.a + (v.dir ? Math.PI / 2 : 0), ex = [Math.cos(a), Math.sin(a)], ey = [-Math.sin(a), Math.cos(a)];
      const len = v.dir ? v.h : v.w, wid = v.dir ? v.w : v.h;
      for (let j = -wid / 2 + 0.2; j < wid / 2 - 0.1; j += 0.3) {
        for (let u = -len / 2 + 0.15; u < len / 2 - 0.15; u += 0.6) {
          const cx = v.c[0] + ex[0] * (u + 0.3) + ey[0] * j, cz = v.c[1] + ex[1] * (u + 0.3) + ey[1] * j;
          parts.push(box(0.6, 0.09, 0.07, row, cx, g.at(cx, cz), cz, -a));
        }
        const px = v.c[0] + ex[0] * (-len / 2 + 0.15) + ey[0] * j, pz = v.c[1] + ex[1] * (-len / 2 + 0.15) + ey[1] * j;
        parts.push(box(0.025, 0.12, 0.025, post, px, g.at(px, pz), pz, 0));
      }
    }
    this.add(parts.map(plainUv), this.mats.byKind.plain);
  }

  // ───────────────────────────── trees and bushes ─────────────────────────────

  private trees() {
    const leaves = (parts: THREE.BufferGeometry[], tint: ((x: number, y: number, z: number) => [number, number, number]) | null = null) => {
      const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
        p.deleteAttribute("uv");
        return p;
      }));
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const c = tint ? tint(pos.getX(i), pos.getY(i), pos.getZ(i)) : [1, 1, 1];
        col[3 * i] = c[0];
        col[3 * i + 1] = c[1];
        col[3 * i + 2] = c[2];
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    };
    // Soft, lumpy canopies: every lobe is dented by a noise of its own vertex positions (the same
    // position always moves the same way, so lobes stay closed), shaded with normals that lean out
    // from the crown's centre, and darker underneath and inside than at the sunlit top.
    const hash = (x: number, y: number, z: number, sd: number) => {
      const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + sd * 19.19) * 43758.5453;
      return (v - Math.floor(v)) * 2 - 1;
    };
    const lobe = (r: number, detail: number, amp: number, sd: number, x: number, y: number, z: number, sy = 1) => {
      const g = new THREE.IcosahedronGeometry(r, detail);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const k = 1 + amp * hash(Math.round(px * 1e3), Math.round(py * 1e3), Math.round(pz * 1e3), sd);
        pos.setXYZ(i, px * k, py * k * sy, pz * k);
      }
      g.translate(x, y, z);
      return g as THREE.BufferGeometry;
    };
    /** Merged crown with normals leaning out from (cx, cy, cz) and an ambient-occlusion tint. */
    const crown = (parts: THREE.BufferGeometry[], cx: number, cy: number, cz: number, lean: number, tint: (x: number, y: number, z: number) => [number, number, number]) => {
      const g = mergeGeometries(parts.map((p) => {
        const q = p.index ? p.toNonIndexed() : p;
        q.deleteAttribute("uv");
        q.computeVertexNormals();
        return q;
      }));
      const pos = g.attributes.position, nor = g.attributes.normal;
      const col = new Float32Array(pos.count * 3);
      const n = new THREE.Vector3(), r = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        r.set(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz).normalize();
        n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).multiplyScalar(1 - lean).addScaledVector(r, lean).normalize();
        nor.setXYZ(i, n.x, n.y, n.z);
        const c = tint(pos.getX(i), pos.getY(i), pos.getZ(i));
        col[3 * i] = c[0];
        col[3 * i + 1] = c[1];
        col[3 * i + 2] = c[2];
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    };
    /** Top-lit tint: dark at y0, bright and a little warm at y1. */
    const ao = (y0: number, y1: number, lo = 0.56, hi = 1.08) => (_x: number, y: number): [number, number, number] => {
      const f = THREE.MathUtils.smoothstep(y, y0, y1);
      const v = lo + (hi - lo) * f;
      return [v * (1 + 0.04 * f), v * (1 + 0.03 * f), v * (1 - 0.06 * f)];
    };
    /** A fir tier: a star of branch tips drooping round a cone. */
    const firTier = (r: number, h: number, y: number, sd: number) => {
      const N = 10, p: number[] = [];
      const rim = Array.from({ length: N }, (_, k) => {
        const a = (k / N) * Math.PI * 2 + sd;
        const rr = r * (k % 2 ? 0.72 : 1) * (1 + 0.08 * hash(k, sd, 1, 3));
        return [Math.cos(a) * rr, y - (k % 2 ? 0.02 : 0.08), Math.sin(a) * rr];
      });
      for (let k = 0; k < N; k++) {
        const a = rim[k], b = rim[(k + 1) % N];
        p.push(0, y + h, 0, b[0], b[1], b[2], a[0], a[1], a[2]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      return g;
    };
    const firTiers = () => [firTier(0.5, 0.5, 0.36, 0.3), firTier(0.41, 0.46, 0.62, 1.1), firTier(0.31, 0.42, 0.88, 2.0), firTier(0.2, 0.4, 1.12, 2.7)];
    const firTint = (x: number, y: number, z: number): [number, number, number] => {
      // branch tips catch the light, the inside of each tier is in shade; the top is brightest
      const out = Math.min(1, Math.hypot(x, z) / 0.35);
      const v = (0.5 + 0.3 * out) * (0.78 + 0.32 * THREE.MathUtils.smoothstep(y, 0.3, 1.5));
      return [v, v * 1.02, v * 0.96];
    };
    const deciduous = this.opt.low
      ? [lobe(0.42, 0, 0.1, 1, 0, 0.92, 0, 0.9), lobe(0.31, 0, 0.12, 2, 0.24, 1.06, 0.08), lobe(0.29, 0, 0.12, 3, -0.22, 1.0, -0.1), lobe(0.25, 0, 0.12, 4, 0.03, 1.25, -0.05)]
      : [lobe(0.44, 1, 0.13, 1, 0, 0.95, 0, 0.88), lobe(0.3, 0, 0.14, 2, 0.28, 0.88, 0.1), lobe(0.28, 0, 0.14, 3, -0.25, 0.92, -0.13), lobe(0.24, 0, 0.14, 4, 0.05, 1.22, -0.06)];
    const SPECIES: { f: THREE.BufferGeometry; t: THREE.BufferGeometry; cols: string[]; trunk: string }[] = [
      // (trunks are open tubes: their ends are never seen)
      { f: crown(firTiers(), 0, 0.85, 0, 0.45, firTint), t: new THREE.CylinderGeometry(0.04, 0.08, 0.4, 6, 1, true).translate(0, 0.2, 0), cols: ["#3d7d3a", "#2d6634", "#467f3f", "#2a5b30"], trunk: "#5b3f2a" },
      {
        f: crown(deciduous, 0, 0.98, 0, 0.7, ao(0.55, 1.4)),
        t: new THREE.CylinderGeometry(0.04, 0.075, 0.7, 6, 1, true).translate(0, 0.35, 0),
        cols: ["#5f9e45", "#4f8f3d", "#6aa84c", "#7fa543", "#c99a3a", "#477f3a"],
        trunk: "#5e4330",
      },
      {
        f: leaves(
          Array.from({ length: 7 }, (_, i) => {
            const g = new THREE.ConeGeometry(0.09, 0.75, 3);
            g.rotateZ(-Math.PI / 2 - 0.5);
            g.translate(0.36, -0.1, 0);
            g.scale(1, 0.6, 1.6);
            g.rotateY((i / 7) * Math.PI * 2);
            g.translate(0.08, 1.32, 0);
            return g as THREE.BufferGeometry;
          }).concat([new THREE.SphereGeometry(0.07, 6, 4).translate(0.08, 1.3, 0)]),
        ),
        t: mergeGeometries([0, 1, 2, 3].map((i) => new THREE.CylinderGeometry(0.035, 0.05, 0.34, 6).translate(i * 0.025, 0.17 + i * 0.33, 0))),
        cols: ["#5fbf4a", "#4fae40", "#6dcc55"],
        trunk: "#a07b52",
      },
      {
        f: crown(firTiers(), 0, 0.85, 0, 0.45, (x, y, z) => {
          // snow on the tiers' upper faces, dark green under them
          const out = Math.min(1, Math.hypot(x, z) / 0.35);
          const snow = out < 0.6 || y > 1.3 ? 1 : 0.35;
          return [0.3 + 0.66 * snow, 0.42 + 0.56 * snow, 0.3 + 0.68 * snow];
        }),
        t: new THREE.CylinderGeometry(0.05, 0.08, 0.35, 5).translate(0, 0.17, 0),
        cols: ["#ffffff", "#f2f6f2", "#e8efe9"],
        trunk: "#6e4a31",
      },
      {
        f: leaves([
          new THREE.CylinderGeometry(0.075, 0.085, 0.95, 8).translate(0, 0.475, 0),
          new THREE.SphereGeometry(0.075, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.95, 0),
          new THREE.CylinderGeometry(0.05, 0.05, 0.22, 7).rotateZ(Math.PI / 2).translate(0.15, 0.45, 0),
          new THREE.CylinderGeometry(0.05, 0.05, 0.32, 7).translate(0.25, 0.6, 0),
          new THREE.CylinderGeometry(0.045, 0.045, 0.16, 7).rotateZ(Math.PI / 2).translate(-0.12, 0.6, 0),
          new THREE.CylinderGeometry(0.045, 0.045, 0.24, 7).translate(-0.2, 0.71, 0),
        ]),
        t: new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6),
        cols: ["#4f8f4a", "#5a9a52", "#467f44"],
        trunk: "#7a6a4a",
      },
      { f: leaves([new THREE.SphereGeometry(0.2, 8, 7).scale(1, 3.4, 1).translate(0, 0.88, 0)]), t: new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5).translate(0, 0.15, 0), cols: ["#2f5a2e", "#355f33", "#2a5229"], trunk: "#5b4330" },
      {
        f: leaves([new THREE.IcosahedronGeometry(0.36, 1).scale(1.25, 0.62, 1.15).translate(0, 0.6, 0), new THREE.IcosahedronGeometry(0.22, 0).translate(0.2, 0.72, 0.1)]),
        t: mergeGeometries([new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6).translate(0, 0.2, 0), new THREE.CylinderGeometry(0.035, 0.05, 0.25, 5).rotateZ(-0.6).translate(0.08, 0.42, 0)]),
        cols: ["#8fa36a", "#9aae78", "#839a62"],
        trunk: "#6b5a46",
      },
    ];
    const groups: Record<string, number[][]> = {};
    this.data.copaci.forEach((tr, i) => {
      if (this.opt.low && !tr[5] && (tr[4] === 0 || tr[4] === 1) && i % 3 === 0) return;
      (groups[`${tr[4] ?? 0}|${this.tileOf(tr[0], tr[1])}`] ||= []).push(tr);
    });
    const c = new THREE.Color();
    const trunkMats = new Map<number, THREE.MeshStandardMaterial>();
    for (const key in groups) {
      const [k] = key.split("|").map(Number);
      const list = groups[key], sp = SPECIES[k];
      const f = new THREE.InstancedMesh(sp.f, this.mats.leaves, list.length);
      if (!trunkMats.has(k)) trunkMats.set(k, new THREE.MeshStandardMaterial({ color: sp.trunk, roughness: 0.9 }));
      const t = new THREE.InstancedMesh(sp.t, trunkMats.get(k)!, list.length);
      f.castShadow = t.castShadow = !this.opt.low;
      f.receiveShadow = true;
      list.forEach((tr, i) => {
        let ci = k === 0 && tr[3] === 1 ? 1 + (i % 2) * 2 : Math.floor(Math.abs(Math.sin(i * 12.9898 + k)) * sp.cols.length) % sp.cols.length;
        if (k === 1 && ci === 4 && i % 7) ci = 0;
        c.set(sp.cols[ci]).offsetHSL(Math.sin(i * 3.1) * 0.015, 0, Math.sin(i * 78.233) * 0.04);
        f.setColorAt(i, c);
        const s = tr[2] * (k === 2 ? 1.05 : 0.92);
        M4.compose(V.set(tr[0], this.ground.at(tr[0], tr[1]) - 0.05, tr[1]), Q.setFromAxisAngle(YAX, i * 2.399 + tr[0]), SC.set(s, s * (0.88 + (i % 5) * 0.06), s));
        f.setMatrixAt(i, M4);
        t.setMatrixAt(i, M4);
      });
      f.computeBoundingSphere();
      t.computeBoundingSphere();
      this.root.add(f, t);
    }
    // bushes: one rounded shape, tinted per bush
    const bush = crown([lobe(0.2, 0, 0.16, 9, 0, 0.1, 0, 0.75), lobe(0.13, 0, 0.18, 10, 0.12, 0.08, 0.05)], 0, 0.06, 0, 0.65, ao(-0.02, 0.24, 0.58, 1.06));
    const PAL = [["#5aa843", "#4b9640", "#6cb84c", "#7aa83f"], ["#8a8a4a", "#7d7a45", "#9a9055", "#6f7a43"], ["#46693a", "#3e6034", "#527542", "#5a6e3a"]];
    const list = this.data.tufe;
    const m = new THREE.InstancedMesh(bush, this.mats.leaves, Math.max(1, list.length));
    m.count = list.length;
    m.castShadow = !this.opt.low;
    m.receiveShadow = true;
    list.forEach((b, i) => {
      const pal = PAL[b[3] ?? 0];
      c.set(pal[i % 4]);
      if (b.length === 3 && i % 23 === 0) c.set("#d96a8a");
      if (b.length === 3 && i % 31 === 0) c.set("#f0d24a");
      m.setColorAt(i, c);
      M4.compose(V.set(b[0], this.ground.at(b[0], b[1]) - 0.03, b[1]), Q.setFromAxisAngle(YAX, i * 1.7), SC.set(b[2], b[2], b[2]));
      m.setMatrixAt(i, M4);
    });
    m.computeBoundingSphere();
    this.root.add(m);
  }

  // ───────────────────────────── parked cars ─────────────────────────────

  private parked() {
    const COLORS = ["#d8423a", "#2f7fd1", "#f4f5f6", "#20252c", "#f2b134", "#9aa4ae", "#3aa76d", "#e57c2f"].map((h) => new THREE.Color(h));
    const spots: [number, number, number, number][] = this.data.parcate.map((p) => [p[0], p[1], p[2], p[3]]);
    for (const pk of this.data.drumuri.parcari) {
      const [cx, cz] = pk.c, [tx, tz] = pk.t, nx = -tz, nz = tx;
      for (const sd of [-1, 1]) {
        const nr = Math.floor((pk.L - 0.5) / 0.34);
        for (let j = 0; j < nr; j++) {
          if (Math.sin(j * 12.9898 + sd * 78.233 + cx) > 0.35) continue;
          const u = -pk.L / 2 + 0.35 + j * 0.34, v = sd * (pk.W / 2 - 0.36);
          spots.push([cx + tx * u + nx * v, cz + tz * u + nz * v, Math.atan2(-(nz * -sd), nx * -sd), (j * 3 + (sd > 0 ? 1 : 0)) % 8]);
        }
      }
    }
    const m = new THREE.InstancedMesh(carGeometry(), this.mats.car, Math.max(1, spots.length));
    m.count = spots.length;
    m.castShadow = true;
    spots.forEach(([x, z, a, ci], i) => {
      m.setColorAt(i, COLORS[ci % COLORS.length]);
      m.setMatrixAt(i, M4.compose(V.set(x, this.ground.at(x, z) + 0.01, z), Q.setFromAxisAngle(YAX, a), SC.set(1, 1, 1)));
    });
    m.computeBoundingSphere();
    this.root.add(m);
  }

  // ───────────────────────────── landmarks ─────────────────────────────

  private object(parts: (THREE.BufferGeometry | null)[], mat: THREE.Material = this.mats.byKind.plain) {
    const m = new THREE.Mesh(mergeGeometries(parts.filter((p): p is THREE.BufferGeometry => !!p).map(plainUv)), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private place(m: THREE.Object3D, x: number, z: number, dy = -0.05) {
    m.position.set(x, this.ground.at(x, z) + dy, z);
    this.root.add(m);
    return m;
  }

  private landmarks() {
    const P = this.data.props as Record<string, number[][]>;
    const list = (k: string) => (P[k] ?? []).filter((p) => Array.isArray(p)) as number[][];
    const R = C("#d8423a"), A = C("#f4f6f8"), G = C("#5d6672"), GOLD = C("#f2b134"), BLUE = C("#2463b8");
    const lighthouse = () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        const g = new THREE.CylinderGeometry(0.42 - i * 0.03, 0.45 - i * 0.03, 0.5, 14);
        g.translate(0, 0.25 + i * 0.5, 0);
        parts.push(paint(g, i % 2 ? R : A));
      }
      parts.push(cylinder(0.32, 0.45, C("#fff3b0"), 0, 3, 0, 10), paint(new THREE.ConeGeometry(0.4, 0.4, 10).translate(0, 3.65, 0), R));
      return this.object(parts);
    };
    for (const [x, z] of list("far")) this.place(lighthouse(), x, z);
    for (const [x, z] of list("faruri")) this.place(lighthouse(), x, z).scale.setScalar(0.85);
    for (const [x, z, rot, s] of list("nave")) {
      const parts = [box(3.6, 0.55, 1.0, C("#a8382e"), 0, -0.25, 0, 0), box(3.5, 0.12, 0.95, G, 0, 0.3, 0, 0), box(0.6, 0.9, 0.8, A, -1.45, 0.42, 0, 0)];
      const cols = [R, C("#2f7fd1"), GOLD, C("#3aa76d")];
      for (let i = 0; i < 5; i++) parts.push(box(0.42, 0.34, 0.8, cols[i % 4], -0.75 + i * 0.5, 0.42, 0, 0));
      parts.push(paint(new THREE.ConeGeometry(0.5, 0.9, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.55, 1).translate(2.2, 0.03, 0), C("#a8382e")));
      const m = this.object(parts);
      m.position.set(x, 0.05, z);
      m.rotation.y = rot;
      m.scale.setScalar(s);
      this.root.add(m);
    }
    const wing = (span: number, root: number, tip: number, sweep: number, thick: number, c: THREE.Color, y: number, xOff: number) => {
      const s = new THREE.Shape();
      s.moveTo(root / 2, 0);
      s.lineTo(-root / 2, 0);
      s.lineTo(-root / 2 - sweep - tip / 2, span);
      s.lineTo(-root / 2 - sweep + tip / 2, span);
      s.closePath();
      return [1, -1].map((sg) => {
        const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
        g.rotateX(Math.PI / 2);
        g.scale(1, 1, sg);
        g.translate(xOff, y + thick / 2, 0);
        return paint(g, c);
      });
    };
    for (const [x, z, rot] of list("avioane")) {
      const parts: THREE.BufferGeometry[] = [
        paint(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 14).rotateZ(Math.PI / 2).translate(0, 0.42, 0), A),
        paint(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(1.9, 1, 1).translate(1.1, 0.42, 0), A),
        paint(new THREE.ConeGeometry(0.15, 0.6, 14).rotateZ(Math.PI / 2).translate(-1.4, 0.45, 0), A),
        paint(new THREE.CylinderGeometry(0.152, 0.152, 1.9, 14, 1, true, Math.PI * 0.62, Math.PI * 0.26).rotateZ(Math.PI / 2).translate(-0.05, 0.42, 0), BLUE),
        box(0.16, 0.04, 0.3, C("#203040"), 1.18, 0.5, 0, 0),
        ...wing(1.25, 0.62, 0.18, 0.55, 0.05, A, 0.33, 0.12),
        ...wing(0.48, 0.32, 0.12, 0.22, 0.04, A, 0.47, -1.32),
      ];
      const fin = new THREE.Shape();
      fin.moveTo(0, 0);
      fin.lineTo(-0.42, 0);
      fin.lineTo(-0.62, 0.62);
      fin.lineTo(-0.42, 0.62);
      fin.closePath();
      parts.push(paint(new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: false }).translate(-1.05, 0.52, -0.02), BLUE));
      for (const sz of [0.55, -0.55]) {
        parts.push(paint(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 12).rotateZ(Math.PI / 2).translate(0.05, 0.24, sz), C("#c9d0d8")));
        parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12).rotateZ(Math.PI / 2).translate(0.27, 0.24, sz), C("#2b3138")));
      }
      for (let i = 0; i < 11; i++) parts.push(box(0.05, 0.035, 0.302, C("#2a3a4c"), 0.8 - i * 0.17, 0.47, 0, 0));
      for (const [gx, gz] of [[0.9, 0], [-0.05, 0.14], [-0.05, -0.14]]) parts.push(cylinder(0.05, 0.27, C("#2b3138"), gx, 0.0, gz, 8));
      const m = this.place(this.object(parts), x, z);
      m.rotation.y = rot;
      m.scale.setScalar(1.15);
    }
    for (const [x, z] of list("turn_control")) this.place(this.object([cylinder(0.32, 4.2, A, 0, 0, 0, 12), cylinder(0.7, 0.55, C("#3f6f9e"), 0, 4.2, 0, 12), cylinder(0.78, 0.12, A, 0, 4.75, 0, 12), cylinder(0.04, 0.7, R, 0, 4.85, 0, 6)]), x, z);
    for (const [x, z] of list("macarale")) {
      const O = C("#e57c2f");
      const m = this.place(this.object([box(0.12, 2.6, 0.12, O, -0.35, 0, -0.35, 0), box(0.12, 2.6, 0.12, O, 0.35, 0, -0.35, 0), box(0.12, 2.6, 0.12, O, -0.35, 0, 0.35, 0), box(0.12, 2.6, 0.12, O, 0.35, 0, 0.35, 0), box(0.9, 0.35, 0.9, O, 0, 2.6, 0, 0), box(3.4, 0.16, 0.2, O, 0.9, 2.95, 0, 0), box(0.08, 1.2, 0.08, G, 2.3, 1.75, 0, 0)]), x, z);
      m.rotation.y = 0.6;
    }
    for (const [x, z, ang, s] of list("turbine")) {
      const t = this.place(this.object([cylinder(0.13, 6.4, A, 0, 0, 0, 10, 0.06), box(0.62, 0.24, 0.24, A, -0.08, 6.32, 0, 0), box(0.2, 0.05, 0.25, C("#d8dde3"), 0.2, 6.32, 0, 0)]), x, z);
      t.rotation.y = ang;
      t.scale.setScalar(s);
      const rotor = this.object([
        sphere(0.12, A, 0, 0, 0, false, 1.6, 1, 1),
        ...[0, 1, 2].map((i) => {
          const g = new THREE.BoxGeometry(0.03, 2.9, 0.16);
          g.translate(0, 1.55, 0);
          g.rotateX((i * Math.PI * 2) / 3);
          return paint(g, A);
        }),
      ]);
      rotor.position.set(0.32, 6.44, 0);
      t.add(rotor);
      this.animated.rotors.push([rotor, 0.9 + ((x * 7) % 0.4), "x"]);
    }
    for (const [x, z, ang] of list("mori")) {
      const m = this.place(this.object([cylinder(0.45, 1.7, C("#f1ece2"), 0, 0, 0, 12, 0.32), cone(0.42, 0.5, C("#6b4328"), 0, 1.7, 0, 12), box(0.2, 0.36, 0.04, C("#5a3820"), 0, 0.02, 0.44, 0), ...[0.6, 1.15].map((y) => box(0.12, 0.14, 0.03, C("#3d4f63"), 0, y, 0.4, 0))]), x, z);
      m.rotation.y = ang;
      const sails = this.object([
        box(0.1, 0.1, 0.1, C("#5a3820"), 0, -0.05, 0, 0),
        ...[0, 1, 2, 3].map((i) => {
          const g = mergeGeometries([new THREE.BoxGeometry(0.03, 1.25, 0.03).translate(0, 0.65, 0), new THREE.BoxGeometry(0.2, 1.0, 0.012).translate(0.11, 0.75, 0)].map((q) => q.toNonIndexed()));
          g.rotateZ((i * Math.PI) / 2);
          return paint(g, C("#efe6d6"));
        }),
      ]);
      sails.position.set(0, 1.88, 0.5);
      m.add(sails);
      this.animated.rotors.push([sails, 0.5, "z"]);
    }
    for (const [x, z, phase, rot] of list("pompe")) {
      const base = this.place(this.object([box(1.1, 0.08, 0.28, C("#5d6672"), 0, 0, 0, 0), beam(-0.15, 0.08, -0.1, 0.0, 0.62, 0, 0.05, C("#2f5f8a")), beam(-0.15, 0.08, 0.1, 0.0, 0.62, 0, 0.05, C("#2f5f8a")), beam(0.18, 0.08, -0.1, 0.0, 0.62, 0, 0.05, C("#2f5f8a")), beam(0.18, 0.08, 0.1, 0.0, 0.62, 0, 0.05, C("#2f5f8a")), box(0.2, 0.22, 0.2, C("#5d6672"), -0.42, 0.08, 0, 0), cylinder(0.04, 0.5, C("#3a3f45"), 0.5, -0.1, 0, 8)]), x, z);
      base.rotation.y = rot;
      const arm = this.object([box(1.05, 0.08, 0.07, C("#e0a028"), 0.05, -0.04, 0, 0), box(0.1, 0.3, 0.09, C("#e0a028"), 0.55, -0.22, 0, 0), box(0.18, 0.12, 0.1, C("#3a3f45"), -0.45, -0.1, 0, 0)]);
      arm.position.set(0, 0.64, 0);
      base.add(arm);
      this.animated.pumps.push([arm, phase]);
    }
    for (const [x, z] of list("turn_apa")) {
      const parts: (THREE.BufferGeometry | null)[] = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(beam(sx * 0.32, 0, sz * 0.32, sx * 0.24, 1.1, sz * 0.24, 0.05, C("#6b4a2e")));
      parts.push(beam(-0.3, 0.5, -0.3, 0.3, 0.5, 0.3, 0.025, C("#6b4a2e")), beam(0.3, 0.5, -0.3, -0.3, 0.5, 0.3, 0.025, C("#6b4a2e")));
      parts.push(cylinder(0.36, 0.5, C("#9a6e45"), 0, 1.1, 0, 16), cylinder(0.365, 0.03, C("#4a3a2a"), 0, 1.25, 0, 16), cylinder(0.365, 0.03, C("#4a3a2a"), 0, 1.45, 0, 16), cone(0.4, 0.22, C("#5b4a3a"), 0, 1.6, 0, 16));
      this.place(this.object(parts), x, z);
    }
    for (const [x, z, rot] of list("panou")) {
      const m = this.place(this.object([box(0.06, 1.0, 0.06, G, -0.45, 0, 0, 0), box(0.06, 1.0, 0.06, G, 0.45, 0, 0, 0), box(1.4, 0.62, 0.05, C("#3a3f45"), 0, 0.92, -0.03, 0)]), x, z);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.56), new THREE.MeshStandardMaterial({ map: billboardTexture(), roughness: 0.7 }));
      face.position.set(0, 1.23, 0);
      m.add(face);
      m.rotation.y = rot;
    }
    for (const [x, z] of list("fantani")) {
      const m = this.place(this.object([cylinder(0.46, 0.12, C("#e6dfd0"), 0, 0, 0, 24), cylinder(0.4, 0.13, C("#5fc3e4"), 0, 0.0, 0, 24), cylinder(0.05, 0.36, C("#e6dfd0"), 0, 0.1, 0, 10), cylinder(0.16, 0.05, C("#e6dfd0"), 0, 0.44, 0, 16), cylinder(0.13, 0.03, C("#7fd3ec"), 0, 0.47, 0, 16)]), x, z, 0.02);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#e8f8ff", transparent: true, opacity: 0.55, roughness: 0.1 }));
      jet.position.set(0, 0.68, 0);
      jet.rotation.x = Math.PI;
      m.add(jet);
    }
    for (const [x, z, rot] of list("semafor_drag")) {
      const parts = [box(0.05, 1.0, 0.05, G, 0, 0, 0, 0), box(0.14, 0.62, 0.08, C("#22262b"), 0, 0.72, 0, 0)];
      ["#ffb020", "#ffb020", "#ffb020", "#3ad16b", "#e8473b"].forEach((cc, i) => {
        for (const sd of [-1, 1]) parts.push(box(0.05, 0.07, 0.03, C(cc), sd * 0.035, 1.24 - i * 0.11, 0.045, 0));
      });
      this.place(this.object(parts), x, z).rotation.y = rot;
    }
    for (const [x, z, rot] of list("arcade")) {
      const parts = [box(0.16, 1.5, 0.16, A, 0, 0, -1.25, 0), box(0.16, 1.5, 0.16, A, 0, 0, 1.25, 0), box(0.2, 0.3, 2.66, C("#22262b"), 0, 1.5, 0, 0)];
      for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) parts.push(box(0.21, 0.13, 0.26, (i + j) % 2 ? A : C("#22262b"), 0, 1.52 + j * 0.13, -1.17 + i * 0.26, 0));
      for (let i = 0; i < 5; i++) parts.push(box(0.06, 0.06, 0.06, C(i < 3 ? "#e8473b" : "#3ad16b"), 0.11, 1.56, -0.5 + i * 0.25, 0));
      this.place(this.object(parts), x, z).rotation.y = rot;
    }
    for (const [x, z] of list("observator")) {
      const m = this.place(this.object([cylinder(0.55, 0.62, A, 0, 0, 0, 24), cylinder(0.58, 0.06, C("#c9d0d8"), 0, 0.62, 0, 24), box(0.6, 0.38, 0.45, A, 0.7, 0, 0.1, 0), cylinder(0.025, 0.8, G, 0.85, 0.38, 0.2, 6)]), x, z, -0.08);
      const dome = this.object([sphere(0.55, C("#dfe5ec"), 0, 0, 0, true), box(0.12, 0.5, 0.6, C("#2a3440"), 0, 0.02, 0.2, 0)], this.mats.byKind.metal);
      dome.position.set(0, 0.66, 0);
      m.add(dome);
      this.animated.rotors.push([dome, 0.06, "y"]);
    }
    // solar panels, hay bales, beach umbrellas and yachts: instanced
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, items: number[][], pose: (p: number[]) => [number, number, number, number, number], color?: (p: number[], i: number) => string) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      m.count = items.length;
      m.castShadow = true;
      m.receiveShadow = true;
      const c = new THREE.Color();
      items.forEach((p, i) => {
        const [x, y, z, r, s] = pose(p);
        m.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromAxisAngle(YAX, r), SC.set(s, s, s)));
        if (color) m.setColorAt(i, c.set(color(p, i)));
      });
      m.computeBoundingSphere();
      this.root.add(m);
    };
    const g = this.ground;
    const tilted = (w: number, t: number, d: number, c: THREE.Color, y: number) => {
      const q = new THREE.BoxGeometry(w, t, d);
      q.rotateX(0.42);
      q.translate(0, y, 0);
      return paint(q, c);
    };
    inst(mergeGeometries([tilted(0.74, 0.025, 0.46, C("#24467a"), 0.27), tilted(0.76, 0.02, 0.48, C("#c9ced4"), 0.262), box(0.04, 0.34, 0.04, C("#9aa4ae"), -0.3, 0, -0.12, 0), box(0.04, 0.34, 0.04, C("#9aa4ae"), 0.3, 0, -0.12, 0), box(0.04, 0.2, 0.04, C("#9aa4ae"), -0.3, 0, 0.12, 0), box(0.04, 0.2, 0.04, C("#9aa4ae"), 0.3, 0, 0.12, 0)].map(plainUv)), this.mats.byKind.metal, list("panouri"), (p) => [p[0], g.at(p[0], p[1]) - 0.02, p[1], 0, 1]);
    inst(plainUv(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.15, 12).rotateX(Math.PI / 2).translate(0, 0.1, 0), C("#e2bc62"))), this.mats.byKind.plain, list("baloti"), (p) => [p[0], g.at(p[0], p[1]) - 0.01, p[1], p[2], 1]);
    const UMB = ["#e8473b", "#f2b134", "#2f7fd1", "#3aa76d", "#f4f5f6", "#e57c2f"];
    const umb = list("umbrele");
    inst(plainUv(cylinder(0.012, 0.24, C("#e8e4dc"), 0, 0, 0, 5)), this.mats.byKind.plain, umb, (p) => [p[0], g.at(p[0], p[1]) - 0.01, p[1], 0, 1]);
    inst(plainUv(cone(0.16, 0.07, C("#ffffff"), 0, 0.2, 0, 8)), this.mats.byKind.plain, umb, (p) => [p[0], g.at(p[0], p[1]) - 0.01, p[1], 0, 1], (p) => UMB[p[2] % UMB.length]);
    inst(mergeGeometries([box(0.075, 0.025, 0.19, C("#ffffff"), 0.2, 0, 0.02, 0.3), box(0.075, 0.025, 0.19, C("#ffffff"), -0.18, 0, 0.06, -0.2)].map(plainUv)), this.mats.byKind.plain, umb, (p) => [p[0], g.at(p[0], p[1]) + 0.005, p[1], p[2] * 1.3, 1]);
    const hull = () => {
      const s = new THREE.Shape();
      s.moveTo(-0.5, -0.16);
      s.lineTo(0.3, -0.16);
      s.quadraticCurveTo(0.58, -0.05, 0.62, 0);
      s.quadraticCurveTo(0.58, 0.05, 0.3, 0.16);
      s.lineTo(-0.5, 0.16);
      s.closePath();
      const q = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false });
      q.rotateX(-Math.PI / 2);
      q.translate(0, -0.04, 0);
      return paint(q, C("#fbfbf8"));
    };
    const yachts = list("iahturi").map((p, i) => [...p, i]);
    inst(mergeGeometries([hull(), box(0.42, 0.1, 0.24, C("#f4f6f8"), -0.08, 0.1, 0, 0), box(0.36, 0.05, 0.25, C("#2a3a4c"), -0.06, 0.15, 0, 0), box(0.2, 0.06, 0.2, C("#f4f6f8"), -0.12, 0.2, 0, 0), box(0.84, 0.02, 0.3, C("#8a6a4a"), -0.04, 0.095, 0, 0)].map(plainUv)), this.mats.byKind.plain, yachts.filter((p) => p[4] % 2 === 0), (p) => [p[0], 0.04, p[1], p[2], p[3]]);
    const sail = (pts: [number, number][], dx: number, dy: number, c: THREE.Color) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (const [a, b] of pts.slice(1)) s.lineTo(a, b);
      s.closePath();
      return paint(new THREE.ShapeGeometry(s).translate(dx, dy, 0), c);
    };
    inst(
      mergeGeometries([hull(), box(0.26, 0.08, 0.18, C("#f4f6f8"), -0.15, 0.1, 0, 0), cylinder(0.012, 1.25, C("#c9ced4"), 0.06, 0.1, 0, 5), sail([[0, 0], [-0.48, 0], [0, 1.05]], 0.05, 0.18, C("#ffffff")), sail([[0, 0], [0.42, 0], [0, 0.9]], 0.07, 0.2, C("#f2f2ec"))].map(plainUv)),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
      yachts.filter((p) => p[4] % 2 === 1),
      (p) => [p[0], 0.04, p[1], p[2], p[3]],
    );
    for (const [x, z, len, rot] of list("docuri")) {
      const parts = [box(0.26, 0.06, len, C("#9a7a56"), 0, 0.06, 0, 0)];
      for (let s = -len / 2 + 0.2; s < len / 2; s += 0.9) for (const sd of [-1, 1]) parts.push(cylinder(0.03, 0.75, C("#6b5a46"), sd * 0.14, -0.55, s, 6));
      const m = this.object(parts);
      m.position.set(x, 0, z);
      m.rotation.y = rot;
      this.root.add(m);
    }
  }

  // ───────────────────────────── cable car ─────────────────────────────

  private cableCar() {
    const g = this.ground;
    const lines = (this.data.props.telegondola ?? []) as unknown as { a: [number, number]; b: [number, number] }[];
    for (const tg of lines) {
      const [ax, az] = tg.a, [bx, bz] = tg.b, L = Math.hypot(bx - ax, bz - az);
      const ya = g.at(ax, az) + 1.15, yb = g.at(bx, bz) + 1.1;
      const n = Math.max(2, Math.ceil(L / 6.5)), pts: [number, number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        let y = ya + (yb - ya) * t;
        if (i > 0 && i < n) y = Math.max(y, g.at(x, z) + 1.3);
        pts.push([x, y, z]);
      }
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux, parts: (THREE.BufferGeometry | null)[] = [];
      for (let i = 1; i < n; i++) {
        const [x, y, z] = pts[i], h0 = g.at(x, z) - 0.1;
        parts.push(beam(x, h0, z, x, y + 0.1, z, 0.09, C("#8d96a0")));
        parts.push(beam(x - nx * 0.32, y + 0.1, z - nz * 0.32, x + nx * 0.32, y + 0.1, z + nz * 0.32, 0.06, C("#8d96a0")));
      }
      const wires = [-1, 1].map((sd) => pts.map(([x, y, z]) => [x + nx * 0.28 * sd, y + 0.04, z + nz * 0.28 * sd]));
      for (const f of wires) for (let i = 0; i < f.length - 1; i++) parts.push(beam(f[i][0], f[i][1], f[i][2], f[i + 1][0], f[i + 1][1], f[i + 1][2], 0.016, C("#3a3f45")));
      this.root.add(this.object(parts));
      const cab = mergeGeometries([box(0.24, 0.2, 0.2, C("#d8423a"), 0, -0.36, 0, 0), box(0.25, 0.06, 0.21, C("#2a3a4c"), 0, -0.26, 0, 0), box(0.02, 0.18, 0.02, C("#3a3f45"), 0, -0.18, 0, 0)].map(plainUv));
      wires.forEach((f, sd) => {
        const cum = [0];
        for (let i = 1; i < f.length; i++) cum.push(cum[i - 1] + Math.hypot(f[i][0] - f[i - 1][0], f[i][1] - f[i - 1][1], f[i][2] - f[i - 1][2]));
        for (let k = 0; k < 7; k++) {
          const c = new THREE.Mesh(cab, this.mats.byKind.plain);
          c.castShadow = true;
          this.root.add(c);
          this.animated.cabins.push({ c, f, cum, u: k / 7, dir: sd ? 1 : -1 });
        }
      });
    }
  }

  /** Moves the rotors, the pumps and the cable cars. */
  animate(dt: number, t: number) {
    for (const [o, v, ax] of this.animated.rotors) o.rotation[ax] += v * dt;
    for (const [o, f] of this.animated.pumps) o.rotation.z = 0.3 * Math.sin(t * 1.6 + f);
    for (const cb of this.animated.cabins) {
      cb.u = (cb.u + dt * 0.012 * cb.dir + 1) % 1;
      const s = cb.u * cb.cum[cb.cum.length - 1];
      let i = 1;
      while (i < cb.cum.length - 1 && cb.cum[i] < s) i++;
      const k = (s - cb.cum[i - 1]) / Math.max(1e-6, cb.cum[i] - cb.cum[i - 1]), a = cb.f[i - 1], b = cb.f[i];
      cb.c.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
      cb.c.rotation.y = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    }
  }
}

/** A small car: body, cabin, roof, wheels and headlights (its colour comes per instance). */
export function carGeometry() {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.56, 0.12, 0.27).translate(0, 0.1, 0), C("#ffffff")),
    paint(new THREE.BoxGeometry(0.3, 0.11, 0.24).translate(-0.04, 0.215, 0), C("#3a4652")),
    paint(new THREE.BoxGeometry(0.28, 0.02, 0.22).translate(-0.04, 0.275, 0), C("#ffffff")),
    ...[[-0.17, 0.13], [0.17, 0.13], [-0.17, -0.13], [0.17, -0.13]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8).rotateX(Math.PI / 2).translate(x, 0.055, z), C("#22262b"))),
    paint(new THREE.BoxGeometry(0.02, 0.03, 0.2).translate(0.285, 0.12, 0), C("#fff6d0")),
  ].map(plainUv));
}

function billboardTexture() {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 216;
  const g = cv.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 216);
  gr.addColorStop(0, "#f7b733");
  gr.addColorStop(1, "#fc4a1a");
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 216);
  g.fillStyle = "#fff4dc";
  g.font = "700 74px sans-serif";
  g.textAlign = "center";
  g.fillText("MOTEL 66", 256, 96);
  g.font = "600 34px sans-serif";
  g.fillText("DINER · GAS · 2 KM", 256, 160);
  g.strokeStyle = "#fff4dc";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 196);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
