// Procedural industrial equipment for the factory floors: articulated robots,
// presses, hoists, lifts, booths, furnaces and tunnels. Units are tiles
// (1 = one map tile, ~8 m); +X runs along the production line, +Y is up.
import type * as THREE_NS from "three";
import type { MaterialKit } from "./car-models";

/** Frame `pose` of an animation cycle; any number (negative, fractional) is safe. */
export const cycle = <V>(frames: readonly V[], pose: number): V => frames[(((Math.floor(pose) || 0) % frames.length) + frames.length) % frames.length];

type Three = typeof THREE_NS;

export type MachineKind =
  | "coils"
  | "press"
  | "welder"
  | "hoist"
  | "lift"
  | "seatRobot"
  | "glassRobot"
  | "wheelRobot"
  | "paintBooth"
  | "gantry"
  | "qcTunnel"
  | "furnace"
  | "mixer"
  | "cnc"
  | "packer";

/** The machine at each step of each plant's process. */
export const STATION_MACHINES: Record<string, MachineKind[]> = {
  bodyWorks: ["coils", "press", "welder", "qcTunnel", "packer"],
  engineFactory: ["furnace", "furnace", "cnc", "welder", "packer"],
  interiorFactory: ["coils", "cnc", "seatRobot", "seatRobot", "packer"],
  glassFactory: ["mixer", "furnace", "press", "furnace", "glassRobot"],
  tireFactory: ["coils", "mixer", "press", "furnace", "packer"],
  suspensionFactory: ["coils", "cnc", "press", "welder", "packer"],
  transmissionFactory: ["coils", "cnc", "furnace", "welder", "packer"],
  wheelFactory: ["furnace", "cnc", "press", "mixer", "packer"],
  brakeFactory: ["furnace", "cnc", "press", "welder", "packer"],
  paintFactory: ["mixer", "mixer", "mixer", "packer", "packer"],
  electronicsFactory: ["coils", "cnc", "welder", "qcTunnel", "packer"],
  batteryFactory: ["mixer", "cnc", "welder", "gantry", "packer"],
  assemblyPlant: ["welder", "hoist", "lift", "seatRobot", "glassRobot", "wheelRobot", "paintBooth", "gantry", "qcTunnel"],
};

const H = 1 / 39; // one map pixel of height, in tiles (≈ 0.2 m)

function mat(T: Three, kit: MaterialKit, color: string, metal = 0.3, rough = 0.45) {
  void kit;
  return new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
}

function boxAt(T: Three, m: THREE_NS.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const b = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  b.position.set(x, y + h / 2, z);
  return b;
}

function cylAt(T: Three, m: THREE_NS.Material, r: number, h: number, x: number, y: number, z: number, seg = 16) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m);
  c.position.set(x, y + h / 2, z);
  return c;
}

/**
 * A six-axis industrial robot. `pose` 0…3 moves the arm through a work
 * cycle; `tool` is what it holds.
 */
