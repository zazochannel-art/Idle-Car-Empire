import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/game/config/achievements";
import { CARS } from "@/game/config/cars";
import { DEALERS } from "@/game/config/dealerships";
import { AUTOMATION, COMPONENTS, GRADES, PLANTS, PLANT_LEVELS } from "@/game/config/chain";
import { MANAGERS } from "@/game/config/managers";
import { MILESTONES } from "@/game/config/missions";
import { EMPIRE_PERKS } from "@/game/config/prestige";
import { EVENTS } from "@/game/config/events";
import { REGIONS } from "@/game/config/regions";
import { RESEARCH, RESEARCH_CATEGORIES } from "@/game/config/research";
import { en } from "./en";
import { ro, roContent } from "./ro";
import { ru, ruContent } from "./ru";
import { loadLanguage, translate } from ".";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  for (const [name, dict] of [["ro", ro], ["ru", ru]] as const) {
    it(`${name} keeps every {placeholder} of the English text`, () => {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dict[key]), `${name}:${key}`).toEqual(placeholders(en[key]));
        expect(dict[key].trim().length, `${name}:${key}`).toBeGreaterThan(0);
      }
    });
  }

  it("translates all game content to Romanian and Russian", () => {
    const keys = [
      ...CARS.flatMap((c) => [`car.${c.id}.name`, `car.${c.id}.tagline`]),
      ...MANAGERS.map((m) => `manager.${m.id}.role`),
      ...DEALERS.flatMap((d) => [`dealer.${d.id}.name`, `dealer.${d.id}.desc`]),
      ...RESEARCH.flatMap((r) => [`research.${r.id}.name`, `research.${r.id}.desc`]),
      ...RESEARCH_CATEGORIES.map((c) => `researchCat.${c.id}`),
      ...ACHIEVEMENTS.flatMap((a) => [`achievement.${a.id}.name`, `achievement.${a.id}.desc`]),
      ...MILESTONES.map((m) => `milestone.${m.id}`),
      ...EMPIRE_PERKS.flatMap((p) => [`perk.${p.points}.name`, `perk.${p.points}.desc`]),
      ...REGIONS.flatMap((r) => [`region.${r.id}.name`, `region.${r.id}.flavor`]),
      ...EVENTS.flatMap((e) => [`event.${e.id}.name`, `event.${e.id}.desc`]),
    ];
    for (const key of keys) {
      expect(roContent[key], `ro:${key}`).toBeTruthy();
      expect(ruContent[key], `ru:${key}`).toBeTruthy();
    }
  });

  it("has every generated key (plants, items, grades, levels)", () => {
    const keys = [
      ...PLANTS.flatMap((p) => [`structure.${p.id}`, `structureDesc.${p.id}`, `process.${p.id}`, ...(p.raw ? [`raw.${p.raw}`] : [])]),
      ...COMPONENTS.flatMap((c) => [`item.${c.id}`, ...GRADES.map((_, i) => `grade.${c.id}.${i + 1}`)]),
      "item.car",
      ...PLANT_LEVELS.map((_, i) => `plantLevel.${i + 1}`),
      ...AUTOMATION.map((_, i) => `automation.${i}`),
      ...["van", "truck", "semi", "trailer", "carrier"].map((v) => `vehicle.${v}`),
      ...["noRaw", "full", "noModel"].map((v) => `status.${v}`),
    ];
    for (const key of keys) expect(key in en, key).toBe(true);
    // the assembly line has one station per step
    expect(en["process.assemblyPlant"].split("|")).toHaveLength(9);
    for (const dict of [ro, ru]) for (const p of PLANTS) expect(dict[`process.${p.id}`].split("|"), p.id).toHaveLength(en[`process.${p.id}`].split("|").length);
  });

  it("loads a language on demand (English until then) and fills placeholders", async () => {
    await loadLanguage("ro");
    await loadLanguage("ru");
    expect(translate("ro", "common.lv", { level: 7 })).toBe("Nv 7");
    expect(translate("ru", "offline.collect", { amount: "$5K" })).toBe("ЗАБРАТЬ $5K");
  });
});
