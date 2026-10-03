// Procedural 3D vehicles. Bodies are lofted from cross-sections along the
// car (rounded, with fenders, wheel arches, a sloped windshield and a real
// greenhouse); wheels are lathed tyres with spoked rims and brake discs;
// lights, grilles, mirrors, handles, spoilers and diffusers are geometry,
// not texture. Units are metres; +X is forward, +Y up, +Z to the right.
import type * as THREE_NS from "three";
import { liveryOf } from "./livery";

type Three = typeof THREE_NS;

export type BodyModel = "city" | "sedan" | "suv" | "sports" | "muscle" | "luxury" | "supercar" | "hypercar" | "electric";

interface CarSpec {
  L: number;
  W: number;
  /** Wheel radius, tyre width, wheelbase. */
  R: number;
  tw: number;
  wb: number;
  /** Front axle position as a share of the length from the nose. */
  fa: number;
  clear: number;
  /** Heights (m): nose, hood at the windshield, rear deck, tail, roof. */
  nose: number;
  hood: number;
  deck: number;
  tail: number;
  roof: number;
  /** Greenhouse along the car (shares of the length): windshield base, roof start, roof end, rear glass end. */
  ws: number;
  rs: number;
  re: number;
  rw: number;
  /** Fender flare over the wheels (m) and plan-view taper at the ends. */
  flare: number;
  taper: number;
  /** Greenhouse top width as a share of the body (tumblehome). */
  roofW: number;
  spoiler?: "lip" | "wing" | "big";
  scoop?: boolean;
  rails?: boolean;
  intakes?: boolean;
  led?: boolean;
  chrome?: boolean;
  closedGrille?: boolean;
  spokes: number;
  /** Cross-section boxiness of the body and the greenhouse (2 round … 5 boxy). */
  n?: number;
  gn?: number;
  /** Contrasting roof (and pillars with `pillars`). */
  roofColor?: string;
  pillars?: boolean;
  /** Racing stripes: over hood, roof and deck, or hood and deck only; a side stripe. */
  band?: "full" | "ends";
  sideStripe?: boolean;
  /** Headlamps: round, twin round, upright round/oval on the wings, slim, LED. */
  lamps?: "round" | "quad" | "frog" | "oval" | "slim" | "led";
  bumper?: "chrome" | "black";
  rims?: "silver" | "black" | "dark" | "chrome";
  hoodVents?: boolean;
  /** Grille opening as a share of the width, and its height (m). */
  grille?: [number, number];
}

export const CAR_SPECS: Record<BodyModel, CarSpec> = {
  // red 80s hot hatch: boxy, upright tailgate, black grille band with round lamps
  city: { L: 3.98, W: 1.68, R: 0.3, tw: 0.19, wb: 2.47, fa: 0.18, clear: 0.15, nose: 0.66, hood: 0.9, deck: 1.02, tail: 0.96, roof: 1.42, ws: 0.32, rs: 0.46, re: 0.88, rw: 0.975, flare: 0.012, taper: 0.04, roofW: 0.84, spokes: 7, n: 3.9, gn: 3.8, lamps: "quad", bumper: "black", rims: "silver", grille: [0.86, 0.2] },
  // silver box-flared sports sedan with a bootlid wing
  sedan: { L: 4.35, W: 1.7, R: 0.31, tw: 0.22, wb: 2.56, fa: 0.17, clear: 0.12, nose: 0.6, hood: 0.84, deck: 0.98, tail: 0.95, roof: 1.37, ws: 0.31, rs: 0.45, re: 0.66, rw: 0.77, flare: 0.045, taper: 0.035, roofW: 0.84, spoiler: "wing", spokes: 10, n: 4.2, gn: 4, lamps: "quad", bumper: "black", rims: "silver", grille: [0.78, 0.16] },
  // white SUV with a black floating roof and black wheels
  suv: { L: 4.8, W: 1.93, R: 0.39, tw: 0.25, wb: 2.75, fa: 0.18, clear: 0.24, nose: 0.88, hood: 1.1, deck: 1.2, tail: 1.13, roof: 1.78, ws: 0.3, rs: 0.42, re: 0.9, rw: 0.965, flare: 0.02, taper: 0.05, roofW: 0.88, spokes: 5, n: 4.6, gn: 4.6, roofColor: "#0e0f12", pillars: true, lamps: "slim", rims: "black", grille: [0.5, 0.2] },
  // yellow classic rear-engine coupe: round wings, upright headlamps, sloping tail
  sports: { L: 4.25, W: 1.76, R: 0.32, tw: 0.24, wb: 2.27, fa: 0.18, clear: 0.12, nose: 0.52, hood: 0.78, deck: 0.92, tail: 0.84, roof: 1.31, ws: 0.33, rs: 0.46, re: 0.66, rw: 0.79, flare: 0.09, taper: 0.2, roofW: 0.7, spoiler: "lip", spokes: 5, n: 2.4, gn: 2.8, lamps: "frog", rims: "silver", grille: [0.5, 0.08] },
  // blue 60s muscle coupe: long hood, short deck, twin white stripes, chrome
  muscle: { L: 4.65, W: 1.78, R: 0.33, tw: 0.23, wb: 2.74, fa: 0.15, clear: 0.14, nose: 0.74, hood: 0.88, deck: 0.92, tail: 0.88, roof: 1.33, ws: 0.41, rs: 0.49, re: 0.73, rw: 0.8, flare: 0.02, taper: 0.05, roofW: 0.82, spokes: 5, n: 3.4, gn: 3.4, band: "full", sideStripe: true, lamps: "round", bumper: "chrome", rims: "dark", chrome: true, grille: [0.62, 0.24] },
  // black classic coupe: long bonnet with a bulge, liftback, chrome bumpers
  luxury: { L: 4.5, W: 1.76, R: 0.33, tw: 0.23, wb: 2.6, fa: 0.15, clear: 0.13, nose: 0.7, hood: 0.86, deck: 0.9, tail: 0.86, roof: 1.3, ws: 0.41, rs: 0.5, re: 0.7, rw: 0.86, flare: 0.04, taper: 0.06, roofW: 0.8, scoop: true, chrome: true, spokes: 8, n: 3.2, gn: 3.2, lamps: "quad", bumper: "chrome", rims: "chrome", grille: [0.7, 0.18] },
  // orange track coupe: rear-engine shape, wide hips, bonnet vents, huge wing
  supercar: { L: 4.55, W: 1.88, R: 0.34, tw: 0.29, wb: 2.46, fa: 0.17, clear: 0.1, nose: 0.52, hood: 0.76, deck: 0.96, tail: 0.92, roof: 1.29, ws: 0.31, rs: 0.45, re: 0.64, rw: 0.79, flare: 0.1, taper: 0.2, roofW: 0.68, spoiler: "big", intakes: true, spokes: 10, n: 2.4, gn: 2.8, lamps: "oval", rims: "black", hoodVents: true, grille: [0.75, 0.14] },
  // purple mid-engine hypercar: low cabin, carbon top, swan-neck wing
  hypercar: { L: 4.6, W: 2.0, R: 0.35, tw: 0.3, wb: 2.67, fa: 0.2, clear: 0.09, nose: 0.42, hood: 0.6, deck: 0.98, tail: 0.98, roof: 1.15, ws: 0.25, rs: 0.42, re: 0.55, rw: 0.8, flare: 0.12, taper: 0.17, roofW: 0.55, spoiler: "big", intakes: true, led: true, spokes: 10, n: 2.3, gn: 2.6, roofColor: "#0f1013", lamps: "led", rims: "black" },
  // green classic coupe: black vinyl roof, white stripes, chrome bumpers
  electric: { L: 4.5, W: 1.76, R: 0.33, tw: 0.23, wb: 2.55, fa: 0.15, clear: 0.13, nose: 0.72, hood: 0.88, deck: 0.93, tail: 0.9, roof: 1.32, ws: 0.41, rs: 0.49, re: 0.73, rw: 0.81, flare: 0.04, taper: 0.05, roofW: 0.82, spoiler: "lip", spokes: 6, n: 3.3, gn: 3.3, roofColor: "#0f1013", band: "ends", sideStripe: true, lamps: "round", bumper: "chrome", rims: "dark", grille: [0.6, 0.2] },
};

