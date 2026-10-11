import { describe, expect, it } from "vitest";
import { hallLook } from "../components/plant/interior/theme";
import { EDITION, EDITIONS } from "./config/collection";
import { migratePlant } from "./engine/chain";
import { editionBonus, editionTick, setPlantSkin, skinUnlocked } from "./engine/collection";
import { computeGlobalMods } from "./engine/modifiers";
import { createInitialState } from "./engine/state";
import type { GameState, PlantData } from "./types";

const T0 = Date.UTC(2026, 0, 1);

function withPlant(): { s: GameState; id: string; p: PlantData } {
  const s = createInitialState(T0);
  const id = "test:plant";
  const p = { speed: 0, automation: 0, fleet: 1, grade: 1, route: "auto", progress: 0, stock: {}, warehouse: 1, power: 0, inputs: {}, out: 0, outValue: 0, car: null, wait: 0, made: 100, status: "ok" } as unknown as PlantData;
  s.city.buildings[id] = { type: "engineFactory", level: 1, plant: p } as unknown as GameState["city"]["buildings"][string];
  return { s, id, p };
}

describe("hall styles", () => {
  it("opens the eras to everyone, Industrial with the story and Neon with achievements", () => {
    const { s } = withPlant();
    for (const id of ["auto", "retro", "modern", "hightech"] as const) expect(skinUnlocked(s, id)).toBe(true);
    expect(skinUnlocked(s, "industrial")).toBe(false);
    expect(skinUnlocked(s, "neon")).toBe(false);
    s.story.chapter = 2;
    expect(skinUnlocked(s, "industrial")).toBe(true);
    s.achievements = Array.from({ length: 15 }, (_, i) => `a${i}`);
    expect(skinUnlocked(s, "neon")).toBe(true);
  });

  it("gives a plant a style, and takes it back to its level's own", () => {
    const { s, id, p } = withPlant();
    expect(setPlantSkin(s, id, "neon")).toBe(false); // still locked
    expect(setPlantSkin(s, id, "retro")).toBe(true);
    expect(p.skin).toBe("retro");
    expect(setPlantSkin(s, id, "retro")).toBe(false); // already
    expect(setPlantSkin(s, id, "auto")).toBe(true);
    expect(p.skin).toBeUndefined();
  });

  it("paints the hall: an era picked by hand, or a style of its own", () => {
    expect(hallLook("engineFactory", 12, "retro").era).toBe("workshop");
    expect(hallLook("engineFactory", 1, "hightech").era).toBe("hightech");
    expect(hallLook("engineFactory", 7)).toEqual(hallLook("engineFactory", 7, "auto"));
    const neon = hallLook("engineFactory", 1, "neon");
    expect(neon.lines).toBe("#e879f9");
    expect(neon.glossy).toBe(true);
    const ind = hallLook("engineFactory", 12, "industrial");
    expect(ind.era).toBe("factory");
    expect(ind.lampColor).toBe("#ffb347");
  });

  it("keeps a plant's style in the save, and drops one that doesn't exist", () => {
    expect(migratePlant("engineFactory", { skin: "neon" }).skin).toBe("neon");
    expect(migratePlant("engineFactory", { skin: "disco" }).skin).toBeUndefined();
    expect(migratePlant("engineFactory", { skin: "auto" }).skin).toBeUndefined();
  });
});

describe("limited editions", () => {
  it("comes off a line after a while of play, only when a car is built, in a fixed order", () => {
    const { s } = withPlant();
    expect(editionTick(s, "city", T0)).toBeNull();
    expect(s.editions.nextAt).toBe(EDITION.first);
    s.lifetime.playTime = EDITION.first;
    expect(editionTick(s, null, T0)).toBeNull();
    const first = editionTick(s, "city", T0);
    expect(first?.id).toBe(EDITIONS[0].id);
    expect(s.editions.got).toEqual([{ id: EDITIONS[0].id, car: "city", at: T0 }]);
    expect(s.editions.nextAt).toBeGreaterThanOrEqual(EDITION.first + EDITION.every);
    expect(s.editions.nextAt).toBeLessThanOrEqual(EDITION.first + EDITION.every + EDITION.spread);
    expect(editionTick(s, "city", T0)).toBeNull(); // not yet
  });

  it("stops once the set is complete, which adds its bonus", () => {
    const { s } = withPlant();
    editionTick(s, null, T0); // schedules the first
    for (let i = 0; i < EDITIONS.length; i++) {
      s.lifetime.playTime = s.editions.nextAt;
      expect(editionTick(s, "city", T0)).not.toBeNull();
    }
    s.lifetime.playTime = s.editions.nextAt;
    expect(editionTick(s, "city", T0)).toBeNull();
    expect(new Set(s.editions.got.map((g) => g.id)).size).toBe(EDITIONS.length);
    expect(editionBonus(s)).toBeCloseTo(EDITIONS.length * EDITION.income + EDITION.fullSet);
  });

  it("adds income for every edition collected", () => {
    const { s } = withPlant();
    const before = computeGlobalMods(s).income;
    s.editions.got.push({ id: "gold", car: "city", at: T0 }, { id: "carbon", car: "city", at: T0 });
    expect(computeGlobalMods(s).income).toBeCloseTo(before * (1 + 2 * EDITION.income));
  });
});
