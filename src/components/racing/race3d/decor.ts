// What stands round a 3D circuit, by theme: woods and pines, palms on the coast, cacti and
// rocks in the desert, warehouses and containers, tower blocks with lit windows at night, a
// backdrop on the horizon (mountains, dunes, a skyline, islands), and on every circuit the main
// grandstand with its crowd, stands at the slow corners, the pit building with its control
// tower, billboards and, after dark, floodlights. Each kind of thing is one instanced mesh.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { TrackTheme } from "@/game/config/racing";
import { RIVAL_TEAMS } from "@/game/config/racing";
import { pointAt, type Track } from "@/game/racing/tracks";
import { C, beam, box, cone, cylinder, paint, sphere } from "../../map/world/kit";
import { corners, pitLane } from "../track-paint";
import { PAD, U, crowdTexture, labelTexture, noise, rand, windowTexture, type Height } from "./ground";

export interface Decor {
  root: THREE.Group;
  /** Moves what moves (the crowd). */
  animate: (t: number) => void;
}

interface Kind {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  shadow: boolean;
  at: THREE.Matrix4[];
  tint: THREE.Color[];
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const YAX = new THREE.Vector3(0, 1, 0);

function merged(parts: (THREE.BufferGeometry | null)[]): THREE.BufferGeometry {
  return mergeGeometries(parts.filter((p): p is THREE.BufferGeometry => !!p))!;
}

// ───────────────────────────── the props (metres, standing on y = 0) ─────────────────────────────

const roundTree = () => merged([cylinder(0.28, 2.4, C("#6b4a2b"), 0, 0, 0, 7), sphere(2.1, C("#4f9a3a"), 0, 3.6, 0, false, 1, 0.9, 1), sphere(1.4, C("#5aa845"), 0.9, 4.6, 0.4)]);
const pine = () => merged([cylinder(0.3, 1.6, C("#5b3d22"), 0, 0, 0, 6), cone(2.4, 3.6, C("#2f6b37"), 0, 1.2, 0, 8), cone(1.9, 3.2, C("#367a3e"), 0, 3.2, 0, 8), cone(1.2, 2.6, C("#3f8746"), 0, 5.2, 0, 8)]);
const bush = () => merged([sphere(1.1, C("#4a8f3a"), 0, 0.6, 0, false, 1.3, 0.8, 1), sphere(0.8, C("#58a245"), 0.8, 0.7, 0.3)]);
function palm() {
  const parts: (THREE.BufferGeometry | null)[] = [];
  let x = 0;
  for (let i = 0; i < 4; i++) {
    parts.push(cylinder(0.24 - i * 0.03, 1.9, C("#8b6a43"), x, i * 1.85, 0, 7));
    x += 0.18;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(beam(x, 7.4, 0, x + Math.cos(a) * 3.2, 6.2, Math.sin(a) * 3.2, 0.12, C(i % 2 ? "#2f9e44" : "#37a84b"), 0.9));
  }
  return merged(parts);
}
const cactus = () => merged([cylinder(0.32, 4.2, C("#3f7d3a"), 0, 0, 0, 8), cylinder(0.2, 1.4, C("#3f7d3a"), 0.7, 1.4, 0, 7), beam(0.1, 1.5, 0, 0.7, 1.5, 0, 0.3, C("#3f7d3a")), cylinder(0.18, 1.2, C("#468a40"), -0.6, 2.0, 0, 7), beam(-0.1, 2.1, 0, -0.6, 2.1, 0, 0.26, C("#468a40"))]);
function rock(color: string) {
  const g = new THREE.DodecahedronGeometry(1.4, 0);
  g.scale(1.3, 0.7, 1);
  g.translate(0, 0.5, 0);
  return paint(g, C(color));
}
const warehouse = () => merged([box(22, 8, 14, C("#a3a8ad"), 0, 0, 0, 0), box(22.6, 0.8, 14.6, C("#64748b"), 0, 8, 0, 0), box(4.5, 5, 0.3, C("#475569"), -5, 0, 7.1, 0), box(4.5, 5, 0.3, C("#475569"), 5, 0, 7.1, 0), box(22.2, 1.2, 0.3, C("#dc2626"), 0, 6.2, 7.1, 0)]);
const container = () => box(6.1, 2.6, 2.45, C("#ffffff"), 0, 0, 0, 0);
const marshal = () => merged([box(2.4, 2.6, 2.4, C("#f8fafc"), 0, 0, 0, 0), box(2.9, 0.4, 2.9, C("#f97316"), 0, 2.6, 0, 0), cylinder(0.05, 2.2, C("#94a3b8"), 1.1, 3.0, 1.1, 4), box(0.9, 0.6, 0.04, C("#facc15"), 1.55, 4.4, 1.1, 0)]);
function mountain(snow: boolean) {
  const g = new THREE.ConeGeometry(1, 1, 9, 3);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const rockC = C("#6b7280");
  const grass = C("#4d6b3f");
  const snowC = C("#f8fafc");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // a rough ridge: jitter the sides by the angle round (the seam's twin vertices move together)
    if (y > 0.05 && y < 0.95) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 0.8 + noise(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + y * 3, 2) * 0.45;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    c.copy(y < 0.3 ? grass : y > 0.72 && snow ? snowC : rockC);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function dune() {
  const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return paint(g, C("#d6ad6b"));
}
function hill() {
  const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return paint(g, C("#3f7a38"));
}
const lampPost = () => merged([cylinder(0.14, 9, C("#475569"), 0, 0, 0, 6), beam(0, 9, 0, 1.6, 9.3, 0, 0.16, C("#475569"))]);
const billboardLegs = () => merged([cylinder(0.12, 3.2, C("#64748b"), -3.4, 0, 0, 6), cylinder(0.12, 3.2, C("#64748b"), 3.4, 0, 0, 6)]);

/** A tower block (14 × h × 14 m) whose window texture repeats every 4 m of height. */
function tower(h: number) {
  const g = new THREE.BoxGeometry(14, h, 14);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // sides: eight windows across, a floor every 4 m up; roof and floor: one dark spot
    const flat = Math.abs(nor.getY(i)) > 0.5;
    uv.setXY(i, flat ? 0.01 : uv.getX(i), flat ? 0.995 : pos.getY(i) / 64);
  }
  return g;
}

// ───────────────────────────── building ─────────────────────────────

function vertexMat(rough = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0.02 });
}