/** How far the car is in the assembly process (assembly-line view). */
export interface BuildStage {
  /** 0 bare body … 8 finished (the nine stations). */
  station: number;
}

export interface CarLook {
  model: BodyModel;
  color: string;
  /** Metallic paint (most colours) or solid / matte. */
  finish?: "metallic" | "gloss" | "matte";
  /** Steering angle of the front wheels, radians. */
  steer?: number;
  /** Wheel rotation, radians. */
  spin?: number;
  stage?: BuildStage;
}

// ───────────────────────────── materials ─────────────────────────────

export interface MaterialKit {
  paint: (color: string, finish: CarLook["finish"]) => THREE_NS.Material;
  primer: THREE_NS.Material;
  glass: THREE_NS.Material;
  tyre: THREE_NS.Material;
  rim: THREE_NS.Material;
  rimBlack: THREE_NS.Material;
  rimDark: THREE_NS.Material;
  chrome: THREE_NS.Material;
  trim: THREE_NS.Material;
  plastic: THREE_NS.Material;
  lens: THREE_NS.Material;
  tail: THREE_NS.Material;
  disc: THREE_NS.Material;
  caliper: THREE_NS.Material;
  seat: THREE_NS.Material;
  engine: THREE_NS.Material;
  white: THREE_NS.Material;
  led: THREE_NS.Material;
}

export function materialKit(T: Three): MaterialKit {
  const paints = new Map<string, THREE_NS.Material>();
  return {
    paint: (color, finish = "metallic") => {
      const key = `${color}|${finish}`;
      let m = paints.get(key);
      if (!m) {
        m = new T.MeshPhysicalMaterial({
          color,
          metalness: finish === "metallic" ? 0.45 : 0.05,
          roughness: finish === "matte" ? 0.6 : finish === "metallic" ? 0.3 : 0.2,
          clearcoat: finish === "matte" ? 0 : 1,
          clearcoatRoughness: 0.06,
          envMapIntensity: 0.9,
        });
        m.userData.keep = true;
        paints.set(key, m);
      }
      return m;
    },
    primer: new T.MeshStandardMaterial({ color: "#a7adb5", metalness: 0.35, roughness: 0.55 }),
    glass: new T.MeshPhysicalMaterial({ color: "#0d1622", metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 }),
    tyre: new T.MeshStandardMaterial({ color: "#16181b", roughness: 0.92, metalness: 0 }),
    rim: new T.MeshStandardMaterial({ color: "#c9ced6", metalness: 0.95, roughness: 0.22 }),
    rimBlack: new T.MeshStandardMaterial({ color: "#17191c", metalness: 0.6, roughness: 0.35 }),
    rimDark: new T.MeshStandardMaterial({ color: "#3c4148", metalness: 0.8, roughness: 0.3 }),
    chrome: new T.MeshStandardMaterial({ color: "#eef2f7", metalness: 1, roughness: 0.08 }),
    trim: new T.MeshStandardMaterial({ color: "#14161a", metalness: 0.2, roughness: 0.45 }),
    plastic: new T.MeshStandardMaterial({ color: "#26292e", metalness: 0.05, roughness: 0.7 }),
    lens: new T.MeshPhysicalMaterial({ color: "#e8f1ff", emissive: "#fff6dd", emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
    tail: new T.MeshPhysicalMaterial({ color: "#7a0a0a", emissive: "#ff1a1a", emissiveIntensity: 0.45, roughness: 0.15, clearcoat: 1 }),
    disc: new T.MeshStandardMaterial({ color: "#6b7078", metalness: 0.85, roughness: 0.4 }),
    caliper: new T.MeshStandardMaterial({ color: "#d9262c", metalness: 0.3, roughness: 0.4 }),
    seat: new T.MeshStandardMaterial({ color: "#3a2a22", roughness: 0.7 }),
    engine: new T.MeshStandardMaterial({ color: "#5d636c", metalness: 0.8, roughness: 0.35 }),
    white: new T.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.4 }),
    led: new T.MeshStandardMaterial({ color: "#dff4ff", emissive: "#bfe9ff", emissiveIntensity: 1.2 }),
  };
}

