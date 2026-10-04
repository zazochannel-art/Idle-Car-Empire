// CAR DNA: everything one car is, worked out from the parts actually fitted
// to it (the grade each factory made), its Design studio options and its
// racing development. The racing stats (racing.statsOf) are the physics; the
// DNA names the parts and turns the stats into real-world figures, which the
// Test Track measures. One source of truth: dealers, racing and the test
// track all read the same car.
import { CAR_BY_ID, type CarConfig } from "../config/cars";
import { RACE_UPGRADES } from "../config/racing";
import type { TechId } from "../config/tech";
import type { CarId, ComponentId, GameState, RaceCarState } from "../types";
import { carStdCost, assemblyTime } from "./costs";
import { bestGrade, recipe, supplied, suppliedGrade } from "./chain";
import { carStats, carTech, rating, statsOf, type RaceStats } from "./racing";

/** Names of the parts by grade (1–5). */
const TIER = ["Standard", "Tuned", "Sport", "Performance", "Racing"] as const;
const TIRES = ["Eco", "Touring", "Sport", "Performance", "Semi-slick"] as const;
const CHASSIS = ["Steel monocoque", "High-strength steel", "Aluminium", "Aluminium + carbon", "Carbon tub"] as const;
const BRAKES = ["Drum / disc", "Disc", "Ventilated disc", "Drilled 6-piston", "Carbon-ceramic"] as const;
const LIGHTS = ["Halogen", "LED", "Adaptive LED", "Matrix LED", "Laser"] as const;
const SUSPENSION = ["MacPherson", "Multi-link", "Sport multi-link", "Adaptive dampers", "Double wishbone"] as const;
const INTERIOR = ["Cloth", "Comfort cloth", "Leatherette", "Leather", "Alcantara & carbon"] as const;
const GLASS = ["Laminated", "Acoustic", "Heated", "Solar control", "Lightweight polycarbonate"] as const;
const WHEELS = ['Steel 15"', 'Alloy 17"', 'Alloy 18"', 'Forged 19"', 'Forged 20"'] as const;
const PAINT = ["Solid", "Metallic", "Pearl", "Matte", "Candy"] as const;

export interface CarDNA {
  car: CarId;
  model: string;
  /** Engine: name, power and torque. */
  engine: string;
  hp: number;
  torque: number;
  weight: number;
  body: string;
  chassis: string;
  suspension: string;
  brakes: string;
  tires: string;
  wheels: string;
  /** Aerodynamics (0–100). */
  aero: number;
  gearbox: string;
  interior: string;
  glass: string;
  lights: string;
  paint: string;
  /** Build quality and reliability (0–100). */
  quality: number;
  reliability: number;
  /** What it costs to make and how long the line takes (s). */
  cost: number;
  time: number;
  /** What it is worth now. */
  value: number;
  /** Racing performance on a circuit (≈ 0–1000) and the stats behind it. */
  performance: number;
  stats: RaceStats;
  /** What the brand adds to its price (reputation, 0.9–1.1). */
  brand: number;
  /** R&D technologies built in. */
  tech: TechId[];
}

const g5 = (g: number) => Math.max(0, Math.min(4, Math.round(g) - 1));
const gradeOf = (grades: Partial<Record<ComponentId, number>>, c: ComponentId, dflt: number) => Math.max(1, grades[c] ?? dflt);

/** Engine name: the platform's engine with the Engine Factory's grade. */
function engineName(cfg: CarConfig, g: number, turboed: boolean): string {
  const turbo = turboed && !/Turbo|Electric/.test(cfg.engine) ? " Turbo" : "";
  return `${cfg.engine}${turbo} ${TIER[g5(g)]}`;
}

/** Torque (Nm) from power and the kind of engine: electric motors and turbos pull hardest low down. */
export function torqueOf(cfg: CarConfig, hp: number, turbo: boolean): number {
  const k = cfg.engine === "Electric" ? 1.9 : turbo || /Turbo/.test(cfg.engine) ? 1.55 : /V8|V12|Flat/.test(cfg.engine) ? 1.35 : 1.25;
  return Math.round(hp * k);
}

function gearboxOf(cfg: CarConfig, g: number, upg: number): string {
  if (cfg.engine === "Electric") return "Single-speed";
  const level = g5(g) + upg;
  return level <= 0 ? "5-speed manual" : level === 1 ? "6-speed manual" : level === 2 ? "8-speed automatic" : "7-speed dual-clutch";
}

