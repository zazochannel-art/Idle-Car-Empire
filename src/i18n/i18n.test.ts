import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/game/config/achievements";
import { CARS } from "@/game/config/cars";
import { DEALERS } from "@/game/config/dealerships";
import { FACTORIES } from "@/game/config/factories";
import { MANAGERS } from "@/game/config/managers";
import { MILESTONES } from "@/game/config/missions";
import { EMPIRE_PERKS } from "@/game/config/prestige";
import { RESEARCH, RESEARCH_CATEGORIES } from "@/game/config/research";
import { UPGRADES } from "@/game/config/upgrades";
import { en } from "./en";
import { ro, roContent } from "./ro";
import { ru, ruContent } from "./ru";
import { translate } from ".";

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
      ...FACTORIES.map((f) => `factory.${f.id}.name`),
      ...UPGRADES.flatMap((u) => [`upgrade.${u.id}.name`, `upgrade.${u.id}.desc`]),
      ...MANAGERS.map((m) => `manager.${m.id}.role`),
      ...DEALERS.flatMap((d) => [`dealer.${d.id}.name`, `dealer.${d.id}.desc`]),
      ...RESEARCH.flatMap((r) => [`research.${r.id}.name`, `research.${r.id}.desc`]),
      ...RESEARCH_CATEGORIES.map((c) => `researchCat.${c.id}`),
      ...ACHIEVEMENTS.flatMap((a) => [`achievement.${a.id}.name`, `achievement.${a.id}.desc`]),
      ...MILESTONES.map((m) => `milestone.${m.id}`),
      ...EMPIRE_PERKS.flatMap((p) => [`perk.${p.points}.name`, `perk.${p.points}.desc`]),
    ];
    for (const key of keys) {
      expect(roContent[key], `ro:${key}`).toBeTruthy();
      expect(ruContent[key], `ru:${key}`).toBeTruthy();
    }
  });

  it("fills placeholders", () => {
    expect(translate("ro", "common.lv", { level: 7 })).toBe("Nv 7");
    expect(translate("ru", "offline.collect", { amount: "$5K" })).toBe("ЗАБРАТЬ $5K");
  });
});
