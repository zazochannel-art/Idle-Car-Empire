// 3D models for the factory interiors: production stations built around the
// line, people at work, forklifts, robot carts and the parts on the belt.
// Units are tiles (x along the line, z across it, y up); one map pixel of
// height is 1/39 tile. A station's origin is the point on the belt where a
// unit stops, so the line runs straight through it along x.
import type * as THREE_NS from "three";
import type { MaterialKit } from "./car-models";
import { buildRobot } from "./industrial-models";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type Three = typeof THREE_NS;
type Mat = THREE_NS.Material;

const H = 1 / 39;

export type StationModel = "sheetRack" | "laserCutter" | "press" | "welder" | "bodyJig" | "qcTunnel" | "bodyRack";
export type WorkerRole = "worker" | "welder" | "inspector" | "driver" | "supervisor" | "manager";
export type PartKind = "coil" | "blank" | "panel" | "frame";

function std(T: Three, color: string, metal = 0.3, rough = 0.5) {
  return new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
}

/** A box with softly rounded edges (machined castings, not cubes); thin parts stay sharp. */
function box(T: Three, m: Mat, x: number, y: number, z: number, w: number, h: number, d: number) {
  const r = Math.min(0.03, Math.min(w, h, d) * 0.18);
  const geo = r > 0.006 ? new RoundedBoxGeometry(w, h, d, 2, r) : new T.BoxGeometry(w, h, d);
  const b = new T.Mesh(geo, m);
  b.position.set(x + w / 2, y + h / 2, z + d / 2);
  return b;
}

function cyl(T: Three, m: Mat, x: number, y: number, z: number, r: number, h: number, seg = 14) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m);
  c.position.set(x, y + h / 2, z);
  return c;
}

/** A lying cylinder along x (a steel coil, a roller). */
function roll(T: Three, m: Mat, x: number, y: number, z: number, r: number, len: number, alongZ = false) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r, len, 20), m);
  c.rotation.z = alongZ ? 0 : Math.PI / 2;
  if (alongZ) c.rotation.x = Math.PI / 2;
  c.position.set(x, y + r, z);
  return c;
}

/** Safety fence panels along a rectangle's back and sides (open toward the camera). */
function fence(T: Three, x0: number, x1: number, z0: number, z1: number, h: number, sides: ("back" | "left" | "right" | "front")[]) {
  const g = new T.Group();
  const post = std(T, "#f5b301", 0.3, 0.45);
  const mesh = new T.MeshStandardMaterial({ color: "#3b4250", metalness: 0.6, roughness: 0.45, transparent: true, opacity: 0.5 });
  const run = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.5));
    for (let i = 0; i <= n; i++) g.add(box(T, post, ax + ((bx - ax) * i) / n - 0.015, 0, az + ((bz - az) * i) / n - 0.015, 0.03, h, 0.03));
    const p = new T.Mesh(new T.BoxGeometry(Math.max(0.01, Math.abs(bx - ax)), h * 0.8, Math.max(0.01, Math.abs(bz - az))), mesh);
    p.position.set((ax + bx) / 2, h * 0.45, (az + bz) / 2);
    g.add(p);
  };
  if (sides.includes("back")) run(x0, z0, x1, z0);
  if (sides.includes("left")) run(x0, z0, x0, z1);
  if (sides.includes("right")) run(x1, z0, x1, z1);
  if (sides.includes("front")) run(x0, z1, x1, z1);
  return g;
}

/** A control cabinet with a screen and a status light. */
function cabinet(T: Three, kit: MaterialKit, x: number, z: number, light: string) {
  const g = new T.Group();
  g.add(box(T, std(T, "#d5dae1", 0.3, 0.4), x, 0, z, 0.22, 9 * H, 0.14));
  g.add(box(T, kit.glass, x + 0.03, 4 * H, z + 0.071, 0.14, 3 * H, 0.004));
  const lamp = new T.MeshStandardMaterial({ color: light, emissive: light, emissiveIntensity: 1.2 });
  g.add(cyl(T, lamp, x + 0.11, 9 * H, z + 0.07, 0.018, 3 * H, 8));
  return g;
}

