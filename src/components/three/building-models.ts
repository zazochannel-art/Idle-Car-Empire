// Procedural 3D factories for the Empire Map. Units are tiles (x along the
// plot's x, z along its y, y up); the origin is the centre of the plot.
// Every level adds equipment and architecture, not just size: a loading dock
// and tanks, an office, a second hall with pipe racks, sawtooth skylights,
// robots and a conveyor bridge, a glass facade with solar panels, and a tower.
import type * as THREE_NS from "three";
import type { MaterialKit } from "./car-models";

type Three = typeof THREE_NS;

/** One map pixel of height in tiles (the map draws heights in pixels). */
export const PX = 1 / 39.2;

export interface PlantSpec {
  type: string;
  level: number;
  big: boolean;
  /** The road (and the loading dock) is on the +z side. */
  dockFront: boolean;
  wall: string;
  roof: string;
  accent: string;
}

/** Hall size and placement, shared with the 2D overlays (stock, smoke…). */
export function hallLayout(level: number, big: boolean, W: number, D: number, dockFront: boolean) {
  const s = big ? 2 : 1;
  const hw = Math.min(W - 0.5, (1.25 + level * 0.12) * s);
  const hd = Math.min(D - 0.8, (1.0 + level * 0.07) * s);
  const hx = 0.25;
  const hy = dockFront ? 0.25 : D - hd - 0.25;
  const h = (12 + level * 4) * (big ? 1.25 : 1);
  return { hw, hd, hx, hy, h };
}

function std(T: Three, color: string, metal = 0.2, rough = 0.6) {
  return new T.MeshStandardMaterial({
    color,
    metalness: metal,
    roughness: rough,
  });
}

function box(T: Three, m: THREE_NS.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
  const b = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  b.position.set(x + w / 2, y + h / 2, z + d / 2);
  return b;
}

function cyl(T: Three, m: THREE_NS.Material, x: number, y: number, z: number, r: number, h: number, seg = 18) {
  const c = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m);
  c.position.set(x, y + h / 2, z);
  return c;
}

/** A horizontal pipe from a to b at height y (along x or z). */
function pipe(T: Three, m: THREE_NS.Material, a: [number, number], b: [number, number], y: number, r: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const p = new T.Mesh(new T.CylinderGeometry(r, r, len, 10), m);
  p.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  p.rotation.z = Math.PI / 2;
  p.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  return p;
}

/** A gable roof as an extruded triangle with eaves, ridge along x. */
function gableRoof(T: Three, m: THREE_NS.Material, x: number, z: number, w: number, d: number, y: number, rise: number) {
  const shape = new T.Shape();
  const o = 0.04;
  shape.moveTo(-o, 0);
  shape.lineTo(d / 2, rise);
  shape.lineTo(d + o, 0);
  shape.lineTo(d + o, -0.012);
  shape.lineTo(-o, -0.012);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {
    depth: w + o * 2,
    bevelEnabled: false,
  });
  const mesh = new T.Mesh(g, m);
  // shape is in the z/y plane, extruded along x
  mesh.rotation.y = -Math.PI / 2;
  mesh.position.set(x + w + o, y, z);
  return mesh;
}

/** Sawtooth roof: rows of prisms with glazed vertical faces (north lights). */
function sawtooth(T: Three, roof: THREE_NS.Material, glass: THREE_NS.Material, x: number, z: number, w: number, d: number, y: number, teeth: number, rise: number) {
  const g = new T.Group();
  const step = d / teeth;
  for (let i = 0; i < teeth; i++) {
    const shape = new T.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(step, 0);
    shape.lineTo(step, rise);
    shape.closePath();
    const m = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }), roof);
    m.rotation.y = -Math.PI / 2;
    m.position.set(x + w, y, z + i * step);
    g.add(m);
    g.add(box(T, glass, x + 0.02, y + 0.005, z + (i + 1) * step - 0.012, w - 0.04, rise * 0.85, 0.01));
  }
  return g;
}

/** Corrugated cladding: thin vertical ribs proud of a wall. */
function ribs(T: Three, m: THREE_NS.Material, x0: number, x1: number, z: number, y: number, h: number, along: "x" | "z", gap = 0.09) {
  const g = new T.Group();
  const n = Math.floor(Math.abs(x1 - x0) / gap);
  for (let i = 1; i < n; i++) {
    const u = x0 + ((x1 - x0) * i) / n;
    g.add(along === "x" ? box(T, m, u - 0.006, y, z - 0.006, 0.012, h, 0.012) : box(T, m, z - 0.006, y, u - 0.006, 0.012, h, 0.012));
  }
  return g;
}