function instanced(k: Kind, low: boolean): THREE.InstancedMesh | null {
  if (!k.at.length) return null;
  const m = new THREE.InstancedMesh(k.geo, k.mat, k.at.length);
  k.at.forEach((mm, i) => m.setMatrixAt(i, mm));
  if (k.tint.length === k.at.length) k.tint.forEach((c, i) => m.setColorAt(i, c));
  m.castShadow = k.shadow && !low;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

/** Nearest distance from a point to the lap's centre line (tiles). */
function makeDistance(tr: Track) {
  const S = tr.samples.filter((_, i) => i % 3 === 0);
  return (x: number, y: number) => {
    let best = Infinity;
    for (const s of S) {
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

/**
 * Places a group built in "track frame" at a point of the lap: its x along the lap, its +z away
 * from the track (to whichever side `lat` is on), so what faces −z faces the track.
 */
function placeAlong(tr: Track, H: Height, g: THREE.Object3D, s: number, lat: number) {
  const p = pointAt(tr, s, lat);
  g.position.set(p.x * U, H(p.x, p.y), p.y * U);
  // turning by −yaw points the local +z to the right of the lap; the left side turns round
  g.rotation.y = -p.yaw + (lat > 0 ? Math.PI : 0);
}

/** A grandstand `len` metres long: stepped seats full of people under a roof, facing the track (−z). */
function grandstand(len: number, crowd: THREE.Material, low: boolean): THREE.Group {
  const g = new THREE.Group();
  const rows = 7;
  const parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < rows; r++) parts.push(box(len, 0.9 + r * 0.9, 1.1, C(r % 2 ? "#cbd5e1" : "#e2e8f0"), 0, 0, 1.2 + r * 1.1, 0));
  parts.push(box(len, 9.5, 0.4, C("#94a3b8"), 0, 0, 1.2 + rows * 1.1, 0));
  for (let i = 0; i <= 4; i++) parts.push(cylinder(0.18, 11.5, C("#64748b"), -len / 2 + (i * len) / 4, 0, 1.2 + rows * 1.1, 6));
  parts.push(box(len + 2, 0.35, rows * 1.1 + 2.5, C("#1e3a8a"), 0, 11.5, 1.2 + (rows * 1.1) / 2 - 0.4, 0));
  const body = new THREE.Mesh(merged(parts), vertexMat());
  body.castShadow = !low;
  body.receiveShadow = true;
  g.add(body);
  // the crowd: a sloping sheet of people over the seats
  const rise = rows * 0.9;
  const run = rows * 1.1;
  const sheet = new THREE.PlaneGeometry(len - 0.4, Math.hypot(rise, run));
  sheet.rotateX(-Math.PI / 2 + Math.atan2(rise, run));
  sheet.translate(0, 1.0 + rise / 2 + 0.35, 1.2 + run / 2 - 0.3);
  const ppl = new THREE.Mesh(sheet, crowd);
  g.add(ppl);
  return g;
}

/** The pit building (track frame: doors on −z, toward the pit lane): garages, a roof terrace and the control tower. */
function pitBuilding(len: number, low: boolean): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(len, 7, 12, C("#e5e7eb"), 0, 0, 6, 0));
  parts.push(box(len + 1, 0.6, 13, C("#334155"), 0, 7, 6, 0));
  parts.push(box(len, 1.2, 0.4, C("#1d4ed8"), 0, 7.6, -0.2, 0));
  const doors = Math.floor(len / 6);
  for (let i = 0; i < doors; i++) parts.push(box(4.6, 4.6, 0.2, C(["#111827", "#1f2937", "#0f172a"][i % 3]), -len / 2 + 3 + i * 6, 0, -0.05, 0));
  // the control tower at the start end
  parts.push(box(9, 16, 9, C("#cbd5e1"), len / 2 - 5, 0, 6, 0));
  parts.push(box(10.5, 3.2, 10.5, C("#38bdf8"), len / 2 - 5, 16, 6, 0));
  parts.push(box(11, 0.6, 11, C("#334155"), len / 2 - 5, 19.2, 6, 0));
  const body = new THREE.Mesh(merged(parts), vertexMat(0.7));
  body.castShadow = !low;
  body.receiveShadow = true;
  g.add(body);
  return g;
}

export function buildDecor(tr: Track, H: Height, theme: TrackTheme, aniso: number, low: boolean, night: number): Decor {
  const root = new THREE.Group();
  const L = tr.layout;
  const half = L.width / 2;
  const dist = makeDistance(tr);
  const vmat = vertexMat();
  const kinds: Record<string, Kind> = {};
  const kind = (name: string, geo: () => THREE.BufferGeometry, shadow = true, mat: THREE.Material = vmat): Kind => (kinds[name] ??= { geo: geo(), mat, shadow, at: [], tint: [] });
  const put = (k: Kind, x: number, y: number, scale: number, rot: number, tint?: THREE.Color, sy = scale, dy = 0) => {
    k.at.push(M.compose(V.set(x * U, H(x, y) + dy, y * U), Q.setFromAxisAngle(YAX, rot), S.set(scale, sy, scale)).clone());
    k.tint.push(tint ?? new THREE.Color(1, 1, 1));
  };

  // places kept clear: the stands along the straight and the pit building
  const pl = pitLane(tr);
  const keepOut: [number, number, number][] = [];
  for (let s = tr.startS - 7; s <= tr.startS + 7; s += 1.5) {
    const a = pointAt(tr, s, half + 2.4);
    keepOut.push([a.x, a.y, 2.2]);
  }
  for (let s = pl.s0; s <= pl.s1 + 1; s += 1.5) {
    const a = pointAt(tr, s, -half - 2.2);
    keepOut.push([a.x, a.y, 2.0]);
  }
  const clear = (x: number, y: number, r: number) => keepOut.every(([kx, ky, kr]) => Math.hypot(kx - x, ky - y) > kr + r);

  // ── the scatter round the circuit ──
  const W = L.w + PAD * 2;
  const D = L.d + PAD * 2;
  const density = { home: 0.16, industrial: 0.07, mountain: 0.2, coastal: 0.12, desert: 0.06, night: 0.06, gp: 0.13, international: 0.13 }[theme] * (low ? 0.5 : 1);
  const n = Math.round(W * D * density);
  for (let i = 0; i < n; i++) {
    const x = rand(i, 11) * W - PAD;
    const y = rand(i, 29) * D - PAD;
    const d = dist(x, y);
    if (d < half + 1.9 || !clear(x, y, 0.8)) continue;
    const r = rand(i, 3);
    const sc = 0.8 + rand(i, 5) * 0.6;
    const rot = rand(i, 7) * Math.PI * 2;
    const tint = new THREE.Color().setHSL(0, 0, 0.85 + rand(i, 9) * 0.3);
    switch (theme) {
      case "mountain":
        if (r < 0.15) put(kind("rock", () => rock("#8b8f97")), x, y, sc * 1.4, rot, tint);
        else put(kind("pine", pine), x, y, sc, rot, tint);
        break;
      case "desert":
        if (r < 0.55) put(kind("cactus", cactus), x, y, sc, rot, tint);
        else put(kind("rockD", () => rock("#b8875a")), x, y, sc * 1.6, rot, tint);
        break;
      case "industrial":
        if (r < 0.25 && d > half + 3.5 && clear(x, y, 1.8)) put(kind("warehouse", warehouse), x, y, 0.8 + rand(i, 5) * 0.4, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2), tint);
        else if (r < 0.7) put(kind("container", container), x, y, 1, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2), new THREE.Color(["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0891b2", "#7c3aed"][i % 6]));
        else put(kind("bush", bush), x, y, sc, rot, tint);
        break;
      case "night":
        if (r < 0.45 && d > half + 3.2 && clear(x, y, 1.5)) {
          const h = [0, 1, 2][i % 3];
          put(kind(`tower${h}`, () => tower([40, 64, 96][h]), true, towerMat(night)), x, y, 0.8 + rand(i, 5) * 0.4, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2), undefined, 1);
        } else put(kind("bush", bush), x, y, sc, rot, tint);
        break;
      case "coastal":
        if (y > L.d * 0.72) continue; // the beach and the sea
        if (r < 0.55) put(kind("palm", palm), x, y, sc, rot, tint);
        else if (r < 0.75) put(kind("bush", bush), x, y, sc, rot, tint);
        else put(kind("tree", roundTree), x, y, sc, rot, tint);
        break;
      default:
        if (r < 0.55) put(kind("tree", roundTree), x, y, sc, rot, tint);
        else if (r < 0.75) put(kind("pine", pine), x, y, sc, rot, tint);
        else put(kind("bush", bush), x, y, sc, rot, tint);
    }
  }

  // ── the horizon ──
  const cx = L.w / 2;
  const cy = L.d / 2;
  const ring = Math.max(L.w, L.d) / 2 + PAD + 14;
  const far = low ? 14 : 26;
  for (let i = 0; i < far; i++) {
    const a = (i / far) * Math.PI * 2 + rand(i, 61) * 0.2;
    const rr = ring + rand(i, 62) * 10;
    const x = cx + Math.cos(a) * rr * 1.2;
    const y = cy + Math.sin(a) * rr;
    if (theme === "coastal" && y > L.d * 0.7) continue;
    const s = 1 + rand(i, 63);
    switch (theme) {
      case "mountain":
        put(kind("mountain", () => mountain(true), false), x, y, 90 * s, a, undefined, 70 * s, -2);
        break;
      case "desert":
        put(kind("dune", dune, false), x, y, 60 * s, a, undefined, 14 * s, -2);
        break;
      case "night":
        put(kind(`towerFar${i % 3}`, () => tower([60, 90, 130][i % 3]), false, towerMat(night)), x, y, 1.5 + rand(i, 64), a, undefined, 1);
        break;
      case "industrial":
        put(kind("warehouseFar", warehouse, false), x, y, 1.5, Math.round(a / (Math.PI / 2)) * (Math.PI / 2));
        break;
      default:
        put(kind("hill", hill, false), x, y, 150 * s, a, undefined, 16 * s, -6);
        if (theme === "gp" || theme === "international") put(kind("mountainFar", () => mountain(false), false), x + Math.cos(a) * 30, y + Math.sin(a) * 30, 160 * s, a, undefined, 60 * s, -6);
    }
  }
  if (theme === "coastal")
    for (let i = 0; i < 5; i++) put(kind("island", hill, false), cx + (rand(i, 71) - 0.5) * L.w * 2.2, L.d + PAD * 1.6 + rand(i, 72) * PAD, 60 + rand(i, 73) * 60, 0, undefined, 12 + rand(i, 74) * 10, -4);

  // ── marshal posts at the corners, floodlights after dark ──
  for (const [a, b, side] of corners(tr)) {
    const p = pointAt(tr, (a + b) / 2, side * (half + 1.6));
    if (dist(p.x, p.y) > half + 1.3 && clear(p.x, p.y, 0.5)) put(kind("marshal", marshal), p.x, p.y, 1, -p.yaw);
  }
  const lit = night > 0.3;
  if (lit) {
    const heads: [number, number, number][] = [];
    for (let s = 0; s < tr.length; s += 2.6)
      for (const side of [1, -1]) {
        const p = pointAt(tr, s, side * (half + 1.45));
        if (dist(p.x, p.y) < half + 1.2 || !clear(p.x, p.y, 0.3)) continue;
        const rot = -p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        put(kind("lamp", lampPost), p.x, p.y, 1, rot);
        const q = pointAt(tr, s, side * (half + 1.29));
        heads.push([q.x, q.y, H(q.x, q.y) + 9.2]);
      }
    root.add(floodlights(heads));
  }

  for (const k of Object.values(kinds)) {
    const m = instanced(k, low);
    if (m) root.add(m);
  }

  // ── the main grandstand, stands at the slowest corners, the pit building ──
  const crowdTex = crowdTexture(aniso);
  crowdTex.repeat.set(6, 1);
  const crowd = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
  const main = grandstand(90, crowd, low);
  placeAlong(tr, H, main, tr.startS, half + 1.45);
  root.add(main);
  const slow = corners(tr, 0.4)
    .map(([a, b, side]) => ({ s: (a + b) / 2, side, len: b - a }))
    .sort((p, q) => q.len - p.len);
  let stands = 0;
  for (const c of slow) {
    if (stands >= (low ? 1 : 3)) break;
    // the outside of the corner, beyond the gravel: only where nothing else is
    const lat = c.side * (half + 2.1);
    const p = pointAt(tr, c.s, lat);
    if (dist(p.x, p.y) < half + 1.9 || !clear(p.x, p.y, 2.5)) continue;
    const st = grandstand(36, crowd, low);
    placeAlong(tr, H, st, c.s, lat);
    root.add(st);
    keepOut.push([p.x, p.y, 2.5]);
    stands++;
  }
  const pitLen = (pl.s1 - pl.s0 + 1.2) * U;
  const pits = pitBuilding(pitLen, low);
  placeAlong(tr, H, pits, (pl.s0 + pl.s1) / 2, -half - 1.08);
  root.add(pits);

  // ── billboards on the straights ──
  const names = ["IDLE CAR EMPIRE", ...RIVAL_TEAMS.map((r) => r.name.toUpperCase())];
  const colors = ["#b91c1c", ...RIVAL_TEAMS.map((r) => r.color)];
  let bi = 0;
  const legs = kind("legs", billboardLegs);
  for (let s = 8; s < tr.length - 4; s += 9) {
    if (Math.abs(pointAt(tr, s).k) > 0.05) continue;
    const side = bi % 2 ? -1 : 1;
    const p = pointAt(tr, s, side * (half + 1.5));
    if (dist(p.x, p.y) < half + 1.3 || !clear(p.x, p.y, 0.8)) continue;
    const j = bi % names.length;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshStandardMaterial({ map: labelTexture(names[j], colors[j], "#ffffff", 512, 140, "900 58px system-ui, sans-serif"), roughness: 0.6, side: THREE.DoubleSide }));
    board.position.set(p.x * U, H(p.x, p.y) + 3.6, p.y * U);
    // its face toward the track on either side
    board.rotation.y = -p.yaw + (side < 0 ? Math.PI : 0);
    root.add(board);
    put(legs, p.x, p.y, 1, -p.yaw);
    bi++;
  }
  const legMesh = instanced(legs, low);
  if (legMesh) root.add(legMesh);

  let t0 = 0;
  return {
    root,
    animate: (t) => {
      // the crowd shuffles: its sheet nudges a little
      if (t - t0 > 0.12) {
        t0 = t;
        crowdTex.offset.y = Math.sin(t * 9) > 0 ? 0.004 : 0;
      }
    },
  };
}

let towerMats: [THREE.Material, THREE.Material] | null = null;
function towerMat(night: number): THREE.Material {
  const lit = night > 0.5 ? 1 : 0;
  if (!towerMats) {
    const day = windowTexture(false);
    const dark = windowTexture(true);
    towerMats = [
      new THREE.MeshStandardMaterial({ map: day, roughness: 0.4, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: dark, emissiveMap: dark, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.6 }),
    ];
  }
  return towerMats[lit];
}

/** Floodlight heads: bright dots over the track (the circuit itself is lit by the night's light). */
function floodlights(heads: [number, number, number][]): THREE.Points {
  const pos = new Float32Array(heads.length * 3);
  heads.forEach(([x, y, h], i) => pos.set([x * U, h, y * U], i * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  // round, soft-edged lamps
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d")!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,247,214,0.9)");
  gr.addColorStop(1, "rgba(255,247,214,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
}
