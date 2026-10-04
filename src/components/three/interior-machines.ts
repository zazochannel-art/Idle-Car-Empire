// The machines, parts and floor props of every plant's interior beyond the
// Body Works: furnaces, machining centres, mixers, extruders, curing presses,
// sewing tables, spray booths, SMT lines, assembly stands, fillers, test
// benches and racks, and what rides their belts (from an ingot to an engine,
// from a rubber bale to a tyre, from a chip reel to a module). Same frame as
// the stations: origin on the belt at the stop point, x along the line, z
// across it (back is -z), y up; one map pixel of height is H.
import type * as THREE_NS from "three";
import type { MaterialKit } from "./car-models";
import { buildRobot, cycle } from "./industrial-models";
import { box, cabinet, cyl, fence, H, roll, rollers, std, type Mat, type Three } from "./interior-kit";
import type { PartKind, PropKind } from "../plant/interior/layout";

type G = THREE_NS.Group;

const glow = (T: Three, color: string, k = 1.6) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const clear = (T: Three, color = "#9ec5e6", opacity = 0.35) => new T.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.08, transparent: true, opacity });

/** Pallet racking along the back of a bay (orange uprights, blue beams). */
function racking(T: Three, g: G, x0: number, x1: number, levels: number, h: number) {
  const up = std(T, "#ea580c", 0.4, 0.45);
  const beam = std(T, "#1d4ed8", 0.4, 0.45);
  const bays = Math.max(1, Math.round((x1 - x0) / 0.85));
  for (let i = 0; i <= bays; i++) for (const z of [-0.95, -0.4]) g.add(box(T, up, x0 + ((x1 - x0) * i) / bays - 0.025, 0, z, 0.05, h, 0.05));
  for (let lv = 1; lv <= levels; lv++) for (const z of [-0.95, -0.4]) g.add(box(T, beam, x0, (h * lv) / levels - 1.2 * H, z, x1 - x0, 1.2 * H, 0.05));
  return { bays, step: (x1 - x0) / bays, lvH: h / levels };
}

/** A robot standing at the machine (when the station is automated). */
function tender(T: Three, kit: MaterialKit, g: G, pose: number, tool: "torch" | "gripper" | "suction" | "spray", x: number, z: number, s = 1.4) {
  const r = buildRobot(T, kit, pose, "#f59e0b", tool);
  r.scale.setScalar(s);
  r.position.set(x, 0, z);
  g.add(r);
}

/** A stack-light tower (green / amber / red). */
function signal(T: Three, g: G, x: number, y: number, z: number, on = "#22c55e") {
  g.add(cyl(T, std(T, "#334155"), x, y, z, 0.012, 4 * H, 6));
  ["#ef4444", "#f59e0b", "#22c55e"].forEach((c, i) => g.add(cyl(T, c === on ? glow(T, c, 1.4) : std(T, c, 0.1, 0.5), x, y + 4 * H + i * 1.2 * H, z, 0.025, 1.1 * H, 10)));
}