/** Roller conveyor section (part of a station, under the stopping point). */
function rollers(T: Three, x0: number, x1: number, y: number) {
  const g = new T.Group();
  const frame = std(T, "#5b6470", 0.6, 0.4);
  const r = std(T, "#a5adb8", 0.9, 0.25);
  g.add(box(T, frame, x0, 0, -0.32, x1 - x0, y, 0.05));
  g.add(box(T, frame, x0, 0, 0.27, x1 - x0, y, 0.05));
  for (let x = x0 + 0.06; x < x1; x += 0.12) g.add(roll(T, r, x, y - 0.03, 0, 0.025, 0.56, true));
  return g;
}

/**
 * One station of the line. `pose` animates the moving parts (press ram,
 * laser head, clamps); `part` picks what stands behind the belt ("back") or
 * in front of it ("front"), so the unit on the belt can pass through.
 */
export function buildStation(T: Three, kit: MaterialKit, model: StationModel, pose: number, accent: string, robots: boolean, part: "back" | "front"): THREE_NS.Group {
  const all = new T.Group();
  const steel = std(T, "#8f98a3", 0.75, 0.3);
  const grey = std(T, "#4b5563", 0.4, 0.5);
  const dark = std(T, "#1f2630", 0.3, 0.6);
  const yellow = std(T, "#f5b301", 0.3, 0.45);
  const acc = std(T, accent, 0.35, 0.4);
  const white = std(T, "#e7ebf0", 0.2, 0.5);
  switch (model) {
    case "sheetRack": {
      // pallet racking with steel coils and stacks of sheet
      const up = std(T, "#ea580c", 0.4, 0.45);
      const beam = std(T, "#1d4ed8", 0.4, 0.45);
      for (const x of [-1.3, -0.45, 0.4, 1.25]) for (const z of [-0.9, -0.45]) all.add(box(T, up, x, 0, z, 0.05, 38 * H, 0.05));
      for (const y of [12 * H, 25 * H, 38 * H]) for (const z of [-0.9, -0.45]) all.add(box(T, beam, -1.3, y, z, 2.6, 1.2 * H, 0.05));
      for (let i = 0; i < 3; i++)
        for (let lv = 0; lv < 3; lv++) {
          const x = -1.05 + i * 0.85;
          if ((i + lv) % 3 === 2) for (let k = 0; k < 4; k++) all.add(box(T, steel, x - 0.25, lv * 13 * H + 1.2 * H + k * 0.8 * H, -0.85, 0.55, 0.7 * H, 0.38));
          else all.add(roll(T, steel, x + 0.02, lv * 13 * H + 1.2 * H, -0.67, 0.13, 0.32, true));
        }
      // the feed table in front, where the line starts
      all.add(rollers(T, -0.6, 0.6, 5 * H));
      all.add(box(T, yellow, -1.4, 0, 0.55, 2.8, 0.2 * H, 0.05));
      break;
    }
    case "laserCutter": {
      // an enclosed laser bed; the bridge sweeps along it
      all.add(box(T, std(T, "#d6dbe1", 0.3, 0.4), -1.2, 0, -0.45, 2.4, 6 * H, 0.9));
      all.add(box(T, dark, -1.15, 6 * H, -0.4, 2.3, 0.4 * H, 0.8));
      const bx = -0.9 + [0, 0.6, 1.2, 0.6][pose % 4];
      for (const z of [-0.5, 0.48]) all.add(box(T, acc, -1.25, 6 * H, z, 2.5, 2 * H, 0.05));
      all.add(box(T, acc, bx - 0.08, 8 * H, -0.5, 0.16, 3 * H, 1.03));
      all.add(box(T, dark, bx - 0.05, 4 * H, -0.05, 0.1, 6 * H, 0.1));
      const beamM = new T.MeshStandardMaterial({ color: "#ff5f2e", emissive: "#ff3d00", emissiveIntensity: 2 });
      all.add(cyl(T, beamM, bx, 6.4 * H, 0, 0.008, 2 * H, 6));
      // glass enclosure on the back and the sides
      const glass = new T.MeshStandardMaterial({ color: "#9ec5e6", metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.35 });
      const gw = new T.Mesh(new T.BoxGeometry(2.5, 14 * H, 0.02), glass);
      gw.position.set(0, 7 * H + 6 * H, -0.55);
      all.add(gw);
      all.add(cabinet(T, kit, -1.55, -0.3, "#22c55e"));
      if (robots) {
        const r = buildRobot(T, kit, pose, accent, "suction");
        r.scale.setScalar(1.5);
        r.position.set(1.45, 0, -0.55);
        all.add(r);
      }
      break;
    }
    case "press": {
      // a tandem line of two big presses straddling the belt
      const stroke = [0, 4, 8][pose % 3] * H;
      for (const px of [-0.7, 0.7]) {
        all.add(box(T, acc, px - 0.5, 0, -0.55, 1.0, 5 * H, 1.1));
        for (const z of [-0.5, 0.42]) for (const s of [-1, 1]) all.add(box(T, acc, px + s * 0.4 - 0.08, 5 * H, z, 0.16, 34 * H, 0.08));
        all.add(box(T, acc, px - 0.55, 39 * H, -0.55, 1.1, 9 * H, 1.1));
        all.add(box(T, steel, px - 0.35, 28 * H - stroke, -0.35, 0.7, 6 * H, 0.7));
        for (const s of [-1, 1]) all.add(cyl(T, steel, px + s * 0.18, 34 * H - stroke, 0, 0.045, 5 * H + stroke, 10));
        all.add(box(T, dark, px - 0.4, 48 * H, -0.3, 0.8, 3 * H, 0.6));
      }
      all.add(cabinet(T, kit, 1.35, -0.62, "#22c55e"));
      if (robots) {
        // transfer robots between the presses
        const r = buildRobot(T, kit, pose + 1, "#f59e0b", "suction");
        r.scale.setScalar(1.4);
        r.position.set(0, 0, -0.55);
        all.add(r);
      }
      all.add(fence(T, -1.45, 1.45, -0.75, 0.75, 9 * H, ["back"]));
      break;
    }
    case "welder": {
      // the framing fixture in the middle of a fenced cell
      all.add(box(T, std(T, "#5b6470", 0.5, 0.45), -0.9, 0, -0.42, 1.8, 3 * H, 0.84));
      for (const s of [-1, 1]) for (const z of [-0.36, 0.3]) all.add(box(T, grey, s * 0.75 - 0.04, 3 * H, z, 0.08, 7 * H, 0.06));
      all.add(fence(T, -1.45, 1.45, -0.85, 0.85, 12 * H, robots ? ["back", "left", "right"] : ["back"]));
      if (!robots) {
        // hanging spot-weld guns on balancers
        for (const x of [-0.5, 0.5]) {
          all.add(box(T, grey, x - 0.02, 3 * H, -0.65, 0.04, 30 * H, 0.04));
          all.add(box(T, grey, x - 0.02, 33 * H, -0.65, 0.04, 1 * H, 0.5));
          all.add(cyl(T, dark, x, 18 * H, -0.2, 0.006, 15 * H, 4));
          all.add(box(T, std(T, "#b91c1c", 0.4, 0.4), x - 0.05, 15 * H, -0.25, 0.1, 3 * H, 0.08));
        }
      }
      all.add(cabinet(T, kit, 1.25, -0.7, robots ? "#38bdf8" : "#22c55e"));
      break;
    }
    case "bodyJig": {
      // a framing gantry: posts, a bridge and clamp arms that close on the body
      const close = [0.1, 0][pose % 2];
      for (const x of [-0.9, 0.9]) for (const z of [-0.55, 0.5]) all.add(box(T, acc, x - 0.06, 0, z, 0.12, 32 * H, 0.08));
      for (const z of [-0.55, 0.5]) all.add(box(T, acc, -0.95, 32 * H, z, 1.9, 3 * H, 0.08));
      all.add(box(T, acc, -0.95, 32 * H, -0.55, 0.08, 3 * H, 1.13));
      all.add(box(T, acc, 0.87, 32 * H, -0.55, 0.08, 3 * H, 1.13));
      for (const x of [-0.5, 0, 0.5]) {
        all.add(box(T, dark, x - 0.03, 14 * H, -0.42 - close, 0.06, 16 * H, 0.05));
        all.add(box(T, dark, x - 0.03, 14 * H, 0.36 + close, 0.06, 16 * H, 0.05));
      }
      // side-panel racks beside the gantry
      all.add(box(T, grey, -1.4, 0, -0.75, 0.35, 16 * H, 0.08));
      for (let i = 0; i < 3; i++) all.add(box(T, std(T, "#aab3bf", 0.7, 0.35), -1.38 + i * 0.1, 2 * H, -0.68, 0.02, 12 * H, 0.32));
      all.add(rollers(T, -0.7, 0.7, 4 * H));
      if (robots)
        for (const s of [-1, 1]) {
          const r = buildRobot(T, kit, pose + (s > 0 ? 2 : 0), "#f59e0b", "torch");
          r.scale.setScalar(1.3);
          r.position.set(s * 1.25, 0, -0.65);
          all.add(r);
        }
      break;
    }
    case "qcTunnel": {
      // a light tunnel the bodies pass through, and an inspection desk
      const lamp = kit.led;
      const frameM = std(T, "#2b3441", 0.4, 0.4);
      for (const z of [-0.6, 0.55]) {
        all.add(box(T, frameM, -0.8, 0, z, 1.6, 30 * H, 0.06));
        for (let i = 0; i < 5; i++) all.add(box(T, lamp, -0.7, 5 * H + i * 5 * H, z + (z < 0 ? 0.06 : -0.01), 1.4, 1 * H, 0.01));
      }
      all.add(box(T, frameM, -0.8, 30 * H, -0.6, 1.6, 2.5 * H, 1.21));
      for (let i = 0; i < 4; i++) all.add(box(T, lamp, -0.7, 29.5 * H, -0.45 + i * 0.3, 1.4, 0.6 * H, 0.05));
      // desk with screens behind the tunnel
      all.add(box(T, white, 1.0, 0, -0.75, 0.45, 5 * H, 0.3));
      for (let i = 0; i < 2; i++) all.add(box(T, kit.glass, 1.02 + i * 0.21, 5 * H, -0.72, 0.18, 4 * H, 0.02));
      all.add(rollers(T, -0.8, 0.8, 4 * H));
      break;
    }
    case "bodyRack": {
      // two-level racks for finished bodies, ready for the trucks
      const up = std(T, "#ea580c", 0.4, 0.45);
      const beam = std(T, "#1d4ed8", 0.4, 0.45);
      for (const x of [-1.45, 0, 1.45]) for (const z of [-0.95, -0.25]) all.add(box(T, up, x - 0.03, 0, z, 0.06, 40 * H, 0.06));
      for (const y of [18 * H, 38 * H]) for (const z of [-0.95, -0.25]) all.add(box(T, beam, -1.45, y, z, 2.9, 1.5 * H, 0.06));
      all.add(rollers(T, -0.6, 0.6, 5 * H));
      all.add(box(T, yellow, -1.5, 0, 0.55, 3, 0.2 * H, 0.05));
      break;
    }
  }
  // keep only what stands behind (or in front of) the belt
  const out = new T.Group();
  for (const c of [...all.children]) {
    const b = new T.Box3().setFromObject(c);
    const zc = (b.min.z + b.max.z) / 2;
    if ((part === "back") === zc < 0.05) out.add(c);
  }
  out.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return out;
}