/** A framed window band: glass with protruding frame and mullions (on a z-facing wall). */
function windowBand(T: Three, kit: MaterialKit, frame: THREE_NS.Material, x: number, z: number, w: number, y: number, h: number, panes: number, face: 1 | -1) {
  const g = new T.Group();
  const t = 0.012;
  const zz = face > 0 ? z : z - t;
  g.add(box(T, kit.glass, x, y, zz + (face > 0 ? 0.002 : -0.002), w, h, t));
  g.add(box(T, frame, x - 0.01, y - 0.012, zz + face * 0.008, w + 0.02, 0.012, t));
  g.add(box(T, frame, x - 0.01, y + h, zz + face * 0.008, w + 0.02, 0.012, t));
  for (let i = 0; i <= panes; i++) g.add(box(T, frame, x + (w * i) / panes - 0.006, y, zz + face * 0.008, 0.012, h, t));
  return g;
}

/** A windows band on an x-facing wall (the right side of a building). */
function windowBandX(T: Three, kit: MaterialKit, frame: THREE_NS.Material, x: number, z: number, d: number, y: number, h: number, panes: number) {
  const g = new T.Group();
  const t = 0.012;
  g.add(box(T, kit.glass, x + 0.002, y, z, t, h, d));
  g.add(box(T, frame, x + 0.008, y - 0.012, z - 0.01, t, 0.012, d + 0.02));
  g.add(box(T, frame, x + 0.008, y + h, z - 0.01, t, 0.012, d + 0.02));
  for (let i = 0; i <= panes; i++) g.add(box(T, frame, x + 0.008, y, z + (d * i) / panes - 0.006, t, h, 0.012));
  return g;
}

/** A roll-up door with slats and a frame, on a z-facing wall. */
function rollerDoor(T: Three, x: number, z: number, w: number, h: number, face: 1 | -1, door: THREE_NS.Material, frame: THREE_NS.Material, slat: THREE_NS.Material) {
  const g = new T.Group();
  const zz = face > 0 ? z : z - 0.01;
  g.add(box(T, door, x, 0, zz - face * 0.006, w, h, 0.012));
  for (let y = 0.02; y < h; y += 0.03) g.add(box(T, slat, x, y, zz + face * 0.003, w, 0.004, 0.006));
  g.add(box(T, frame, x - 0.02, 0, zz + face * 0.004, 0.02, h + 0.02, 0.016));
  g.add(box(T, frame, x + w, 0, zz + face * 0.004, 0.02, h + 0.02, 0.016));
  g.add(box(T, frame, x - 0.02, h, zz + face * 0.004, w + 0.04, 0.03, 0.02));
  return g;
}

/** A roof fan / ventilator with a mushroom cap. */
function ventilator(T: Three, m: THREE_NS.Material, x: number, y: number, z: number) {
  const g = new T.Group();
  g.add(cyl(T, m, x, y, z, 0.035, 0.06, 12));
  const cap = new T.Mesh(new T.ConeGeometry(0.055, 0.03, 12), m);
  cap.position.set(x, y + 0.075, z);
  g.add(cap);
  return g;
}

/** A packaged air-conditioning unit with a fan grille on top. */
function hvac(T: Three, body: THREE_NS.Material, dark: THREE_NS.Material, x: number, y: number, z: number) {
  const g = new T.Group();
  g.add(box(T, body, x, y, z, 0.2, 0.08, 0.14));
  for (const dx of [0.05, 0.15]) {
    const f = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.004, 14), dark);
    f.position.set(x + dx, y + 0.082, z + 0.07);
    g.add(f);
  }
  return g;
}

