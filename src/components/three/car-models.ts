// Procedural 3D vehicles. Bodies are lofted from cross-sections along the
// car (rounded, with fenders, wheel arches, a sloped windshield and a real
// greenhouse); wheels are lathed tyres with spoked rims and brake discs;
// lights, grilles, mirrors, handles, spoilers and diffusers are geometry,
// not texture. Units are metres; +X is forward, +Y up, +Z to the right.
import type * as THREE_NS from "three";
import { liveryOf } from "./livery";
import type { Facing } from "./glb-car";

type Three = typeof THREE_NS;

export type BodyModel = "city" | "sedan" | "suv" | "sports" | "muscle" | "luxury" | "supercar" | "hypercar" | "electric" | "compact" | "minivan" | "offroad" | "pickup" | "wagon";

/** Rim finish of the truck wheels. */
type Rims = "silver" | "black" | "dark" | "chrome";

/** Bumper-to-bumper length of each body, metres: its ready-made model is scaled to it. */
export const CAR_LENGTH: Record<BodyModel, number> = {
  city: 3.98,
  sedan: 4.35,
  suv: 4.8,
  sports: 4.25,
  muscle: 4.65,
  luxury: 4.5,
  supercar: 4.55,
  hypercar: 4.6,
  electric: 4.5,
  compact: 3.9,
  minivan: 4.9,
  offroad: 4.3,
  pickup: 5.3,
  wagon: 4.6,
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
  /** What the factories actually fitted (Car DNA): overrides the model's factory look. */
  build?: BuildLook;
}

