// The circuit in 3D: asphalt with the rubber of the racing line, white edge lines, raised kerbs
// through the corners, gravel traps on their outside, barriers that never reach into another
// part of the lap, tyre walls, the chequered start line, the grid, the pit lane with its wall
// and the start gantry with its five red lights. Built once per track from its samples.
import * as THREE from "three";
import { GRID_SPACING, pointAt, type Track } from "@/game/racing/tracks";
import { corners, pitLane } from "../track-paint";
import { U, asphaltTexture, gravelTexture, kerbTexture, labelTexture, type Height } from "./ground";

export interface CircuitLook {
  asphalt: string;
  kerbA: string;
  kerbB: string;
  gravel: string;
  shoulder: string;
  /** Armco rails, or concrete walls in the city. */
  walls: boolean;
}

export interface Circuit {
  root: THREE.Group;
  /** The five start lights, left to right (their material lights up red). */
  lamps: THREE.MeshStandardMaterial[];
  /** How far out the barriers stand on each side, per track sample (tiles). */
  barrier: { left: Float32Array; right: Float32Array };
  /** Height of the racing surface above the ground (m). */
  surface: number;
}

const SURFACE = 0.12;

/** A band along the track between two lateral offsets (functions of s), following the ground. */
function band(tr: Track, H: Height, s0: number, s1: number, lat0: (s: number) => number, lat1: (s: number) => number, lift0: number, lift1: number, uvLen: number, step = 0.16, vertical = 0): THREE.BufferGeometry {
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const a = pointAt(tr, s, lat0(s));
    const b = pointAt(tr, s, lat1(s));
    const ha = H(a.x, a.y);
    const hb = H(b.x, b.y);
    // a vertical band (barriers, walls): both edges at the first offset, `vertical` metres apart
    if (vertical) {
      pos.push(a.x * U, ha + lift0, a.y * U, a.x * U, ha + lift0 + vertical, a.y * U);
    } else {
      pos.push(a.x * U, ha + lift0, a.y * U, b.x * U, hb + lift1, b.y * U);
    }
    const u = (s * U) / uvLen;
    uv.push(u, 0, u, 1);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  // flat bands face up whichever way their edges run (vertical ones are drawn from both sides)
  if (!vertical && pos.length >= 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos;
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    void ay;
    void by;
    void cy;
    if (ny < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const fixed = (v: number) => () => v;

/** Layered flat surfaces: drawn above the ones below without fighting over depth. */
function layer(m: THREE.Material, k: number): THREE.Material {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -k;
  m.polygonOffsetUnits = -k * 2;
  return m;
}

/** Barrier offsets per sample (tiles); NaN where no barrier fits (the inside of a hairpin). */
interface Room {
  left: Float32Array;
  right: Float32Array;
}

/**
 * How far out a barrier can stand on each side of every sample: halfway to the nearest other
 * part of the lap on that side, and on the inside of a corner within its radius (further out,
 * a line parallel to the corner would loop over itself). Where even the kerb's distance is too
 * far (a hairpin's inside) there is no barrier. Never a jump: the offset eases in and out.
 */
function barrierRoom(tr: Track): Room {
  const S = tr.samples;
  const n = S.length;
  const half = tr.layout.width / 2;
  const want = half + 1.15;
  const floor = half + 0.32;
  const left = new Float32Array(n).fill(want);
  const right = new Float32Array(n).fill(want);
  for (let i = 0; i < n; i++) {
    const a = S[i];
    // left (+lat) normal: (sin yaw, -cos yaw)
    const nx = Math.sin(a.yaw);
    const ny = -Math.cos(a.yaw);
    for (let j = 0; j < n; j += 2) {
      const arc = Math.min(Math.abs(a.s - S[j].s), tr.length - Math.abs(a.s - S[j].s));
      if (arc < 3) continue;
      const dx = S[j].x - a.x;
      const dy = S[j].y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > want * 2 + 1) continue;
      const side = (dx * nx + dy * ny) / d;
      // the other part's own asphalt and barrier: stop halfway, less a gap
      const room = d / 2 - 0.08;
      if (side > 0.35) left[i] = Math.min(left[i], room);
      else if (side < -0.35) right[i] = Math.min(right[i], room);
    }
    // the inside of a corner (k > 0 turns to the right): within its radius, nearby included
    let kl = 0;
    let kr = 0;
    for (let j = -14; j <= 14; j++) {
      const k = S[(i + j + n) % n].k;
      kr = Math.max(kr, k);
      kl = Math.max(kl, -k);
    }
    if (kl > 0) left[i] = Math.min(left[i], 0.8 / kl);
    if (kr > 0) right[i] = Math.min(right[i], 0.8 / kr);
  }
  const out: Room = { left: new Float32Array(n), right: new Float32Array(n) };
  for (const key of ["left", "right"] as const) {
    const src = key === "left" ? left : right;
    const o = out[key];
    for (let i = 0; i < n; i++) o[i] = src[i];
    // eases: never closer in by more than 0.04 tiles a sample (twice round for the wrap)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < 2 * n; i++) o[i % n] = Math.min(o[i % n], o[(i - 1) % n] + 0.04);
      for (let i = 2 * n - 2; i >= 0; i--) o[i % n] = Math.min(o[i % n], o[(i + 1) % n] + 0.04);
    }
    for (let i = 0; i < n; i++) o[i] = o[i] < floor ? NaN : o[i];
  }
  return out;
}

/** The barrier's offset (tiles, signed) at a distance along the lap. */
function barrierAt(tr: Track, room: { left: Float32Array; right: Float32Array }, side: number, s: number) {
  const n = tr.samples.length;
  const i = Math.round((((s % tr.length) + tr.length) % tr.length) / (tr.length / n)) % n;
  return side > 0 ? room.left[i] : -room.right[i];
}

/** Rails or walls: a canvas of the barrier seen from the track. */
function barrierTexture(walls: boolean, aniso: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext("2d")!;
  if (walls) {
    g.fillStyle = "#cbd5e1";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#94a3b8";
    g.fillRect(0, 56, 128, 8);
    g.fillStyle = "#dc2626";
    g.fillRect(0, 6, 64, 10);
    g.fillStyle = "#f8fafc";
    g.fillRect(64, 6, 64, 10);
  } else {
    g.fillStyle = "rgba(0,0,0,0)";
    g.clearRect(0, 0, 128, 64);
    // two rails and the posts
    for (const y of [10, 30]) {
      const gr = g.createLinearGradient(0, y, 0, y + 14);
      gr.addColorStop(0, "#e5e7eb");
      gr.addColorStop(0.5, "#9ca3af");
      gr.addColorStop(1, "#6b7280");
      g.fillStyle = gr;
      g.fillRect(0, y, 128, 14);
    }
    g.fillStyle = "#4b5563";
    g.fillRect(60, 8, 8, 56);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function checkerTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 6; j++) {
      g.fillStyle = (i + j) % 2 ? "#111827" : "#f8fafc";
      g.fillRect(i * 32, j * (64 / 6), 32, 64 / 6 + 1);
    }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCircuit(tr: Track, H: Height, look: CircuitLook, aniso: number, low: boolean): Circuit {
  const root = new THREE.Group();
  const half = tr.layout.width / 2;
  const L = tr.length;
  const crn = corners(tr);
  const room = barrierRoom(tr);
  const meshes: [THREE.BufferGeometry, THREE.Material, boolean][] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = false) => meshes.push([g, m, shadow]);

  // shoulders, then gravel traps on the outside of the corners
  const shoulder = layer(new THREE.MeshStandardMaterial({ color: look.shoulder, roughness: 0.95 }), 1);
  add(band(tr, H, 0, L, fixed(half), fixed(half + 0.18), SURFACE - 0.04, SURFACE - 0.05, 10), shoulder);
  add(band(tr, H, 0, L, fixed(-half), fixed(-half - 0.18), SURFACE - 0.04, SURFACE - 0.05, 10), shoulder);
  const gravelTex = gravelTexture(look.gravel, aniso);
  gravelTex.repeat.set(1, 1);
  const gravel = layer(new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1 }), 1);
  // (where no barrier fits, the gravel keeps its own width)
  const reach = (side: number, s: number) => {
    const b = Math.abs(barrierAt(tr, room, side, s));
    return Number.isFinite(b) ? b : half + 1.0;
  };
  for (const [a, b, side] of crn) {
    const out = (s: number) => side * Math.max(half + 0.3, Math.min(half + 1.0, reach(side, s) - 0.06));
    add(band(tr, H, a - 0.6, b + 1.2, fixed(side * (half + 0.18)), out, SURFACE - 0.05, SURFACE - 0.08, 6), gravel);
  }

  // the asphalt, the rubber on the racing line, the white edge lines
  const asphaltTex = asphaltTexture(look.asphalt, aniso);
  const asphalt = layer(new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.82, metalness: 0.02 }), 2);
  add(band(tr, H, 0, L, fixed(-half), fixed(half), SURFACE, SURFACE, 14, 0.12), asphalt);
  const rubber = layer(new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.16, depthWrite: false }), 3);
  add(band(tr, H, 0, L, fixed(-half * 0.25), fixed(half * 0.2), SURFACE + 0.01, SURFACE + 0.01, 10, 0.2), rubber);
  const white = layer(new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.6 }), 4);
  add(band(tr, H, 0, L, fixed(half - 0.045), fixed(half - 0.015), SURFACE + 0.015, SURFACE + 0.015, 10, 0.25), white);
  add(band(tr, H, 0, L, fixed(-half + 0.015), fixed(-half + 0.045), SURFACE + 0.015, SURFACE + 0.015, 10, 0.25), white);

  // kerbs on both edges through every corner, raised to the outside
  const kerb = layer(new THREE.MeshStandardMaterial({ map: kerbTexture(look.kerbA, look.kerbB, aniso), roughness: 0.55 }), 4);
  for (const [a, b] of crn) {
    add(band(tr, H, a - 0.3, b + 0.3, fixed(half - 0.03), fixed(half + 0.11), SURFACE + 0.012, SURFACE + 0.1, 6, 0.1), kerb);
    add(band(tr, H, a - 0.3, b + 0.3, fixed(-half - 0.11), fixed(-half + 0.03), SURFACE + 0.1, SURFACE + 0.012, 6, 0.1), kerb);
  }

  // start / finish: a chequered band across, the grid's white brackets behind it
  const st = tr.startS;
  add(band(tr, H, st, st + 0.18, fixed(-half), fixed(half), SURFACE + 0.016, SURFACE + 0.016, 1.8, 0.09), layer(new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6 }), 5));
  for (let gi = 0; gi < 8; gi++) {
    const s = st - (gi + 1) * GRID_SPACING;
    const lat = gi % 2 ? -half * 0.45 : half * 0.45;
    add(band(tr, H, s - 0.03, s + 0.015, fixed(lat - 0.17), fixed(lat + 0.17), SURFACE + 0.016, SURFACE + 0.016, 10, 0.04), white);
  }

  // the pit lane: on the infield of the straight, ramps in and out, its wall and the box lines
  const pl = pitLane(tr);
  const pitAsphalt = layer(new THREE.MeshStandardMaterial({ map: asphaltTex, color: "#c9ced6", roughness: 0.85 }), 2);
  const ramp = (s0: number, s1: number, from: number, to: number) => (s: number) => from + (to - from) * Math.min(1, Math.max(0, (s - s0) / (s1 - s0)));
  add(band(tr, H, pl.s0 - 1.2, pl.s0, ramp(pl.s0 - 1.2, pl.s0, -half + 0.05, pl.lat + pl.half), ramp(pl.s0 - 1.2, pl.s0, -half + 0.05, pl.lat - pl.half), SURFACE - 0.01, SURFACE - 0.01, 14, 0.1), pitAsphalt);
  add(band(tr, H, pl.s0, pl.s1, fixed(pl.lat - pl.half), fixed(pl.lat + pl.half), SURFACE - 0.01, SURFACE - 0.01, 14), pitAsphalt);
  add(band(tr, H, pl.s1, pl.s1 + 1.2, ramp(pl.s1, pl.s1 + 1.2, pl.lat + pl.half, -half + 0.05), ramp(pl.s1, pl.s1 + 1.2, pl.lat - pl.half, -half + 0.05), SURFACE - 0.01, SURFACE - 0.01, 14, 0.1), pitAsphalt);
  const yellow = layer(new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.6 }), 4);
  for (let s = pl.s0 + 0.6; s < pl.s1 - 0.4; s += 0.8) add(band(tr, H, s, s + 0.04, fixed(pl.lat - pl.half), fixed(pl.lat - pl.half + 0.22), SURFACE + 0.01, SURFACE + 0.01, 10, 0.04), yellow);
  const concrete = new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.9, side: THREE.DoubleSide });
  add(band(tr, H, pl.s0 + 0.3, pl.s1 - 0.3, fixed(-half - 0.21), fixed(-half - 0.21), SURFACE, SURFACE, 10, 0.25, 1.1), concrete, true);

  // barriers all round (the infield one stops at the pit wall)
  const rails = new THREE.MeshStandardMaterial({ map: barrierTexture(look.walls, aniso), roughness: look.walls ? 0.85 : 0.35, metalness: look.walls ? 0 : 0.7, alphaTest: 0.5, side: THREE.DoubleSide });
  const railH = look.walls ? 1.3 : 0.95;
  // one stretch of barrier per run of samples where it fits
  const runs = (side: number, s0: number, s1: number) => {
    const out: [number, number][] = [];
    let open: number | null = null;
    for (let s = s0; s <= s1; s += 0.08) {
      const ok = Number.isFinite(barrierAt(tr, room, side, s));
      if (ok && open === null) open = s;
      if (!ok && open !== null) {
        if (s - open > 0.5) out.push([open, s - 0.08]);
        open = null;
      }
    }
    if (open !== null && s1 - open > 0.5) out.push([open, s1]);
    return out;
  };
  for (const [a, b] of runs(1, 0, L)) add(band(tr, H, a, b, (s) => barrierAt(tr, room, 1, s), (s) => barrierAt(tr, room, 1, s), SURFACE - 0.1, SURFACE - 0.1, 4, 0.25, railH), rails, true);
  for (const [a, b] of runs(-1, pl.s1 + 1.2, L + pl.s0 - 1.2)) add(band(tr, H, a, b, (s) => barrierAt(tr, room, -1, s), (s) => barrierAt(tr, room, -1, s), SURFACE - 0.1, SURFACE - 0.1, 4, 0.25, railH), rails, true);

  // merge by material: one draw for each
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
  for (const [g, m, sh] of meshes) {
    const e = byMat.get(m) ?? { geos: [], shadow: false };
    e.geos.push(g);
    e.shadow ||= sh;
    byMat.set(m, e);
  }
  for (const [m, e] of byMat) {
    const g = mergeAll(e.geos);
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.castShadow = e.shadow && !low;
    root.add(mesh);
  }

  // tyre walls on the outside of the corners, three high
  const stacks: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const m4 = new THREE.Matrix4();
  const tyreCols = [new THREE.Color("#18181b"), new THREE.Color("#18181b"), new THREE.Color("#dc2626"), new THREE.Color("#f8fafc")];
  for (const [a, b, side] of crn)
    for (let s = a - 0.4; s < b + 0.8; s += 0.075) {
      const at = barrierAt(tr, room, side, s);
      if (!Number.isFinite(at)) continue;
      const lat = at - side * 0.06;
      const q = pointAt(tr, s, lat);
      for (let k = 0; k < 3; k++) {
        m4.makeTranslation(q.x * U, H(q.x, q.y) + 0.12 + k * 0.29, q.y * U);
        stacks.push(m4.clone());
        cols.push(tyreCols[(Math.floor(s / 0.11) + k) % tyreCols.length]);
      }
    }
  if (stacks.length) {
    const tyre = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 12, 1, false);
    const inst = new THREE.InstancedMesh(tyre, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, side: THREE.DoubleSide }), stacks.length);
    stacks.forEach((mm, i) => {
      inst.setMatrixAt(i, mm);
      inst.setColorAt(i, cols[i]);
    });
    inst.castShadow = !low;
    inst.receiveShadow = true;
    root.add(inst);
  }

  // the start gantry: two posts, a beam with the five lights and the race's banner
  const lamps: THREE.MeshStandardMaterial[] = [];
  // one post outside the track, the other on the pit wall (the pit lane runs past here)
  const g0 = pointAt(tr, st, half + 0.55);
  const g1 = pointAt(tr, st, -half - 0.21);
  const steel = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5, metalness: 0.6 });
  const yaw = pointAt(tr, st).yaw;
  const gy = Math.max(H(g0.x, g0.y), H(g1.x, g1.y)) + SURFACE;
  for (const p of [g0, g1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.4, 0.5), steel);
    post.position.set(p.x * U, gy + 3.7, p.y * U);
    post.castShadow = !low;
    root.add(post);
  }
  const span = Math.hypot(g0.x - g1.x, g0.y - g1.y) * U;
  const beam = new THREE.Group();
  beam.position.set(((g0.x + g1.x) / 2) * U, gy + 6.6, ((g0.y + g1.y) / 2) * U);
  // the beam runs across the track: along the lateral direction
  beam.rotation.y = -yaw + Math.PI / 2;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(span, 1.2, 0.6), steel);
  bar.castShadow = !low;
  beam.add(bar);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.62, 1.05), new THREE.MeshBasicMaterial({ map: labelTexture("START  ·  FINISH", "#b91c1c", "#ffffff", 1024, 128), side: THREE.DoubleSide }));
  banner.position.set(0, 0, 0.31);
  beam.add(banner);
  const back = banner.clone();
  back.position.z = -0.31;
  beam.add(back);
  // the lights hang over the middle of the asphalt (the beam's middle is off it, toward the posts' gap)
  const mid = -((half + 0.55 - half - 0.21) / 2) * U;
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: "#1f2937", emissive: "#ff1a1a", emissiveIntensity: 0, roughness: 0.3 });
    lamps.push(m);
    for (const z of [0.36, -0.36]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), m);
      lamp.position.set(mid + (i - 2) * 0.62, -0.95, z);
      beam.add(lamp);
    }
  }
  root.add(beam);

  return { root, lamps, barrier: room, surface: SURFACE };
}

/** Merges geometries with the same attributes (position, normal, uv). */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let verts = 0;
  let idx = 0;
  for (const g of list) {
    verts += g.attributes.position.count;
    idx += g.index!.count;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const ind = new Uint32Array(idx);
  let v = 0;
  let k = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, v * 3);
    nor.set(g.attributes.normal.array as Float32Array, v * 3);
    uv.set(g.attributes.uv.array as Float32Array, v * 2);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) ind[k + i] = gi[i] + v;
    v += g.attributes.position.count;
    k += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  return out;
}