// ───────────────────────────── loft ─────────────────────────────

/** Smooth interpolation through (u, v) control points (u ascending). */
function curve(points: [number, number][]) {
  return (u: number) => {
    if (u <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [u1, v1] = points[i];
      if (u <= u1) {
        const [u0, v0] = points[i - 1];
        const k = (u - u0) / (u1 - u0 || 1);
        const s = k * k * (3 - 2 * k);
        return v0 + (v1 - v0) * s;
      }
    }
    return points[points.length - 1][1];
  };
}

interface Section {
  x: number;
  /** Half width at the bottom and at the top of the section. */
  wb: number;
  wt: number;
  bot: number;
  top: number;
  /** Superellipse exponent (higher = boxier). */
  n: number;
}

/**
 * Lofts closed cross-sections into a smooth tube and caps both ends.
 * Each section is a superellipse that can be narrower at the top.
 */
function loft(T: Three, sections: Section[], around = 20, classify?: (i: number, pz: number, side: number) => number): THREE_NS.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const s of sections) {
    const zc = (s.bot + s.top) / 2;
    const hh = (s.top - s.bot) / 2;
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const c = Math.cos(a);
      const si = Math.sin(a);
      const pz = Math.sign(si) * Math.pow(Math.abs(si), 2 / s.n);
      const py = zc + hh * pz;
      // width eases from the bottom width to the top width
      const k = (pz + 1) / 2;
      const w = s.wb + (s.wt - s.wb) * k;
      const pw = Math.sign(c) * Math.pow(Math.abs(c), 2 / s.n) * w;
      pos.push(s.x, py, pw);
    }
  }
  // faces can be split into material groups (glass / paint / trim)
  const groups: number[][] = [[], [], []];
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = (i + 1) * around + j;
      const d = (i + 1) * around + ((j + 1) % around);
      const am = ((j + 0.5) / around) * Math.PI * 2;
      const g = classify ? classify(i, Math.sin(am), Math.cos(am)) : 0;
      groups[g].push(a, b, c, b, d, c);
    }
  for (const g of groups) idx.push(...g);
  // caps: a centre point at each end
  for (const [si, flip] of [
    [0, true],
    [sections.length - 1, false],
  ] as const) {
    const s = sections[si];
    const centre = pos.length / 3;
    pos.push(s.x, (s.bot + s.top) / 2, 0);
    for (let j = 0; j < around; j++) {
      const a = si * around + j;
      const b = si * around + ((j + 1) % around);
      if (flip) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // index layout: group 0, group 1, group 2, then the end caps (material 0)
  let start = 0;
  groups.forEach((list, m) => {
    g.addGroup(start, list.length, m);
    start += list.length;
  });
  g.addGroup(start, idx.length - start, 0);
  return g;
}

/** Splits a grouped loft into one mesh per material (glass, paint, trim…). */
function splitMeshes(T: Three, g: THREE_NS.BufferGeometry, mats: (THREE_NS.Material | null)[]): THREE_NS.Mesh[] {
  const index = g.getIndex()!.array;
  const byMat = new Map<number, number[]>();
  for (const gr of g.groups) {
    const list = byMat.get(gr.materialIndex ?? 0) ?? [];
    for (let i = gr.start; i < gr.start + gr.count; i++) list.push(index[i]);
    byMat.set(gr.materialIndex ?? 0, list);
  }
  const out: THREE_NS.Mesh[] = [];
  for (const [m, list] of byMat) {
    const mat = mats[m];
    if (!mat || !list.length) continue;
    const part = new T.BufferGeometry();
    part.setAttribute("position", g.getAttribute("position"));
    part.setAttribute("normal", g.getAttribute("normal"));
    part.setIndex(list);
    out.push(new T.Mesh(part, mat));
  }
  return out;
}

/** A tyre: lathed rounded-rectangle profile around the axle (Y). */
function tyreGeometry(T: Three, R: number, w: number) {
  const pts: THREE_NS.Vector2[] = [];
  const inner = R * 0.68;
  const rr = w * 0.32;
  // inner lip → sidewall → tread (rounded shoulders) → sidewall → inner lip
  pts.push(new T.Vector2(inner, -w / 2));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new T.Vector2(R - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new T.Vector2(R - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr));
  }
  pts.push(new T.Vector2(inner, w / 2));
  return new T.LatheGeometry(pts, 28);
}

function box(T: Three, w: number, h: number, d: number, mat: THREE_NS.Material, x: number, y: number, z: number, ry = 0) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

