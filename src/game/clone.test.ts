import { describe, expect, it } from "vitest";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import { cloneState, createInitialState } from "./engine/state";
import { snapshot } from "./engine/economy";
import { tick } from "./engine/tick";
import type { GameState, PlantType } from "./types";

const T0 = 1_700_000_000_000;

/** A company with a working chain and some history, after a few minutes of ticks. */
function grown(): GameState {
  const s = createInitialState(T0);
  s.cash = 1e9;
  s.chain.firstCar = true;
  s.city.zones = ["town", "industrial", "downtown", "automotive"];
  s.dealers.local.owned = true;
  for (const type of ["bodyWorks", "engineFactory", "interiorFactory", "assemblyPlant"] as PlantType[]) {
    const id = Co.plotsFor(type).find((p) => !s.city.buildings[p])!;
    s.city.buildings[id] = { type, level: 3, plant: Ch.newPlant() };
  }
  for (let i = 0; i < 600; i++) tick(s, 0.5, snapshot(s));
  return s;
}

describe("cloneState", () => {
  it("copies the state exactly like structuredClone, undefined fields and all", () => {
    const s = grown();
    // a few awkward values plain data can hold
    (s as unknown as Record<string, unknown>).probe = { a: undefined, n: NaN, inf: -Infinity, list: [1, undefined, { x: null }] };
    const copy = cloneState(s);
    expect(copy).toStrictEqual(structuredClone(s));
    expect(Object.keys(copy.city.buildings)).toEqual(Object.keys(s.city.buildings));
  });

  it("shares nothing with the original", () => {
    const s = grown();
    const before = JSON.stringify(s);
    const copy = cloneState(s);
    copy.cash = 1;
    for (const b of Object.values(copy.city.buildings)) {
      b.level = 99;
      if (b.plant) b.plant.inputs = {};
    }
    copy.chain.shipments.length = 0;
    copy.research.push("x");
    expect(JSON.stringify(s)).toBe(before);
  });
});
