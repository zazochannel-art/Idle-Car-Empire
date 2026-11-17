import { describe, expect, it } from "vitest";
import { SOURCES } from "./config/sources";
import { marketPrice } from "./engine/materials";
import { buySource, migrateSources, sourceCost, sourceLevel } from "./engine/sources";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const rich = () => {
  const s = createInitialState(0);
  s.lifetime.moneyEarned = SOURCES.unlockEarned;
  s.cash = 1e15;
  return s;
};

describe("own sources", () => {
  it("stay shut until the company has earned enough", () => {
    const s = createInitialState(0);
    s.cash = 1e15;
    expect(buySource(s, "steel")).toBe(false);
    expect(sourceLevel(s, "steel")).toBe(0);
  });

  it("cost more each level, take the money and lower only that material's price", () => {
    const s = rich();
    const steel0 = marketPrice(s, "steel");
    const glass0 = marketPrice(s, "glass");
    const c1 = sourceCost(s, "steel")!;
    expect(buySource(s, "steel")).toBe(true);
    expect(s.cash).toBe(1e15 - c1);
    expect(sourceCost(s, "steel")).toBe(c1 * SOURCES.growth);
    expect(marketPrice(s, "steel")).toBeCloseTo(steel0 * (1 - SOURCES.discountPerLevel));
    expect(marketPrice(s, "glass")).toBeCloseTo(glass0);
  });

  it("stop at the top level and when the cash is short", () => {
    const s = rich();
    for (let i = 0; i < SOURCES.maxLevel; i++) expect(buySource(s, "rubber")).toBe(true);
    expect(buySource(s, "rubber")).toBe(false);
    expect(sourceCost(s, "rubber")).toBeNull();
    s.cash = 0;
    expect(buySource(s, "steel")).toBe(false);
  });

  it("price dear materials higher than cheap ones", () => {
    const s = rich();
    expect(sourceCost(s, "battery")!).toBeGreaterThan(sourceCost(s, "fluids")!);
  });

  it("are saved and cleaned on load", () => {
    const s = rich();
    buySource(s, "copper");
    const back = decodeSave(encodeSave(s), 0);
    expect(sourceLevel(back, "copper")).toBe(1);
    expect(migrateSources({ steel: 99, nope: 3, glass: -1, paint: "2" })).toEqual({ steel: SOURCES.maxLevel });
  });
});
