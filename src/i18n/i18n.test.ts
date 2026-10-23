import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/game/config/achievements";
import { CARS } from "@/game/config/cars";
import { DEALERS } from "@/game/config/dealerships";
import { AUTOMATION, COMPONENTS, GRADES, PLANTS, PLANT_LEVELS } from "@/game/config/chain";
import { MANAGERS } from "@/game/config/managers";
import { MILESTONES } from "@/game/config/missions";
import { EVENTS } from "@/game/config/events";
import { RESEARCH, RESEARCH_CATEGORIES } from "@/game/config/research";
import { RECIPES } from "@/components/plant/interior/layout";
import { en } from "./en";
import { ro, roContent } from "./ro";
import { ru, ruContent } from "./ru";
import { es, esContent } from "./es";
import { pt, ptContent } from "./pt";
import { de, deContent } from "./de";
import { detectLanguage, LANGS, loadLanguage, translate } from ".";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const DICTS = [["ro", ro, roContent], ["ru", ru, ruContent], ["es", es, esContent], ["pt", pt, ptContent], ["de", de, deContent]] as const;

  it("offers every language it has texts for", () => {
    expect(LANGS.map((l) => l.id).sort()).toEqual(["de", "en", "es", "pt", "ro", "ru"]);
  });

  for (const [name, dict, content] of DICTS) {
    it(`${name} keeps every {placeholder} of the English text`, () => {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dict[key]), `${name}:${key}`).toEqual(placeholders(en[key]));
        expect(dict[key].trim().length, `${name}:${key}`).toBeGreaterThan(0);
      }
      expect(Object.keys(dict).sort(), name).toEqual(Object.keys(en).sort());
      expect(Object.keys(content).sort(), name).toEqual(Object.keys(roContent).sort());
      for (const [key, text] of Object.entries(content)) expect(placeholders(text), `${name}:${key}`).toEqual(placeholders(roContent[key]));
    });
  }

  it("translates all game content to every language", () => {
    const keys = [
      ...CARS.flatMap((c) => [`car.${c.id}.name`, `car.${c.id}.tagline`]),
      ...MANAGERS.map((m) => `manager.${m.id}.role`),
      ...DEALERS.flatMap((d) => [`dealer.${d.id}.name`, `dealer.${d.id}.desc`]),
      ...RESEARCH.flatMap((r) => [`research.${r.id}.name`, `research.${r.id}.desc`]),
      ...RESEARCH_CATEGORIES.map((c) => `researchCat.${c.id}`),
      ...ACHIEVEMENTS.flatMap((a) => [`achievement.${a.id}.name`, `achievement.${a.id}.desc`]),
      ...MILESTONES.map((m) => `milestone.${m.id}`),
      ...EVENTS.flatMap((e) => [`event.${e.id}.name`, `event.${e.id}.desc`]),
    ];
    for (const key of keys) for (const [name, , content] of DICTS) expect(content[key], `${name}:${key}`).toBeTruthy();
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
    // every station inside every plant has a name and a description
    for (const d of Object.values(RECIPES).flat()) for (const key of [`interior.station.${d.id}`, `interior.desc.${d.id}`]) expect(key in en, key).toBe(true);
    // the assembly line has one station per step
    expect(en["process.assemblyPlant"].split("|")).toHaveLength(9);
    for (const [, dict] of DICTS) for (const p of PLANTS) expect(dict[`process.${p.id}`].split("|"), p.id).toHaveLength(en[`process.${p.id}`].split("|").length);
  });

  it("loads a language on demand (English until then) and fills placeholders", async () => {
    await loadLanguage("ro");
    await loadLanguage("ru");
    expect(translate("ro", "common.lv", { level: 7 })).toBe("Nv 7");
    expect(translate("ru", "offline.collect", { amount: "$5K" })).toBe("ЗАБРАТЬ $5K");
    await Promise.all((["es", "pt", "de"] as const).map(loadLanguage));
    expect(translate("es", "racing.lap", { n: 2, of: 3 })).toBe("Vuelta 2/3");
    expect(translate("pt", "racing.lap", { n: 2, of: 3 })).toBe("Volta 2/3");
    expect(translate("de", "racing.lap", { n: 2, of: 3 })).toBe("Runde 2/3");
  });

  it("guesses the language from the device", () => {
    const guess = (tag: string) => {
      Object.defineProperty(globalThis, "navigator", { value: { languages: [tag], language: tag }, configurable: true });
      return detectLanguage();
    };
    const before = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      expect(guess("es-MX")).toBe("es");
      expect(guess("pt-BR")).toBe("pt");
      expect(guess("pt-PT")).toBe("pt");
      expect(guess("de-AT")).toBe("de");
      expect(guess("ro-RO")).toBe("ro");
      expect(guess("fr-FR")).toBe("en");
    } finally {
      if (before) Object.defineProperty(globalThis, "navigator", before);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });
});