export function addMachine(T: Three, kit: MaterialKit, g: G, model: string, variant: string, pose: number, accent: string, color: string, robots: boolean) {
  const steel = std(T, "#8f98a3", 0.75, 0.3);
  const grey = std(T, "#4b5563", 0.4, 0.5);
  const dark = std(T, "#1f2630", 0.3, 0.6);
  const white = std(T, "#e7ebf0", 0.2, 0.5);
  const acc = std(T, accent, 0.35, 0.4);
  const yellow = std(T, "#f5b301", 0.3, 0.45);
  switch (model) {
    case "rawRack": {
      const { bays, step, lvH } = racking(T, g, -1.35, 1.35, 3, 38 * H);
      for (let i = 0; i < bays; i++)
        for (let lv = 0; lv < 3; lv++) {
          const x = -1.35 + step * (i + 0.5);
          const y = lv * lvH + 0.4 * H;
          addStock(T, g, variant, x, y, -0.68, (i + lv) % 3);
        }
      g.add(rollers(T, -0.6, 0.6, 5 * H));
      g.add(box(T, yellow, -1.4, 0, 0.55, 2.8, 0.2 * H, 0.05));
      break;
    }
    case "goodsRack": {
      const { bays, step, lvH } = racking(T, g, -1.45, 1.45, 2, 40 * H);
      const wrap = clear(T, "#e2e8f0", 0.45);
      const goods = std(T, color, 0.35, 0.5);
      for (let i = 0; i < bays; i++)
        for (let lv = 0; lv < 2; lv++) {
          const x = -1.45 + step * (i + 0.5);
          const y = lv * lvH + 0.4 * H;
          g.add(box(T, std(T, "#a16207", 0, 0.8), x - 0.3, y, -0.9, 0.6, 1.4 * H, 0.42));
          g.add(box(T, goods, x - 0.27, y + 1.4 * H, -0.87, 0.54, 9 * H, 0.36));
          g.add(box(T, wrap, x - 0.28, y + 1.4 * H, -0.88, 0.56, 9.5 * H, 0.38));
        }
      g.add(rollers(T, -0.6, 0.6, 5 * H));
      g.add(box(T, yellow, -1.5, 0, 0.55, 3, 0.2 * H, 0.05));
      break;
    }
    case "furnace": {
      const hot = glow(T, "#ff7a1a", 2.2 + (pose % 2) * 0.8);
      const brick = std(T, "#6b3a2a", 0.1, 0.85);
      const shell = std(T, "#3f4650", 0.6, 0.45);
      if (variant === "tunnel") {
        // a long tunnel oven over the belt: insulated steel housing, inspection
        // windows glowing from inside, heater zones on the roof and exhaust stacks
        const housing = std(T, "#c9d0d8", 0.55, 0.35);
        const zone = std(T, "#7b8794", 0.6, 0.4);
        g.add(box(T, housing, -1.35, 0, -0.5, 2.7, 10 * H, 0.12));
        g.add(box(T, housing, -1.35, 0, 0.4, 2.7, 10 * H, 0.12));
        for (let i = 0; i < 4; i++) g.add(box(T, hot, -1.15 + i * 0.62, 3 * H, 0.525, 0.36, 2.5 * H, 0.01)); // windows
        // roof (a little forward of the belt, so it is drawn over the parts inside)
        g.add(box(T, housing, -1.4, 10 * H, -0.45, 2.8, 2 * H, 1.05));
        for (let i = 0; i < 4; i++) g.add(box(T, zone, -1.25 + i * 0.66, 12 * H, -0.3, 0.52, 3 * H, 0.75)); // heater zones
        for (let i = 0; i < 4; i++) g.add(box(T, acc, -1.25 + i * 0.66, 15 * H, -0.3, 0.52, 0.5 * H, 0.75));
        for (const x of [-0.95, 0.35]) g.add(cyl(T, steel, x, 15 * H, 0.08, 0.05, 14 * H, 12));
        for (const x of [-1.3, 1.22]) g.add(box(T, hot, x, 1 * H, -0.38, 0.08, 8 * H, 0.76));
        g.add(box(T, dark, -1.45, 0, -0.55, 0.1, 10 * H, 1.1)); // entry curtain frame
        g.add(cabinet(T, kit, 1.5, -0.62, "#f59e0b"));
        signal(T, g, 1.42, 12 * H, -0.45);
        break;
      }
      // a melting furnace with a glowing mouth, a hood and a ladle to the line
      g.add(cyl(T, shell, -0.6, 0, -0.55, 0.42, 22 * H, 22));
      g.add(cyl(T, brick, -0.6, 22 * H, -0.55, 0.36, 2 * H, 22));
      g.add(cyl(T, hot, -0.6, 23.5 * H, -0.55, 0.3, 0.6 * H, 22));
      g.add(box(T, hot, -0.75, 8 * H, -0.16, 0.3, 6 * H, 0.04));
      g.add(box(T, shell, -1.1, 34 * H, -0.95, 1.0, 6 * H, 0.8));
      g.add(box(T, shell, -0.75, 40 * H, -0.85, 0.3, 30 * H, 0.3));
      // the casting mould station beside it
      g.add(box(T, dark, 0.2, 0, -0.75, 0.9, 8 * H, 0.5));
      g.add(box(T, hot, 0.3, 8 * H, -0.65, 0.7, 0.4 * H, 0.3));
      const ladle = new T.Group();
      ladle.add(cyl(T, shell, 0, 0, 0, 0.14, 5 * H, 14));
      ladle.add(cyl(T, hot, 0, 5 * H, 0, 0.11, 0.3 * H, 14));
      ladle.position.set(-0.05, 12 * H, -0.35);
      ladle.rotation.z = cycle([0, -0.5], pose);
      g.add(ladle);
      g.add(box(T, steel, -0.1, 0, -0.42, 0.06, 12 * H, 0.06));
      g.add(cabinet(T, kit, 1.25, -0.7, "#f59e0b"));
      g.add(fence(T, -1.45, 1.45, -1.0, 0.75, 9 * H, ["back"]));
      if (robots) tender(T, kit, g, pose, "gripper", 0.95, -0.3, 1.3);
      break;
    }
    case "cnc": {
      // an enclosed machining centre with a window; the spindle moves inside
      const body = std(T, "#dfe4ea", 0.3, 0.4);
      for (const x of [-1.3, 0.15]) {
        g.add(box(T, body, x, 0, -0.95, 1.1, 22 * H, 0.65));
        g.add(box(T, acc, x, 18 * H, -0.31, 1.1, 2 * H, 0.02));
        g.add(box(T, clear(T, "#7dd3fc", 0.45), x + 0.15, 5 * H, -0.305, 0.6, 11 * H, 0.01));
        g.add(box(T, dark, x + 0.25 + cycle([0, 0.2, 0.35, 0.15], pose), 7 * H, -0.6, 0.12, 9 * H, 0.12)); // spindle head
        g.add(box(T, grey, x + 0.82, 3 * H, -0.3, 0.2, 10 * H, 0.06)); // control panel
        g.add(box(T, kit.glass, x + 0.85, 9 * H, -0.24, 0.14, 3 * H, 0.004));
        signal(T, g, x + 1.0, 22 * H, -0.85, robots ? "#22c55e" : "#f59e0b");
      }
      // chip conveyor and coolant tank
      g.add(box(T, std(T, "#64748b", 0.5, 0.5), -1.4, 0, -0.3, 2.8, 2 * H, 0.08));
      g.add(box(T, std(T, "#0e7490", 0.3, 0.4), -0.15, 0, -1.0, 0.3, 6 * H, 0.25));
      if (robots) tender(T, kit, g, pose, "gripper", 0, -0.45, 1.2);
      break;
    }
    case "mixer": {
      if (variant === "lab") {
        // a colour lab: a tinting machine with canisters, swatches and a bench
        g.add(box(T, white, -1.3, 0, -0.9, 1.2, 8 * H, 0.5));
        g.add(box(T, std(T, "#cbd5e1", 0.3, 0.4), -1.25, 8 * H, -0.85, 1.1, 10 * H, 0.35));
        for (let i = 0; i < 8; i++) g.add(cyl(T, std(T, ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#111827", "#f8fafc"][i], 0.2, 0.4), -1.15 + i * 0.13, 18 * H, -0.68, 0.05, 4 * H, 10));
        g.add(box(T, white, 0.1, 0, -0.85, 1.2, 7 * H, 0.45));
        for (let i = 0; i < 6; i++) g.add(box(T, std(T, color, 0.2, 0.3 + i * 0.08), 0.15 + i * 0.19, 7 * H, -0.8, 0.15, 0.3 * H, 0.15));
        g.add(box(T, kit.glass, 0.6, 7 * H, -0.82, 0.3, 5 * H, 0.02));
        g.add(rollers(T, -0.6, 0.6, 4 * H));
        break;
      }
      // two process tanks on legs with agitator motors, a platform and a hopper to the line
      const tank = std(T, "#d6dbe1", 0.75, 0.25);
      for (const x of [-0.85, 0.35]) {
        for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) g.add(box(T, steel, x + dx - 0.02, 0, -0.6 + dz - 0.02, 0.04, 10 * H, 0.04));
        g.add(cyl(T, tank, x, 10 * H, -0.6, 0.34, 20 * H, 22));
        const cone = new T.Mesh(new T.ConeGeometry(0.34, 6 * H, 22), tank);
        cone.rotation.x = Math.PI;
        cone.position.set(x, 7 * H, -0.6);
        g.add(cone);
        g.add(cyl(T, std(T, color, 0.4, 0.4), x, 30 * H, -0.6, 0.12, 4 * H, 14)); // motor
        g.add(cyl(T, std(T, color, 0.3, 0.4), x, 20 * H, -0.6, 0.345, 1.5 * H, 22)); // band
      }
      g.add(box(T, yellow, -1.35, 30 * H, -0.2, 2.2, 0.6 * H, 0.22)); // walkway
      for (const x of [-1.3, -0.2, 0.75]) g.add(box(T, yellow, x, 30 * H, -0.02, 0.03, 4 * H, 0.03));
      g.add(box(T, yellow, -1.35, 34 * H, -0.02, 2.2, 0.4 * H, 0.03));
      g.add(box(T, steel, -1.4, 0, -0.15, 0.04, 30 * H, 0.04)); // ladder
      g.add(box(T, steel, 1.0, 6 * H, -0.45, 0.35, 8 * H, 0.35)); // hopper
      g.add(cabinet(T, kit, 1.3, -0.9, "#22c55e"));
      break;
    }
    case "extruder": {
      if (variant === "mill") {
        // horizontal bead mills with motors
        for (const z of [-0.85, -0.45]) {
          g.add(box(T, grey, -1.3, 0, z - 0.12, 2.4, 5 * H, 0.24));
          g.add(roll(T, std(T, "#cbd5e1", 0.8, 0.25), -0.9, 5 * H, z, 0.13, 1.4));
          g.add(box(T, std(T, color, 0.4, 0.4), 0.5, 5 * H, z - 0.13, 0.4, 7 * H, 0.26));
        }
        g.add(cabinet(T, kit, 1.25, -0.95, "#22c55e"));
        g.add(rollers(T, -0.6, 0.6, 4 * H));
        break;
      }
      if (variant === "coater") {
        // roll-to-roll electrode coater: unwinder, a drying oven, rewinder
        const foil = std(T, "#c08457", 0.8, 0.3);
        g.add(box(T, grey, -1.4, 0, -0.95, 0.4, 14 * H, 0.5));
        g.add(roll(T, foil, -1.2, 10 * H, -0.7, 0.18, 0.45, true));
        g.add(box(T, std(T, "#dfe4ea", 0.3, 0.4), -0.85, 4 * H, -0.95, 1.7, 12 * H, 0.55));
        g.add(box(T, glow(T, "#fb923c", 0.6), -0.8, 9 * H, -0.395, 1.6, 0.6 * H, 0.01));
        g.add(box(T, grey, 0.95, 0, -0.95, 0.4, 14 * H, 0.5));
        g.add(roll(T, foil, 1.15, 10 * H, -0.7, 0.22, 0.45, true));
        g.add(rollers(T, -0.6, 0.6, 4 * H));
        break;
      }
      // a rubber extruder: hopper, screw barrel, gearbox and motor, and calender rolls
      g.add(box(T, std(T, "#475569", 0.5, 0.45), -1.4, 0, -0.9, 0.55, 14 * H, 0.5));
      g.add(cyl(T, acc, -1.12, 14 * H, -0.65, 0.16, 6 * H, 14)); // motor
      g.add(roll(T, steel, -0.85, 7 * H, -0.65, 0.12, 1.4));
      for (const x of [-0.6, -0.1, 0.4]) g.add(cyl(T, std(T, "#b45309", 0.6, 0.35), x, 6.5 * H, -0.65, 0.14, 3 * H, 14)); // heater bands
      g.add(box(T, steel, -0.75, 10 * H, -0.8, 0.3, 6 * H, 0.3)); // hopper
      for (const y of [4 * H, 9 * H]) g.add(roll(T, std(T, "#cbd5e1", 0.9, 0.2), 0.75, y, -0.45, 0.1, 0.6, true));
      g.add(box(T, grey, 0.55, 0, -0.85, 0.08, 16 * H, 0.08));
      g.add(box(T, grey, 1.05, 0, -0.85, 0.08, 16 * H, 0.08));
      g.add(cabinet(T, kit, 1.25, -0.95, "#22c55e"));
      break;
    }
    case "curing": {
      // a row of clamshell curing presses; the lids open and close
      const open = cycle([0, 6], pose) * H;
      for (const x of [-0.95, 0, 0.95]) {
        g.add(box(T, std(T, "#3f4650", 0.6, 0.4), x - 0.4, 0, -0.95, 0.8, 8 * H, 0.65));
        g.add(cyl(T, std(T, "#1f2937", 0.6, 0.4), x, 8 * H, -0.62, 0.28, 2 * H, 20));
        for (const s of [-1, 1]) g.add(box(T, steel, x + s * 0.34 - 0.03, 8 * H, -0.68, 0.06, 12 * H + open, 0.06));
        g.add(cyl(T, acc, x, 10 * H + open, -0.62, 0.3, 3 * H, 20));
        g.add(cyl(T, steel, x, 13 * H + open, -0.62, 0.08, 6 * H, 12));
        if (open === 0) g.add(cyl(T, glow(T, "#fb923c", 0.5), x, 9.9 * H, -0.62, 0.31, 0.2 * H, 20));
      }
      g.add(fence(T, -1.45, 1.45, -1.05, 0.75, 9 * H, ["back"]));
      g.add(rollers(T, -0.6, 0.6, 4 * H));
      if (robots) tender(T, kit, g, pose, "gripper", 1.3, -0.25, 1.2);
      break;
    }
    case "sewing": {
      // cutting table with fabric, and sewing tables with machines and lamps
      const fabric = std(T, color, 0.05, 0.85);
      g.add(box(T, white, -1.35, 0, -0.95, 1.0, 7 * H, 0.6));
      for (let i = 0; i < 5; i++) g.add(box(T, fabric, -1.3, 7 * H + i * 0.4 * H, -0.9, 0.9, 0.35 * H, 0.5));
      for (const x of [-0.15, 0.75]) {
        g.add(box(T, std(T, "#d6c7a1", 0.05, 0.6), x, 0, -0.9, 0.7, 6 * H, 0.45));
        g.add(box(T, white, x + 0.2, 6 * H, -0.8, 0.28, 3 * H, 0.12));
        g.add(box(T, white, x + 0.4, 6 * H, -0.8, 0.06, 5 * H, 0.12));
        g.add(box(T, white, x + 0.2, 10 * H, -0.8, 0.26, 1 * H, 0.12));
        g.add(cyl(T, std(T, color), x + 0.55, 6 * H, -0.62, 0.05, 1.5 * H, 10)); // thread
        g.add(box(T, glow(T, "#fff7e0", 0.6), x + 0.1, 24 * H, -0.75, 0.5, 0.6 * H, 0.08));
        g.add(box(T, grey, x + 0.33, 25 * H, -0.73, 0.02, 14 * H, 0.02));
      }
      g.add(rollers(T, -0.6, 0.6, 4 * H));
      break;
    }
    case "sprayBooth": {
      // a pressurised booth over the line: glass sides, filters on the roof, lights inside
      const wall = std(T, "#e5e7eb", 0.2, 0.5);
      g.add(box(T, wall, -1.4, 0, -0.85, 2.8, 30 * H, 0.08));
      for (const x of [-1.42, 1.34]) g.add(box(T, clear(T, "#bfe3ff", 0.35), x, 0, -0.78, 0.08, 28 * H, 1.25));
      for (const x of [-1.42, 1.34]) for (const z of [-0.8, 0.45]) g.add(box(T, grey, x, 0, z, 0.08, 30 * H, 0.06));
      g.add(box(T, wall, -1.45, 30 * H, -0.85, 2.9, 3 * H, 1.45)); // roof (in front of the line: hides the part being painted)
      for (const x of [-1.0, 0, 1.0]) g.add(box(T, std(T, "#9ca3af", 0.4, 0.5), x - 0.3, 33 * H, -0.6, 0.6, 5 * H, 0.9)); // filter units
      for (let i = 0; i < 4; i++) g.add(box(T, glow(T, "#f8fafc", 1.0), -1.2 + i * 0.7, 26 * H, -0.76, 0.5, 2 * H, 0.03));
      g.add(box(T, glow(T, color, 0.4), -1.3, 1 * H, -0.76, 2.6, 0.5 * H, 0.02));
      if (robots)
        for (const x of [-0.6, 0.6]) tender(T, kit, g, pose + (x > 0 ? 2 : 0), "spray", x, -0.6, 1.2);
      g.add(cabinet(T, kit, 1.5, -0.95, robots ? "#38bdf8" : "#22c55e"));
      break;
    }
    case "smt": {
      // an SMT line over the belt: feeder banks behind, a glass-topped machine over the boards
      const body = std(T, "#e7ebf0", 0.3, 0.4);
      const n = variant === "printer" ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? -0.6 : -1.3 + i * 1.35;
        g.add(box(T, body, x, 0, -0.95, 1.2, 10 * H, 0.55));
        if (variant !== "printer") for (let f = 0; f < 10; f++) g.add(cyl(T, std(T, ["#1d4ed8", "#111827", "#d97706"][f % 3], 0.3, 0.4), x + 0.1 + f * 0.105, 10 * H, -0.75, 0.045, 4 * H, 10));
        // the hood over the belt (front of the line: the board is inside it)
        g.add(box(T, body, x, 6 * H, -0.4, 1.2, 8 * H, 0.9));
        g.add(box(T, clear(T, "#7dd3fc", 0.5), x + 0.15, 14 * H, -0.3, 0.9, 0.3 * H, 0.7));
        g.add(box(T, acc, x, 12 * H, 0.49, 1.2, 1.5 * H, 0.02));
        signal(T, g, x + 1.1, 14 * H, -0.85);
      }
      if (variant === "printer") {
        g.add(box(T, std(T, "#94a3b8", 0.8, 0.25), 0.8, 0, -0.9, 0.5, 9 * H, 0.45)); // stencil store
        g.add(cabinet(T, kit, 1.35, -0.95, "#22c55e"));
      }
      break;
    }
    case "assemblyStand": {
      // flow racks with parts behind, an overhead rail with tool balancers, and the job's fixture
      const flow = std(T, "#64748b", 0.5, 0.45);
      g.add(box(T, flow, -1.4, 0, -1.0, 0.9, 14 * H, 0.35));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.add(box(T, std(T, ["#2563eb", "#f59e0b", "#16a34a"][(r + c) % 3], 0.1, 0.6), -1.37 + c * 0.22, 2 * H + r * 4 * H, -0.98, 0.18, 3 * H, 0.3));
      for (const x of [-1.3, 1.3]) g.add(box(T, yellow, x - 0.03, 0, -0.75, 0.06, 32 * H, 0.06));
      g.add(box(T, yellow, -1.35, 32 * H, -0.75, 2.7, 1.5 * H, 0.06));
      for (const x of [-0.5, 0.5]) {
        g.add(cyl(T, dark, x, 18 * H, -0.73, 0.006, 14 * H, 4));
        g.add(box(T, std(T, "#2563eb", 0.4, 0.4), x - 0.05, 15 * H, -0.76, 0.1, 3 * H, 0.08));
      }
      switch (variant) {
        case "engine":
          // engines on stands, waiting for their heads and ancillaries
          for (const x of [0.25, 0.95]) {
            g.add(box(T, std(T, "#1d4ed8", 0.4, 0.4), x - 0.03, 0, -0.75, 0.06, 7 * H, 0.06));
            g.add(box(T, std(T, "#6b7280", 0.75, 0.35), x - 0.18, 7 * H, -0.9, 0.36, 7 * H, 0.32));
            g.add(box(T, std(T, color, 0.4, 0.4), x - 0.15, 14 * H, -0.87, 0.3, 1.5 * H, 0.26));
          }
          break;
        case "drum":
          // the tyre building drum and the ply servicer
          g.add(box(T, grey, 0.0, 0, -0.95, 0.4, 14 * H, 0.45));
          g.add(roll(T, std(T, "#cbd5e1", 0.85, 0.2), 0.4, 7 * H, -0.72, 0.22, 0.55));
          g.add(roll(T, std(T, "#1f2937", 0.1, 0.8), 1.0, 2 * H, -0.85, 0.18, 0.3, true));
          break;
        case "seat":
          for (const x of [0.25, 0.95]) {
            g.add(box(T, grey, x - 0.25, 0, -0.95, 0.5, 6 * H, 0.45));
            g.add(box(T, std(T, color, 0.05, 0.75), x - 0.2, 6 * H, -0.9, 0.4, 2 * H, 0.35));
            g.add(box(T, std(T, color, 0.05, 0.75), x - 0.2, 8 * H, -0.92, 0.08, 7 * H, 0.35));
          }
          break;
        case "bench":
          for (const x of [0.1, 0.8]) {
            g.add(box(T, white, x - 0.1, 0, -0.95, 0.6, 7 * H, 0.45));
            g.add(box(T, kit.glass, x + 0.05, 7 * H, -0.9, 0.3, 4 * H, 0.02));
            g.add(box(T, std(T, "#16a34a", 0.2, 0.5), x + 0.0, 7 * H, -0.78, 0.25, 0.4 * H, 0.18));
            g.add(box(T, glow(T, "#fff7e0", 0.5), x + 0.05, 13 * H, -0.85, 0.3, 0.5 * H, 0.06));
          }
          break;
        case "pack":
          g.add(box(T, grey, 0, 0, -0.95, 1.2, 6 * H, 0.55));
          g.add(box(T, std(T, "#1f2937", 0.4, 0.4), 0.05, 6 * H, -0.9, 1.1, 2 * H, 0.45));
          for (let i = 0; i < 5; i++) g.add(box(T, std(T, "#f97316", 0.3, 0.4), 0.12 + i * 0.2, 8 * H, -0.85, 0.1, 0.8 * H, 0.35));
          break;
        case "marriage":
          // the powertrain on a lift cart, raised into the body from below
          g.add(box(T, std(T, "#f59e0b", 0.3, 0.4), 0.2, 0, -0.95, 1.0, 3 * H, 0.5));
          g.add(box(T, std(T, "#6b7280", 0.75, 0.35), 0.35, 3 * H, -0.9, 0.4, 6 * H, 0.35));
          g.add(box(T, std(T, "#ef4444", 0.4, 0.4), 0.38, 9 * H, -0.87, 0.34, 1.5 * H, 0.3));
          for (const x of [0.85, 1.05]) g.add(cyl(T, std(T, "#111827", 0.1, 0.8), x, 3 * H, -0.7, 0.07, 1.5 * H, 14));
          break;
        case "trim":
          // seats and windscreens waiting by the line
          for (const x of [0.15, 0.6]) {
            g.add(box(T, std(T, "#3a2a22", 0.05, 0.7), x, 0, -0.95, 0.35, 4 * H, 0.35));
            g.add(box(T, std(T, "#3a2a22", 0.05, 0.7), x, 4 * H, -0.95, 0.08, 6 * H, 0.35));
          }
          for (let i = 0; i < 3; i++) g.add(box(T, clear(T, "#7dd3fc", 0.55), 1.0 + i * 0.06, 2 * H, -0.95, 0.02, 10 * H, 0.5));
          break;
      }
      g.add(rollers(T, -0.7, 0.7, 4 * H));
      g.add(cabinet(T, kit, 1.45, -0.55, robots ? "#38bdf8" : "#22c55e"));
      break;
    }
    case "filler": {
      // a rotary filler: cans go round under the filling heads, then the capper
      const guard = clear(T, "#cbd5e1", 0.3);
      g.add(cyl(T, grey, -0.5, 0, -0.6, 0.45, 7 * H, 24));
      const turn = new T.Group();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + (pose % 4) * (Math.PI / 16);
        turn.add(cyl(T, std(T, "#cbd5e1", 0.85, 0.25), Math.cos(a) * 0.35, 7 * H, Math.sin(a) * 0.35, 0.05, 2.5 * H, 12));
        turn.add(cyl(T, std(T, color, 0.3, 0.4), Math.cos(a) * 0.35, 9.5 * H, Math.sin(a) * 0.35, 0.05, 0.4 * H, 12));
      }
      turn.position.set(-0.5, 0, -0.6);
      g.add(turn);
      g.add(cyl(T, steel, -0.5, 7 * H, -0.6, 0.06, 20 * H, 10));
      g.add(cyl(T, std(T, "#e5e7eb", 0.6, 0.3), -0.5, 20 * H, -0.6, 0.42, 3 * H, 24)); // filling heads carousel
      g.add(cyl(T, std(T, color, 0.3, 0.4), -0.5, 23 * H, -0.6, 0.25, 6 * H, 20)); // product tank
      g.add(box(T, guard, -1.0, 0, -1.1, 1.0, 22 * H, 0.02));
      g.add(box(T, grey, 0.3, 0, -0.85, 0.6, 12 * H, 0.45)); // capper
      g.add(box(T, std(T, "#f59e0b", 0.3, 0.4), 0.45, 12 * H, -0.75, 0.3, 3 * H, 0.25));
      g.add(rollers(T, -0.7, 0.7, 4 * H));
      g.add(cabinet(T, kit, 1.25, -0.95, "#22c55e"));
      break;
    }
    case "testBench": {
      // a sound-proofed test cell with the unit on a bench, and the control desk
      const panel = std(T, "#cfd5dc", 0.3, 0.45);
      g.add(box(T, panel, -1.4, 0, -1.0, 1.6, 26 * H, 0.08));
      g.add(box(T, panel, -1.4, 0, -1.0, 0.08, 26 * H, 0.7));
      g.add(box(T, clear(T), 0.12, 0, -1.0, 0.04, 26 * H, 0.7));
      g.add(box(T, std(T, "#475569", 0.5, 0.45), -1.2, 0, -0.85, 1.1, 5 * H, 0.45));
      g.add(box(T, std(T, color, 0.5, 0.4), -1.0, 5 * H, -0.8, 0.5, 6 * H, 0.35));
      g.add(cyl(T, std(T, "#94a3b8", 0.8, 0.3), -0.3, 5 * H, -0.62, 0.08, 20 * H, 12)); // exhaust / cable duct
      g.add(box(T, white, 0.5, 0, -0.9, 0.9, 7 * H, 0.4));
      for (let i = 0; i < 3; i++) g.add(box(T, kit.glass, 0.55 + i * 0.28, 7 * H, -0.85, 0.24, 5 * H, 0.02));
      g.add(rollers(T, -0.7, 0.7, 4 * H));
      signal(T, g, 1.35, 8 * H, -0.8);
      break;
    }
  }
}