/** A strut between two points (pillars, wing posts). */
function strut(T: Three, a: THREE_NS.Vector3, b: THREE_NS.Vector3, r: number, mat: THREE_NS.Material) {
  const len = a.distanceTo(b);
  const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// ───────────────────────────── wheel ─────────────────────────────

function wheel(T: Three, kit: MaterialKit, R: number, w: number, spokes: number, sporty: boolean, spin: number, showTyre = true, rims: CarSpec["rims"] = "silver") {
  const rimM = rims === "black" ? kit.rimBlack : rims === "dark" ? kit.rimDark : rims === "chrome" ? kit.chrome : kit.rim;
  const g = new T.Group();
  // the wheel spins about its axle, which runs along Z (across the car)
  const turn = new T.Group();
  if (showTyre) {
    const tyre = new T.Mesh(tyreGeometry(T, R, w), kit.tyre);
    tyre.rotation.x = Math.PI / 2;
    turn.add(tyre);
  }
  // rim barrel and face
  // dark wheels keep a polished lip
  const face = new T.Mesh(new T.CylinderGeometry(R * 0.67, R * 0.67, w * 0.86, 24, 1, true), rims === "dark" ? kit.chrome : rimM);
  face.rotation.x = Math.PI / 2;
  turn.add(face);
  const dish = new T.Mesh(new T.CylinderGeometry(R * 0.62, R * 0.62, 0.01, 24), kit.trim);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = w * 0.18;
  turn.add(dish);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new T.Mesh(new T.BoxGeometry(R * 0.58, sporty ? 0.026 : 0.045, 0.03), rimM);
    sp.position.set(Math.cos(a) * R * 0.33, Math.sin(a) * R * 0.33, w * 0.28);
    sp.rotation.z = a;
    turn.add(sp);
  }
  const hub = new T.Mesh(new T.CylinderGeometry(R * 0.13, R * 0.13, 0.04, 12), kit.chrome);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = w * 0.3;
  turn.add(hub);
  turn.rotation.z = -spin;
  g.add(turn);
  // brake disc and caliper (do not spin)
  const disc = new T.Mesh(new T.CylinderGeometry(R * 0.5, R * 0.5, 0.025, 20), kit.disc);
  disc.rotation.x = Math.PI / 2;
  disc.position.z = w * 0.08;
  g.add(disc);
  if (sporty) {
    const cal = box(T, R * 0.25, R * 0.42, 0.06, kit.caliper, R * 0.3, R * 0.12, w * 0.14);
    g.add(cal);
  }
  return g;
}

// ───────────────────────────── car ─────────────────────────────

