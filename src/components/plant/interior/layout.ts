// The inside of a plant, as data: halls, production lines, stations, people,
// robots and vehicles, all derived from the plant's real state (level,
// automation, manager). Nothing here is saved: the interior grows because
// the plant grows. Units are tiles; x runs along the production line (raw
// material in on the left, finished goods out on the right), y runs across
// the halls (one hall per line, a forklift aisle in front).
//
// Every plant has the same shape (a store, four process steps, quality
// control and a finished-goods store along one line); a recipe says which
// machine stands at each step and what the part looks like after it.

/** Station ids double as i18n keys (`interior.station.<id>`, `interior.desc.<id>`). */
export type StationId = string;
/** Which of the plant's real upgrades a station stands for. */
export type StationUpgrade = "level" | "speed" | "automation" | "grade";
/** The 3D machine drawn at a station. */
export type StationMachine =
  | "sheetRack"
  | "laserCutter"
  | "press"
  | "welder"
  | "bodyJig"
  | "qcTunnel"
  | "bodyRack"
  | "rawRack"
  | "goodsRack"
  | "furnace"
  | "cnc"
  | "mixer"
  | "extruder"
  | "curing"
  | "sewing"
  | "sprayBooth"
  | "smt"
  | "assemblyStand"
  | "filler"
  | "testBench";
/** What rides the line after a station (or "car": a car body at an assembly stage). */
export type PartKind =
  | "coil"
  | "blank"
  | "panel"
  | "frame"
  | "ingot"
  | "casting"
  | "block"
  | "engine"
  | "bale"
  | "slab"
  | "strip"
  | "greenTire"
  | "tire"
  | "roll"
  | "fabricCut"
  | "cover"
  | "cushion"
  | "seat"
  | "bar"
  | "spring"
  | "arm"
  | "strut"
  | "sack"
  | "cullet"
  | "glassSheet"
  | "windshield"
  | "drum"
  | "tote"
  | "can"
  | "reel"
  | "pcbBare"
  | "pcb"
  | "module"
  | "electrode"
  | "cell"
  | "pack";
export type PropKind = "sheetPallet" | "partsCage" | "dieBlock" | "toolCabinet" | "binRack" | "drumPallet" | "boxPallet";
export type RobotTool = "torch" | "gripper" | "suction" | "spray";
/** A floor effect while the station works. */
export type StationFx = "sparks" | "laser" | "scan" | "heat" | "spray";

export interface StationDef {
  id: StationId;
  /** Left edge and width along the line (tiles). */
  x: number;
  w: number;
  machine: StationMachine;
  /** Machine variant (rack stock, stand type…). */
  variant?: string;
  /** Plant level that installs the station (before: an empty, marked bay). */
  unlock: number;
  upgrade: StationUpgrade;
  icon: string;
  /** Automation tier from which robots work here instead of people. */
  robotsFrom: number;
  /** What the part looks like when it leaves the station; `stage` for car bodies. */
  part: PartKind | "car";
  stage?: number;
  /** People at the station (0 stores, 1, 2 heavy work) and their job. */
  staff: 0 | 1 | 2;
  role?: "worker" | "welder" | "inspector";
  /** The robot's tool; "embedded" robots are part of the machine model. */
  tool?: RobotTool;
  robot?: "floor" | "reach" | "embedded";
  fx?: StationFx;
  props?: PropKind[];
}

/** The seven bays along every line. */
const SLOTS: [number, number][] = [
  [0.8, 3],
  [4.5, 3],
  [8, 3],
  [11.5, 3],
  [15, 3],
  [18.5, 3],
  [22, 3.2],
];

type Step = Omit<StationDef, "x" | "w">;
const line7 = (steps: Step[]): StationDef[] => steps.map((s, i) => ({ ...s, x: SLOTS[i][0], w: SLOTS[i][1] }));