/** Stock on a raw-material rack shelf. */
function addStock(T: Three, g: G, look: string, x: number, y: number, z: number, k: number) {
  switch (look) {
    case "ingot": {
      const al = std(T, "#c8ccd2", 0.85, 0.3);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.add(box(T, al, x - 0.27 + c * 0.18, y + r * 1.5 * H, z - 0.2, 0.16, 1.3 * H, 0.42));
      break;
    }
    case "bale":
      for (let i = 0; i < 2; i++) g.add(box(T, std(T, "#232527", 0.05, 0.85), x - 0.28 + i * 0.3, y, z - 0.2, 0.26, 6 * H, 0.4));
      break;
    case "reel":
      for (let i = 0; i < 2; i++) g.add(roll(T, std(T, ["#d6c7a1", "#8b6f47", "#4b5563"][(k + i) % 3], 0.05, 0.8), x - 0.14 + i * 0.28, y, z, 0.12, 0.42, true));
      break;
    case "bar":
      for (let i = 0; i < 6; i++) g.add(roll(T, std(T, "#a8b0ba", 0.85, 0.3), x, y + Math.floor(i / 3) * 0.05, z - 0.12 + (i % 3) * 0.1, 0.025, 0.7));
      break;
    case "sack":
      for (let i = 0; i < 2; i++) g.add(box(T, std(T, "#f1f5f9", 0, 0.9), x - 0.28 + i * 0.3, y, z - 0.18, 0.26, 7 * H, 0.36));
      break;
    case "drum":
      for (let i = 0; i < 2; i++) g.add(cyl(T, std(T, ["#1d4ed8", "#475569", "#0f766e"][(k + i) % 3], 0.5, 0.4), x - 0.14 + i * 0.28, y, z, 0.12, 7 * H, 16));
      break;
    case "chips":
      g.add(box(T, std(T, "#d6c7a1", 0, 0.8), x - 0.28, y, z - 0.2, 0.56, 3 * H, 0.4));
      for (let i = 0; i < 4; i++) g.add(cyl(T, std(T, "#1f2937", 0.3, 0.5), x - 0.2 + i * 0.13, y + 3 * H, z, 0.06, 0.6 * H, 14));
      break;
  }
}

