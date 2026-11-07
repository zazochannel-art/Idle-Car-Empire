// What each plant's unit takes in raw materials (config/economy.ts recipes): a leaf of the engine.
import { COMPONENT_RECIPE, GRADE_MATERIAL, MATERIAL_IDS, type MaterialId } from "../config/economy";
import { PLANT_BY_ID, isPlantType } from "../config/chain";
import type { GameState, MaterialStock, PlantType } from "../types";

// ───────────────────────────── recipes ─────────────────────────────

/** Materials one finished unit of this plant uses (empty for the assembly plant). */
/** What one unit takes, by plant and grade (worked out once each, shared: never change it). */
const UNIT_MATERIALS: Partial<Record<PlantType, { need: MaterialStock; list: readonly (readonly [MaterialId, number])[] }[]>> = {};
export function unitNeed(type: PlantType, grade: number) {
  const byGrade = (UNIT_MATERIALS[type] ??= []);
  let u = byGrade[grade];
  if (!u) {
    const need: MaterialStock = {};
    const item = PLANT_BY_ID[type].item;
    if (item) {
      const mult = GRADE_MATERIAL[Math.max(0, Math.min(GRADE_MATERIAL.length - 1, grade - 1))];
      for (const [m, n] of Object.entries(COMPONENT_RECIPE[item]) as [MaterialId, number][]) need[m] = Math.ceil(n * mult);
    }
    const list = Object.freeze((Object.entries(need) as [MaterialId, number][]).map((e) => Object.freeze(e)));
    u = byGrade[grade] = { need: Object.freeze(need), list };
  }
  return u;
}
export function unitMaterials(type: PlantType, grade: number): MaterialStock {
  return unitNeed(type, grade).need;
}

/** Materials this plant type buys. */
export const plantMaterials = (type: PlantType): MaterialId[] => {
  const item = PLANT_BY_ID[type].item;
  return item ? (Object.keys(COMPONENT_RECIPE[item]) as MaterialId[]) : [];
};

/** Materials the company uses at all (unlocked as new plants are built). */
export function usedMaterials(s: GameState): MaterialId[] {
  const set = new Set<MaterialId>();
  for (const b of Object.values(s.city.buildings)) if (b.plant && isPlantType(b.type)) for (const m of plantMaterials(b.type)) set.add(m);
  return MATERIAL_IDS.filter((m) => set.has(m));
}
