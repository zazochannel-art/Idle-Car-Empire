// Car models, recipes, values and what the assembly line orders.
import { safetyMult } from "../safety";
import { BASE_RECIPE, MAKER, OUTSOURCE, OUTSOURCED_PARTS, SUPPLIED_PARTS, VEHICLE_CAPACITY } from "../../config/chain";
import { CARS, CAR_MODEL, type CarConfig } from "../../config/cars";
import type { CityId, ComponentId, GameState, PlantData, PlantType } from "../../types";
import { DEPOT } from "../../city/layout";
import type { GlobalMods } from "../modifiers";
import type { PlantStats } from "./stats";
import { book, canOwe, payOrOwe } from "../ledger";
import { carListPrice, carStdCost, componentPrice, componentStdCost } from "../costs";
import { depotTrip } from "../materials";
import { designStats, nordicMult } from "../design";
import { hasPlant, plantsOf } from "../plants";
import { localValueMult } from "../landmarks";
import { protoValueMult } from "../expansion";
import { ship } from "./travel";

// ───────────────────────────── cars ─────────────────────────────

/** The parts a car is made of (one list per model, shared: never change it). */
const RECIPES = new Map<CarConfig, readonly ComponentId[]>();
export function recipe(car: CarConfig): ComponentId[] {
  let r = RECIPES.get(car);
  if (!r) {
    r = Object.freeze([...BASE_RECIPE, ...car.extras]);
    RECIPES.set(car, r);
  }
  return r as ComponentId[];
}

/**
 * A part the company doesn't make yet that an outside supplier sells (tyres,
 * drivetrain): ordered and paid by the assembly plant, delivered by truck.
 * Bodies and engines never come from a supplier.
 */
export function supplied(s: GameState, c: ComponentId): boolean {
  return OUTSOURCED_PARTS.includes(c) && !hasPlant(s, MAKER[c]);
}

/** The grade the supplier delivers for a model: base parts at grade 1, drivetrain parts at whatever the model needs. */
export function suppliedGrade(c: ComponentId, car: CarConfig): number {
  return SUPPLIED_PARTS.includes(c) ? car.grade : 1;
}

/**
 * Emergency parts: a part the supplier sells, which the company makes itself
 * but whose own plants deliver nothing (out of materials, stopped). Only when
 * the player switched emergency parts on for this assembly plant, and at the
 * emergency price: a way through a bad hour, never a way around the plants.
 */
export function backupSupply(s: GameState, c: ComponentId, p: PlantData): boolean {
  if (!p.backup || !OUTSOURCED_PARTS.includes(c) || supplied(s, c) || (p.inputs[c] ?? 0) >= 1) return false;
  return plantsOf(s).every(([, b]) => b.type !== MAKER[c] || (b.plant.out < 1 && b.plant.status !== "ok"));
}

/** Whether the supplier covers this part for this model. */
const supplierCovers = (s: GameState, c: ComponentId, car: CarConfig) => supplied(s, c) && suppliedGrade(c, car) >= car.grade;

/** What the supplier charges for one unit (emergency parts cost more). */
export function supplierPrice(c: ComponentId, grade = 1, emergency = false): number {
  return componentStdCost(c, grade) * (emergency ? OUTSOURCE.emergency : OUTSOURCE.markup);
}

/** Parts from the outside supplier on their way to an assembly plant. */
const partsComing = (s: GameState, plot: string, c: ComponentId) => s.chain.shipments.some((sh) => !sh.back && sh.to === plot && sh.item === c && sh.from === DEPOT);

/**
 * An assembly line stopped on a bought-in part it can't get (no cash, no
 * credit, nothing on the way): parts made for it are sold at the Parts
 * Market meanwhile, which brings the cash to buy the missing part.
 */
export function lineWaitsOnSupplier(s: GameState, plot: string, p: PlantData): boolean {
  const m = p.missing;
  return p.status === "noParts" && !!m && OUTSOURCED_PARTS.includes(m) && supplied(s, m) && !partsComing(s, plot, m);
}

/**
 * Orders finished parts from the outside supplier for an assembly plant:
 * a few batches' worth (one batch for emergency parts), paid now as far as
 * the cash goes, and driven over from the depot. With no cash at all, the
 * supplier gives trade credit for the next batch only, on the company's
 * account and within its limit. Emergency parts are never on credit.
 * Returns what the order cost.
 */