/** Builds a complete car. The origin is the ground under the car's centre. */
export function buildCar(T: Three, kit: MaterialKit, look: CarLook): THREE_NS.Group {
  const sp = CAR_SPECS[look.model];
  const st = look.stage?.station ?? 8;
  const painted = st >= 6;
  // every model leaves the line in its own factory colour
  const liv = liveryOf(look.model);
  const body = painted ? kit.paint(liv.color, liv.finish) : kit.primer;
  const roofM = painted && sp.roofColor ? kit.paint(sp.roofColor, "gloss") : body;
  const car = new T.Group();
  const { L, W, R } = sp;
  const hw = W / 2;
  const x = (u: number) => L / 2 - u * L; // u = 0 nose … 1 tail
  const fu = sp.fa;
  const ru = sp.fa + sp.wb / L;
  const sporty = !!sp.spoiler || !!sp.intakes || sp.rims === "black" || sp.rims === "dark";

  // body top line: nose → hood → windshield base → deck → tail
  const top = curve([
    [0, sp.nose],
    [0.06, sp.nose + (sp.hood - sp.nose) * 0.55],
    [sp.ws * 0.6, sp.hood - 0.04],
    [sp.ws, sp.hood],
    [sp.rw, sp.deck],
    [0.95, sp.tail + 0.03],
    [1, sp.tail - 0.08],
  ]);
  const halfW = curve([
    [0, hw * (1 - sp.taper)],
    [0.08, hw * (1 - sp.taper * 0.25)],
    [0.25, hw],
    [0.8, hw],
    [0.94, hw * (1 - sp.taper * 0.3)],
    [1, hw * (1 - sp.taper * 0.8)],
  ]);
  const archR = R + 0.05;
  const bottom = (u: number) => {
    let b = sp.clear;
    const xx = x(u);
    for (const au of [fu, ru]) {
      const d = Math.abs(xx - x(au));
      if (d < archR) b = Math.max(b, R + Math.sqrt(archR * archR - d * d) * 0.92);
    }
    // bumpers curl up at the ends
    if (u < 0.04) b += (0.04 - u) * 3;
    if (u > 0.96) b += (u - 0.96) * 3;
    return Math.min(b, top(u) - 0.12);
  };
  const flare = (u: number) => {
    let f = 0;
    for (const au of [fu, ru]) f = Math.max(f, Math.max(0, 1 - Math.abs(x(u) - x(au)) / (archR * 1.6)));
    return f * sp.flare;
  };
  const N = 44;
  const sections: Section[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const t = top(u);
    const w = halfW(u) + flare(u);
    // ends round off in plan and in profile
    const end = Math.min(1, Math.min(u, 1 - u) / 0.025);
    const k = 0.72 + 0.28 * Math.sqrt(end);
    sections.push({ x: x(u), wb: w * k * 0.97, wt: w * k * 0.86, bot: bottom(u), top: t, n: sp.n ?? 2.7 });
  }
  /** Height of the body surface at u, at a share f (0 centre … 1 side) of its half width. */
  const surfY = (u: number, f: number) => {
    const q = sections[Math.round(u * N)];
    const n = sp.n ?? 2.7;
    const hh = (q.top - q.bot) / 2;
    return (q.top + q.bot) / 2 + hh * Math.pow(1 - Math.pow(Math.min(0.98, Math.abs(f)), n), 1 / n);
  };
  /** Half width of the body at u at height y. */
  const sideZ = (u: number, y: number) => {
    const q = sections[Math.round(u * N)];
    const n = sp.n ?? 2.7;
    const hh = (q.top - q.bot) / 2;
    const pz = Math.max(-0.99, Math.min(0.99, (y - (q.top + q.bot) / 2) / hh));
    const w = q.wb + (q.wt - q.wb) * ((pz + 1) / 2);
    return w * Math.pow(1 - Math.pow(Math.abs(pz), n), 1 / n);
  };
  const shell = new T.Mesh(loft(T, sections), body);
  car.add(shell);

  // greenhouse: glass all round, painted roof and pillars
  const belt = (u: number) => top(u) - 0.02;
  const gh: Section[] = [];
  const roofAt = curve([
    [sp.ws, sp.hood],
    [sp.rs, sp.roof],
    [sp.re, sp.roof - 0.01],
    [sp.rw, sp.deck],
  ]);
  const GN = 26;
  for (let i = 0; i <= GN; i++) {
    const u = sp.ws + ((sp.rw - sp.ws) * i) / GN;
    const b = belt(u);
    const tp = Math.max(b + 0.02, roofAt(u));
    const w = halfW(u) * 0.93;
    gh.push({ x: x(u), wb: w, wt: w * sp.roofW, bot: b - 0.05, top: tp, n: sp.gn ?? 3.4 });
  }
  // glass all round, a painted roof, black B-pillars (no glass before station 5)
  const ghU = (i: number) => sp.ws + ((sp.rw - sp.ws) * (i + 0.5)) / GN;
  const midU = (sp.rs + sp.re) / 2;
  const classify = (i: number, pz: number, side: number) => {
    const u = ghU(i);
    if (pz > 0.62 && u > sp.rs && u < sp.re) return 1; // roof
    if (Math.abs(side) > 0.35 && sp.re - sp.rs > 0.12 && Math.abs(u - midU) < 0.012) return 2; // B-pillar
    if (Math.abs(side) > 0.35 && (u < sp.ws + 0.015 || u > sp.rw - 0.03)) return sp.pillars ? 2 : 1; // A and C pillars
    return 0;
  };
  // before the glass goes in (station 5) only the roof and pillars stand, seats visible
  const parts = splitMeshes(T, loft(T, gh, 20, classify), [st >= 4 ? kit.glass : null, roofM, painted ? kit.trim : body]);
  car.add(...parts);
  if (st < 4) {
    if (st >= 3) {
      const seat = (sx: number, sz: number) => {
        const sg = new T.Group();
        sg.add(box(T, 0.5, 0.12, 0.48, kit.seat, 0, sp.hood - 0.25, 0));
        sg.add(box(T, 0.12, 0.55, 0.46, kit.seat, -0.22, sp.hood + 0.02, 0));
        sg.position.set(sx, 0, sz);
        return sg;
      };
      car.add(seat(x((sp.ws + sp.rs) / 2) - 0.35, -hw * 0.42), seat(x((sp.ws + sp.rs) / 2) - 0.35, hw * 0.42));
    }
  }
  // chrome or black trim along the window line
  for (const side of [-1, 1]) {
    const p = (u: number, h: number) => new T.Vector3(x(u), h, side * halfW(u) * 0.94);
    car.add(strut(T, p(sp.ws + 0.01, belt(sp.ws) + 0.005), p(sp.rw - 0.01, belt(sp.rw) + 0.005), 0.012, sp.chrome ? kit.chrome : kit.trim));
  }

  // engine (visible before the hood goes on at final assembly)
  if (st >= 1 && st < 7) {
    const ex = x(sp.intakes ? 0.62 : 0.16);
    car.add(box(T, 0.7, 0.32, 0.6, kit.engine, ex, sp.hood + 0.05, 0));
    car.add(box(T, 0.5, 0.1, 0.5, kit.trim, ex, sp.hood + 0.26, 0));
  }

  const done = st >= 7;
  // wheels and suspension
  if (st >= 2) {
    const steer = look.steer ?? 0;
    for (const au of [fu, ru])
      for (const side of [-1, 1]) {
        const wz = side * (hw + sp.flare * 0.6 - sp.tw * 0.5);
        const wg = st >= 5 ? wheel(T, kit, R, sp.tw, sp.spokes, sporty, look.spin ?? 0, true, sp.rims) : wheel(T, kit, R, sp.tw, 0, false, 0, false);
        if (side < 0) wg.rotation.y = Math.PI;
        const holder = new T.Group();
        holder.add(wg);
        holder.position.set(x(au), R, wz);
        if (au === fu) holder.rotation.y = steer;
        car.add(holder);
      }
  }

  if (done) {
    const lamp = sp.lamps ?? (sp.led ? "led" : "round");
    const gy = sp.nose - (sp.grille ? sp.grille[1] / 2 + 0.04 : 0.12);
    // a round lamp facing forward, with a chrome bezel
    const roundLamp = (lx: number, ly: number, lz: number, r: number, tall = 1) => {
      const lens = new T.Mesh(new T.CylinderGeometry(r, r, 0.05, 18), kit.lens);
      lens.rotation.z = Math.PI / 2;
      lens.scale.set(1, 1, tall);
      lens.position.set(lx, ly, lz);
      const ring = new T.Mesh(new T.TorusGeometry(r, 0.014, 6, 20), kit.chrome);
      ring.rotation.y = Math.PI / 2;
      ring.scale.set(1, tall, 1);
      ring.position.set(lx + 0.022, ly, lz);
      car.add(lens, ring);
    };
    for (const side of [-1, 1]) {
      const fz = halfW(0.02) * 0.9;
      if (lamp === "round") roundLamp(x(0.012), gy, side * fz * 0.74, 0.095);
      else if (lamp === "quad") for (const k of [0.84, 0.6]) roundLamp(x(0.012), gy, side * fz * k, 0.07);
      else if (lamp === "frog" || lamp === "oval") {
        // upright lamps on top of the front wings
        const u = 0.06;
        const f = 0.7;
        const lz = side * (halfW(u) + flare(u)) * f;
        roundLamp(x(u) + 0.02, surfY(u, f) + 0.02, lz, lamp === "oval" ? 0.085 : 0.09, lamp === "oval" ? 1.35 : 1);
      } else if (lamp === "slim") car.add(box(T, 0.05, 0.07, 0.34, kit.lens, x(0.012), sp.nose - 0.08, side * fz * 0.66));
      else {
        const lens = new T.Mesh(new T.SphereGeometry(0.15, 14, 10), kit.led);
        lens.scale.set(0.45, 0.22, 1.8);
        lens.position.set(x(0.025), sp.nose + (sp.hood - sp.nose) * 0.35, side * halfW(0.04) * 0.68);
        car.add(lens);
      }
      // tail lights (a full-width bar on the rear-engine coupés)
      if (lamp !== "frog" && lamp !== "oval") {
        const tl = new T.Mesh(new T.SphereGeometry(0.14, 12, 8), kit.tail);
        tl.scale.set(0.35, 0.36, sp.led ? 3.2 : 1.6);
        tl.position.set(x(0.985), sp.tail - 0.06, side * halfW(0.97) * (sp.led ? 0.45 : 0.66));
        car.add(tl);
      }
      // mirrors on stalks at the A-pillar base
      const mu = sp.ws + 0.02;
      const mz = side * (halfW(mu) * 0.98 + 0.11);
      car.add(box(T, 0.06, 0.04, 0.12, kit.trim, x(mu), belt(mu) + 0.05, side * (halfW(mu) * 0.96 + 0.04)));
      const mirror = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), body);
      mirror.scale.set(0.9, 0.8, 1.3);
      mirror.position.set(x(mu) - 0.02, belt(mu) + 0.1, mz);
      car.add(mirror);
      // door handles
      const doors = sp.re - sp.rs > 0.15 ? [0.42, 0.62] : [0.48];
      for (const du of doors) car.add(box(T, 0.16, 0.025, 0.02, sp.chrome ? kit.chrome : kit.trim, x(du), belt(du) - 0.13, side * (halfW(du) + flare(du) - 0.005)));
      // side air intakes on mid-engine cars
      if (sp.intakes) {
        const iu = sp.rw - 0.04;
        const intake = new T.Mesh(new T.SphereGeometry(0.2, 12, 8), kit.plastic);
        intake.scale.set(1.5, 0.55, 0.25);
        intake.position.set(x(iu), (bottom(iu) + top(iu)) / 2, side * (halfW(iu) + flare(iu) - 0.02));
        car.add(intake);
      }
    }
    // grille: a dark recess with chrome bars (closed panel on electric cars)
    const gx = x(0.008);
    const gw = W * (sp.grille ? sp.grille[0] : sp.chrome ? 0.42 : 0.36);
    const gH = sp.grille ? sp.grille[1] : sp.chrome ? 0.26 : 0.16;
    car.add(box(T, 0.05, gH, gw, sp.closedGrille ? body : kit.trim, gx, gy, 0));
    const bars = Math.max(2, Math.round(gH / 0.05));
    if (!sp.closedGrille) for (let i = 0; i < bars; i++) car.add(box(T, 0.055, 0.01, gw * 0.96, sp.chrome ? kit.chrome : kit.plastic, gx + 0.003, gy - gH / 2 + ((i + 0.5) * gH) / bars, 0));
    // hot-hatch red pinstripe around the grille
    if (look.model === "city") car.add(box(T, 0.056, 0.014, gw, kit.tail, gx + 0.004, gy - gH / 2 + 0.02, 0));
    // bumpers: chrome blades or black wraparound bars
    if (sp.bumper)
      for (const [u, dx] of [
        [0, 0.02],
        [1, -0.02],
      ] as const) {
        const by = sp.clear + (sp.bumper === "chrome" ? 0.2 : 0.17);
        car.add(box(T, sp.bumper === "chrome" ? 0.1 : 0.16, sp.bumper === "chrome" ? 0.08 : 0.14, halfW(u === 0 ? 0.01 : 0.99) * 1.9, sp.bumper === "chrome" ? kit.chrome : kit.plastic, x(u) + dx, by, 0));
      }
    // rear-engine coupés: a full-width light bar
    if (lamp === "frog" || lamp === "oval") {
      car.add(box(T, 0.04, 0.07, W * 0.84, kit.tail, x(0.993), sp.tail - 0.05, 0));
      car.add(box(T, 0.042, 0.02, W * 0.5, kit.trim, x(0.993) - 0.002, sp.tail - 0.05, 0));
    }
    if (sp.hoodVents) for (const s of [-1, 1]) car.add(box(T, 0.22, 0.012, 0.2, kit.trim, x(0.1), surfY(0.1, 0.3) + 0.004, s * 0.26));
    if (sp.led) car.add(box(T, 0.03, 0.025, W * 0.7, kit.led, x(0.012), sp.nose + 0.02, 0));
    // lower intake / splitter
    car.add(box(T, 0.12, 0.06, W * 0.7, kit.plastic, x(0.02), sp.clear + 0.1, 0));
    // rear: diffuser fins and exhausts
    car.add(box(T, 0.18, 0.08, W * 0.72, kit.plastic, x(0.985), sp.clear + 0.1, 0));
    if (sporty) for (let i = -2; i <= 2; i++) car.add(box(T, 0.2, 0.09, 0.015, kit.plastic, x(0.98), sp.clear + 0.06, i * 0.18));
    if (look.model !== "electric")
      for (const side of sp.intakes ? [-0.12, 0.12] : [-1, 1]) {
        const ex = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.12, 10), kit.chrome);
        ex.rotation.z = Math.PI / 2;
        ex.position.set(x(1) - 0.02, sp.clear + 0.12, sp.intakes ? side * 2 : side * hw * 0.55);
        car.add(ex);
      }
    // spoilers
    if (sp.spoiler === "lip") car.add(box(T, 0.18, 0.035, W * 0.8, body, x(0.965), sp.tail + 0.06, 0));
    if (sp.spoiler === "wing" || sp.spoiler === "big") {
      const big = sp.spoiler === "big";
      const wy = sp.tail + (big ? 0.34 : 0.24);
      const wingM = big ? kit.trim : body;
      const wing = box(T, big ? 0.36 : 0.28, 0.035, W * (big ? 0.98 : 0.86), wingM, x(0.955), wy, 0);
      wing.rotation.z = -0.08;
      car.add(wing);
      for (const s of [-1, 1]) car.add(strut(T, new T.Vector3(x(0.95), sp.tail, s * W * 0.25), new T.Vector3(x(0.955), wy, s * W * 0.25), 0.02, kit.trim));
      if (big) for (const s of [-1, 1]) car.add(box(T, 0.36, 0.14, 0.02, kit.trim, x(0.955), wy + 0.03, s * W * 0.49));
    }
    if (sp.scoop) {
      const sc = new T.Mesh(new T.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
      sc.scale.set(1.5, 0.16, 0.55);
      sc.position.set(x(sp.ws * 0.5), top(sp.ws * 0.5) - 0.01, 0);
      car.add(sc);
      car.add(box(T, 0.03, 0.05, 0.3, kit.trim, x(sp.ws * 0.5) + 0.33, top(sp.ws * 0.5) + 0.03, 0));
    }
    if (sp.band) {
      // twin racing stripes over the hood and deck (and the roof)
      const strip = (list: Section[]) => list.map((q) => ({ ...q, wb: 0.085, wt: 0.085, bot: q.top - 0.004, top: q.top + 0.008, n: 8 }));
      const front = sections.filter((q) => q.x >= x(sp.ws) - 0.02 && q.x <= x(0.01));
      const rear = sections.filter((q) => q.x <= x(sp.rw) + 0.02 && q.x >= x(0.99));
      const roofSecs = gh.filter((q) => q.x <= x(sp.rs) && q.x >= x(sp.re));
      for (const z of [-0.15, 0.15])
        for (const list of sp.band === "full" ? [front, rear, roofSecs] : [front, rear])
          if (list.length > 1) {
            const m = new T.Mesh(loft(T, strip(list), 8), kit.white);
            m.position.z = z;
            car.add(m);
          }
    }
    if (sp.sideStripe) {
      // a white stripe along each flank, broken by the wheel arches
      const y0 = sp.clear + (sp.hood - sp.clear) * 0.62;
      for (const side of [-1, 1])
        for (let i = 1; i < N - 1; i++) {
          const u0 = i / N;
          const u1 = (i + 1) / N;
          if (bottom(u0) > y0 - 0.05 || bottom(u1) > y0 - 0.05) continue;
          const a = new T.Vector3(x(u0), y0, side * (sideZ(u0, y0) + 0.004));
          const b = new T.Vector3(x(u1), y0, side * (sideZ(u1, y0) + 0.004));
          const seg = box(T, a.distanceTo(b) + 0.004, 0.05, 0.008, kit.white, (a.x + b.x) / 2, y0, (a.z + b.z) / 2, -Math.atan2(b.z - a.z, b.x - a.x));
          car.add(seg);
        }
    }
    if (sp.rails) {
      for (const s of [-1, 1]) car.add(box(T, (sp.re - sp.rs) * L * 0.95, 0.04, 0.04, kit.chrome, x((sp.rs + sp.re) / 2), sp.roof + 0.045, s * halfW(0.6) * sp.roofW * 0.85));
    }
  }

  for (const m of car.children) m.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = false)) : null));
  return car;
}