/** A person at work: hard hat, hi-vis vest (or the outfit of the job). `pose` 0…3 swings the arms. */
export function buildWorker(T: Three, role: WorkerRole, pose: number, tone = 0): THREE_NS.Group {
  const g = new T.Group();
  const skin = std(T, ["#e0b48f", "#a0704c", "#f1c9a5", "#7a4f32"][tone & 3], 0, 0.8);
  const outfit: Record<WorkerRole, [string, string, string]> = {
    // trousers, top, helmet
    worker: ["#2f3a4a", "#f97316", "#facc15"],
    welder: ["#374151", "#1f2937", "#111827"],
    inspector: ["#e5e7eb", "#f8fafc", "#f8fafc"],
    driver: ["#2f3a4a", "#facc15", "#f97316"],
    supervisor: ["#1e3a5f", "#2563eb", "#f8fafc"],
    manager: ["#1f2937", "#111827", "none"],
  };
  const [legs, top, hat] = outfit[role];
  const legM = std(T, legs, 0.05, 0.8);
  const topM = std(T, top, 0.05, 0.7);
  const step = [0.05, 0, -0.05, 0][pose & 3];
  const s = 0.13; // ~1.8 m is 0.22 tiles; a little taller so people read on a phone
  for (const side of [-1, 1]) {
    const leg = box(T, legM, -0.12 + side * step - 0.06, 0, side * 0.1 - 0.06, 0.12, 0.85, 0.12);
    g.add(leg);
  }
  g.add(box(T, topM, -0.16, 0.85, -0.2, 0.32, 0.75, 0.4));
  if (role === "worker" || role === "driver") {
    // reflective stripes on the vest
    const refl = new T.MeshStandardMaterial({ color: "#e5e7eb", emissive: "#9ca3af", emissiveIntensity: 0.3 });
    g.add(box(T, refl, -0.165, 1.2, -0.205, 0.33, 0.05, 0.41));
  }
  if (role === "manager") g.add(box(T, std(T, "#e5e7eb"), -0.04, 1.35, 0.1, 0.08, 0.25, 0.01)); // shirt and tie
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(0, 1.5, side * 0.27);
    arm.rotation.z = (side > 0 ? 1 : -1) * [0.4, 0.9, 0.4, -0.2][pose & 3] * (role === "manager" ? 0.3 : 1);
    arm.add(box(T, topM, -0.05, -0.65, -0.05, 0.1, 0.65, 0.1));
    arm.add(box(T, skin, -0.05, -0.8, -0.05, 0.1, 0.15, 0.1));
    g.add(arm);
  }
  const head = new T.Mesh(new T.SphereGeometry(0.15, 14, 10), skin);
  head.position.set(0, 1.78, 0);
  g.add(head);
  if (hat !== "none") {
    const helm = new T.Mesh(new T.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(T, hat, 0.2, 0.4));
    helm.position.set(0, 1.82, 0);
    g.add(helm);
    g.add(cyl(T, std(T, hat, 0.2, 0.4), 0, 1.82, 0, 0.21, 0.02, 14));
  }
  if (role === "welder") g.add(box(T, std(T, "#0f172a", 0.3, 0.3), 0.08, 1.62, -0.14, 0.1, 0.3, 0.28)); // welding mask
  if (role === "supervisor" || role === "inspector") g.add(box(T, std(T, "#a16207"), 0.15, 1.15, 0.25, 0.04, 0.3, 0.22)); // clipboard / tablet
  g.scale.setScalar(s);
  const root = new T.Group();
  root.add(g);
  root.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return root;
}

