// What is open, and what plants and their upgrades cost.
import { AUTOMATION, BODY_WORKSHOP, MAX_GRADE, MAX_TRUCKS, PLANT_BY_ID, PLANT_COPY_COST, PLANT_MAX_LEVEL, PLANT_TRUCKS, SPEED } from "../../config/chain";
import type { BuildingState, ComponentId, GameState, PlantData, PlantType } from "../../types";
import type { GlobalMods } from "../modifiers";
import { UPGRADE_SCALING } from "../../config/economy";
import { book } from "../ledger";
import { hasPlant, plantCount } from "../plants";

// ───────────────────────────── unlocks & costs ─────────────────────────────

export type PlantLock =
  | { kind: "plant"; plant: PlantType }
  | { kind: "research"; research: string }
  | { kind: "made"; item: ComponentId; n: number; have: number }
  | null;

/** What must happen before a plant type can be built (null = ready). */
export function plantLock(s: GameState, type: PlantType): PlantLock {
  const cfg = PLANT_BY_ID[type];
  // the plant before it in the chain must be built or at least going up (sites can run side by side)
  if (cfg.requires && !hasPlant(s, cfg.requires) && !Object.values(s.city.sites).some((st) => st.type === cfg.requires))
    return { kind: "plant", plant: cfg.requires };
  if (cfg.unlockMade && s.lifetime.parts[cfg.unlockMade.item] < cfg.unlockMade.n)
    return { kind: "made", item: cfg.unlockMade.item, n: cfg.unlockMade.n, have: Math.floor(s.lifetime.parts[cfg.unlockMade.item]) };
  if (cfg.research && !s.research.includes(cfg.research)) return { kind: "research", research: cfg.research };
  return null;
}

/** A plant's shop floor: machines installed along its line and the operators running them. */
export interface Workshop {
  machines: number;
  workers: number;
}

/** One machine slot of the Body Works line and what it adds to the plant's speed. */
export interface WorkshopMachine {
  index: number;
  installed: boolean;
  /** An operator runs it (operators take the machines in line order). */
  staffed: boolean;
  /** Share added to the plant's speed (the first machine is the plant's base: 0). */
  bonus: number;
}

/** A plant's shop floor within its limits (older saves and other plants: one machine, one operator). */
export function workshopOf(p: PlantData): Workshop {
  const w = p.workshop;
  const machines = Math.max(1, Math.min(BODY_WORKSHOP.max, Math.floor(w?.machines ?? 1)));
  const workers = Math.max(1, Math.min(machines, Math.floor(w?.workers ?? 1)));
  return { machines, workers };
}

/** Every machine slot of the Body Works line, in order, with its real contribution. */
export function workshopMachines(w: Workshop): WorkshopMachine[] {
  return Array.from({ length: BODY_WORKSHOP.max }, (_, index) => {
    const installed = index < w.machines;
    const staffed = installed && index < w.workers;
    const bonus = index === 0 || !installed ? 0 : BODY_WORKSHOP.machine + (staffed ? BODY_WORKSHOP.operator : 0);
    return { index, installed, staffed, bonus };
  });
}

/** The shop floor's speed multiplier (1: the base machine and its operator; only the Body Works has one). */
export function workshopSpeed(type: PlantType, w: Workshop): number {
  if (type !== "bodyWorks") return 1;
  return 1 + workshopMachines(w).reduce((a, m) => a + m.bonus, 0);
}

/** The next machine for the Body Works line (null: not a Body Works, or the line is full). */
export function bodyMachineCost(s: GameState, plotId: string): number | null {
  const b = s.city.buildings[plotId];
  if (b?.type !== "bodyWorks" || !b.plant) return null;
  const { machines } = workshopOf(b.plant);
  if (machines >= BODY_WORKSHOP.max) return null;
  return Math.round(BODY_WORKSHOP.machineCost.base * Math.pow(BODY_WORKSHOP.machineCost.growth, machines - 1));
}

/** The next operator (null: every machine already has one). */
export function bodyWorkerCost(s: GameState, plotId: string): number | null {
  const b = s.city.buildings[plotId];
  if (b?.type !== "bodyWorks" || !b.plant) return null;
  const { machines, workers } = workshopOf(b.plant);
  if (workers >= machines) return null;
  return Math.round(BODY_WORKSHOP.operatorCost.base * Math.pow(BODY_WORKSHOP.operatorCost.growth, workers - 1));
}

export function buyBodyMachine(s: GameState, plotId: string): boolean {
  const b = s.city.buildings[plotId];
  const cost = bodyMachineCost(s, plotId);
  if (!b?.plant || cost === null || s.cash < cost) return false;
  const w = workshopOf(b.plant);
  s.cash -= cost;
  book(s, "maintenance", cost);
  b.plant.workshop = { ...w, machines: w.machines + 1 };
  return true;
}

export function hireBodyWorker(s: GameState, plotId: string): boolean {
  const b = s.city.buildings[plotId];
  const cost = bodyWorkerCost(s, plotId);
  if (!b?.plant || cost === null || s.cash < cost) return false;
  const w = workshopOf(b.plant);
  s.cash -= cost;
  book(s, "labor", cost);
  b.plant.workshop = { ...w, workers: w.workers + 1 };
  return true;
}

export function plantBuildCost(s: GameState, type: PlantType): number {
  const cfg = PLANT_BY_ID[type];
  const n = plantCount(s, type);
  return n === 0 && cfg.firstCost ? cfg.firstCost : cfg.cost * Math.pow(PLANT_COPY_COST, n);
}

export const base = (b: BuildingState) => PLANT_BY_ID[b.type as PlantType].cost;

/** Price of the next level: the plant's cost × level.base × level.growth^(level-1) (config/economy.ts). */
export function levelCost(b: BuildingState, gm: GlobalMods): number | null {
  if (b.works || b.level >= Math.min(PLANT_MAX_LEVEL, gm.maxPlantLevel)) return null;
  const u = UPGRADE_SCALING.level;
  return base(b) * u.base * Math.pow(u.growth, b.level - 1) * gm.costMult;
}

export function speedCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (p.speed >= SPEED.max) return null;
  const u = UPGRADE_SCALING.speed;
  return base(b) * u.base * Math.pow(u.growth, p.speed) * gm.costMult;
}

export function automationCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (p.automation >= AUTOMATION.length - 1) return null;
  return base(b) * UPGRADE_SCALING.automation[p.automation + 1] * gm.costMult;
}

/** Whether an engine factory is making motorized chassis (only before the first assembly plant). */
export function combines(s: GameState, b: BuildingState): boolean {
  return b.type === "engineFactory" && !!b.plant?.combine && !hasPlant(s, "assemblyPlant");
}

/** Trucks a plant runs: they come with its level (older saves keep the ones they bought). */
export function trucksOf(b: BuildingState): number {
  return Math.min(MAX_TRUCKS, Math.max(b.plant?.fleet ?? 1, PLANT_TRUCKS[b.level - 1] ?? 1));
}

export function gradeCost(b: BuildingState, gm: GlobalMods): number | null {
  const p = b.plant!;
  if (b.type === "assemblyPlant" || p.grade >= MAX_GRADE) return null;
  return base(b) * UPGRADE_SCALING.grade[p.grade] * gm.costMult;
}