export function buildRobot(T: Three, kit: MaterialKit, pose: number, color = "#f59e0b", tool: "torch" | "gripper" | "suction" | "spray" = "torch") {
  const g = new T.Group();
  const paint = mat(T, kit, color, 0.35, 0.35);
  const dark = mat(T, kit, "#2b2f36", 0.5, 0.5);
  const a = cycle([0, 0.7, 1.4, 0.7], pose);
  const lift = cycle([0.35, 0.15, 0.4, 0.6], pose);
  g.add(cylAt(T, dark, 0.09, 4 * H, 0, 0, 0));
  const turret = new T.Group();
  turret.position.y = 4 * H;
  turret.rotation.y = a;
  turret.add(cylAt(T, paint, 0.07, 4 * H, 0, 0, 0));
  // lower arm
  const shoulder = new T.Group();
  shoulder.position.y = 7 * H;
  shoulder.rotation.z = -lift;
  const lower = boxAt(T, paint, 0.045, 13 * H, 0.05, 0, 0, 0);
  shoulder.add(lower);
  // upper arm
  const elbow = new T.Group();
  elbow.position.y = 13 * H;
  elbow.rotation.z = 1.2 + lift * 0.8;
  elbow.add(cylAt(T, dark, 0.035, 0.06, 0, -0.03, 0, 10));
  const upper = boxAt(T, paint, 0.035, 11 * H, 0.04, 0, 0, 0);
  elbow.add(upper);
  // wrist and tool
  const wrist = new T.Group();
  wrist.position.y = 11 * H;
  wrist.rotation.z = 0.6;
  wrist.add(cylAt(T, dark, 0.02, 3 * H, 0, 0, 0, 8));
  if (tool === "torch") wrist.add(cylAt(T, mat(T, kit, "#d1d5db", 0.9, 0.2), 0.008, 4 * H, 0, 3 * H, 0, 6));
  if (tool === "gripper") {
    wrist.add(boxAt(T, dark, 0.008, 3 * H, 0.04, -0.012, 3 * H, 0));
    wrist.add(boxAt(T, dark, 0.008, 3 * H, 0.04, 0.012, 3 * H, 0));
  }
  if (tool === "suction") wrist.add(boxAt(T, dark, 0.08, 0.6 * H, 0.08, 0, 3 * H, 0));
  if (tool === "spray") wrist.add(cylAt(T, mat(T, kit, "#e5e7eb", 0.6, 0.3), 0.015, 3 * H, 0, 3 * H, 0, 8));
  elbow.add(wrist);
  shoulder.add(elbow);
  turret.add(shoulder);
  g.add(turret);
  return g;
}