/** Parts on the belt for the plants beyond the Body Works. */
export function addPart(T: Three, g: G, kind: PartKind, color: string) {
  const steel = std(T, "#aeb6c1", 0.85, 0.3);
  const rubber = std(T, "#1d1f22", 0.05, 0.85);
  const prod = std(T, color, 0.4, 0.4);
  const tray = std(T, "#64748b", 0.5, 0.5);
  const torus = (m: Mat, r: number, t: number, y: number) => {
    const o = new T.Mesh(new T.TorusGeometry(r, t, 12, 24), m);
    o.rotation.x = Math.PI / 2;
    o.position.y = y;
    return o;
  };
  switch (kind) {
    case "ingot":
      for (let i = 0; i < 3; i++) g.add(box(T, std(T, "#c8ccd2", 0.85, 0.3), -0.25 + i * 0.17, 0.02, -0.14, 0.15, 0.05, 0.28));
      break;
    case "casting":
      g.add(box(T, std(T, "#5b5f66", 0.6, 0.6), -0.2, 0.02, -0.15, 0.4, 0.16, 0.3));
      for (let i = 0; i < 4; i++) g.add(cyl(T, std(T, "#2a2d31", 0.4, 0.6), -0.13 + i * 0.09, 0.181, 0, 0.035, 0.002, 12));
      break;
    case "block":
      g.add(box(T, std(T, "#b8bec6", 0.85, 0.25), -0.2, 0.02, -0.15, 0.4, 0.16, 0.3));
      for (let i = 0; i < 4; i++) g.add(cyl(T, std(T, "#33373d", 0.6, 0.3), -0.13 + i * 0.09, 0.181, 0, 0.035, 0.002, 12));
      break;
    case "engine":
      g.add(box(T, std(T, "#6b7280", 0.75, 0.35), -0.2, 0.02, -0.14, 0.4, 0.15, 0.28));
      g.add(box(T, prod, -0.18, 0.17, -0.1, 0.36, 0.05, 0.2)); // valve cover
      g.add(cyl(T, std(T, "#111827", 0.3, 0.5), 0.24, 0.05, 0, 0.07, 0.04, 14)); // pulley side
      g.add(box(T, std(T, "#9ca3af", 0.8, 0.3), -0.16, 0.12, 0.14, 0.32, 0.04, 0.04)); // manifold
      break;
    case "bale":
      g.add(box(T, rubber, -0.22, 0.02, -0.16, 0.44, 0.12, 0.32));
      break;
    case "slab":
      for (let i = 0; i < 3; i++) g.add(box(T, rubber, -0.25, 0.02 + i * 0.022, -0.17, 0.5, 0.02, 0.34));
      break;
    case "strip":
      g.add(box(T, rubber, -0.3, 0.02, -0.06, 0.6, 0.02, 0.12));
      g.add(box(T, rubber, -0.3, 0.02, 0.1, 0.6, 0.02, 0.06));
      break;
    case "greenTire":
      g.add(torus(std(T, "#4b5546", 0.05, 0.8), 0.15, 0.06, 0.08));
      break;
    case "tire":
      g.add(torus(rubber, 0.15, 0.07, 0.09));
      g.add(cyl(T, std(T, "#e5e7eb", 0.2, 0.5), 0, 0.155, 0, 0.11, 0.003, 18)); // label
      break;
    case "roll":
      g.add(roll(T, std(T, color, 0.05, 0.85), 0, 0.02, 0, 0.1, 0.42, true));
      break;
    case "fabricCut":
      for (let i = 0; i < 4; i++) g.add(box(T, std(T, color, 0.05, 0.85), -0.2 + i * 0.02, 0.02 + i * 0.01, -0.15, 0.36, 0.008, 0.3));
      break;
    case "cover":
      g.add(box(T, std(T, color, 0.05, 0.8), -0.2, 0.02, -0.15, 0.4, 0.04, 0.3));
      break;
    case "cushion":
      g.add(box(T, std(T, "#facc15", 0, 0.9), -0.2, 0.02, -0.15, 0.4, 0.09, 0.3));
      break;
    case "seat":
      g.add(box(T, std(T, color, 0.05, 0.75), -0.16, 0.02, -0.15, 0.32, 0.08, 0.3));
      g.add(box(T, std(T, color, 0.05, 0.75), -0.18, 0.1, -0.15, 0.08, 0.24, 0.3));
      g.add(box(T, std(T, color, 0.05, 0.75), -0.19, 0.34, -0.08, 0.07, 0.07, 0.16));
      break;
    case "bar":
      for (let i = 0; i < 3; i++) g.add(roll(T, steel, 0, 0.02 + (i === 2 ? 0.045 : 0), -0.05 + (i % 2) * 0.1 - (i === 2 ? 0.05 : 0), 0.025, 0.6));
      break;
    case "spring":
    case "strut": {
      // a coil spring (helix tube); struts have a damper through it
      const pts: THREE_NS.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * Math.PI * 2 * 6;
        pts.push(new T.Vector3(Math.cos(a) * 0.08, 0.04 + (i / 60) * 0.3, Math.sin(a) * 0.08));
      }
      const spring = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 120, 0.014, 6), kind === "strut" ? prod : std(T, "#d97706", 0.6, 0.4));
      const s = new T.Group();
      s.add(spring);
      if (kind === "strut") {
        s.add(cyl(T, std(T, "#1f2937", 0.6, 0.35), 0, 0, 0, 0.04, 0.42, 12));
        s.add(cyl(T, steel, 0, 0.42, 0, 0.015, 0.1, 8));
      }
      s.rotation.z = Math.PI / 2;
      s.position.set(0.22, 0.12, 0);
      g.add(s);
      break;
    }
    case "arm":
      // a forged control arm: a wishbone with bushings
      g.add(box(T, std(T, "#3f4650", 0.7, 0.35), -0.24, 0.02, -0.03, 0.48, 0.04, 0.06));
      g.add(box(T, std(T, "#3f4650", 0.7, 0.35), -0.02, 0.02, -0.18, 0.06, 0.04, 0.36));
      for (const [x, z] of [[-0.24, 0], [0.24, 0], [0, -0.18]]) g.add(cyl(T, rubber, x, 0.02, z, 0.04, 0.05, 12));
      break;
    case "sack":
      g.add(box(T, std(T, "#f1f5f9", 0, 0.9), -0.2, 0.02, -0.18, 0.4, 0.22, 0.36));
      break;
    case "cullet":
      g.add(box(T, tray, -0.25, 0.02, -0.18, 0.5, 0.03, 0.36));
      for (let i = 0; i < 9; i++) g.add(box(T, std(T, "#b6e3d4", 0.2, 0.2), -0.2 + (i % 3) * 0.14, 0.05, -0.12 + Math.floor(i / 3) * 0.1, 0.08, 0.04, 0.06));
      break;
    case "glassSheet":
      g.add(box(T, clear(T, "#9fd6f0", 0.6), -0.28, 0.03, -0.2, 0.56, 0.015, 0.4));
      break;
    case "windshield": {
      const shape = new T.Shape();
      shape.moveTo(-0.26, 0);
      shape.quadraticCurveTo(0, 0.08, 0.26, 0);
      shape.lineTo(0.26, 0.012);
      shape.quadraticCurveTo(0, 0.092, -0.26, 0.012);
      shape.closePath();
      const m = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false }), clear(T, "#8ccbea", 0.65));
      m.position.set(0, 0.03, -0.18);
      g.add(m);
      break;
    }
    case "drum":
      g.add(cyl(T, std(T, "#1d4ed8", 0.5, 0.4), 0, 0.02, 0, 0.12, 0.26, 18));
      break;
    case "tote":
      // an IBC tote: a white tank in a steel cage on a pallet
      g.add(box(T, std(T, "#a16207", 0, 0.8), -0.2, 0.02, -0.2, 0.4, 0.03, 0.4));
      g.add(box(T, std(T, "#f1f5f9", 0, 0.5), -0.18, 0.05, -0.18, 0.36, 0.28, 0.36));
      g.add(box(T, prod, -0.18, 0.05, -0.18, 0.36, 0.1, 0.36));
      for (const x of [-0.19, 0.17]) for (const z of [-0.19, 0.17]) g.add(box(T, steel, x, 0.05, z, 0.02, 0.29, 0.02));
      break;
    case "can":
      g.add(box(T, tray, -0.22, 0.02, -0.15, 0.44, 0.02, 0.3));
      for (let i = 0; i < 6; i++) {
        const x = -0.14 + (i % 3) * 0.14;
        const z = -0.07 + Math.floor(i / 3) * 0.14;
        g.add(cyl(T, std(T, "#d1d5db", 0.85, 0.25), x, 0.04, z, 0.055, 0.1, 14));
        g.add(cyl(T, prod, x, 0.07, z, 0.056, 0.04, 14));
      }
      break;
    case "reel":
      for (let i = 0; i < 3; i++) g.add(cyl(T, std(T, "#1f2937", 0.3, 0.5), -0.15 + i * 0.15, 0.02, 0, 0.065, 0.02, 16));
      break;
    case "pcbBare":
    case "pcb":
      g.add(box(T, std(T, "#15803d", 0.2, 0.45), -0.24, 0.02, -0.16, 0.48, 0.012, 0.32));
      g.add(box(T, std(T, "#d4a017", 0.9, 0.2), -0.22, 0.033, -0.14, 0.44, 0.001, 0.02));
      if (kind === "pcb") {
        g.add(box(T, std(T, "#111827", 0.3, 0.4), -0.1, 0.032, -0.08, 0.14, 0.02, 0.14));
        for (let i = 0; i < 6; i++) g.add(box(T, std(T, i % 2 ? "#1f2937" : "#cbd5e1", 0.5, 0.4), -0.2 + (i % 3) * 0.06, 0.032, 0.04 + Math.floor(i / 3) * 0.05, 0.04, 0.015, 0.03));
        g.add(cyl(T, std(T, "#1d4ed8", 0.3, 0.4), 0.15, 0.032, 0.0, 0.03, 0.05, 10));
      }
      break;
    case "module":
      g.add(box(T, std(T, "#334155", 0.5, 0.4), -0.22, 0.02, -0.15, 0.44, 0.08, 0.3));
      g.add(box(T, prod, -0.2, 0.1, -0.13, 0.4, 0.01, 0.26));
      g.add(box(T, std(T, "#e5e7eb", 0.4, 0.4), 0.16, 0.06, 0.15, 0.06, 0.03, 0.02));
      break;
    case "electrode":
      g.add(roll(T, std(T, "#c08457", 0.85, 0.3), 0, 0.02, 0, 0.11, 0.36, true));
      g.add(roll(T, std(T, "#1f2937", 0.3, 0.5), 0, 0.075, 0, 0.055, 0.38, true));
      break;
    case "cell":
      g.add(box(T, tray, -0.22, 0.02, -0.15, 0.44, 0.02, 0.3));
      for (let i = 0; i < 12; i++) g.add(cyl(T, std(T, i % 2 ? "#0f766e" : "#1e3a8a", 0.4, 0.4), -0.17 + (i % 4) * 0.11, 0.04, -0.09 + Math.floor(i / 4) * 0.09, 0.04, 0.12, 12));
      break;
    case "pack":
      g.add(box(T, std(T, "#1f2937", 0.5, 0.4), -0.28, 0.02, -0.2, 0.56, 0.08, 0.4));
      g.add(box(T, prod, -0.26, 0.1, -0.18, 0.52, 0.006, 0.36));
      for (const z of [-0.12, 0.08]) g.add(box(T, std(T, "#f97316", 0.3, 0.4), 0.2, 0.1, z, 0.06, 0.03, 0.06));
      break;
    default:
      g.add(box(T, prod, -0.2, 0.02, -0.15, 0.4, 0.1, 0.3));
  }
}