/** The parts a car really got, as they show: paint, rims, engine and brakes. */
export interface BuildLook {
  /** Design studio paint ("" = the model's factory colour). */
  color?: string;
  rims?: "silver" | "black" | "dark" | "chrome";
  /** Rim size from the Wheel Factory's grade (1 = standard). */
  rimScale?: number;
  /** Engine Factory grade 1–5: a bigger block, a turbo, a red cam cover. */
  engine?: number;
  /** Brake Factory grade 1–5: performance brakes get coloured calipers. */
  brakes?: number;
  /** R&D: wind-tunnel aero (a bigger wing) and carbon body panels (a carbon bonnet). */
  aero?: boolean;
  carbon?: boolean;
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
  cabin: THREE_NS.Material;
  plate: THREE_NS.Material;
  alu: THREE_NS.Material;
  amber: THREE_NS.Material;
  wood: THREE_NS.Material;
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
    // tinted glass that mirrors the sky like real windows do
    // see-through glass: the sky reflects off it and the cabin shows behind it
    glass: new T.MeshPhysicalMaterial({ color: "#3b5670", metalness: 0.25, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, transparent: true, opacity: 0.84, depthWrite: false }),
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
    cabin: new T.MeshStandardMaterial({ color: "#1b1d21", roughness: 0.8 }),
    plate: new T.MeshStandardMaterial({ color: "#f3f4f6", roughness: 0.35, metalness: 0.1 }),
    alu: new T.MeshStandardMaterial({ color: "#c7ccd3", metalness: 0.9, roughness: 0.28 }),
    amber: new T.MeshStandardMaterial({ color: "#f59e0b", emissive: "#f59e0b", emissiveIntensity: 0.35, roughness: 0.2 }),
    wood: new T.MeshStandardMaterial({ color: "#8b5a2b", roughness: 0.85 }),
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

/**
 * Ready-made 3D models standing in for a procedural body (see glb-car.ts).
 * Files live in public/models/; their licences and credits are in
 * public/models/CREDITS.txt and on the Settings screen.
 */
interface HeroFile {
  url: string;
  /** Parts left out, by material name. */
  hide?: RegExp;
  /** The file's own paint (with its decals) is the factory look; only a Design-studio colour repaints it. */
  ownPaint?: boolean;
  /** One car out of a pack (its body's node name), and which way it faces once straightened. */
  pick?: string;
  facing?: Facing;
}
const PACK = "models/car-pack.glb";
const HERO_FILES: Partial<Record<BodyModel, HeroFile>> = {
  // "Porsche 911(930) Turbo 1975" by vecarz, CC BY-NC-SA 4.0 — badges and plates left out
  sports: { url: "models/sports-1975.glb", hide: /sticker|plate|wunderbaum/i },
  // "Nissan R34 Brians Fast Furious" by vecarz, CC BY 4.0 — silver with blue graphics, badges left out
  muscle: { url: "models/gt-r34.glb", hide: /badge|manufacturerplate/i, ownPaint: true },
  // "Generic passenger car pack" by Comrade1280, CC BY 4.0 — unbranded cars, painted in the game's colours
  city: { url: PACK, pick: "Hatchback Body" },
  sedan: { url: PACK, pick: "Sedan Body", facing: "-x" },
  suv: { url: PACK, pick: "SUV Body", facing: "-x" },
  luxury: { url: PACK, pick: "Coupe Body" },
  supercar: { url: PACK, pick: "Sport body", facing: "-x" },
  hypercar: { url: PACK, pick: "Sport body", facing: "-x" },
  electric: { url: PACK, pick: "Compact Body" },
  // street traffic
  compact: { url: PACK, pick: "Compact Body" },
  minivan: { url: PACK, pick: "minivan body" },
  offroad: { url: PACK, pick: "Offroad Body", facing: "-x" },
  pickup: { url: PACK, pick: "Pickup Body" },
  wagon: { url: PACK, pick: "Wagon Body", facing: "-x" },
};
interface Hero {
  car: THREE_NS.Group;
  ownPaint: boolean;
  /** Names of the body-paint materials (repainted per car). */
  paint: Set<string>;
  /** One repainted copy of each paint material per colour. */
  coats: Map<string, THREE_NS.Material>;
}
const HEROES: Partial<Record<BodyModel, Hero>> = {};
let heroLoad: Promise<void> | null = null;

/** Loads the ready-made models (once); bodies without one stay procedural. */
export function loadHeroes(T: Three): Promise<void> {
  heroLoad ??= (async () => {
    const { loadGlbCar, paintMaterials, neutralizePaint } = await import("./glb-car");
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    await Promise.all(
      (Object.entries(HERO_FILES) as [BodyModel, HeroFile][]).map(async ([model, f]) => {
        try {
          const car = await loadGlbCar(T, `${base}/${f.url}`, { length: CAR_LENGTH[model], hide: f.hide, pick: f.pick, facing: f.facing });
          const paint = paintMaterials(T, car);
          if (!f.ownPaint) neutralizePaint(T, paint);
          // shared by every copy: never disposed with a sprite
          car.traverse((o) => {
            const m = o as THREE_NS.Mesh;
            if (!m.isMesh) return;
            m.geometry.userData.keep = true;
            for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mm.userData.keep = true;
          });
          HEROES[model] = { car, ownPaint: !!f.ownPaint, paint: new Set(paint.map((m) => m.name)), coats: new Map() };
        } catch {
          // no file or no network: the procedural body stays
        }
      }),
    );
  })();
  return heroLoad;
}

/** A copy of a ready-made model in the given paint, or its own (geometry and other materials shared). */
function heroCopy(hero: Hero, color: string | null): THREE_NS.Group {
  const car = hero.car.clone(true);
  if (!color) return car;
  car.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || !hero.paint.has(m.material.name)) return;
    const key = `${m.material.name}|${color}`;
    let coat = hero.coats.get(key);
    if (!coat) {
      coat = m.material.clone();
      const c = coat as THREE_NS.MeshPhysicalMaterial;
      c.color.set(color);
      // a soft gloss: a mirror-like clearcoat shows the studio walls as grey streaks
      c.envMapIntensity = 0.7;
      if ("clearcoat" in c) {
        c.clearcoat = Math.min(c.clearcoat, 0.35);
        c.clearcoatRoughness = Math.max(c.clearcoatRoughness, 0.2);
      }
      coat.userData.keep = true;
      hero.coats.set(key, coat);
    }
    m.material = coat;
  });
  return car;
}

let RoundedBox: typeof import("three/addons/geometries/RoundedBoxGeometry.js").RoundedBoxGeometry | null = null;
/** Loads the rounded box geometry (call once before building). */
export async function loadShapes() {
  RoundedBox ??= (await import("three/addons/geometries/RoundedBoxGeometry.js")).RoundedBoxGeometry;
}