/** One piece of factory equipment, sitting behind or over the line. Origin: floor under its centre. */
export function buildMachine(T: Three, kit: MaterialKit, kind: MachineKind, pose: number, accent: string): THREE_NS.Group {
  const g = new T.Group();
  const steel = mat(T, kit, "#8b939e", 0.75, 0.35);
  const grey = mat(T, kit, "#4b5563", 0.4, 0.5);
  const dark = mat(T, kit, "#1f2937", 0.3, 0.6);
  const yellow = mat(T, kit, "#f5b301", 0.3, 0.45);
  const accentM = mat(T, kit, accent, 0.3, 0.4);
  const glass = kit.glass;
  const stroke = cycle([0, 3, 6, 3], pose) * H;
  // a safety-yellow plinth under every machine
  g.add(boxAt(T, yellow, 0.86, 0.6 * H, 0.7, 0, 0, 0));
  switch (kind) {
    case "coils":
      for (let i = 0; i < 3; i++) {
        const c = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.16, 20), steel);
        c.rotation.x = Math.PI / 2;
        c.position.set(-0.25 + i * 0.25, 0.13 + 0.6 * H, 0);
        g.add(c);
        const hole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.17, 12), dark);
        hole.rotation.x = Math.PI / 2;
        hole.position.copy(c.position);
        g.add(hole);
      }
      break;
    case "press": {
      // C-frame hydraulic press with a moving ram
      g.add(boxAt(T, accentM, 0.7, 4 * H, 0.5, 0, 0, 0));
      for (const s of [-1, 1]) g.add(boxAt(T, accentM, 0.12, 22 * H, 0.45, s * 0.3, 4 * H, 0));
      g.add(boxAt(T, accentM, 0.72, 5 * H, 0.5, 0, 26 * H, 0));
      g.add(cylAt(T, steel, 0.06, 6 * H, 0, 20 * H - stroke, 0));
      g.add(boxAt(T, grey, 0.45, 3 * H, 0.38, 0, 17 * H - stroke, 0));
      g.add(boxAt(T, grey, 0.5, 1.5 * H, 0.4, 0, 4 * H, 0));
      // hydraulic lines
      for (const s of [-1, 1]) g.add(cylAt(T, dark, 0.012, 22 * H, s * 0.37, 4 * H, 0.18, 6));
      break;
    }
    case "welder":
      for (const s of [-1, 1]) {
        const r = buildRobot(T, kit, pose + (s > 0 ? 2 : 0), accent, "torch");
        r.position.set(s * 0.28, 0.6 * H, -0.12);
        g.add(r);
      }
      break;
    case "seatRobot":
    case "glassRobot":
    case "wheelRobot": {
      const tool = kind === "glassRobot" ? "suction" : "gripper";
      const r = buildRobot(T, kit, pose, accent, tool);
      r.position.set(0, 0.6 * H, -0.1);
      g.add(r);
      // supply rack beside the robot
      const rack = new T.Group();
      rack.add(boxAt(T, grey, 0.3, 10 * H, 0.04, 0, 0, 0.25));
      if (kind === "wheelRobot")
        for (let i = 0; i < 3; i++) {
          const t = new T.Mesh(new T.TorusGeometry(0.06, 0.03, 8, 16), kit.tyre);
          t.position.set(-0.3, 0.1 + i * 0.09, 0.2);
          rack.add(t);
        }
      if (kind === "seatRobot")
        for (let i = 0; i < 2; i++) {
          rack.add(boxAt(T, kit.seat, 0.12, 2 * H, 0.12, -0.32, i * 5 * H, 0.18));
          rack.add(boxAt(T, kit.seat, 0.03, 5 * H, 0.12, -0.37, i * 5 * H + 2 * H, 0.18));
        }
      if (kind === "glassRobot") for (let i = 0; i < 4; i++) rack.add(boxAt(T, glass, 0.22, 7 * H, 0.012, -0.3, 0.6 * H, 0.12 + i * 0.03));
      g.add(rack);
      break;
    }
    case "hoist": {
      // overhead gantry with a chain hoist carrying an engine
      for (const s of [-1, 1]) g.add(boxAt(T, yellow, 0.04, 30 * H, 0.04, s * 0.38, 0, -0.25));
      g.add(boxAt(T, yellow, 0.8, 2 * H, 0.05, 0, 30 * H, -0.25));
      g.add(boxAt(T, yellow, 0.05, 2 * H, 0.75, 0, 30 * H, 0.1));
      g.add(cylAt(T, dark, 0.006, (12 * H + stroke), 0, 18 * H - stroke, 0.25, 4));
      g.add(boxAt(T, kit.engine, 0.18, 5 * H, 0.14, 0, 13 * H - stroke, 0.25));
      break;
    }
    case "lift":
      // two-post lift beside the line
      for (const s of [-1, 1]) {
        g.add(boxAt(T, accentM, 0.06, 26 * H, 0.08, s * 0.4, 0, 0.1));
        g.add(boxAt(T, steel, 0.24, 1.5 * H, 0.05, s * 0.3, 6 * H + stroke, 0.25));
      }
      g.add(boxAt(T, accentM, 0.86, 2 * H, 0.08, 0, 26 * H, 0.1));
      break;
    case "paintBooth": {
      // an enclosed booth with glass walls and overhead filters; spray robots inside
      g.add(boxAt(T, mat(T, kit, "#e5e7eb", 0.2, 0.5), 0.9, 1.5 * H, 0.9, 0, 0, 0.1));
      for (const s of [-1, 1]) g.add(boxAt(T, mat(T, kit, "#cbd5e1", 0.3, 0.4), 0.05, 28 * H, 0.9, s * 0.45, 0, 0.1));
      g.add(boxAt(T, mat(T, kit, "#cbd5e1", 0.3, 0.4), 0.95, 4 * H, 0.95, 0, 28 * H, 0.1));
      g.add(boxAt(T, glass, 0.86, 22 * H, 0.02, 0, 3 * H, -0.34));
      for (let i = 0; i < 3; i++) g.add(boxAt(T, dark, 0.22, 1 * H, 0.7, -0.28 + i * 0.28, 32 * H, 0.1));
      const r = buildRobot(T, kit, pose, "#e2e8f0", "spray");
      r.position.set(-0.3, 1.5 * H, -0.2);
      g.add(r);
      break;
    }
    case "gantry":
      for (const s of [-1, 1]) for (const z of [-0.3, 0.45]) g.add(boxAt(T, accentM, 0.05, 30 * H, 0.05, s * 0.4, 0, z));
      g.add(boxAt(T, accentM, 0.85, 2.5 * H, 0.05, 0, 30 * H, -0.3));
      g.add(boxAt(T, accentM, 0.85, 2.5 * H, 0.05, 0, 30 * H, 0.45));
      g.add(boxAt(T, dark, 0.12, 4 * H, 0.8, -0.1 + stroke, 27 * H, 0.08));
      break;
    case "qcTunnel": {
      // an arch of light panels the cars drive through
      const lamp = kit.led;
      for (const s of [-1, 1]) {
        g.add(boxAt(T, mat(T, kit, "#334155", 0.4, 0.4), 0.7, 26 * H, 0.05, 0, 0, s * 0.42 + 0.08));
        for (let i = 0; i < 4; i++) g.add(boxAt(T, lamp, 0.6, 1 * H, 0.02, 0, 6 * H + i * 5 * H, s * 0.4 + 0.08));
      }
      g.add(boxAt(T, mat(T, kit, "#334155", 0.4, 0.4), 0.7, 2 * H, 0.9, 0, 26 * H, 0.08));
      for (let i = 0; i < 3; i++) g.add(boxAt(T, lamp, 0.6, 0.5 * H, 0.04, 0, 25.5 * H, -0.2 + i * 0.28));
      break;
    }
    case "furnace": {
      g.add(boxAt(T, mat(T, kit, "#6b4f3a", 0.2, 0.8), 0.7, 18 * H, 0.55, 0, 0, -0.05));
      g.add(boxAt(T, mat(T, kit, "#ff7a1a", 0, 0.6), 0.3, 6 * H, 0.02, 0, 3 * H, 0.23));
      (g.children[g.children.length - 1] as THREE_NS.Mesh).material = new T.MeshStandardMaterial({ color: "#ff8a2a", emissive: "#ff5a0a", emissiveIntensity: 1.5 });
      g.add(cylAt(T, steel, 0.06, 18 * H, 0.2, 18 * H, -0.15, 12));
      g.add(cylAt(T, dark, 0.07, 1.5 * H, 0.2, 36 * H, -0.15, 12));
      break;
    }
    case "mixer":
      g.add(cylAt(T, mat(T, kit, accent, 0.5, 0.3), 0.22, 18 * H, 0, 0.6 * H, 0, 24));
      g.add(new T.Mesh(new T.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(T, kit, accent, 0.5, 0.3)));
      (g.children[g.children.length - 1] as THREE_NS.Mesh).position.y = 18.6 * H;
      g.add(cylAt(T, steel, 0.03, 8 * H, 0, 24 * H, 0, 8));
      g.add(boxAt(T, dark, 0.14, 4 * H, 0.14, 0, 31 * H, 0));
      for (const s of [-1, 1]) g.add(cylAt(T, steel, 0.02, 18 * H, s * 0.2, 0.6 * H, 0.2, 6));
      break;
    case "cnc":
      g.add(boxAt(T, mat(T, kit, "#d6d9de", 0.3, 0.4), 0.75, 16 * H, 0.55, 0, 0.6 * H, -0.05));
      g.add(boxAt(T, glass, 0.4, 8 * H, 0.02, -0.08, 5 * H, 0.23));
      g.add(boxAt(T, accentM, 0.75, 2 * H, 0.56, 0, 16.6 * H, -0.05));
      g.add(boxAt(T, dark, 0.14, 7 * H, 0.06, 0.28, 6 * H, 0.24));
      break;
    case "packer":
      g.add(boxAt(T, mat(T, kit, "#cbd5e1", 0.3, 0.4), 0.7, 10 * H, 0.5, 0, 0.6 * H, -0.05));
      g.add(boxAt(T, dark, 0.7, 2 * H, 0.5, 0, 10.6 * H, -0.05));
      for (let i = 0; i < 3; i++) g.add(boxAt(T, mat(T, kit, "#b45309", 0.1, 0.7), 0.16, 5 * H, 0.16, -0.24 + i * 0.24, 0.6 * H, 0.3));
      break;
  }
  g.traverse((o) => ((o as THREE_NS.Mesh).isMesh ? (o.castShadow = true) : null));
  return g;
}