export interface DnaInput {
  car: CarId;
  grades: Partial<Record<ComponentId, number>>;
  design: { hp: number; quality: number; design: number; rims?: number; paint?: number; color?: string };
  upgrades: RaceCarState["upgrades"];
  wear?: RaceCarState["wear"];
  value: number;
  name?: string;
  rep?: number;
  tech?: TechId[];
}

/** The full DNA of a car from what went into it. */
export function dnaOf(x: DnaInput): CarDNA {
  const cfg = CAR_BY_ID[x.car];
  const st = statsOf(x.car, x.grades, x.design, x.upgrades, x.wear, x.tech);
  const up = (u: (typeof RACE_UPGRADES)[number]) => x.upgrades[u] ?? 0;
  const ge = gradeOf(x.grades, "engine", cfg.grade);
  const gb = gradeOf(x.grades, "body", cfg.grade);
  const gt = gradeOf(x.grades, "tires", cfg.grade);
  const gs = gradeOf(x.grades, "suspension", Math.max(1, cfg.grade - 1));
  const gi = gradeOf(x.grades, "interior", Math.max(1, cfg.grade - 1));
  const gg = gradeOf(x.grades, "glass", Math.max(1, cfg.grade - 1));
  const gel = gradeOf(x.grades, "electronics", Math.max(1, cfg.grade - 1));
  const rims = x.design.rims ?? 0;
  // the drivetrain plants' work (older cars without them: what the tyres and suspension implied)
  const gtr = x.grades.transmission;
  const gw = x.grades.wheels;
  const gbr = x.grades.brakes;
  const parts = recipe(cfg);
  // a turbo kit, or an engine developed far enough to get one
  const turbo = up("turbo") >= 1 || up("engine") >= 2;
  return {
    car: x.car,
    model: x.name ?? cfg.name,
    engine: engineName(cfg, ge, turbo) + (x.tech?.includes("direct_injection") && cfg.engine !== "Electric" ? " DI" : "") + (up("ecu") ? ` · ECU ${up("ecu")}` : ""),
    hp: st.hp,
    torque: torqueOf(cfg, st.hp, turbo),
    weight: st.weight,
    body: cfg.body,
    chassis: x.tech?.includes("carbon_body") ? `${CHASSIS[g5(gb)]} + carbon panels` : CHASSIS[g5(gb)],
    suspension: SUSPENSION[g5(gs + Math.floor(up("suspension") / 2) + (x.tech?.includes("adaptive_dampers") ? 1 : 0))],
    brakes: BRAKES[g5((gbr ?? Math.max(gt, gs)) + Math.floor(up("brakes") / 2))],
    tires: TIRES[g5(gt + Math.floor(up("tires") / 2))],
    wheels: WHEELS[g5((gw ?? 1) + rims + (up("weight") >= 2 ? 1 : 0))],
    aero: Math.round(st.aero),
    gearbox: x.tech?.includes("dual_clutch") && cfg.engine !== "Electric" ? "7-speed dual-clutch" : gearboxOf(cfg, gtr ?? ge, up("transmission")),
    interior: INTERIOR[g5(gi)],
    glass: GLASS[g5(gg)],
    lights: LIGHTS[g5(parts.includes("electronics") ? gel + 1 : gel)],
    paint: PAINT[g5(1 + (x.design.paint ?? 0))],
    quality: Math.round(x.design.quality),
    reliability: Math.round(st.reliability),
    cost: carStdCost(cfg, parts),
    time: assemblyTime(cfg),
    value: x.value,
    performance: Math.round(rating(st, "circuit")),
    stats: st,
    brand: 1 + ((x.rep ?? 50) - 50) * 0.002,
    tech: x.tech ?? [],
  };
}

/** The DNA of a car in the collection. */
export function carDNA(s: GameState, rc: RaceCarState): CarDNA {
  const d = s.designs[rc.car];
  return dnaOf({
    car: rc.car,
    grades: rc.grades,
    design: { hp: rc.hp, quality: rc.quality, design: rc.design, rims: d?.rims, paint: d?.paint, color: d?.color },
    upgrades: rc.upgrades,
    wear: rc.wear,
    value: rc.value,
    name: d?.name,
    rep: s.quality?.rep,
    tech: rc.tech,
  });
}

// ───────────────────────────── test track ─────────────────────────────

export interface TestReport {
  /** Seconds. */
  zeroTo100: number;
  /** Seconds, or null if it can't reach 200 km/h. */
  zeroTo200: number | null;
  topSpeed: number;
  /** Metres from 100 km/h. */
  braking: number;
  /** Lateral grip in g. */
  cornering: number;
  handling: number;
  reliability: number;
  /** A lap of the test circuit (s). */
  lap: number;
  hp: number;
  weight: number;
}

