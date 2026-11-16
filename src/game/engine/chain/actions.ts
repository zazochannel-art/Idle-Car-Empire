// Player actions on plants: upgrades, automation, grades, warehouses.
import type { BuildingState, CarId, CarRoute, GameState, PlantData, PlantType, QualityMode } from "../../types";
import { CAR_BY_ID } from "../../config/cars";
import type { GlobalMods } from "../modifiers";
import { PLANT_BY_ID } from "../../config/chain";
import { POWER_SYSTEM } from "../../config/economy";
import { automationCost, gradeCost, levelCost, speedCost } from "./unlocks";
import { carLock } from "./cars";
import { powerCost, warehouseCost } from "../materials";
import { qualityOf } from "../market";
import { startWorks } from "../construction";

// ───────────────────────────── actions ─────────────────────────────

function spend(s: GameState, cost: number | null): boolean {
  if (cost === null || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  return true;
}

function plantAt(s: GameState, plotId: string) {
  const b = s.city.buildings[plotId];
  return b?.plant ? (b as BuildingState & { plant: PlantData }) : null;
}

function countUpgrade(s: GameState, levels = false) {
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  if (levels) {
    s.run.levelsBought += 1;
    s.lifetime.levelsBought += 1;
  }
}

/** A new level is built onto the plant (it keeps producing at its level meanwhile). */
export function upgradePlantLevel(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !startWorks(s, plotId, levelCost(b, gm))) return false;
  countUpgrade(s, true);
  return true;
}

export function upgradePlantSpeed(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, speedCost(b, gm))) return false;
  b.plant.speed += 1;
  countUpgrade(s, true);
  return true;
}

export function upgradeAutomation(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, automationCost(b, gm))) return false;
  b.plant.automation += 1;
  countUpgrade(s);
  return true;
}

export function upgradeGrade(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, gradeCost(b, gm))) return false;
  b.plant.grade += 1;
  countUpgrade(s);
  return true;
}

/** A bigger warehouse: more materials on site. */
export function upgradeWarehouse(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || !spend(s, warehouseCost(b, gm.costMult))) return false;
  b.plant.warehouse += 1;
  countUpgrade(s);
  return true;
}

/** ⚡ Power System: a cheaper energy bill. */
export function upgradePower(s: GameState, plotId: string, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.plant.power >= POWER_SYSTEM.max || !spend(s, powerCost(b, gm.costMult))) return false;
  b.plant.power += 1;
  countUpgrade(s);
  return true;
}

/** Switches emergency parts for an assembly plant (bought at the emergency price when the company's own plants stop). */
export function setBackupParts(s: GameState, plotId: string, on: boolean): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "assemblyPlant") return false;
  if (on) b.plant.backup = true;
  else delete b.plant.backup;
  return true;
}

/** Switches automatic restocking (it only runs once a supplier allows it). */
export function setAutoBuy(s: GameState, plotId: string, on: boolean): boolean {
  const b = plantAt(s, plotId);
  if (!b || !PLANT_BY_ID[b.type as PlantType].item) return false;
  b.plant.autoBuy = on;
  return true;
}

/** Engine factory strategy before assembly: sell engines, or motorized chassis. */
/** Quality against quantity for one plant. */
export function setQualityMode(s: GameState, plotId: string, mode: QualityMode): boolean {
  const b = plantAt(s, plotId);
  if (!b || qualityOf(b.plant) === mode) return false;
  if (mode === "balanced") delete b.plant.mode;
  else b.plant.mode = mode;
  return true;
}

/** Where an assembly plant sends its cars. */
export function setCarRoute(s: GameState, plotId: string, route: CarRoute): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "assemblyPlant" || (b.plant.carRoute ?? "price") === route) return false;
  if (route === "price") delete b.plant.carRoute;
  else b.plant.carRoute = route;
  return true;
}

export function setCombine(s: GameState, plotId: string, on: boolean): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "engineFactory" || !!b.plant.combine === on) return false;
  b.plant.combine = on;
  return true;
}

export function setPlantCar(s: GameState, plotId: string, car: CarId | null, gm: GlobalMods): boolean {
  const b = plantAt(s, plotId);
  if (!b || b.type !== "assemblyPlant") return false;
  if (car && carLock(s, CAR_BY_ID[car], gm) !== null) return false;
  b.plant.car = car;
  return true;
}
