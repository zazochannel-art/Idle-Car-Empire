// The inside of a plant, as data: halls, production lines, stations, people,
// robots and vehicles, all derived from the plant's real state (level,
// automation, manager). Nothing here is saved: the interior grows because
// the plant grows. Units are tiles; x runs along the production line (raw
// material in on the left, finished goods out on the right), y runs across
// the halls (one hall per line, a forklift aisle in front).
//
// The first plant with its own interior is the Body Works; the same shape
// (a list of stations along a line) is meant for every other plant.

export type StationId = "rawStore" | "cutting" | "press" | "welding" | "assembly" | "qc" | "finished";
/** Which of the plant's real upgrades a station stands for. */
export type StationUpgrade = "level" | "speed" | "automation" | "grade";
/** The 3D machine drawn at a station. */
export type StationMachine = "sheetRack" | "laserCutter" | "press" | "welder" | "bodyJig" | "qcTunnel" | "bodyRack";

export interface StationDef {
  id: StationId;
  /** Left edge and width along the line (tiles). */
  x: number;
  w: number;
  machine: StationMachine;
  /** Plant level that installs the station (before: an empty, marked bay). */
  unlock: number;
  upgrade: StationUpgrade;
  icon: string;
  /** Automation tier from which robots work here instead of people. */
  robotsFrom: number;
}

/** Body Works: steel coils in, finished car bodies out. */
export const BODY_STATIONS: StationDef[] = [
  { id: "rawStore", x: 0.8, w: 3, machine: "sheetRack", unlock: 1, upgrade: "level", icon: "📦", robotsFrom: 99 },
  { id: "cutting", x: 4.5, w: 3, machine: "laserCutter", unlock: 1, upgrade: "speed", icon: "⚙️", robotsFrom: 3 },
  { id: "press", x: 8, w: 3, machine: "press", unlock: 2, upgrade: "speed", icon: "🔩", robotsFrom: 2 },
  { id: "welding", x: 11.5, w: 3, machine: "welder", unlock: 1, upgrade: "automation", icon: "🤖", robotsFrom: 1 },
  { id: "assembly", x: 15, w: 3, machine: "bodyJig", unlock: 3, upgrade: "automation", icon: "🚗", robotsFrom: 2 },
  { id: "qc", x: 18.5, w: 3, machine: "qcTunnel", unlock: 4, upgrade: "grade", icon: "🔍", robotsFrom: 4 },
  { id: "finished", x: 22, w: 3.2, machine: "bodyRack", unlock: 1, upgrade: "level", icon: "📦", robotsFrom: 99 },
];

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
  tool: "torch" | "gripper" | "suction" | "spray";
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

const stationMode = (def: StationDef, s: InteriorSpec): StationMode => {
  if (s.level < def.unlock) return "planned";
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
    const stations: PlacedStation[] = defs.map((def) => ({
      def,
      line: i,
      x: def.x,
      y: y0 + 0.5,
      w: def.w,
      d: 1.3,
      mode: stationMode(def, spec),
      stop: { x: def.x + def.w / 2, y: belt },
    }));
    lines.push({ index: i, y0, belt, conveyor: level >= CONVEYOR_LEVEL, stations });

    // people and robots work in front of the line
    const front = belt + 1.25;
    for (const st of stations) {
      const cx = st.x + st.w / 2;
      const id = st.def.id;
      if (st.mode === "planned") continue;
      if (id === "rawStore" || id === "finished") continue;
      if (st.mode === "robot") {
        const tool = id === "welding" ? "torch" : id === "press" ? "gripper" : id === "assembly" ? "torch" : id === "cutting" ? "suction" : "spray";
        robots.push({ x: cx - 0.7, y: front - 0.2, station: id, line: i, tool });
        // big lines get a robot on both sides of the busiest stations
        if ((id === "welding" || id === "assembly") && (level >= 8 || auto >= 3)) robots.push({ x: cx + 0.7, y: front - 0.2, station: id, line: i, tool });
        // someone still watches the robots until the plant runs itself
        if (auto < 4 && id === "welding") people.push({ x: cx + 1.2, y: front + 0.6, role: "supervisor", line: i });
      } else {
        const role = id === "welding" ? "welder" : id === "qc" ? "inspector" : "worker";
        people.push({ x: cx - 0.2, y: front, role, station: id, line: i });
        // two people on the heavy stations once the plant grows
        if ((id === "welding" || id === "press" || id === "assembly") && level >= 2) people.push({ x: cx + 0.6, y: front + 0.1, role, station: id, line: i });
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

/** The stations a unit actually stops at on a line, in order. */
export function lineStops(line: Line): PlacedStation[] {
  return line.stations.filter((s) => s.mode !== "planned");
}