/** A vertical tank with a domed top, ladder and catwalk ring. */
function tank(T: Three, m: THREE_NS.Material, rail: THREE_NS.Material, x: number, z: number, r: number, h: number) {
  const g = new T.Group();
  g.add(cyl(T, m, x, 0, z, r, h, 24));
  const dome = new T.Mesh(new T.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
  dome.scale.y = 0.4;
  dome.position.set(x, h, z);
  g.add(dome);
  const ring = new T.Mesh(new T.TorusGeometry(r + 0.015, 0.004, 4, 24), rail);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, h * 0.98, z);
  g.add(ring);
  g.add(box(T, rail, x + r * 0.7, 0, z + r * 0.7, 0.012, h, 0.012));
  g.add(box(T, rail, x + r * 0.7 + 0.03, 0, z + r * 0.7 - 0.03, 0.012, h, 0.012));
  for (let y = 0.04; y < h; y += 0.04) g.add(box(T, rail, x + r * 0.7, y, z + r * 0.7 - 0.03, 0.04, 0.004, 0.004));
  return g;
}

/** A glass office block with a mullion grid and a parapet. */
function office(T: Three, kit: MaterialKit, frame: THREE_NS.Material, slab: THREE_NS.Material, x: number, z: number, w: number, d: number, h: number) {
  const g = new T.Group();
  g.add(box(T, kit.glass, x, 0, z, w, h, d));
  const floors = Math.max(2, Math.round(h / 0.11));
  for (let i = 0; i <= floors; i++) g.add(box(T, slab, x - 0.008, (h * i) / floors - 0.006, z - 0.008, w + 0.016, 0.012, d + 0.016));
  for (let i = 0; i <= Math.round(w / 0.08); i++) g.add(box(T, frame, x + (w * i) / Math.round(w / 0.08) - 0.004, 0, z + d, 0.008, h, 0.008));
  for (let i = 0; i <= Math.round(d / 0.08); i++) g.add(box(T, frame, x + w, 0, z + (d * i) / Math.round(d / 0.08) - 0.004, 0.008, h, 0.008));
  g.add(box(T, slab, x - 0.01, h, z - 0.01, w + 0.02, 0.03, d + 0.02));
  return g;
}

