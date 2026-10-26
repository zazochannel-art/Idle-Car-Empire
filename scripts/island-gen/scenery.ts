// Nordheim's scenery: buildings along the roads in the style of each area
// (coloured wooden houses in the town, glass towers on the peninsula, halls
// in the harbour, cabins in the mountains), the ski village, the fishing
// port, the airport, fir forests (snowy higher up), bushes, parked cars, and
// the props: wind turbines, lighthouses, ships, cranes, the cable car.
import { SIZE, type AreaId } from "./design";
import { CABLE_CAR, QUAYS, RAIL, RUNWAY } from "./features";
import { lakeDepth, type Land } from "./land";
import { NODES } from "./network";
import { hash2, pointAt, rng, type P } from "./noise";
import type { BuiltRoad, Lot } from "./roads";
import { forestAt } from "./paint";

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

export interface SceneryOut {
  cladiri: Building[];
  copaci: number[][];
  tufe: number[][];
  parcate: number[][];
  props: Record<string, unknown[]>;
  vii: never[];
  parcari: { c: P; t: P; L: number; W: number; o: number }[];
  /** For the painter: fields, mine pits and ski runs. */
  fields: { c: P; w: number; d: number; a: number; tone: number }[];
  pits: { c: P; r: number }[];
  runs: P[][];
}

const RES = 4;
const FREE = 0;
const WATER = 1;
const ROAD = 2;
const LOT = 3;
const FEATURE = 4;
const BUILT = 5;

class Occupancy {
  readonly W: number;
  readonly H: number;
  readonly cells: Uint8Array;
  constructor(private land: Land) {
    this.W = Math.round(SIZE[0] * RES) + 1;
    this.H = Math.round(SIZE[1] * RES) + 1;
    this.cells = new Uint8Array(this.W * this.H);
    for (let j = 0; j < this.H; j++)
      for (let i = 0; i < this.W; i++) {
        const [x, y] = this.pos(i, j);
        if (land.depthAt(x, y) < 0.45 || lakeDepth(x, y).d > -0.3) this.cells[j * this.W + i] = WATER;
      }
  }
  pos(i: number, j: number): P {
    return [(i / (this.W - 1) - 0.5) * SIZE[0], (j / (this.H - 1) - 0.5) * SIZE[1]];
  }
  cell(x: number, y: number): number {
    const i = Math.round((x / SIZE[0] + 0.5) * (this.W - 1));
    const j = Math.round((y / SIZE[1] + 0.5) * (this.H - 1));
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }
  at(x: number, y: number): number {
    const k = this.cell(x, y);
    return k < 0 ? WATER : this.cells[k];
  }
  /** Every cell within `r` of the points gets `code` (never overwriting water). */
  line(pts: P[], r: number, code: number) {
    for (const [x, y] of pts) this.disk(x, y, r, code);
  }
  disk(x: number, y: number, r: number, code: number) {
    const n = Math.ceil(r * RES);
    for (let dj = -n; dj <= n; dj++)
      for (let di = -n; di <= n; di++) {
        if (Math.hypot(di, dj) > r * RES) continue;
        const k = this.cell(x + di / RES, y + dj / RES);
        if (k >= 0 && this.cells[k] !== WATER) this.cells[k] = Math.max(this.cells[k], code);
      }
  }
  rect(l: { x: number; y: number; w: number; d: number; rot: number }, grow: number, code: number) {
    this.forRect(l, grow, (k) => {
      if (this.cells[k] !== WATER) this.cells[k] = Math.max(this.cells[k], code);
      return true;
    });
  }
  /** Every cell of the rectangle is free land. */
  free(l: { x: number; y: number; w: number; d: number; rot: number }, grow: number): boolean {
    return this.forRect(l, grow, (k) => this.cells[k] === FREE);
  }
  freeDisk(x: number, y: number, r: number): boolean {
    const n = Math.ceil(r * RES);
    for (let dj = -n; dj <= n; dj += 1)
      for (let di = -n; di <= n; di += 1) {
        if (Math.hypot(di, dj) > r * RES) continue;
        const k = this.cell(x + di / RES, y + dj / RES);
        if (k < 0 || this.cells[k] !== FREE) return false;
      }
    return true;
  }
  private forRect(l: { x: number; y: number; w: number; d: number; rot: number }, grow: number, f: (k: number) => boolean): boolean {
    const c = Math.cos(l.rot);
    const s = Math.sin(l.rot);
    const hw = l.w / 2 + grow;
    const hd = l.d / 2 + grow;
    for (let u = -hw; u <= hw + 1e-6; u += 1 / RES)
      for (let v = -hd; v <= hd + 1e-6; v += 1 / RES) {
        const k = this.cell(l.x + u * c + v * s, l.y - u * s + v * c);
        if (k < 0) return false;
        if (!f(k)) return false;
      }
    return true;
  }
}