/** A box with softened edges (falls back to a sharp box until the geometry is loaded). */
function rbox(T: Three, w: number, h: number, d: number, mat: THREE_NS.Material, x: number, y: number, z: number, r = 0.03, ry = 0) {
  const rr = Math.min(r, Math.min(w, h, d) * 0.45);
  const m = new T.Mesh(RoundedBox && rr > 0.002 ? new RoundedBox(w, h, d, 2, rr) : new T.BoxGeometry(w, h, d), mat);
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

function wheel(T: Three, kit: MaterialKit, R: number, w: number, spokes: number, sporty: boolean, spin: number, showTyre = true, rims: Rims = "silver", rimScale = 1, caliperM?: THREE_NS.Material) {
  // a bigger rim means a lower-profile tyre around it (the wheel itself keeps its size)
  const rs = Math.max(0.85, Math.min(1.18, rimScale));
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
  const face = new T.Mesh(new T.CylinderGeometry(R * 0.67 * rs, R * 0.67 * rs, w * 0.86, 24, 1, true), rims === "dark" ? kit.chrome : rimM);
  face.rotation.x = Math.PI / 2;
  turn.add(face);
  const dish = new T.Mesh(new T.CylinderGeometry(R * 0.62 * rs, R * 0.62 * rs, 0.01, 24), kit.trim);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = w * 0.18;
  turn.add(dish);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new T.Mesh(new T.BoxGeometry(R * 0.58 * rs, sporty ? 0.026 : 0.045, 0.03), rimM);
    sp.position.set(Math.cos(a) * R * 0.33 * rs, Math.sin(a) * R * 0.33 * rs, w * 0.28);
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
    const cal = box(T, R * 0.25, R * 0.42, 0.06, caliperM ?? kit.caliper, R * 0.3, R * 0.12, w * 0.14);
    g.add(cal);
  }
  return g;
}

// ───────────────────────────── car ─────────────────────────────

/**
 * A car: the ready-made model of its body, in grey primer on the assembly
 * line until the paint shop, then in its paint (the Design-studio colour,
 * else its factory colour, else the file's own paint where that is the
 * factory look). Nothing is drawn until the model files are in.
 */
export function buildCar(T: Three, look: CarLook): THREE_NS.Group {
  const hero = HEROES[look.model];
  if (!hero) return new T.Group();
  const st = look.stage?.station ?? 8;
  return heroCopy(hero, st < 6 ? "#9aa3ad" : look.build?.color || (hero.ownPaint ? null : liveryOf(look.model).color));
}


// ───────────────────────────── trucks ─────────────────────────────

/** A dark half-tube over an axle: the wheel arch. Axis across the vehicle. */
function arch(T: Three, kit: MaterialKit, x: number, R: number, w: number) {
  const m = new T.Mesh(new T.CylinderGeometry(R * 1.12, R * 1.12, w, 16, 1, false, -Math.PI / 2, Math.PI), kit.cabin);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, R, 0);
  return m;
}

/**
 * A forward-control truck cab: rounded shell, raked windscreen with a sun
 * visor, grille bars, lamps in the bumper, a step, big mirrors on arms and,
 * on long-haul tractors, a sleeper with a roof fairing. Origin: centre of
 * the cab on the ground; +X forward.
 */