/** A forklift (yaw in quarter turns), carrying a pallet when `loaded`. */
export function buildForklift(T: Three, kit: MaterialKit, yaw: number, loaded: boolean, cargo: string): THREE_NS.Group {
  const g = new T.Group();
  const body = std(T, "#f59e0b", 0.3, 0.4);
  const dark = std(T, "#1f2630", 0.3, 0.6);
  g.add(box(T, body, -0.2, 0.04, -0.11, 0.32, 0.1, 0.22));
  g.add(box(T, dark, -0.22, 0.04, -0.11, 0.06, 0.13, 0.22)); // counterweight
  for (const x of [-0.12, 0.06]) for (const z of [-0.12, 0.12]) {
    const w = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.04, 12), kit.tyre);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.045, z);
    g.add(w);
  }
  // overhead guard and the driver
  for (const x of [-0.16, 0.04]) for (const z of [-0.09, 0.09]) g.add(box(T, dark, x, 0.14, z, 0.015, 0.16, 0.015));
  g.add(box(T, dark, -0.17, 0.3, -0.1, 0.23, 0.01, 0.2));
  const drv = buildWorker(T, "driver", 0);
  drv.scale.setScalar(0.55);
  drv.position.set(-0.06, 0.08, 0);
  g.add(drv);
  // mast and forks
  g.add(box(T, dark, 0.12, 0.02, -0.08, 0.03, 0.34, 0.03));
  g.add(box(T, dark, 0.12, 0.02, 0.05, 0.03, 0.34, 0.03));
  const lift = loaded ? 0.06 : 0.02;
  g.add(box(T, std(T, "#94a3b8", 0.8, 0.3), 0.15, lift, -0.07, 0.2, 0.012, 0.03));
  g.add(box(T, std(T, "#94a3b8", 0.8, 0.3), 0.15, lift, 0.04, 0.2, 0.012, 0.03));
  if (loaded) {
    g.add(box(T, std(T, "#a16207", 0, 0.8), 0.15, lift + 0.012, -0.1, 0.22, 0.02, 0.2));
    g.add(box(T, std(T, cargo, 0.6, 0.35), 0.16, lift + 0.032, -0.09, 0.2, 0.09, 0.18));
  }
  g.rotation.y = (-yaw * Math.PI) / 2;
  const root = new T.Group();
  root.add(g);
  root.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return root;
}