// ───────────────────────────── trucks ─────────────────────────────

/** A cab with windscreen, mirrors, grille and lights. Origin at its rear axle line. */
function cab(T: Three, kit: MaterialKit, color: string, len: number, h: number, w: number) {
  const g = new T.Group();
  const paint = kit.paint(color, "gloss");
  // rounded cab body
  const secs: Section[] = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const front = u < 0.15;
    secs.push({ x: len * (1 - u) - len / 2, wb: w / 2, wt: w / 2 * 0.94, bot: 0.45, top: front ? 0.45 + h * (0.82 + u) : 0.45 + h, n: 5 });
  }
  g.add(new T.Mesh(loft(T, secs, 18), paint));
  // windscreen and side windows
  g.add(box(T, 0.04, h * 0.42, w * 0.86, kit.glass, len / 2 + 0.005, 0.45 + h * 0.66, 0));
  for (const s of [-1, 1]) g.add(box(T, len * 0.4, h * 0.34, 0.02, kit.glass, len * 0.22, 0.45 + h * 0.66, s * (w / 2 + 0.003)));
  // grille, bumper, lights, mirrors
  g.add(box(T, 0.04, h * 0.3, w * 0.6, kit.trim, len / 2 + 0.01, 0.45 + h * 0.25, 0));
  g.add(box(T, 0.12, 0.18, w * 1.02, kit.plastic, len / 2, 0.5, 0));
  for (const s of [-1, 1]) {
    const lens = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), kit.lens);
    lens.scale.set(0.4, 0.6, 1);
    lens.position.set(len / 2 + 0.03, 0.62, s * w * 0.38);
    g.add(lens);
    g.add(box(T, 0.04, 0.32, 0.05, kit.trim, len / 2 - 0.05, 0.45 + h * 0.7, s * (w / 2 + 0.12)));
    g.add(strut(T, new T.Vector3(len / 2 - 0.05, 0.45 + h * 0.85, s * w / 2), new T.Vector3(len / 2 - 0.05, 0.45 + h * 0.85, s * (w / 2 + 0.12)), 0.015, kit.trim));
  }
  return g;
}

