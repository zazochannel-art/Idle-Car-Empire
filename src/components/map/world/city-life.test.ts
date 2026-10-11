import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/engine/state";
import type { GameState, PlantData } from "@/game/types";
import { cityLife, cityLifeKey, ownShare } from "./city-life";

const T0 = Date.UTC(2026, 0, 1);

function withAssembly(car: string | null): GameState {
  const s = createInitialState(T0);
  for (const id of Object.keys(s.city.buildings)) delete s.city.buildings[id];
  const p = { speed: 0, automation: 0, fleet: 1, grade: 1, route: "auto", progress: 0, stock: {}, warehouse: 1, power: 0, inputs: {}, out: 0, outValue: 0, car, wait: 0, made: 10, status: "ok" } as unknown as PlantData;
  s.city.buildings["test:asm"] = { type: "assemblyPlant", level: 1, plant: p } as unknown as GameState["city"]["buildings"][string];
  return s;
}

describe("the town and the company", () => {
  it("drives more of the company's cars as it sells, up to 60%", () => {
    expect(ownShare(0)).toBe(0);
    expect(ownShare(10)).toBeCloseTo(0.13, 2);
    expect(ownShare(1000)).toBeCloseTo(0.375, 2);
    expect(ownShare(1e9)).toBe(0.6);
  });

  it("has nothing to show before a model is on a line", () => {
    const life = cityLife(withAssembly(null));
    expect(life.own).toEqual([]);
    expect(life.share).toBe(0);
    expect(life.ad).toBeNull();
  });

  it("puts the model on the line in the traffic, in its paint, and on the billboard with the brand", () => {
    const s = withAssembly("sedan");
    s.lifetime.carsSold = 1000;
    s.designs.sedan = { ...(s.designs.sedan ?? {}), color: "#ff00aa" } as GameState["designs"]["sedan"];
    s.brand.name = "Zazo Motors";
    const life = cityLife(s);
    expect(life.own).toEqual([{ model: "sedan", color: "#ff00aa", paint: true }]);
    expect(life.share).toBeCloseTo(0.375, 2);
    expect(life.ad).toMatchObject({ name: "Zazo Motors", car: "sedan" });
    const key = cityLifeKey(s);
    s.brand.name = "Other";
    expect(cityLifeKey(s)).not.toBe(key);
  });
});