/** An autonomous robot cart (AGV) with a status light and a load deck. */
export function buildAGV(T: Three, yaw: number, loaded: boolean, cargo: string): THREE_NS.Group {
  const g = new T.Group();
  g.add(box(T, std(T, "#e5e7eb", 0.3, 0.4), -0.2, 0.01, -0.13, 0.4, 0.06, 0.26));
  g.add(box(T, std(T, "#f97316", 0.3, 0.4), -0.2, 0.07, -0.13, 0.4, 0.008, 0.26));
  const led = new T.MeshStandardMaterial({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 1.5 });
  g.add(box(T, led, 0.19, 0.03, -0.1, 0.012, 0.012, 0.2));
  g.add(cyl(T, std(T, "#111827"), 0.15, 0.078, 0, 0.025, 0.03, 10)); // lidar
  if (loaded) g.add(box(T, std(T, cargo, 0.6, 0.35), -0.15, 0.08, -0.1, 0.26, 0.1, 0.2));
  g.rotation.y = (-yaw * Math.PI) / 2;
  const root = new T.Group();
  root.add(g);
  root.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return root;
}

/** What rides the belt before it is a car body: a steel coil, a cut blank, a pressed panel, a welded underbody. */
export function buildPart(T: Three, kind: PartKind): THREE_NS.Group {
  const g = new T.Group();
  const steel = std(T, "#aeb6c1", 0.85, 0.3);
  const bright = std(T, "#cfd6de", 0.9, 0.2);
  switch (kind) {
    case "coil":
      g.add(roll(T, steel, 0, 0.015, 0, 0.13, 0.3, true));
      break;
    case "blank":
      for (let i = 0; i < 3; i++) g.add(box(T, bright, -0.28, 0.02 + i * 0.012, -0.18, 0.56, 0.008, 0.36));
      break;
    case "panel": {
      // a pressed door skin: a shallow curved shell
      const shape = new T.Shape();
      shape.moveTo(-0.28, 0);
      shape.quadraticCurveTo(0, 0.07, 0.28, 0);
      shape.lineTo(0.28, 0.012);
      shape.quadraticCurveTo(0, 0.082, -0.28, 0.012);
      shape.closePath();
      const m = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: false }), bright);
      m.position.set(0, 0.02, -0.17);
      g.add(m);
      g.add(box(T, std(T, "#374151"), -0.1, 0.03, -0.06, 0.2, 0.05, 0.12)); // window opening
      break;
    }
    case "frame": {
      // a welded underbody: rails, cross-members and floor
      for (const z of [-0.14, 0.12]) g.add(box(T, steel, -0.3, 0.02, z, 0.6, 0.04, 0.03));
      for (const x of [-0.25, -0.05, 0.15, 0.27]) g.add(box(T, steel, x, 0.02, -0.14, 0.03, 0.035, 0.29));
      g.add(box(T, bright, -0.22, 0.05, -0.12, 0.42, 0.01, 0.24));
      for (const x of [-0.18, 0.12]) for (const z of [-0.14, 0.12]) g.add(box(T, steel, x, 0.06, z, 0.03, 0.08, 0.03)); // pillar stubs
      break;
    }
  }
  g.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return g;
}