function cab(T: Three, kit: MaterialKit, color: string, len: number, h: number, w: number, sleeper = false) {
  const g = new T.Group();
  const paint = kit.paint(color, "gloss");
  const y0 = 0.55;
  const fx = len / 2;
  // the shell: rounded box, a touch narrower at the roof
  g.add(rbox(T, len, h, w, paint, 0, y0 + h / 2, 0, 0.16));
  // the cabin inside, seen through the glass
  g.add(rbox(T, len * 0.6, h * 0.4, w * 0.86, kit.cabin, fx - len * 0.35, y0 + h * 0.62, 0, 0.05));
  // raked windscreen and side windows
  const ws = rbox(T, 0.06, h * 0.4, w * 0.9, kit.glass, fx + 0.005, y0 + h * 0.66, 0, 0.03);
  ws.rotation.z = -0.07;
  g.add(ws);
  for (const sd of [-1, 1]) {
    g.add(rbox(T, len * 0.42, h * 0.32, 0.04, kit.glass, fx - len * 0.28, y0 + h * 0.67, sd * (w / 2 + 0.002), 0.02));
    // door seam, handle and step
    g.add(box(T, 0.012, h * 0.62, 0.01, kit.trim, fx - len * 0.53, y0 + h * 0.45, sd * (w / 2 + 0.004)));
    g.add(box(T, 0.14, 0.03, 0.02, kit.chrome, fx - len * 0.48, y0 + h * 0.45, sd * (w / 2 + 0.01)));
    g.add(rbox(T, 0.34, 0.05, 0.16, kit.plastic, fx - len * 0.2, y0 - 0.08, sd * (w / 2 - 0.02), 0.02));
    // mirror on two arms, with a wide-angle lens below
    const mx = fx - 0.02;
    const mz = sd * (w / 2 + 0.24);
    for (const my of [y0 + h * 0.86, y0 + h * 0.5]) g.add(strut(T, new T.Vector3(mx - 0.05, my, sd * (w / 2 - 0.02)), new T.Vector3(mx, my, mz), 0.016, kit.trim));
    g.add(rbox(T, 0.07, h * 0.3, 0.13, kit.trim, mx, y0 + h * 0.7, mz, 0.03));
    g.add(rbox(T, 0.072, h * 0.1, 0.12, kit.chrome, mx + 0.004, y0 + h * 0.48, mz, 0.03));
    // headlamps in the bumper corners and amber indicators
    g.add(rbox(T, 0.05, 0.14, 0.32, kit.lens, fx + 0.05, y0 + 0.13, sd * w * 0.33, 0.03));
    const ind = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), kit.amber);
    ind.position.set(fx + 0.05, y0 + 0.13, sd * w * 0.46);
    g.add(ind);
  }
  // sun visor and roof marker lights
  g.add(rbox(T, 0.22, 0.05, w * 0.94, kit.trim, fx + 0.05, y0 + h + 0.0, 0, 0.02));
  for (let i = -2; i <= 2; i++) {
    const l = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), kit.amber);
    l.position.set(fx + 0.08, y0 + h + 0.04, i * w * 0.15);
    g.add(l);
  }
  // grille: dark panel with chrome bars and a badge
  const gy = y0 + h * 0.3;
  g.add(rbox(T, 0.04, h * 0.32, w * 0.64, kit.trim, fx + 0.01, gy, 0, 0.02));
  for (let i = 0; i < 5; i++) g.add(box(T, 0.045, 0.025, w * 0.6, kit.chrome, fx + 0.02, gy - h * 0.12 + i * h * 0.06, 0));
  g.add(rbox(T, 0.05, 0.08, 0.3, kit.chrome, fx + 0.03, gy + h * 0.2, 0, 0.02));
  // bumper with a number plate
  g.add(rbox(T, 0.2, 0.26, w * 1.02, kit.plastic, fx, y0 + 0.08, 0, 0.06));
  g.add(rbox(T, 0.02, 0.1, 0.42, kit.plate, fx + 0.11, y0 + 0.02, 0, 0.01));
  if (sleeper) {
    // sleeper behind the seats and an aerodynamic roof fairing
    g.add(rbox(T, len * 0.42, h * 0.5, w * 0.98, paint, -len * 0.3, y0 + h + h * 0.22, 0, 0.12));
    const fair = rbox(T, len * 0.62, h * 0.42, w * 0.96, paint, fx - len * 0.42, y0 + h + h * 0.18, 0, 0.14);
    fair.rotation.z = -0.22;
    g.add(fair);
  }
  return g;
}

export interface TruckLook {
  kind: "van" | "truck" | "semi" | "trailer";
  cargo: string;
  empty: boolean;
  spin?: number;
}