/** A store at either end of the line (raw material in, finished goods out). */
const store = (id: string, machine: StationMachine, part: PartKind | "car", variant?: string, props?: PropKind[], stage?: number): Step => ({
  id,
  machine,
  variant,
  unlock: 1,
  upgrade: "level",
  icon: "📦",
  robotsFrom: 99,
  part,
  stage,
  staff: 0,
  props,
});
const qc = (part: PartKind | "car", machine: StationMachine = "qcTunnel", stage?: number): Step => ({
  id: "qc",
  machine,
  unlock: 4,
  upgrade: "grade",
  icon: "🔍",
  robotsFrom: 4,
  part,
  stage,
  staff: 1,
  role: "inspector",
  tool: "spray",
  robot: "floor",
  fx: "scan",
  props: ["toolCabinet", "binRack"],
});

export const RECIPES: Record<string, StationDef[]> = {
  // steel coils → blanks → pressed panels → welded underbody → body in white
  bodyWorks: line7([
    store("rawStore", "sheetRack", "coil", undefined, ["sheetPallet", "sheetPallet"]),
    { id: "cutting", machine: "laserCutter", unlock: 1, upgrade: "speed", icon: "⚙️", robotsFrom: 3, part: "blank", staff: 1, tool: "suction", robot: "embedded", fx: "laser", props: ["sheetPallet", "binRack"] },
    { id: "press", machine: "press", unlock: 2, upgrade: "speed", icon: "🔩", robotsFrom: 2, part: "panel", staff: 2, tool: "gripper", robot: "embedded", props: ["dieBlock", "dieBlock"] },
    { id: "welding", machine: "welder", unlock: 1, upgrade: "automation", icon: "🤖", robotsFrom: 1, part: "frame", staff: 2, role: "welder", tool: "torch", robot: "reach", fx: "sparks", props: ["partsCage", "partsCage"] },
    { id: "assembly", machine: "bodyJig", unlock: 3, upgrade: "automation", icon: "🚗", robotsFrom: 2, part: "car", stage: 0, staff: 2, tool: "torch", robot: "reach", fx: "sparks", props: ["partsCage", "toolCabinet"] },
    qc("car", "qcTunnel", 0),
    store("finished", "bodyRack", "car", undefined, undefined, 0),
  ]),
  // ingots → cast blocks → machined blocks → assembled, painted, tested engines
  engineFactory: line7([
    store("rawStore", "rawRack", "ingot", "ingot", ["drumPallet", "boxPallet"]),
    { id: "casting", machine: "furnace", unlock: 1, upgrade: "speed", icon: "🔥", robotsFrom: 3, part: "casting", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["dieBlock", "drumPallet"] },
    { id: "machining", machine: "cnc", unlock: 2, upgrade: "speed", icon: "⚙️", robotsFrom: 2, part: "block", staff: 1, tool: "gripper", robot: "floor", props: ["binRack", "toolCabinet"] },
    { id: "engineAsm", machine: "assemblyStand", variant: "engine", unlock: 1, upgrade: "automation", icon: "🔧", robotsFrom: 1, part: "engine", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "binRack"] },
    { id: "enginePaint", machine: "sprayBooth", unlock: 3, upgrade: "automation", icon: "🎨", robotsFrom: 2, part: "engine", staff: 1, tool: "spray", robot: "embedded", fx: "spray", props: ["drumPallet", "toolCabinet"] },
    qc("engine", "testBench"),
    store("goods", "goodsRack", "engine"),
  ]),
  // rubber bales → mixed compound → treads → green tyres → cured tyres
  tireFactory: line7([
    store("rawStore", "rawRack", "bale", "bale", ["boxPallet", "boxPallet"]),
    { id: "mixing", machine: "mixer", unlock: 1, upgrade: "speed", icon: "🌀", robotsFrom: 3, part: "slab", staff: 1, tool: "gripper", robot: "floor", props: ["drumPallet", "boxPallet"] },
    { id: "extrusion", machine: "extruder", unlock: 2, upgrade: "speed", icon: "➰", robotsFrom: 2, part: "strip", staff: 1, tool: "gripper", robot: "floor", props: ["binRack", "boxPallet"] },
    { id: "tireBuild", machine: "assemblyStand", variant: "drum", unlock: 1, upgrade: "automation", icon: "🛞", robotsFrom: 1, part: "greenTire", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "binRack"] },
    { id: "curing", machine: "curing", unlock: 3, upgrade: "automation", icon: "♨️", robotsFrom: 2, part: "tire", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["dieBlock", "toolCabinet"] },
    qc("tire"),
    store("goods", "goodsRack", "tire"),
  ]),
  // fabric rolls → cut panels → sewn covers → foamed cushions → seats
  interiorFactory: line7([
    store("rawStore", "rawRack", "roll", "reel", ["boxPallet", "boxPallet"]),
    { id: "fabricCut", machine: "laserCutter", unlock: 1, upgrade: "speed", icon: "✂️", robotsFrom: 3, part: "fabricCut", staff: 1, tool: "suction", robot: "embedded", fx: "laser", props: ["boxPallet", "binRack"] },
    { id: "sewing", machine: "sewing", unlock: 2, upgrade: "speed", icon: "🧵", robotsFrom: 2, part: "cover", staff: 2, tool: "gripper", robot: "floor", props: ["binRack", "boxPallet"] },
    { id: "foaming", machine: "press", unlock: 1, upgrade: "automation", icon: "🧽", robotsFrom: 1, part: "cushion", staff: 1, tool: "gripper", robot: "embedded", fx: "heat", props: ["drumPallet", "drumPallet"] },
    { id: "seatAsm", machine: "assemblyStand", variant: "seat", unlock: 3, upgrade: "automation", icon: "💺", robotsFrom: 2, part: "seat", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "toolCabinet"] },
    qc("seat"),
    store("goods", "goodsRack", "seat"),
  ]),
  // alloy bars → coiled springs → forged arms → welded struts → painted struts
  suspensionFactory: line7([
    store("rawStore", "rawRack", "bar", "bar", ["sheetPallet", "boxPallet"]),
    { id: "coiling", machine: "cnc", unlock: 1, upgrade: "speed", icon: "🌀", robotsFrom: 3, part: "spring", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["binRack", "drumPallet"] },
    { id: "forging", machine: "press", unlock: 2, upgrade: "speed", icon: "🔨", robotsFrom: 2, part: "arm", staff: 2, tool: "gripper", robot: "embedded", fx: "heat", props: ["dieBlock", "dieBlock"] },
    { id: "strutWeld", machine: "welder", unlock: 1, upgrade: "automation", icon: "🤖", robotsFrom: 1, part: "strut", staff: 2, role: "welder", tool: "torch", robot: "reach", fx: "sparks", props: ["partsCage", "partsCage"] },
    { id: "coating", machine: "sprayBooth", unlock: 3, upgrade: "automation", icon: "🎨", robotsFrom: 2, part: "strut", staff: 1, tool: "spray", robot: "embedded", fx: "spray", props: ["drumPallet", "toolCabinet"] },
    qc("strut"),
    store("goods", "goodsRack", "strut"),
  ]),
  // sand → glass batch → float glass → bent windscreens → tempered glass
  glassFactory: line7([
    store("rawStore", "rawRack", "sack", "sack", ["boxPallet", "boxPallet"]),
    { id: "batching", machine: "mixer", unlock: 1, upgrade: "speed", icon: "⚗️", robotsFrom: 3, part: "cullet", staff: 1, tool: "gripper", robot: "floor", props: ["drumPallet", "boxPallet"] },
    { id: "melting", machine: "furnace", unlock: 2, upgrade: "speed", icon: "🔥", robotsFrom: 2, part: "glassSheet", staff: 1, tool: "suction", robot: "floor", fx: "heat", props: ["toolCabinet", "drumPallet"] },
    { id: "bending", machine: "press", unlock: 1, upgrade: "automation", icon: "🪟", robotsFrom: 1, part: "windshield", staff: 2, tool: "suction", robot: "embedded", fx: "heat", props: ["dieBlock", "binRack"] },
    { id: "tempering", machine: "furnace", variant: "tunnel", unlock: 3, upgrade: "automation", icon: "♨️", robotsFrom: 2, part: "windshield", staff: 1, tool: "suction", robot: "floor", fx: "heat", props: ["toolCabinet", "boxPallet"] },
    qc("windshield"),
    store("goods", "goodsRack", "windshield"),
  ]),
  // pigment drums → premix → milled paint → tinted → filled cans
  paintFactory: line7([
    store("rawStore", "rawRack", "drum", "drum", ["drumPallet", "drumPallet"]),
    { id: "premix", machine: "mixer", unlock: 1, upgrade: "speed", icon: "🌀", robotsFrom: 3, part: "tote", staff: 1, tool: "gripper", robot: "floor", props: ["drumPallet", "boxPallet"] },
    { id: "milling", machine: "extruder", variant: "mill", unlock: 2, upgrade: "speed", icon: "⚙️", robotsFrom: 2, part: "tote", staff: 1, tool: "gripper", robot: "floor", props: ["drumPallet", "binRack"] },
    { id: "tinting", machine: "mixer", variant: "lab", unlock: 1, upgrade: "automation", icon: "🎨", robotsFrom: 1, part: "tote", staff: 1, role: "inspector", tool: "gripper", robot: "reach", props: ["binRack", "toolCabinet"] },
    { id: "filling", machine: "filler", unlock: 3, upgrade: "automation", icon: "🥫", robotsFrom: 2, part: "can", staff: 1, tool: "gripper", robot: "floor", props: ["boxPallet", "boxPallet"] },
    qc("can"),
    store("goods", "goodsRack", "can"),
  ]),
  // chip reels → printed boards → placed components → reflow → modules
  electronicsFactory: line7([
    store("rawStore", "rawRack", "reel", "chips", ["binRack", "boxPallet"]),
    { id: "printing", machine: "smt", variant: "printer", unlock: 1, upgrade: "speed", icon: "🖨️", robotsFrom: 3, part: "pcbBare", staff: 1, tool: "suction", robot: "floor", props: ["binRack", "boxPallet"] },
    { id: "placement", machine: "smt", unlock: 2, upgrade: "speed", icon: "🔌", robotsFrom: 2, part: "pcb", staff: 1, tool: "suction", robot: "floor", props: ["binRack", "binRack"] },
    { id: "reflow", machine: "furnace", variant: "tunnel", unlock: 1, upgrade: "automation", icon: "♨️", robotsFrom: 1, part: "pcb", staff: 1, tool: "suction", robot: "floor", fx: "heat", props: ["toolCabinet", "boxPallet"] },
    { id: "moduleAsm", machine: "assemblyStand", variant: "bench", unlock: 3, upgrade: "automation", icon: "🧩", robotsFrom: 2, part: "module", staff: 2, tool: "suction", robot: "reach", props: ["partsCage", "binRack"] },
    qc("module"),
    store("goods", "goodsRack", "module"),
  ]),
  // lithium drums → coated electrodes → cells → laser-welded modules → packs
  batteryFactory: line7([
    store("rawStore", "rawRack", "drum", "drum", ["drumPallet", "drumPallet"]),
    { id: "electrode", machine: "extruder", variant: "coater", unlock: 1, upgrade: "speed", icon: "🎞️", robotsFrom: 3, part: "electrode", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["drumPallet", "boxPallet"] },
    { id: "cellAsm", machine: "bodyJig", unlock: 2, upgrade: "speed", icon: "🔋", robotsFrom: 2, part: "cell", staff: 1, tool: "suction", robot: "reach", props: ["binRack", "boxPallet"] },
    { id: "moduleWeld", machine: "welder", unlock: 1, upgrade: "automation", icon: "⚡", robotsFrom: 1, part: "module", staff: 2, role: "welder", tool: "torch", robot: "reach", fx: "laser", props: ["partsCage", "partsCage"] },
    { id: "packAsm", machine: "assemblyStand", variant: "pack", unlock: 3, upgrade: "automation", icon: "🧰", robotsFrom: 2, part: "pack", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "toolCabinet"] },
    qc("pack", "testBench"),
    store("goods", "goodsRack", "pack"),
  ]),
  // steel bars → cut gears → hardened → shafts assembled → tested gearboxes
  transmissionFactory: line7([
    store("rawStore", "rawRack", "bar", "bar", ["sheetPallet", "boxPallet"]),
    { id: "gearCut", machine: "cnc", unlock: 1, upgrade: "speed", icon: "⚙️", robotsFrom: 3, part: "spring", staff: 1, tool: "gripper", robot: "floor", props: ["binRack", "toolCabinet"] },
    { id: "hardening", machine: "furnace", variant: "tunnel", unlock: 2, upgrade: "speed", icon: "🔥", robotsFrom: 2, part: "arm", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["drumPallet", "dieBlock"] },
    { id: "gearboxAsm", machine: "assemblyStand", variant: "engine", unlock: 1, upgrade: "automation", icon: "🕹️", robotsFrom: 1, part: "block", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "binRack"] },
    { id: "gearboxFill", machine: "filler", unlock: 3, upgrade: "automation", icon: "🛢️", robotsFrom: 2, part: "block", staff: 1, tool: "gripper", robot: "floor", props: ["drumPallet", "boxPallet"] },
    qc("block", "testBench"),
    store("goods", "goodsRack", "block"),
  ]),
  // alloy ingots → cast rims → machined → painted → balanced wheels
  wheelFactory: line7([
    store("rawStore", "rawRack", "ingot", "ingot", ["drumPallet", "boxPallet"]),
    { id: "rimCast", machine: "furnace", unlock: 1, upgrade: "speed", icon: "🔥", robotsFrom: 3, part: "casting", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["dieBlock", "drumPallet"] },
    { id: "rimTurn", machine: "cnc", unlock: 2, upgrade: "speed", icon: "⭕", robotsFrom: 2, part: "tire", staff: 1, tool: "gripper", robot: "floor", props: ["binRack", "toolCabinet"] },
    { id: "rimPaint", machine: "sprayBooth", unlock: 1, upgrade: "automation", icon: "🎨", robotsFrom: 1, part: "tire", staff: 1, tool: "spray", robot: "embedded", fx: "spray", props: ["drumPallet", "toolCabinet"] },
    { id: "balancing", machine: "assemblyStand", variant: "drum", unlock: 3, upgrade: "automation", icon: "⚖️", robotsFrom: 2, part: "tire", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "binRack"] },
    qc("tire"),
    store("goods", "goodsRack", "tire"),
  ]),
  // iron → cast discs → machined → calipers fitted → bench-tested brake kits
  brakeFactory: line7([
    store("rawStore", "rawRack", "ingot", "ingot", ["drumPallet", "boxPallet"]),
    { id: "discCast", machine: "furnace", unlock: 1, upgrade: "speed", icon: "🔥", robotsFrom: 3, part: "casting", staff: 1, tool: "gripper", robot: "floor", fx: "heat", props: ["dieBlock", "drumPallet"] },
    { id: "discMachine", machine: "cnc", unlock: 2, upgrade: "speed", icon: "⚙️", robotsFrom: 2, part: "arm", staff: 1, tool: "gripper", robot: "floor", props: ["binRack", "toolCabinet"] },
    { id: "padPress", machine: "press", unlock: 1, upgrade: "automation", icon: "🧱", robotsFrom: 1, part: "arm", staff: 2, tool: "gripper", robot: "embedded", fx: "heat", props: ["dieBlock", "binRack"] },
    { id: "caliperAsm", machine: "assemblyStand", variant: "bench", unlock: 3, upgrade: "automation", icon: "🛑", robotsFrom: 2, part: "strut", staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "toolCabinet"] },
    qc("strut", "testBench"),
    store("goods", "goodsRack", "strut"),
  ]),
  // the car takes shape: body → powertrain → interior and glass → wheels → paint and finish
  assemblyPlant: line7([
    store("bodyStore", "bodyRack", "car", undefined, ["partsCage", "partsCage"], 0),
    { id: "powertrain", machine: "assemblyStand", variant: "marriage", unlock: 1, upgrade: "speed", icon: "⚙️", robotsFrom: 3, part: "car", stage: 2, staff: 2, tool: "gripper", robot: "reach", props: ["partsCage", "binRack"] },
    { id: "trim", machine: "assemblyStand", variant: "trim", unlock: 2, upgrade: "speed", icon: "💺", robotsFrom: 2, part: "car", stage: 4, staff: 2, tool: "suction", robot: "reach", props: ["boxPallet", "binRack"] },
    { id: "wheels", machine: "bodyJig", unlock: 1, upgrade: "automation", icon: "🛞", robotsFrom: 1, part: "car", stage: 5, staff: 2, tool: "gripper", robot: "reach", props: ["boxPallet", "partsCage"] },
    { id: "finish", machine: "sprayBooth", unlock: 3, upgrade: "automation", icon: "🎨", robotsFrom: 2, part: "car", stage: 7, staff: 1, tool: "spray", robot: "embedded", fx: "spray", props: ["drumPallet", "toolCabinet"] },
    qc("car", "qcTunnel", 8),
    store("carPark", "bodyRack", "car", "cars", undefined, 8),
  ]),
};