export type PropKind = "sheetPallet" | "partsCage" | "dieBlock" | "toolCabinet" | "binRack";

/** Floor clutter that makes a hall look worked in: pallets, cages, dies, cabinets, bins. Origin: floor centre. */
export function buildProp(T: Three, kind: PropKind, accent: string): THREE_NS.Group {
  const g = new T.Group();
  const wood = std(T, "#a16207", 0, 0.8);
  const steel = std(T, "#aeb6c1", 0.85, 0.3);
  switch (kind) {
    case "sheetPallet":
      g.add(box(T, wood, -0.3, 0, -0.22, 0.6, 2 * H, 0.44));
      for (let i = 0; i < 6; i++) g.add(box(T, steel, -0.28, 2 * H + i * 0.9 * H, -0.2, 0.56, 0.7 * H, 0.4));
      break;
    case "partsCage": {
      const frame = std(T, "#64748b", 0.6, 0.4);
      const mesh = new T.MeshStandardMaterial({ color: "#475569", metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.45 });
      g.add(box(T, frame, -0.26, 0, -0.22, 0.52, 1.5 * H, 0.44));
      const walls = new T.Mesh(new T.BoxGeometry(0.5, 13 * H, 0.42), mesh);
      walls.position.set(0, 1.5 * H + 6.5 * H, 0);
      g.add(walls);
      for (let i = 0; i < 4; i++) g.add(box(T, std(T, "#c5ccd5", 0.85, 0.3), -0.2 + i * 0.1, 2 * H, -0.18, 0.025, 10 * H, 0.36)); // panels inside
      break;
    }
    case "dieBlock":
      // a press die waiting for a changeover
      g.add(box(T, std(T, "#3f4752", 0.7, 0.4), -0.32, 0, -0.26, 0.64, 7 * H, 0.52));
      g.add(box(T, std(T, accent, 0.4, 0.4), -0.32, 7 * H, -0.26, 0.64, 1.5 * H, 0.52));
      g.add(box(T, std(T, "#9aa3ad", 0.85, 0.25), -0.2, 8.5 * H, -0.15, 0.4, 2 * H, 0.3));
      break;
    case "toolCabinet":
      g.add(box(T, std(T, "#dc2626", 0.4, 0.4), -0.22, 0, -0.14, 0.44, 11 * H, 0.28));
      for (let i = 0; i < 4; i++) g.add(box(T, std(T, "#991b1b", 0.4, 0.4), -0.2, 1.5 * H + i * 2.4 * H, 0.13, 0.4, 0.3 * H, 0.02));
      g.add(box(T, std(T, "#e5e7eb", 0.3, 0.4), -0.24, 11 * H, -0.16, 0.48, 0.6 * H, 0.32));
      break;
    case "binRack": {
      const frame = std(T, "#1d4ed8", 0.4, 0.45);
      g.add(box(T, frame, -0.3, 0, -0.12, 0.04, 16 * H, 0.24));
      g.add(box(T, frame, 0.26, 0, -0.12, 0.04, 16 * H, 0.24));
      const cols = ["#2563eb", "#f59e0b", "#16a34a"];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.add(box(T, std(T, cols[(r + c) % 3], 0.1, 0.6), -0.26 + c * 0.17, 1 * H + r * 5 * H, -0.1, 0.15, 3 * H, 0.2));
      break;
    }
  }
  g.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}