/** A panel van, lofted like the cars: low bonnet, steep screen, tall roof. */
function van(T: Three, kit: MaterialKit, L: number, W: number, H: number, cargo: string, empty: boolean) {
  const g = new T.Group();
  const R = 0.36;
  const x = (u: number) => L / 2 - u * L;
  const fa = 0.15;
  const ra = 0.8;
  const top = curve([
    [0, 0.85],
    [0.1, 1.12],
    [0.15, 1.2],
    [0.3, H - 0.08],
    [0.36, H],
    [0.98, H],
    [1, H - 0.08],
  ]);
  const archR = R + 0.07;
  const bottom = (u: number) => {
    let b = 0.3;
    for (const au of [fa, ra]) {
      const d = Math.abs(x(u) - x(au));
      if (d < archR) b = Math.max(b, R + Math.sqrt(archR * archR - d * d) * 0.9);
    }
    return b;
  };
  const N = 40;
  const secs: Section[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const end = Math.min(1, Math.min(u, 1 - u) / 0.02);
    const k = 0.8 + 0.2 * Math.sqrt(end);
    secs.push({ x: x(u), wb: (W / 2) * k, wt: (W / 2) * k * 0.9, bot: bottom(u), top: top(u), n: 4.6 });
  }
  // windscreen and cab windows are glass faces of the same shell
  const classify = (i: number, pz: number, side: number) => {
    const u = (i + 0.5) / N;
    if (u > 0.15 && u < 0.33 && pz > -0.05 && Math.abs(side) < 0.8) return 1;
    if (u > 0.2 && u < 0.36 && pz > 0.1 && pz < 0.75 && Math.abs(side) > 0.6) return 1;
    return 0;
  };
  g.add(...splitMeshes(T, loft(T, secs, 24, classify), [kit.paint("#eef1f5", "gloss"), kit.glass, kit.trim]));
  g.add(rbox(T, L * 0.16, 0.5, W * 0.84, kit.cabin, x(0.28), 1.25, 0, 0.05));
  for (const au of [fa, ra]) g.add(arch(T, kit, x(au), R, W * 0.88));
  for (const sd of [-1, 1]) {
    // company livery band, sliding door rail, mirror, lamps
    if (!empty) g.add(box(T, L * 0.5, 0.32, 0.01, kit.paint(cargo, "gloss"), x(0.66), 1.3, sd * (W / 2 - 0.005)));
    g.add(box(T, L * 0.3, 0.02, 0.012, kit.trim, x(0.5), 1.62, sd * (W / 2 - 0.004)));
    g.add(rbox(T, 0.06, 0.24, 0.12, kit.trim, x(0.2), 1.55, sd * (W / 2 + 0.14), 0.03));
    g.add(strut(T, new T.Vector3(x(0.2), 1.48, sd * (W / 2 - 0.03)), new T.Vector3(x(0.2), 1.48, sd * (W / 2 + 0.1)), 0.015, kit.trim));
    g.add(rbox(T, 0.05, 0.12, 0.34, kit.lens, x(0.005) - 0.01, 0.92, sd * W * 0.3, 0.03));
    g.add(rbox(T, 0.04, 0.4, 0.14, kit.tail, x(1) - 0.005, 0.95, sd * (W / 2 - 0.1), 0.02));
  }
  g.add(rbox(T, 0.04, 0.2, W * 0.5, kit.trim, x(0.003), 0.66, 0, 0.02));
  g.add(rbox(T, 0.16, 0.2, W * 1.0, kit.plastic, x(0) + 0.05, 0.42, 0, 0.06));
  g.add(rbox(T, 0.16, 0.2, W * 1.0, kit.plastic, x(1) - 0.05, 0.42, 0, 0.06));
  g.add(box(T, 0.012, H - 0.6, 0.012, kit.trim, x(1) - 0.002, H / 2 + 0.25, 0)); // rear door split
  for (const au of [fa, ra])
    for (const sd of [-1, 1]) {
      const wg = wheel(T, kit, R, 0.24, 6, false, 0, true, "silver");
      if (sd < 0) wg.rotation.y = Math.PI;
      wg.position.set(x(au), R, sd * (W / 2 - 0.16));
      g.add(wg);
    }
  return g;
}