type Kind = { k: string; w: [number, number]; d: [number, number]; h: [number, number]; v?: number[]; colors: string[]; ds?: string; alee?: number; p: number };
interface Style {
  kinds: Kind[];
  /** Chance a frontage slot gets a building. */
  density: number;
  setback: [number, number];
  /** Rows behind the frontage (0: frontage only). */
  rows: number;
}

const NORDIC = ["#a8322d", "#b5452f", "#e2b33f", "#f1ece2", "#e8e3d6", "#4f7da8", "#3f6e5a", "#c9853a", "#8a3a33"];
const PASTEL = ["#d9c7a8", "#c9d3dc", "#e3d2c0", "#b8c6cf", "#d4b9a3", "#9fb3c2", "#e6dccb"];
const GLASS = ["#4b6f91", "#3e5f7d", "#5d7f9c", "#41698c", "#6a8aa6", "#2f4f6e"];
const METAL = ["#7d8a96", "#8f9ba6", "#6f7c88", "#a0aab4"];

const STYLE: Record<AreaId, Style> = {
  town: {
    kinds: [
      { k: "casa", w: [0.8, 1.15], d: [0.7, 1.05], h: [0.6, 0.8], v: [0, 0, 1], colors: NORDIC, alee: 0.55, p: 0.72 },
      { k: "bloc", w: [1.2, 1.8], d: [1.0, 1.4], h: [1.0, 1.6], colors: PASTEL, ds: "city", p: 0.28 },
    ],
    density: 0.85,
    setback: [0.5, 0.85],
    rows: 1,
  },
  industrial: {
    kinds: [
      { k: "hala", w: [2, 3.8], d: [1.6, 2.6], h: [0.8, 1.3], colors: METAL, ds: "industrial", p: 0.72 },
      { k: "rezervor", w: [0.8, 1.2], d: [0.8, 1.2], h: [0.9, 1.5], colors: ["#d8dde2"], ds: "industrial", p: 0.16 },
      { k: "siloz", w: [0.7, 0.7], d: [0.7, 0.7], h: [1.2, 1.4], colors: ["#c9ced4"], p: 0.12 },
    ],
    density: 0.72,
    setback: [0.8, 1.4],
    rows: 1,
  },
  downtown: {
    kinds: [
      { k: "bloc", w: [1.3, 2.3], d: [1.2, 1.9], h: [1.4, 2.4], colors: PASTEL, ds: "city", p: 0.55 },
      { k: "turn", w: [1.2, 1.7], d: [1.2, 1.7], h: [2.6, 5.6], v: [0, 1, 2], colors: GLASS, p: 0.3 },
      { k: "hotel", w: [1.8, 2.3], d: [1.1, 1.3], h: [1.4, 2.2], v: [0, 2], colors: PASTEL, p: 0.15 },
    ],
    density: 0.9,
    setback: [0.45, 0.7],
    rows: 1,
  },
  automotive: {
    kinds: [
      { k: "hala", w: [2, 3.6], d: [1.6, 2.4], h: [0.8, 1.2], colors: METAL, ds: "automotive", p: 0.6 },
      { k: "bloc", w: [1.2, 2], d: [1, 1.6], h: [1, 1.8], colors: PASTEL, ds: "automotive", p: 0.4 },
    ],
    density: 0.8,
    setback: [0.6, 1.1],
    rows: 1,
  },
  luxury: {
    kinds: [
      { k: "vila", w: [1.1, 1.45], d: [0.9, 1.15], h: [0.6, 0.8], v: [0, 1, 2], colors: ["#f3eee4", "#efe6d6", "#e8dcc6"], p: 0.6 },
      { k: "casa", w: [0.9, 1.15], d: [0.8, 1.1], h: [0.6, 0.8], v: [1], colors: NORDIC, alee: 0.6, p: 0.25 },
      { k: "hotel", w: [1.8, 2.3], d: [1.1, 1.3], h: [1.4, 2.2], v: [0, 2], colors: ["#f3eee4", "#e3d2c0"], p: 0.15 },
    ],
    density: 0.7,
    setback: [0.8, 1.3],
    rows: 1,
  },
  supercar: {
    kinds: [
      { k: "hala", w: [2, 3.4], d: [1.6, 2.4], h: [0.8, 1.2], colors: METAL, ds: "speed", p: 0.5 },
      { k: "bloc", w: [1.2, 2], d: [1.1, 1.7], h: [1.2, 2], colors: GLASS, ds: "dealer", p: 0.3 },
      { k: "turn", w: [1.2, 1.6], d: [1.2, 1.6], h: [2.2, 3.6], v: [1], colors: GLASS, p: 0.2 },
    ],
    density: 0.75,
    setback: [0.6, 1.1],
    rows: 1,
  },
  mega: {
    kinds: [
      { k: "hala", w: [3, 5], d: [2, 2.9], h: [1, 1.6], colors: METAL, ds: "industrial", p: 0.55 },
      { k: "turn", w: [1.3, 1.8], d: [1.3, 1.8], h: [3, 6], v: [1], colors: GLASS, p: 0.25 },
      { k: "rezervor", w: [0.9, 1.3], d: [0.9, 1.3], h: [1, 1.5], colors: ["#d8dde2"], p: 0.2 },
    ],
    density: 0.7,
    setback: [0.8, 1.3],
    rows: 1,
  },
  global: {
    kinds: [
      { k: "turn", w: [1.3, 1.8], d: [1.3, 1.8], h: [4, 8.6], v: [0, 2, 2], colors: GLASS, p: 0.6 },
      { k: "bloc", w: [1.4, 2.4], d: [1.2, 1.9], h: [1.6, 2.2], colors: GLASS, ds: "city", p: 0.3 },
      { k: "hotel", w: [1.8, 2.3], d: [1.1, 1.3], h: [1.6, 2.3], v: [0, 2], colors: PASTEL, p: 0.1 },
    ],
    density: 0.85,
    setback: [0.5, 0.8],
    rows: 1,
  },
  suburbs: {
    kinds: [
      { k: "casa", w: [0.8, 1.15], d: [0.7, 1.05], h: [0.6, 0.8], v: [0, 0, 1], colors: NORDIC, alee: 0.9, p: 0.75 },
      { k: "hambar", w: [1.8, 2.2], d: [1.1, 1.4], h: [0.9, 1], colors: ["#a8322d", "#8a3a33"], p: 0.15 },
      { k: "siloz", w: [0.7, 0.7], d: [0.7, 0.7], h: [1.2, 1.4], colors: ["#c9ced4"], p: 0.1 },
    ],
    density: 0.45,
    setback: [1.0, 2.4],
    rows: 0,
  },
  raw: {
    kinds: [
      { k: "hala", w: [2, 3.4], d: [1.6, 2.4], h: [0.9, 1.4], colors: ["#7a6a5c", "#8a7a6a", "#6b6258"], ds: "industrial", p: 0.6 },
      { k: "siloz", w: [0.7, 0.7], d: [0.7, 0.7], h: [1.2, 1.4], colors: ["#b5b0a8"], p: 0.2 },
      { k: "rezervor", w: [0.8, 1.1], d: [0.8, 1.1], h: [0.9, 1.3], colors: ["#c9ced4"], p: 0.2 },
    ],
    density: 0.35,
    setback: [1.0, 2.0],
    rows: 0,
  },
  mountain: {
    kinds: [
      { k: "cabana", w: [0.8, 1.6], d: [0.7, 1.2], h: [0.7, 1.2], v: [0, 1, 2], colors: ["#6b4328", "#7a4f30", "#5d3a24"], p: 0.9 },
      { k: "hotel", w: [1.8, 2.3], d: [1.1, 1.3], h: [1.4, 2], v: [0], colors: ["#8a5a36", "#f1ece2"], p: 0.1 },
    ],
    density: 0.5,
    setback: [0.9, 1.8],
    rows: 0,
  },
  boulevard: {
    kinds: [
      { k: "hotel", w: [1.8, 2.3], d: [1.1, 1.3], h: [1.6, 2.6], v: [0, 2], colors: ["#f3eee4", "#e3d2c0", "#d9e2ea"], p: 0.45 },
      { k: "vila", w: [1.1, 1.45], d: [0.9, 1.15], h: [0.6, 0.8], v: [0, 1, 2], colors: ["#f3eee4", "#efe6d6"], p: 0.35 },
      { k: "casa", w: [0.9, 1.15], d: [0.8, 1.1], h: [0.6, 0.8], v: [1], colors: NORDIC, alee: 0.5, p: 0.2 },
    ],
    density: 0.8,
    setback: [0.6, 1.0],
    rows: 0,
  },
  port: {
    kinds: [
      { k: "casa", w: [0.8, 1.1], d: [0.7, 1.0], h: [0.6, 0.8], v: [0], colors: ["#a8322d", "#b5452f", "#e2b33f", "#f1ece2"], p: 0.7 },
      { k: "hala", w: [1.8, 2.8], d: [1.2, 1.8], h: [0.8, 1.1], colors: METAL, ds: "port", p: 0.3 },
    ],
    density: 0.8,
    setback: [0.5, 0.9],
    rows: 0,
  },
  airport: {
    kinds: [
      { k: "hala", w: [2.6, 4.2], d: [2, 2.8], h: [1, 1.5], colors: ["#e8ecf0", "#d9dee4"], ds: "airport", p: 0.7 },
      { k: "bloc", w: [1.6, 2.6], d: [1.2, 1.8], h: [1, 1.6], colors: GLASS, ds: "airport", p: 0.3 },
    ],
    density: 0.6,
    setback: [1.0, 1.6],
    rows: 0,
  },
  campus: {
    kinds: [
      { k: "turn", w: [1.2, 1.6], d: [1.2, 1.6], h: [2.2, 3.2], v: [1], colors: GLASS, p: 0.5 },
      { k: "bloc", w: [1.3, 2.1], d: [1.1, 1.7], h: [1.2, 2], colors: PASTEL, ds: "test", p: 0.5 },
    ],
    density: 0.8,
    setback: [0.6, 1.0],
    rows: 0,
  },
  racing: {
    kinds: [{ k: "hala", w: [2, 3], d: [1.4, 2], h: [0.7, 1], colors: METAL, ds: "racing", p: 1 }],
    density: 0.25,
    setback: [1, 1.6],
    rows: 0,
  },
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildScenery(land: Land, roads: BuiltRoad[], lots: Lot[], circuit: P[]): SceneryOut {
  const rnd = rng(4242);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const between = ([a, b]: [number, number]) => a + (b - a) * rnd();
  const occ = new Occupancy(land);
  for (const r of roads) occ.line(r.pts, r.w / 2 + 0.3, ROAD);
  for (const l of lots) occ.rect(l, 0.5, LOT);
  occ.line(circuit, 1.5, FEATURE);
  {
    const L = Math.hypot(RUNWAY.b[0] - RUNWAY.a[0], RUNWAY.b[1] - RUNWAY.a[1]);
    const pts: P[] = [];
    for (let s = -3; s <= L + 3; s += 0.5) pts.push([RUNWAY.a[0] + ((RUNWAY.b[0] - RUNWAY.a[0]) * s) / L, RUNWAY.a[1] + ((RUNWAY.b[1] - RUNWAY.a[1]) * s) / L]);
    occ.line(pts, 2.2, FEATURE);
  }
  occ.line(RAIL, 1.1, FEATURE);
  {
    const pts: P[] = [];
    for (let t = 0; t <= 1; t += 0.02) pts.push([CABLE_CAR.a[0] + (CABLE_CAR.b[0] - CABLE_CAR.a[0]) * t, CABLE_CAR.a[1] + (CABLE_CAR.b[1] - CABLE_CAR.a[1]) * t]);
    occ.line(pts, 0.6, FEATURE);
  }

  // the ski runs down from the summit (no trees on them)
  const runs: P[][] = [];
  for (const off of [-4, 0, 5]) {
    const pts: P[] = [];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = CABLE_CAR.b[0] + (CABLE_CAR.a[0] - CABLE_CAR.b[0]) * t + off * Math.sin(t * 5 + off) * 0.6 + off;
      const y = CABLE_CAR.b[1] + (CABLE_CAR.a[1] - CABLE_CAR.b[1]) * t;
      pts.push([r2(x), r2(y)]);
    }
    runs.push(pts);
  }
  for (const r of runs) occ.line(r, 0.9, FEATURE);

  const cladiri: Building[] = [];
  let seed = 1;
  const addBuilding = (b: Omit<Building, "s">, grow = 0.3): boolean => {
    const rect = { x: b.x, y: b.z, w: b.w, d: b.d, rot: b.r };
    if (!occ.free(rect, grow)) return false;
    occ.rect(rect, grow + 0.1, BUILT);
    cladiri.push({ ...b, x: r3(b.x), z: r3(b.z), w: r2(b.w), d: r2(b.d), r: r3(b.r), h: r2(b.h), s: seed++ });
    return true;
  };
  const kindFor = (st: Style) => {
    let t = rnd();
    for (const k of st.kinds) {
      if (t < k.p) return k;
      t -= k.p;
    }
    return st.kinds[0];
  };
  const make = (kind: Kind, x: number, z: number, r: number): Omit<Building, "s"> => {
    const w = between(kind.w);
    const d = kind.k === "rezervor" || kind.k === "siloz" ? w : between(kind.d);
    const b: Omit<Building, "s"> = { x, z, w, d, r, h: between(kind.h), k: kind.k, c: pick(kind.colors), o: 1 };
    if (kind.ds) b.ds = kind.ds;
    if (kind.v) b.v = pick(kind.v);
    if (kind.alee && rnd() < 0.7) b.alee = r2(kind.alee * (0.7 + rnd() * 0.5));
    return b;
  };

  // ── buildings along the roads, in their area's style
  for (const r of roads) {
    for (const side of [1, -1] as const) {
      let s = 2.4 + rnd() * 1.5;
      while (s < r.len - 2.4) {
        const p = pointAt(r.pts, s);
        const a = land.areaOf(p.x, p.y);
        const st = a ? STYLE[a] : null;
        if (!st || r.decks.some(([d0, d1]) => s > d0 - 1 && s < d1 + 1)) {
          s += 2;
          continue;
        }
        const kind = kindFor(st);
        const nx = -p.ty * side;
        const ny = p.tx * side;
        const rot = Math.atan2(-nx, -ny);
        const proto = make(kind, 0, 0, rot);
        let placed = false;
        if (rnd() < st.density) {
          for (let row = 0; row <= st.rows && !placed; row++) {
            const off = r.w / 2 + between(st.setback) + proto.d / 2 + row * 3.2;
            const b = { ...proto, x: p.x + nx * off, z: p.y + ny * off };
            placed = addBuilding(b);
          }
        }
        s += (placed ? proto.w : 1.2) + 0.35 + rnd() * 0.6;
      }
    }
  }
  // a second row behind the town's and downtown's frontage
  for (const r of roads) {
    if (!r.spec.urban) continue;
    for (const side of [1, -1] as const)
      for (let s = 3; s < r.len - 3; s += 1.6 + rnd()) {
        const p = pointAt(r.pts, s);
        const a = land.areaOf(p.x, p.y);
        if (a !== "town" && a !== "downtown" && a !== "global" && a !== "port") continue;
        const st = STYLE[a];
        const nx = -p.ty * side;
        const ny = p.tx * side;
        const kind = kindFor(st);
        const proto = make(kind, 0, 0, Math.atan2(-nx, -ny));
        const off = r.w / 2 + 3.4 + proto.d / 2 + rnd() * 1.2;
        if (rnd() < st.density * 0.8) addBuilding({ ...proto, x: p.x + nx * off, z: p.y + ny * off });
      }
  }

  // ── the town church, by the square
  {
    const [cx, cy] = NODES.T_C;
    for (let k = 0; k < 200; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 3 + rnd() * 6;
      if (addBuilding({ x: cx + Math.cos(a) * d, z: cy + Math.sin(a) * d, w: 0.98, d: 1.58, r: rnd() * Math.PI, h: 0.9, k: "biserica", c: "#f1ece2" }, 0.5)) break;
    }
  }
  // ── the ski village round the cable car's foot, and the summit station
  const statie = (x: number, z: number) => {
    for (let k = 0; k < 60; k++) if (addBuilding({ x: x + (rnd() - 0.5) * 2, z: z + (rnd() - 0.5) * 2, w: 0.95, d: 0.75, r: Math.atan2(CABLE_CAR.b[0] - CABLE_CAR.a[0], CABLE_CAR.b[1] - CABLE_CAR.a[1]), h: 0.55, k: "statie", c: "#c74a3a" }, 0.1)) return;
  };
  statie(CABLE_CAR.a[0], CABLE_CAR.a[1]);
  statie(CABLE_CAR.b[0], CABLE_CAR.b[1]);
  {
    const [cx, cy] = NODES.M_SKI;
    for (let k = 0; k < 400 && cladiri.filter((b) => b.k === "cabana" && Math.hypot(b.x - cx, b.z - cy) < 10).length < 22; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 2.2 + rnd() * 7;
      const x = cx + Math.cos(a) * d;
      const z = cy + Math.sin(a) * d;
      const big = rnd() < 0.2;
      addBuilding({ x, z, w: big ? between([1.8, 2.5]) : between([0.8, 1.4]), d: big ? between([1.1, 1.4]) : between([0.7, 1.1]), r: Math.atan2(cx - x, cy - z) + (rnd() - 0.5) * 0.6, h: big ? 1.8 : 0.9, k: "cabana", c: pick(["#6b4328", "#7a4f30", "#5d3a24"]), v: big ? 3 : pick([0, 1, 2]) }, 0.3);
    }
    for (let k = 0; k < 80; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 4 + rnd() * 5;
      if (addBuilding({ x: cx + Math.cos(a) * d, z: cy + Math.sin(a) * d, w: 2.3, d: 1.3, r: a + Math.PI / 2, h: 2.2, k: "hotel", c: "#8a5a36", v: 0 }, 0.4)) break;
    }
  }
  // ── the fishing village on the port island
  {
    const [cx, cy] = NODES.P_V;
    for (let k = 0; k < 500 && cladiri.filter((b) => Math.hypot(b.x - cx, b.z - cy) < 9).length < 18; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 1.8 + rnd() * 7;
      const x = cx + Math.cos(a) * d;
      const z = cy + Math.sin(a) * d;
      if (land.depthAt(x, z) > 3.5) continue;
      addBuilding({ x, z, w: between([0.8, 1.1]), d: between([0.7, 0.95]), r: Math.atan2(cx - x, cy - z), h: 0.7, k: "casa", c: pick(["#a8322d", "#b5452f", "#e2b33f", "#f1ece2"]), v: 0 }, 0.25);
    }
  }
  // ── the harbour: containers on the quay
  for (const [qx, qy] of QUAYS.slice(0, 1))
    for (let k = 0; k < 300 && cladiri.filter((b) => b.k === "container").length < 16; k++) {
      const x = qx + (rnd() - 0.5) * 16;
      const z = qy + 3 + (rnd() - 0.2) * 8;
      addBuilding({ x, z, w: between([1.4, 3.6]), d: between([0.6, 1.1]), r: 0.08, h: between([0.3, 0.7]), k: "container", c: pick(["#d8423a", "#2f7fd1", "#f2b134", "#3aa76d", "#e57c2f", "#8a5a9a"]), ds: "port" }, 0.15);
    }
  // ── the racing district: grandstands along the main straight
  {
    let best = 0;
    let at = 0;
    for (let i = 0; i < circuit.length; i++) {
      const a = circuit[i];
      const b = circuit[(i + 8) % circuit.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > best) {
        best = L;
        at = i;
      }
    }
    const a = circuit[at];
    const b = circuit[(at + 8) % circuit.length];
    const tx = (b[0] - a[0]) / best;
    const ty = (b[1] - a[1]) / best;
    for (const side of [1, -1])
      for (const off of [2.6, 3.4]) {
        const x = (a[0] + b[0]) / 2 - ty * side * off;
        const z = (a[1] + b[1]) / 2 + tx * side * off;
        if (addBuilding({ x, z, w: 6, d: 1.3, r: Math.atan2(ty * side, -tx * side) + Math.PI / 2, h: 0.8, k: "tribuna", c: "#d8423a", ds: "racing" }, 0.2)) break;
      }
  }

  // ── trees: fir forests, snowy higher up and in the north; birches in the south
  const copaci: number[][] = [];
  const tufe: number[][] = [];
  const step = 0.78;
  for (let y = -SIZE[1] / 2 + 1; y < SIZE[1] / 2 - 1; y += step)
    for (let x = -SIZE[0] / 2 + 1; x < SIZE[0] / 2 - 1; x += step) {
      const i = Math.round(x / step);
      const j = Math.round(y / step);
      const px = x + (hash2(i, j, 7) - 0.5) * step * 0.9;
      const py = y + (hash2(i, j, 9) - 0.5) * step * 0.9;
      const d = land.depthAt(px, py);
      if (d < 0.8) continue;
      const h = land.height(px, py);
      if (h > 98) continue;
      const forest = forestAt(land, px, py) - (h > 70 ? (h - 70) / 40 : 0);
      const pTree = forest > 0.18 ? 0.85 : forest > 0.02 ? 0.22 : 0.035;
      if (hash2(i, j, 11) > pTree) continue;
      if (!occ.freeDisk(px, py, 0.32)) continue;
      const snowy = h > 32 || (py < -18 && hash2(i, j, 13) < 0.55) || (py < 0 && hash2(i, j, 13) < 0.25);
      let species = snowy ? 3 : 0;
      if (!snowy) {
        const t = hash2(i, j, 17);
        if (py > 10 && t < 0.18) species = 1;
        else if (t > 0.86) species = 5;
      }
      const dense = forest > 0.18;
      copaci.push([r2(px), r2(py), r2((dense ? 0.85 : 0.72) + hash2(i, j, 19) * 0.45), hash2(i, j, 23) < 0.4 ? 1 : 0, species, dense ? 0 : 1]);
    }
  // bushes by the houses and along the town streets
  for (const b of cladiri) {
    if (!["casa", "vila", "hotel", "bloc", "cabana"].includes(b.k)) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const dd = Math.max(b.w, b.d) / 2 + 0.35 + rnd() * 0.5;
      const x = b.x + Math.cos(a) * dd;
      const z = b.z + Math.sin(a) * dd;
      if (occ.at(x, z) !== FREE) continue;
      tufe.push([r2(x), r2(z), r2(0.75 + rnd() * 0.5), b.k === "cabana" ? 2 : 0]);
    }
  }

  // ── parking lots: by the downtown square, the airport terminal, the ski village and the fishing port
  const parcari: SceneryOut["parcari"] = [];
  const parking = (cx: number, cy: number, L: number, W: number) => {
    for (let k = 0; k < 160; k++) {
      const a = rnd() * Math.PI;
      const d = 2 + rnd() * 6;
      const x = cx + Math.cos(a * 2) * d;
      const y = cy + Math.sin(a * 2) * d;
      const t: P = [Math.cos(a), Math.sin(a)];
      const rect = { x, y, w: L, d: W, rot: Math.atan2(t[1], t[0]) };
      if (!occ.free(rect, 0.2)) continue;
      occ.rect(rect, 0.3, BUILT);
      parcari.push({ c: [r3(x), r3(y)], t: [r3(t[0]), r3(t[1])], L, W, o: 1 });
      return;
    }
  };
  parking(NODES.D_C[0], NODES.D_C[1], 3, 2.2);
  parking(NODES.A_T[0], NODES.A_T[1], 4, 2.2);
  parking(NODES.M_SKI[0], NODES.M_SKI[1], 3, 2.2);
  parking(NODES.P_V[0], NODES.P_V[1], 2.6, 2.2);
  parking(NODES.S_C[0], NODES.S_C[1], 3, 2.2);
  parking(NODES.G_C[0], NODES.G_C[1], 3, 2.2);

  // ── props
  const props: Record<string, unknown[]> = {};
  const add = (k: string, v: unknown) => (props[k] ??= []).push(v);
  const spot = (cx: number, cy: number, r: number, R: number, clear: number, test?: (x: number, y: number) => boolean): P | null => {
    for (let k = 0; k < 300; k++) {
      const a = rnd() * Math.PI * 2;
      const d = r + rnd() * (R - r);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (occ.freeDisk(x, y, clear) && (!test || test(x, y))) {
        occ.disk(x, y, clear, BUILT);
        return [r2(x), r2(y)];
      }
    }
    return null;
  };
  // the wind farm on the west hills, all turned to the same wind
  for (let k = 0, n = 0; k < 600 && n < 12; k++) {
    const x = -132 + rnd() * 26;
    const y = 4 + rnd() * 26;
    if (land.depthAt(x, y) < 3 || land.areaOf(x, y) !== "suburbs") continue;
    if (!occ.freeDisk(x, y, 1.6)) continue;
    if ((props.turbine ?? []).some((t) => Math.hypot((t as number[])[0] - x, (t as number[])[1] - y) < 5.5)) continue;
    occ.disk(x, y, 1.2, BUILT);
    add("turbine", [r2(x), r2(y), 2.3, r2(0.9 + rnd() * 0.25)]);
    n++;
  }
  // lighthouses: the port island's point, the fjord's mouth, a skerry
  const far = spot(117, -74, 0, 4, 0.6, (x, y) => land.depthAt(x, y) < 3);
  if (far) add("far", far);
  for (const [x, y] of [[-134, -12], [-142, 8], [140, -48]] as P[]) {
    const p = spot(x, y, 0, 5, 0.5, (px, py) => land.depthAt(px, py) < 2.5);
    if (p) add("faruri", p);
  }
  // cranes on the harbour quay, ships at the berths and out in the fjord
  for (let k = 0; k < 3; k++) {
    const p = spot(QUAYS[0][0] - 4 + k * 4, QUAYS[0][1] + 2.4, 0, 1.6, 0.5);
    if (p) add("macarale", p);
  }
  add("nave", [-104, 4.5, 0.15, 1.1]);
  add("nave", [-120, 2.2, -0.05, 1.2]);
  add("nave", [60, -84, 0.5, 1]);
  // the boulevard's marina: docks and yachts in the bay
  for (const [x, len] of [[22, 4.5], [28, 5], [34, 4.5]] as [number, number][]) {
    let y = 64;
    while (y < 90 && land.depthAt(x, y) > -0.2) y += 0.3;
    add("docuri", [x, r2(y + len / 2 - 0.3), len, 0]);
    for (let k = 0; k < 4; k++) add("iahturi", [r2(x + (k % 2 ? 0.55 : -0.55)), r2(y + 0.8 + k * 1.1), 1.571 + (k % 2 ? Math.PI : 0), r2(0.9 + rnd() * 0.2)]);
  }
  // the fishing port's docks
  {
    const [cx, cy] = NODES.P_V;
    let y = cy;
    while (y < cy + 14 && land.depthAt(cx, y) > -0.2) y += 0.3;
    add("docuri", [cx, r2(y + 1.6), 3.6, 0]);
    add("iahturi", [r2(cx + 0.6), r2(y + 1.6), 1.571, 1]);
  }
  // the airport: control tower and airliners on the apron
  {
    const t = spot(NODES.A_T[0] + 3, NODES.A_T[1] + 2, 0, 4, 0.9);
    if (t) add("turn_control", t);
    for (let k = 0; k < 3; k++) {
      const p = spot(NODES.A_T[0] - 2 + k * 4, NODES.A_T[1] + 4.5, 0, 1.5, 1.4);
      if (p) add("avioane", [...p, 0.42]);
    }
  }
  add("telegondola", { a: CABLE_CAR.a, b: CABLE_CAR.b });
  {
    const p = spot(-50, -62, 0, 8, 1, (x, y) => land.height(x, y) > 60);
    if (p) add("observator", [...p, 0.6]);
  }
  {
    const p = spot(-100, 46, 0, 8, 0.6);
    if (p) add("turn_apa", p);
  }
  {
    const p = spot(NODES.D_C[0], NODES.D_C[1], 1.6, 4, 0.6);
    if (p) add("fantani", p);
  }
  // billboards by the coast highway
  for (const [a, b] of [["H_IND", "T_N"], ["H_AUT", "H_LUX"], ["H_SUP", "H_AIR"]] as [string, string][]) {
    const r = roads.find((q) => q.spec.a === a && q.spec.b === b);
    if (!r) continue;
    const p = pointAt(r.pts, r.len * 0.5);
    const x = p.x - p.ty * (r.w / 2 + 1.2);
    const y = p.y + p.tx * (r.w / 2 + 1.2);
    if (occ.freeDisk(x, y, 0.7)) {
      occ.disk(x, y, 0.7, BUILT);
      add("panou", [r2(x), r2(y), r3(Math.atan2(-p.ty, p.tx))]);
    }
  }

  // ── for the painter: fields round the farms, the mines' pits, the ski runs
  const fields: SceneryOut["fields"] = [];
  for (let k = 0; k < 400 && fields.length < 26; k++) {
    const x = -128 + rnd() * 50;
    const y = 18 + rnd() * 46;
    if (land.areaOf(x, y) !== "suburbs" || land.depthAt(x, y) < 4) continue;
    const f = { c: [r2(x), r2(y)] as P, w: r2(4 + rnd() * 5), d: r2(3 + rnd() * 4), a: r3(0.35 + (rnd() - 0.5) * 0.3), tone: Math.floor(rnd() * 4) };
    const rect = { x, y, w: f.w, d: f.d, rot: f.a };
    if (!occ.free(rect, 0.3)) continue;
    occ.rect(rect, 0.2, FEATURE);
    fields.push(f);
    if (rnd() < 0.5) for (let b = 0; b < 4; b++) add("baloti", [r2(x + (rnd() - 0.5) * f.w * 0.6), r2(y + (rnd() - 0.5) * f.d * 0.6), r2(rnd() * 3)]);
  }
  const pits: SceneryOut["pits"] = [
    { c: [-112, -34], r: 6 },
    { c: [-122, -24], r: 4 },
  ];
  return { cladiri, copaci, tufe, parcate: [], props, vii: [], parcari, fields, pits, runs };
}