export function orderParts(s: GameState, plot: string, p: PlantData, st: PlantStats, c: ComponentId): number {
  if (!st.car) return 0;
  const regular = supplied(s, c);
  const emergency = !regular && backupSupply(s, c, p);
  if ((!regular && !emergency) || partsComing(s, plot, c)) return 0;
  const have = p.inputs[c] ?? 0;
  // reorder while a batch is still on hand, so the line rarely waits for the truck
  if (have >= (emergency ? 1 : st.lines * 2)) return 0;
  const want = emergency ? st.lines : Math.min(st.inCap, st.lines * OUTSOURCE.cover);
  const price = supplierPrice(c, suppliedGrade(c, st.car), emergency);
  const affordable = Math.floor(Math.max(0, s.cash) / price);
  let qty = Math.min(Math.floor(want - have), affordable);
  const credit = qty < 1 && regular;
  if (credit) qty = Math.ceil(st.lines - have);
  if (qty < 1 || (credit && !canOwe(s, qty * price))) return 0;
  const cost = qty * price;
  payOrOwe(s, cost);
  book(s, "materials", cost);
  ship(s, { from: DEPOT, to: plot, item: c, qty, value: cost, dur: depotTrip(plot), vehicle: qty > VEHICLE_CAPACITY.truck ? "semi" : "truck" });
  return cost;
}

/** Best grade available for a component across all plants that make it. */
export function bestGrade(s: GameState, c: ComponentId): number {
  const all = s.city.buildings;
  const maker = MAKER[c];
  let g = 0;
  for (const id in all) {
    const b = all[id];
    if (b.plant && b.type === maker) g = Math.max(g, b.plant.grade);
  }
  return g;
}

/** Why a car model cannot be built yet, or null. */
export type CarLock =
  | { kind: "city"; city: CityId }
  | { kind: "research"; research: string }
  | { kind: "plant"; plant: PlantType }
  | { kind: "grade"; plant: PlantType; grade: number }
  | null;

export function carLock(s: GameState, car: CarConfig, gm: GlobalMods): CarLock {
  // a landmark works' line, or Nordheim's flagship, is built only in its own city
  if (car.city && car.city !== s.activeCity) return { kind: "city", city: car.city };
  if (car.requiresResearch && !gm.unlockedCars.has(car.id)) return { kind: "research", research: car.requiresResearch };
  if (!hasPlant(s, "assemblyPlant")) return { kind: "plant", plant: "assemblyPlant" };
  // missing plants first (the bigger step), then grades
  const parts = recipe(car);
  const grades = parts.map((c) => bestGrade(s, c));
  for (let i = 0; i < parts.length; i++) if (grades[i] === 0 && !supplierCovers(s, parts[i], car)) return { kind: "plant", plant: MAKER[parts[i]] };
  for (let i = 0; i < parts.length; i++) if (grades[i] < car.grade && !supplierCovers(s, parts[i], car)) return { kind: "grade", plant: MAKER[parts[i]], grade: car.grade };
  return null;
}

export function availableCars(s: GameState, gm: GlobalMods): CarConfig[] {
  return CARS.filter((c) => carLock(s, c, gm) === null);
}

/** What the Parts Market pays for one unit of a component at a grade, before global multipliers. */
export const componentBase = (c: ComponentId, grade: number) => componentPrice(c, grade);

/** Standard production cost of one car (parts, assembly, QC, transport). */
export function carPartsValue(car: CarConfig): number {
  return carStdCost(car, recipe(car));
}

/** Sale value of one car before dealer markup (bonuses widen its margin). */
export function carValue(s: GameState, car: CarConfig, gm: GlobalMods, extra = 1): number {
  // a landmark works' line sells for more to its territory's buyers, a winterised model to Nordheim's
  // and a crash-tested model by its safety stars (engine/safety.ts)
  return carListPrice(car, recipe(car), carMarginMult(s, car, gm) * modelStats(s, car).valueMult * protoValueMult(s, car.id) * extra) * localValueMult(s, car) * nordicMult(s, car.id) * safetyMult(s, car.id);
}

/** Sale value before the Design studio options (what R&D prices are based on). */
export function carBaseValue(s: GameState, car: CarConfig, gm: GlobalMods): number {
  return carListPrice(car, recipe(car), carMarginMult(s, car, gm));
}

/** How much the bonuses (refinement, research, prestige, events…) widen a car's margin. */
export function carMarginMult(s: GameState, car: CarConfig, gm: GlobalMods): number {
  const refine = Math.pow(CAR_MODEL.valuePerLevel, s.carModels[car.id] ?? 0);
  return refine * gm.value[car.tier] * gm.income;
}

/** Market value of a component with the company's bonuses (widening its margin). */
export function componentValue(c: ComponentId, grade: number, gm: GlobalMods, extra = 1): number {
  return componentPrice(c, grade, gm.value[1] * gm.income * extra);
}

/** The player's model on this platform, with quality from the parts actually made. */
export function modelStats(s: GameState, car: CarConfig) {
  const grades = recipe(car).map((c) => (supplied(s, c) ? suppliedGrade(c, car) : bestGrade(s, c)));
  const grade = grades.length ? Math.max(car.grade, grades.reduce((a, b) => a + b, 0) / grades.length) : car.grade;
  return designStats(car, s.designs[car.id], grade);
}