export interface TruckLook {
  kind: "van" | "truck" | "semi" | "trailer";
  cargo: string;
  empty: boolean;
  spin?: number;
}

/** Delivery trucks: van, box truck, semi and road train. Origin under the centre. */
export function buildTruck(T: Three, kit: MaterialKit, look: TruckLook): THREE_NS.Group {
  const g = new T.Group();
  const dims = { van: { L: 5.2, W: 2.0, H: 2.3 }, truck: { L: 7.5, W: 2.4, H: 3.0 }, semi: { L: 9.5, W: 2.5, H: 3.3 }, trailer: { L: 11, W: 2.5, H: 3.4 } }[look.kind];
  const { L, W, H } = dims;
  const R = look.kind === "van" ? 0.34 : 0.48;
  const cabLen = look.kind === "van" ? 1.6 : 2.0;
  const cabColor = "#e8ecf1";
  // chassis
  g.add(box(T, L * 0.96, 0.2, W * 0.8, kit.trim, 0, R + 0.05, 0));
  const c = cab(T, kit, cabColor, cabLen, look.kind === "van" ? 1.55 : 2.0, W);
  c.position.x = L / 2 - cabLen / 2;
  g.add(c);
  // cargo box with ribs, or a flat bed when empty
  const boxLen = L - cabLen - 0.25;
  const bx = -L / 2 + boxLen / 2 + 0.05;
  if (look.kind === "van") {
    const vanBody = box(T, boxLen, H - 0.55, W, kit.paint(look.empty ? cabColor : cabColor, "gloss"), bx, 0.55 + (H - 0.55) / 2, 0);
    g.add(vanBody);
    if (!look.empty) for (const s of [-1, 1]) g.add(box(T, boxLen * 0.8, 0.35, 0.01, kit.paint(look.cargo, "gloss"), bx, 1.4, s * (W / 2 + 0.006)));
  } else if (!look.empty) {
    g.add(box(T, boxLen, H - 0.65, W, kit.paint(look.cargo, "gloss"), bx, 0.65 + (H - 0.65) / 2, 0));
    for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) g.add(box(T, 0.04, H - 0.75, 0.02, kit.chrome, bx - boxLen / 2 + (i * boxLen) / 6, 0.65 + (H - 0.65) / 2, s * (W / 2 + 0.01)));
    g.add(box(T, 0.02, H - 0.7, W * 0.96, kit.trim, bx - boxLen / 2 - 0.005, 0.65 + (H - 0.65) / 2, 0));
  } else {
    g.add(box(T, boxLen, 0.14, W, kit.plastic, bx, 0.72, 0));
    for (const s of [-1, 1]) g.add(box(T, boxLen, 0.4, 0.04, kit.trim, bx, 0.98, s * W / 2));
  }
  // wheels: front axle under the cab, one or two rear axles
  const axles = look.kind === "van" ? [L / 2 - 0.9, -L / 2 + 1.0] : look.kind === "truck" ? [L / 2 - 1.1, -L / 2 + 1.6] : [L / 2 - 1.1, -L / 2 + 2.2, -L / 2 + 1.0];
  for (const ax of axles)
    for (const s of [-1, 1]) {
      const wg = wheel(T, kit, R, 0.32, 6, false, look.spin ?? 0);
      if (s < 0) wg.rotation.y = Math.PI;
      wg.position.set(ax, R, s * (W / 2 - 0.12));
      g.add(wg);
    }
  // mud flaps and tail lights
  for (const s of [-1, 1]) {
    g.add(box(T, 0.04, 0.4, 0.4, kit.plastic, -L / 2 + 0.3, 0.4, s * (W / 2 - 0.25)));
    const tl = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), kit.tail);
    tl.scale.set(0.5, 1, 1.6);
    tl.position.set(-L / 2 - 0.02, 0.75, s * (W / 2 - 0.2));
    g.add(tl);
  }
  g.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return g;
}