/** Delivery trucks: van, rigid box truck, semi and road train. Origin under the centre, +X forward. */
export function buildTruck(T: Three, kit: MaterialKit, look: TruckLook): THREE_NS.Group {
  const g = new T.Group();
  const dims = { van: { L: 5.2, W: 2.0, H: 2.3 }, truck: { L: 7.5, W: 2.4, H: 3.0 }, semi: { L: 9.5, W: 2.5, H: 3.3 }, trailer: { L: 11, W: 2.5, H: 3.4 } }[look.kind];
  const { L, W, H } = dims;
  if (look.kind === "van") {
    g.add(van(T, kit, L, W, H, look.cargo, look.empty));
    g.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
    return g;
  }
  const R = 0.5;
  const tractor = look.kind !== "truck";
  const cabLen = 2.0;
  const cabH = 2.05;
  const c = cab(T, kit, tractor ? "#e9edf2" : "#f2f4f7", cabLen, cabH, W, tractor);
  c.position.x = L / 2 - cabLen / 2;
  g.add(c);
  const steel = kit.trim;
  // chassis rails
  for (const sd of [-1, 1]) g.add(box(T, L * 0.94, 0.22, 0.12, steel, 0, R + 0.1, sd * W * 0.3));
  // fuel tank and battery box behind the front wheels, an exhaust stack behind the cab
  const tx = L / 2 - cabLen - 0.45;
  const tank = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.9, 18), kit.alu);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(tx, 0.62, W / 2 - 0.32);
  g.add(tank);
  for (const bx of [tx - 0.3, tx + 0.3]) {
    const band = new T.Mesh(new T.TorusGeometry(0.305, 0.015, 6, 18), steel);
    band.rotation.y = Math.PI / 2;
    band.position.set(bx, 0.62, W / 2 - 0.32);
    g.add(band);
  }
  g.add(rbox(T, 0.7, 0.45, 0.5, steel, tx, 0.62, -(W / 2 - 0.3), 0.04));
  const stack = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, cabH + 0.7, 12), kit.chrome);
  stack.position.set(L / 2 - cabLen - 0.08, 0.55 + (cabH + 0.7) / 2, -(W / 2 - 0.2));
  g.add(stack);

  // the load: a rounded box body with corner posts and rear doors, or a flatbed
  const gap = tractor ? 0.45 : 0.15;
  const boxLen = L - cabLen - gap;
  const bx = -L / 2 + boxLen / 2;
  const floor = R * 2 + 0.25;
  const bodyH = H - floor + 0.3;
  if (!look.empty) {
    const cargoM = kit.paint(look.cargo, "gloss");
    g.add(rbox(T, boxLen, bodyH, W, cargoM, bx, floor + bodyH / 2, 0, 0.08));
    // white roof cap and bottom rail
    g.add(rbox(T, boxLen + 0.02, 0.12, W + 0.02, kit.white, bx, floor + bodyH - 0.05, 0, 0.05));
    g.add(rbox(T, boxLen + 0.02, 0.14, W + 0.03, steel, bx, floor + 0.04, 0, 0.03));
    // vertical posts along the sides, and the rear door frame with locking bars
    const posts = Math.max(4, Math.round(boxLen / 1.2));
    for (let i = 1; i < posts; i++) for (const sd of [-1, 1]) g.add(box(T, 0.05, bodyH - 0.2, 0.02, kit.alu, bx - boxLen / 2 + (i * boxLen) / posts, floor + bodyH / 2, sd * (W / 2 + 0.008)));
    g.add(rbox(T, 0.06, bodyH, W + 0.02, kit.alu, -L / 2 + 0.02, floor + bodyH / 2, 0, 0.03));
    g.add(box(T, 0.065, bodyH - 0.15, 0.025, steel, -L / 2 + 0.01, floor + bodyH / 2, 0));
    for (const z of [-W * 0.33, -W * 0.12, W * 0.12, W * 0.33]) g.add(strut(T, new T.Vector3(-L / 2 - 0.02, floor + 0.15, z), new T.Vector3(-L / 2 - 0.02, floor + bodyH - 0.15, z), 0.02, kit.chrome));
  } else {
    // flatbed: wooden deck, headboard and stake pockets
    g.add(rbox(T, boxLen, 0.14, W, kit.wood, bx, floor, 0, 0.03));
    g.add(rbox(T, 0.1, 1.0, W, steel, bx + boxLen / 2 - 0.05, floor + 0.55, 0, 0.03));
    for (let i = 0; i <= 5; i++) for (const sd of [-1, 1]) g.add(box(T, 0.08, 0.12, 0.06, steel, bx - boxLen / 2 + 0.2 + (i * (boxLen - 0.4)) / 5, floor - 0.05, sd * W / 2));
  }
  // semi-trailers: landing legs and an aero side skirt between the axles
  const axles: { x: number; dual: boolean }[] = [{ x: L / 2 - 1.1, dual: false }];
  if (tractor) {
    axles.push({ x: L / 2 - cabLen - 0.75, dual: true });
    const n = look.kind === "trailer" ? 3 : 2;
    for (let i = 0; i < n; i++) axles.push({ x: -L / 2 + 1.0 + i * 1.05, dual: false });
    const legX = L / 2 - cabLen - gap - 1.3;
    for (const sd of [-1, 1]) g.add(box(T, 0.1, floor - 0.1, 0.1, steel, legX, (floor - 0.1) / 2, sd * W * 0.32));
    if (!look.empty) {
      const s0 = legX - 0.3;
      const s1 = -L / 2 + 1.0 + n * 1.05 - 0.2;
      for (const sd of [-1, 1]) g.add(rbox(T, s0 - s1, floor - 0.45, 0.03, kit.plastic, (s0 + s1) / 2, (floor - 0.45) / 2 + 0.32, sd * (W / 2 - 0.03), 0.01));
    }
  } else axles.push({ x: -L / 2 + 1.6, dual: true });
  for (const ax of axles) {
    if (ax.x > L / 2 - cabLen) g.add(arch(T, kit, ax.x, R, W * 0.9));
    for (const sd of [-1, 1])
      for (const k of ax.dual ? [0, 1] : [0]) {
        const wg = wheel(T, kit, R, 0.3, 8, false, look.spin ?? 0, true, "silver");
        if (sd < 0) wg.rotation.y = Math.PI;
        wg.position.set(ax.x, R, sd * (W / 2 - 0.16 - k * 0.32));
        g.add(wg);
      }
  }
  // mud flaps, rear bumper bar and tail light clusters
  const lastX = Math.min(...axles.map((a) => a.x));
  for (const sd of [-1, 1]) {
    g.add(box(T, 0.03, 0.55, 0.55, kit.plastic, lastX - R - 0.15, 0.5, sd * (W / 2 - 0.3)));
    g.add(rbox(T, 0.05, 0.16, 0.42, kit.tail, -L / 2 - 0.03, 0.75, sd * (W / 2 - 0.3), 0.03));
    g.add(rbox(T, 0.05, 0.1, 0.16, kit.amber, -L / 2 - 0.03, 0.75, sd * (W / 2 - 0.62), 0.03));
  }
  g.add(rbox(T, 0.12, 0.12, W * 0.9, steel, -L / 2 + 0.05, 0.45, 0, 0.03));
  g.add(rbox(T, 0.02, 0.12, 0.42, kit.plate, -L / 2 - 0.02, 0.6, 0, 0.01));
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
  for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) g.add(rbox(T, 0.09, 1.75, 0.09, kit.paint("#f59e0b", "gloss"), dx - deckLen / 2 + (i * deckLen) / 4, 1.7, s * W / 2, 0.03));
  // guard rails along both decks, a fuel tank and the cab's front arch
  for (const y of [1.05, 2.75]) for (const s of [-1, 1]) g.add(rbox(T, deckLen, 0.06, 0.05, kit.alu, dx, y, s * W / 2, 0.02));
  const tank = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.8, 16), kit.alu);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(L / 2 - 2.6, 0.6, W / 2 - 0.3);
  g.add(tank, arch(T, kit, L / 2 - 1.1, 0.48, W * 0.9));
  const slots = [
    [dx + deckLen * 0.25, 0.9],
    [dx - deckLen * 0.25, 0.9],
    [dx + deckLen * 0.2, 2.6],
    [dx - deckLen * 0.25, 2.6],
  ];
  cars.slice(0, 4).forEach((look, i) => {
    const m = buildCar(T, look);
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
