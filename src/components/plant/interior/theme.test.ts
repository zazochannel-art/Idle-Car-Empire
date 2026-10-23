import { describe, expect, it } from "vitest";
import { RECIPES } from "./layout";
import { hallEra, hallLook, PLANT_THEMES } from "./theme";

const HEX = /^#[0-9a-f]{6}$/i;

describe("hall looks", () => {
  it("grows from a workshop into a factory, then a high-tech plant", () => {
    expect([1, 4, 5, 9, 10, 15].map(hallEra)).toEqual(["workshop", "workshop", "factory", "factory", "hightech", "hightech"]);
  });

  it("gives every plant its own trade look, at every era", () => {
    for (const type of Object.keys(RECIPES)) {
      expect(PLANT_THEMES[type], type).toBeDefined();
      for (const level of [1, 5, 10]) {
        const look = hallLook(type, level);
        expect(look.floor, `${type} ${level}`).toMatch(HEX);
        for (const c of look.bay) expect(c, `${type} ${level}`).toMatch(HEX);
        expect(look.decor.length, type).toBeGreaterThan(0);
      }
    }
  });

  it("dirties the workshop and cleans up the high-tech plant", () => {
    const old = hallLook("engineFactory", 1);
    const mid = hallLook("engineFactory", 6);
    const hi = hallLook("engineFactory", 12);
    expect(old.stainCount).toBeGreaterThan(mid.stainCount);
    expect(hi.stainCount).toBeLessThan(mid.stainCount);
    expect([old.lamps, mid.lamps, hi.lamps]).toEqual(["bulb", "highbay", "led"]);
    expect(old.brick && old.planks).toBe(true);
    expect(hi.glossy).toBe(true);
  });
});
