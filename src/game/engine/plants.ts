// The company's plants, listed and counted: a leaf of the engine (it imports none of it).
import { isPlantType } from "../config/chain";
import type { BuildingState, GameState, PlantData, PlantType } from "../types";

export type PlantEntry = [string, BuildingState & { plant: PlantData; type: PlantType }];

export function plantsOf(s: GameState): PlantEntry[] {
  return Object.entries(s.city.buildings).filter((e): e is PlantEntry => !!e[1].plant && isPlantType(e[1].type));
}

// counted in place (no list built): these run for every car and part, many times a tick
export function plantCount(s: GameState, type: PlantType): number {
  const all = s.city.buildings;
  let n = 0;
  for (const id in all) if (all[id].plant && all[id].type === type) n++;
  return n;
}

export function hasPlant(s: GameState, type: PlantType): boolean {
  const all = s.city.buildings;
  for (const id in all) if (all[id].plant && all[id].type === type) return true;
  return false;
}