/** Extra floor props: a pallet of drums, a pallet of boxed goods. */
export function addProp(T: Three, g: G, kind: PropKind, color: string) {
  const wood = std(T, "#a16207", 0, 0.8);
  if (kind === "drumPallet") {
    g.add(box(T, wood, -0.3, 0, -0.25, 0.6, 2 * H, 0.5));
    for (let i = 0; i < 4; i++) g.add(cyl(T, std(T, ["#1d4ed8", "#0f766e", "#475569", "#b45309"][i], 0.5, 0.4), -0.14 + (i % 2) * 0.28, 2 * H, -0.12 + Math.floor(i / 2) * 0.25, 0.12, 8 * H, 16));
  } else if (kind === "boxPallet") {
    g.add(box(T, wood, -0.3, 0, -0.25, 0.6, 2 * H, 0.5));
    for (let i = 0; i < 6; i++) g.add(box(T, std(T, i % 2 ? "#c8a46b" : "#b8935a", 0, 0.85), -0.28 + (i % 3) * 0.19, 2 * H + Math.floor(i / 3) * 4 * H, -0.22, 0.18, 4 * H, 0.44));
    g.add(box(T, std(T, color, 0.2, 0.5), -0.1, 2 * H + 8 * H, -0.05, 0.2, 0.2 * H, 0.1));
  }
}