/** Body Works: steel coils in, finished car bodies out. */
export const BODY_STATIONS = RECIPES.bodyWorks;

/** The recipe for a plant type (any plant without its own falls back to the Body Works). */
export const recipeFor = (type: string): StationDef[] => RECIPES[type] ?? BODY_STATIONS;

/** Plant level at which each production hall (and its line) opens. */
export const HALL_LEVELS = [1, 5, 10, 13];
/** Depth of one hall (tiles) and the margin before the first one. */
export const HALL_D = 5;
const TOP = 1.4;
/** The whole building (every hall unlocked), so locked space shows too. */
export const HALL_W = 26;
export const HALL_DEPTH = TOP + HALL_LEVELS.length * HALL_D + 3.4;
/** Plant level from which units ride a conveyor (before: carried bench to bench). */
export const CONVEYOR_LEVEL = 3;

export interface InteriorSpec {
  level: number;
  /** 0 Manual … 4 AI Factory. */
  automation: number;
  /** A manager runs this plant. */
  manager: boolean;
  /**
   * The Body Works shop floor: how many of the line's machines are built and
   * staffed, in line order (absent: machines open with the plant level).
   */
  floor?: { machines: number; workers: number };
}

export type StationMode = "planned" | "manual" | "robot";

export interface PlacedStation {
  def: StationDef;
  line: number;
  /** Footprint (tiles). */
  x: number;
  y: number;
  w: number;
  d: number;
  mode: StationMode;
  /** Its place among the line's machines (stores have none). */
  slot?: number;
  /** An operator runs it (always, unless the shop floor says otherwise). */
  staffed: boolean;
  /** Where a unit stops on the line at this station. */
  stop: { x: number; y: number };
}