/** Builds a plant on a W×D yard (tiles). Origin: centre of the yard on the ground. */
export function buildPlant(T: Three, kit: MaterialKit, spec: PlantSpec, W: number, D: number): THREE_NS.Group {
  const root = new T.Group();
  const g = new T.Group();
  g.position.set(-W / 2, 0, -D / 2);
  root.add(g);
  const L = spec.level;
  const { hw, hd, hx, hy, h: hpx } = hallLayout(L, spec.big, W, D, spec.dockFront);
  const H = hpx * PX;
  const s = spec.big ? 2 : 1;
  const wall = std(T, L >= 7 ? "#dbeafe" : spec.wall, 0.35, 0.5);
  const rib = std(T, L >= 7 ? "#c7d7ea" : shadeHex(spec.wall, -0.1), 0.4, 0.5);
  const roof = std(T, spec.roof, 0.4, 0.55);
  const accent = std(T, spec.accent, 0.3, 0.4);
  const frame = std(T, "#2c3440", 0.6, 0.4);
  const concrete = std(T, "#a9b0b8", 0, 0.9);
  const asphalt = std(T, "#4a515c", 0, 0.95);
  const steel = std(T, "#9aa3ad", 0.85, 0.3);
  const dark = std(T, "#1e242c", 0.3, 0.6);
  const yellow = std(T, "#f5b301", 0.2, 0.5);
  const white = std(T, "#eef2f6", 0.1, 0.6);

  // yard: concrete with an asphalt apron and painted bays
  g.add(box(T, concrete, 0, 0, 0, W, 0.012, D));
  const apronZ = spec.dockFront ? hy + hd + 0.02 : 0.02;
  const apronD = spec.dockFront ? D - (hy + hd) - 0.04 : hy - 0.04;
  if (apronD > 0.1) {
    g.add(box(T, asphalt, 0.05, 0.012, apronZ, W - 0.1, 0.004, apronD));
    for (let i = 1; i < 6 * s; i++) g.add(box(T, white, 0.05 + ((W - 0.1) * i) / (6 * s), 0.016, apronZ + apronD * 0.45, 0.01, 0.001, apronD * 0.5));
  }

  // main hall: walls with a plinth, corner posts and corrugated cladding
  g.add(box(T, std(T, "#6b7280", 0.2, 0.7), hx - 0.01, 0.012, hy - 0.01, hw + 0.02, 0.05, hd + 0.02));
  g.add(box(T, wall, hx, 0.012, hy, hw, H, hd));
  for (const [cx, cz] of [
    [hx - 0.015, hy - 0.015],
    [hx + hw - 0.015, hy - 0.015],
    [hx - 0.015, hy + hd - 0.015],
    [hx + hw - 0.015, hy + hd - 0.015],
  ])
    g.add(box(T, frame, cx, 0.012, cz, 0.03, H + 0.01, 0.03));
  g.add(ribs(T, rib, hx, hx + hw, hy + hd + 0.004, 0.07, H - 0.08, "x"));
  g.add(ribs(T, rib, hy, hy + hd, hx + hw + 0.004, 0.07, H - 0.08, "z"));
  // coloured fascia band under the eaves
  g.add(box(T, accent, hx - 0.005, H - 0.035, hy + hd - 0.002, hw + 0.01, 0.03, 0.012));
  g.add(box(T, accent, hx + hw - 0.002, H - 0.035, hy - 0.005, 0.012, 0.03, hd + 0.01));

  // roof: gable (small plants) or sawtooth with skylights (from Large)
  if (L >= 7) {
    g.add(box(T, std(T, "#d5dbe3", 0.3, 0.6), hx - 0.02, H, hy - 0.02, hw + 0.04, 0.03, hd + 0.04));
    // solar panels in rows
    const panel = new T.MeshStandardMaterial({
      color: "#1d3a6b",
      metalness: 0.6,
      roughness: 0.25,
    });
    for (let r = 0; r < Math.floor(hd / 0.22); r++)
      for (let c = 0; c < Math.floor(hw / 0.32); c++) {
        const p = box(T, panel, hx + 0.06 + c * 0.32, H + 0.04, hy + 0.06 + r * 0.22, 0.28, 0.012, 0.16);
        p.rotation.x = -0.25;
        g.add(p);
      }
  } else if (L >= 5) sawtooth(T, roof, kit.glass, hx, hy, hw, hd, H, Math.max(3, Math.round(hd / 0.22)), 0.12).children.forEach((c) => g.add(c));
  else g.add(gableRoof(T, roof, hx, hy, hw, hd, H, 0.06 + L * 0.02));
  // roof equipment
  for (let i = 0; i < Math.min(2 + L, 8); i++) {
    const fx = hx + 0.15 + ((i * 0.37) % Math.max(0.3, hw - 0.3));
    const fz = hy + 0.15 + ((i * 0.53) % Math.max(0.2, hd - 0.3));
    if (L >= 5 && L < 7) continue; // sawtooth roofs keep their skylights clear
    if (i % 3 === 0) g.add(hvac(T, std(T, "#d1d5db", 0.4, 0.5), dark, fx, H + (L >= 7 ? 0.03 : 0.07), fz));
    else g.add(ventilator(T, steel, fx, H + (L >= 7 ? 0.03 : 0.08), fz));
  }

  // dock side: roll-up doors, a raised dock with bumpers, a canopy
  const doorZ = hy + hd;
  const doors = Math.min(5, 1 + Math.floor(L / 2)) * (spec.big ? 2 : 1);
  const doorW = Math.min(0.28, (hw - 0.2) / doors - 0.06);
  for (let i = 0; i < doors; i++) {
    const dx = hx + 0.12 + (i * (hw - 0.2)) / doors;
    g.add(rollerDoor(T, dx, doorZ, doorW, Math.min(H * 0.6, 0.26), 1, std(T, "#c9ced6", 0.6, 0.4), frame, std(T, "#9aa3ad", 0.6, 0.4)));
    if (L >= 2) {
      // dock leveller and black bumpers
      g.add(box(T, concrete, dx - 0.03, 0.012, doorZ, doorW + 0.06, 0.05, 0.1));
      for (const bx of [dx - 0.02, dx + doorW + 0.005]) g.add(box(T, dark, bx, 0.03, doorZ + 0.1, 0.015, 0.04, 0.012));
    }
  }
  if (L >= 2) g.add(box(T, std(T, "#e5e7eb", 0.3, 0.5), hx + 0.05, Math.min(H * 0.6, 0.26) + 0.04, doorZ, hw - 0.1, 0.012, 0.16));
  // windows on the side wall and over the doors
  if (L >= 3) g.add(windowBandX(T, kit, frame, hx + hw, hy + 0.1, hd - 0.2, H * 0.55, H * 0.22, Math.max(2, Math.round(hd / 0.12))));
  g.add(windowBand(T, kit, frame, hx + 0.1, doorZ, hw - 0.2, H * 0.72, H * 0.12, Math.max(3, Math.round(hw / 0.1)), 1));
  // company sign over the doors
  g.add(box(T, accent, hx + hw * 0.3, H * 0.86, doorZ + 0.002, hw * 0.4, 0.05, 0.012));

  // pipes along the side wall into the roof (from Basic)
  if (L >= 2) {
    const px = hx + hw + 0.03;
    g.add(pipe(T, steel, [px, hy + 0.05], [px, hy + hd - 0.05], H * 0.42, 0.012).rotateY(0));
    (g.children[g.children.length - 1] as THREE_NS.Mesh).rotation.set(Math.PI / 2, 0, 0);
    g.add(cyl(T, steel, px, 0.012, hy + 0.05, 0.012, H * 0.42));
    g.add(cyl(T, steel, px, H * 0.42, hy + hd - 0.05, 0.012, H * 0.6));
    g.add(cyl(T, accent, px + 0.03, 0.012, hy + hd * 0.5, 0.016, H + 0.1));
  }

  // office block from Industrial on
  if (L >= 3) {
    const ox = hx + hw + 0.12;
    const ow = Math.min(0.75 * s, W - ox - 0.1);
    if (ow > 0.3) {
      const oh = (14 + L * 3) * PX;
      g.add(office(T, kit, frame, white, ox, hy, ow, 0.7 * s, oh));
    }
  }
  // tanks / silos from Advanced on
  if (L >= 4) {
    const tz = spec.dockFront ? D - 0.35 : 0.35;
    for (let i = 0; i < (spec.big ? 3 : 2); i++) g.add(tank(T, std(T, i % 2 ? "#d9dee5" : spec.accent, 0.5, 0.35), steel, W - 0.3 - i * 0.32, tz, 0.12, 0.3 + L * 0.02));
  }
  // conveyor bridge to the office (Automated and up)
  if (L >= 6) {
    const by = H * 0.65;
    g.add(box(T, std(T, "#94a3b8", 0.6, 0.4), hx + hw, by, hy + 0.15, 0.12, 0.05, 0.08));
    for (let i = 0; i < 4; i++) g.add(box(T, steel, hx + hw + 0.02 + i * 0.03, 0.012, hy + 0.15, 0.008, by, 0.008));
  }
  // Mega Factory: a glass tower with a beacon mast
  if (L >= 8) {
    const tx = W - 0.55 * s;
    g.add(office(T, kit, frame, std(T, "#1e3a8a", 0.4, 0.4), tx, 0.15, 0.5 * s, 0.5 * s, 80 * PX));
    g.add(cyl(T, steel, tx + 0.25 * s, 80 * PX + 0.03, 0.15 + 0.25 * s, 0.008, 0.2, 6));
  }
  // Industrial Complex: a helipad on the roof and a glass skybridge to the tower
  if (L >= 9) {
    const pad = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.012, 24), std(T, "#334155", 0.2, 0.7));
    pad.position.set(hx + hw * 0.7, H + 0.05, hy + hd * 0.6);
    g.add(pad);
    const mark = new T.Mesh(new T.TorusGeometry(0.11, 0.008, 6, 24), std(T, "#facc15", 0.2, 0.5));
    mark.rotation.x = Math.PI / 2;
    mark.position.set(hx + hw * 0.7, H + 0.058, hy + hd * 0.6);
    g.add(mark);
    g.add(box(T, kit.glass, hx + hw, H * 0.8, 0.2, W - 0.55 * s - (hx + hw), 0.06, 0.1));
  }
  // Auto City: a second glass tower with a lit crown
  if (L >= 10) {
    const t2 = W - 1.15 * s;
    g.add(office(T, kit, frame, std(T, "#0f766e", 0.4, 0.4), t2, 0.15, 0.45 * s, 0.45 * s, 64 * PX));
    const crown = new T.Mesh(new T.BoxGeometry(0.45 * s + 0.02, 0.02, 0.45 * s + 0.02), new T.MeshStandardMaterial({ color: "#67e8f9", emissive: "#22d3ee", emissiveIntensity: 1.5 }));
    crown.position.set(t2 + 0.225 * s, 64 * PX + 0.04, 0.15 + 0.225 * s);
    g.add(crown);
  }

  // equipment that says what the plant makes
  const yardZ = spec.dockFront ? hy + hd + 0.25 : 0.2;
  switch (spec.type) {
    case "bodyWorks":
      for (let i = 0; i < 3; i++) {
        const c = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.09, 18), steel);
        c.rotation.x = Math.PI / 2;
        c.position.set(W - 0.35 - i * 0.17, 0.08, yardZ + 0.05);
        g.add(c);
      }
      break;
    case "engineFactory":
      g.add(cyl(T, std(T, "#8b939e", 0.6, 0.4), hx + 0.15, H, hy + 0.15, 0.045, 0.42));
      for (let k = 1; k < 4; k++) g.add(cyl(T, dark, hx + 0.15, H + k * 0.1, hy + 0.15, 0.05, 0.01));
      break;
    case "glassFactory": {
      g.add(cyl(T, std(T, "#e2e8f0", 0.4, 0.5), hx + 0.17, H, hy + 0.17, 0.07, 0.4));
      const glow = new T.Mesh(
        new T.CylinderGeometry(0.055, 0.055, 0.01, 16),
        new T.MeshStandardMaterial({
          color: "#ff8a2a",
          emissive: "#ff6a00",
          emissiveIntensity: 2,
        }),
      );
      glow.position.set(hx + 0.17, H + 0.405, hy + 0.17);
      g.add(glow);
      for (let i = 0; i < 4; i++) g.add(box(T, kit.glass, W - 0.5 + i * 0.06, 0.012, yardZ, 0.012, 0.16, 0.22));
      break;
    }
    case "tireFactory":
      for (let i = 0; i < 3; i++)
        for (let k = 0; k < 3 + (i % 2); k++) {
          const t = new T.Mesh(new T.TorusGeometry(0.045, 0.022, 8, 16), kit.tyre);
          t.rotation.x = Math.PI / 2;
          t.position.set(W - 0.3 - i * 0.14, 0.03 + k * 0.045, yardZ + 0.05);
          g.add(t);
        }
      g.add(cyl(T, std(T, "#3f3f46", 0.5, 0.5), hx + 0.15, H, hy + 0.15, 0.04, 0.36));
      break;
    case "paintFactory":
      for (const [i, c] of ["#f472b6", "#60a5fa", "#facc15"].entries()) g.add(tank(T, std(T, c, 0.4, 0.35), steel, W - 0.28 - i * 0.26, yardZ + 0.1, 0.1, 0.32));
      break;
    case "interiorFactory":
      for (const [i, c] of ["#dc2626", "#2563eb", "#a16207", "#334155"].entries()) {
        const roll = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.2, 14), std(T, c, 0, 0.8));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(W - 0.4, 0.06 + (i % 2) * 0.1, yardZ + Math.floor(i / 2) * 0.12);
        g.add(roll);
      }
      break;
    case "electronicsFactory":
      g.add(cyl(T, steel, hx + 0.1, H, hy + 0.1, 0.008, 0.45, 6));
      g.add(new T.Mesh(new T.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white));
      (g.children[g.children.length - 1] as THREE_NS.Mesh).position.set(hx + 0.3, H + 0.02, hy + 0.2);
      break;
    case "batteryFactory":
      for (let i = 0; i < 3; i++) {
        g.add(box(T, std(T, "#d9f99d", 0.3, 0.5), W - 0.75 + i * 0.22, 0.012, yardZ, 0.18, 0.14, 0.3));
        g.add(box(T, std(T, "#365314", 0.3, 0.5), W - 0.73 + i * 0.22, 0.05, yardZ + 0.3, 0.14, 0.04, 0.004));
      }
      break;
    case "assemblyPlant":
      // a test pad with a painted track loop
      g.add(box(T, asphalt, W - 1.1 * s, 0.014, yardZ - 0.05, 1.0 * s, 0.004, 0.45));
      g.add(box(T, white, W - 1.05 * s, 0.019, yardZ + 0.15, 0.9 * s, 0.001, 0.01));
      break;
  }
  // safety bollards and a lamp post at the gate
  for (let i = 0; i < 4; i++) g.add(cyl(T, yellow, 0.1 + i * 0.12, 0.012, spec.dockFront ? D - 0.08 : 0.08, 0.012, 0.05, 8));

  root.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return root;
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return "#" + ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