/** A car transporter with two decks, loaded with real cars. */
export function buildCarrier(T: Three, kit: MaterialKit, cars: CarLook[], spin = 0): THREE_NS.Group {
  const g = new T.Group();
  const L = 12;
  const W = 2.5;
  const c = cab(T, kit, "#f59e0b", 2.2, 2.0, W);
  c.position.x = L / 2 - 1.1;
  g.add(c);
  g.add(box(T, L * 0.95, 0.2, W * 0.8, kit.trim, 0, 0.55, 0));
  const deckLen = L - 2.6;
  const dx = -L / 2 + deckLen / 2;
  // lower and upper decks with posts
  g.add(box(T, deckLen, 0.1, W, kit.plastic, dx, 0.85, 0));
  g.add(box(T, deckLen, 0.08, W, kit.trim, dx, 2.55, 0));
  for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) g.add(box(T, 0.08, 1.75, 0.08, kit.paint("#f59e0b", "gloss"), dx - deckLen / 2 + (i * deckLen) / 4, 1.7, s * W / 2));
  const slots = [
    [dx + deckLen * 0.25, 0.9],
    [dx - deckLen * 0.25, 0.9],
    [dx + deckLen * 0.2, 2.6],
    [dx - deckLen * 0.25, 2.6],
  ];
  cars.slice(0, 4).forEach((look, i) => {
    const m = buildCar(T, kit, look);
    m.scale.setScalar(0.8);
    m.position.set(slots[i][0], slots[i][1], 0);
    g.add(m);
  });
  for (const ax of [L / 2 - 1.1, -L / 2 + 2.4, -L / 2 + 1.2])
    for (const s of [-1, 1]) {
      const wg = wheel(T, kit, 0.48, 0.32, 6, false, spin);
      if (s < 0) wg.rotation.y = Math.PI;
      wg.position.set(ax, 0.48, s * (W / 2 - 0.12));
      g.add(wg);
    }
  g.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return g;
}