export interface Person {
  x: number;
  y: number;
  role: "worker" | "welder" | "inspector" | "driver" | "supervisor" | "manager";
  /** Station it works at (for the work animation), if any. */
  station?: StationId;
  line: number;
}

export interface Robot {
  x: number;
  y: number;
  station: StationId;
  line: number;
  tool: RobotTool;
  /** Reaches over the part from the front of the line (welding, framing). */
  reach: boolean;
}

export interface Line {
  index: number;
  /** Hall rectangle. */
  y0: number;
  /** The conveyor (or the bench row) runs along y = belt. */
  belt: number;
  conveyor: boolean;
  stations: PlacedStation[];
}

export interface Interior {
  w: number;
  d: number;
  lines: Line[];
  /** Halls not built yet, with the level that opens them. */
  locked: { y0: number; level: number }[];
  people: Person[];
  robots: Robot[];
  /** The aisle in front of the halls: forklifts (or robot carts from automation 3). */
  aisle: { y: number; agv: boolean; vehicles: number };
  /** An overhead crane over the storage bays (big plants). */
  crane: boolean;
  /** Glass office where the manager works. */
  office: { x: number; y: number; w: number; d: number };
  gates: { inX: number; outX: number; y: number };
}

const stationMode = (def: StationDef, s: InteriorSpec, slot: number | undefined): StationMode => {
  const built = s.floor && slot !== undefined ? slot < s.floor.machines : s.level >= def.unlock;
  if (!built) return "planned";
  if (def.robotsFrom <= s.automation || (s.level >= 10 && def.robotsFrom <= 2 && s.automation >= 1)) return "robot";
  return "manual";
};