/** What the timing gear measures: real-world figures from the car's stats. */
export function testFigures(st: RaceStats): TestReport {
  const pw = st.weight / Math.max(1, st.hp);
  // traction and gearing (accel stat) shave a little off
  const launch = Math.max(0.85, 1.12 - st.accel / 500);
  const zeroTo100 = Math.max(2.1, 1.6 * Math.pow(pw, 0.8) * launch);
  const topSpeed = Math.round(180 * Math.cbrt(st.hp / 100) * (0.92 + st.aero / 600));
  const zeroTo200 = topSpeed >= 210 ? zeroTo100 * (2.6 + 300 / Math.max(1, st.hp)) : null;
  return {
    zeroTo100: Math.round(zeroTo100 * 10) / 10,
    zeroTo200: zeroTo200 === null ? null : Math.round(zeroTo200 * 10) / 10,
    topSpeed,
    braking: Math.round((30 + (100 - st.braking) * 0.35) * 10) / 10,
    cornering: Math.round((0.7 + st.handling / 200) * 100) / 100,
    handling: Math.round(st.handling),
    reliability: Math.round(st.reliability),
    lap: Math.round((55 + 9000 / (rating(st, "timeTrial") + 100)) * 10) / 10,
    hp: st.hp,
    weight: st.weight,
  };
}

/** The test report of a car in the collection, as it is now (wear included). */
export const testCar = (rc: RaceCarState) => testFigures(carStats(rc));

/** A session at the Test Track: a fee, a little wear and mileage, and a report kept with the car. */
export const TEST_TRACK = { feeShare: 0.01, feeMin: 500, km: 30, wear: 0.02 };

export const testFee = (rc: RaceCarState) => Math.max(TEST_TRACK.feeMin, rc.value * TEST_TRACK.feeShare);

export function runTest(s: GameState, id: number): TestReport | null {
  const rc = s.racing.cars.find((c) => c.id === id);
  if (!rc || s.racing.live?.car === id || rc.location === "transit") return null;
  const fee = testFee(rc);
  if (s.cash < fee) return null;
  s.cash -= fee;
  rc.mileage = (rc.mileage ?? 0) + TEST_TRACK.km;
  rc.wear.tires = Math.max(0.05, rc.wear.tires - TEST_TRACK.wear);
  rc.wear.brakes = Math.max(0.05, rc.wear.brakes - TEST_TRACK.wear);
  // the report shows the car as it comes back in
  const report = testCar(rc);
  rc.test = report;
  return report;
}

// ───────────────────────────── the look of the build ─────────────────────────────

/** What a car looks like from the parts it got (3D model and assembly line). */
export interface BuildLookData {
  color: string;
  rims: "silver" | "black" | "dark" | "chrome";
  rimScale: number;
  engine: number;
  brakes: number;
  aero: boolean;
  carbon: boolean;
}

const RIM_STYLES = ["silver", "silver", "dark", "chrome"] as const;

/** From the grades of a car's parts and its Design studio options. */
export function buildLookFrom(grades: Partial<Record<ComponentId, number>>, design: { rims?: number; color?: string } | undefined, tech: readonly TechId[] = []): BuildLookData {
  const rimsLvl = design?.rims ?? 0;
  const wheels = Math.max(1, grades.wheels ?? 1);
  return {
    color: design?.color ?? "",
    rims: rimsLvl >= 3 || wheels >= 5 ? "black" : RIM_STYLES[Math.min(3, rimsLvl)],
    rimScale: 1 + 0.04 * (wheels - 1) + 0.02 * rimsLvl,
    engine: Math.max(1, grades.engine ?? 1),
    brakes: Math.max(1, grades.brakes ?? 1),
    aero: tech.includes("wind_tunnel"),
    carbon: tech.includes("carbon_body"),
  };
}

/** The car an assembly line builds right now: the grades its parts come in today. */
export function lineBuildLook(s: GameState, car: CarId): BuildLookData {
  const cfg = CAR_BY_ID[car];
  const grades: Partial<Record<ComponentId, number>> = {};
  for (const c of recipe(cfg)) grades[c] = supplied(s, c) ? suppliedGrade(c, cfg) : Math.max(1, bestGrade(s, c));
  return buildLookFrom(grades, s.designs[car], carTech(s));
}

/** How a car of the collection looks: the parts it was built with, its rims and its R&D tech. */
export const carLook = (s: GameState, rc: RaceCarState): BuildLookData => buildLookFrom(rc.grades, { rims: s.designs[rc.car]?.rims }, rc.tech);