export function interiorLayout(s: InteriorSpec, defs: StationDef[] = BODY_STATIONS): Interior {
  const level = Math.max(1, s.level);
  const auto = Math.max(0, Math.min(4, s.automation));
  const spec = { ...s, level, automation: auto };
  const open = HALL_LEVELS.filter((l) => level >= l).length;
  const lines: Line[] = [];
  const people: Person[] = [];
  const robots: Robot[] = [];
  for (let i = 0; i < open; i++) {
    const y0 = TOP + i * HALL_D;
    const belt = y0 + 2.2;
    const stations: PlacedStation[] = defs.map((def) => {
      const slot = machineSlot(defs, def);
      const mode = stationMode(def, spec, slot);
      const staffed = mode !== "planned" && (!s.floor || slot === undefined || slot < s.floor.workers);
      return { def, line: i, x: def.x, y: y0 + 0.5, w: def.w, d: 1.3, mode, slot, staffed, stop: { x: def.x + def.w / 2, y: belt } };
    });
    lines.push({ index: i, y0, belt, conveyor: level >= CONVEYOR_LEVEL, stations });

    // people and robots work in front of the line
    const front = belt + 1.25;
    let watched = false;
    for (const st of stations) {
      const cx = st.x + st.w / 2;
      const d = st.def;
      if (st.mode === "planned" || d.staff === 0) continue;
      // a machine without an operator: nobody stands at it (robots stay, they are the automation)
      if (!st.staffed && st.mode !== "robot") continue;
      if (st.mode === "robot") {
        const tool = d.tool ?? "gripper";
        const reach = d.robot === "reach";
        if (d.robot !== "embedded") robots.push({ x: cx - 0.7, y: front - 0.2, station: d.id, line: i, tool, reach });
        // big lines get a robot on both sides of the busiest stations
        if (reach && (level >= 8 || auto >= 3)) robots.push({ x: cx + 0.7, y: front - 0.2, station: d.id, line: i, tool, reach });
        // on the Body Works shop floor every staffed robot cell has its operator
        if (s.floor && st.staffed) people.push({ x: cx + 1.15, y: front + 0.6, role: "supervisor", station: d.id, line: i });
        // someone still watches the robots until the plant runs itself
        else if (!s.floor && auto < 4 && !watched && reach) {
          people.push({ x: cx + 1.2, y: front + 0.6, role: "supervisor", line: i });
          watched = true;
        }
      } else {
        const role = d.role ?? "worker";
        people.push({ x: cx - 0.2, y: front, role, station: d.id, line: i });
        // two people on the heavy stations once the plant grows
        if (d.staff === 2 && level >= 2) people.push({ x: cx + 0.6, y: front + 0.1, role, station: d.id, line: i });
      }
    }
  }
  const aisleY = TOP + HALL_LEVELS.length * HALL_D + 1.2;
  const agv = auto >= 3;
  const vehicles = Math.min(4, 1 + Math.floor(open / 2) + (level >= 8 ? 1 : 0));
  if (!agv) for (let k = 0; k < vehicles; k++) people.push({ x: 0, y: aisleY, role: "driver", line: -1 });
  const office = { x: HALL_W - 4.2, y: aisleY + 0.4, w: 3.4, d: 1.7 };
  if (s.manager) people.push({ x: office.x - 0.8, y: office.y + 0.8, role: "manager", line: -1 });
  return {
    w: HALL_W,
    d: HALL_DEPTH,
    lines,
    locked: HALL_LEVELS.slice(open).map((lv, k) => ({ y0: TOP + (open + k) * HALL_D, level: lv })),
    people,
    robots,
    aisle: { y: aisleY, agv, vehicles },
    crane: level >= 10,
    office,
    gates: { inX: 0, outX: HALL_W, y: aisleY },
  };
}

/** A station's place among the line's machines (0 the first after the raw store); undefined for the stores. */
export function machineSlot(defs: StationDef[], def: StationDef): number | undefined {
  if (def.staff === 0) return undefined;
  const k = defs.filter((d) => d.staff > 0).indexOf(def);
  return k < 0 ? undefined : k;
}

/** The stations a unit actually stops at on a line, in order. */
export function lineStops(line: Line): PlacedStation[] {
  return line.stations.filter((s) => s.mode !== "planned");
}
