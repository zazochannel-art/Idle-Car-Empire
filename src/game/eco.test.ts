import { describe, expect, it } from "vitest";
import { buyEco, ECO, ecoActive, ecoCost, ecoIncomeMult, pollution, pollutionLimit } from "./engine/eco";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";
import type { GameState } from "./types";

/** A company with `n` body works at `level`, past the point the city starts watching. */
const company = (n: number, level: number, earned = ECO.fromEarned) => {
  const s = createInitialState(0);
  const tpl = Object.values(s.city.buildings).find((b) => b.plant)!;
  s.city.buildings = {};
  for (let i = 0; i < n; i++) s.city.buildings[`p${i}`] = { ...structuredClone(tpl), level };
  s.lifetime.moneyEarned = earned;
  s.cash = 1e15;
  return s as GameState;
};

describe("the environment", () => {
  it("does nothing before the city starts watching", () => {
    const s = company(40, 10, 0);
    expect(ecoActive(s)).toBe(false);
    expect(ecoIncomeMult(s)).toBe(1);
  });

  it("gives a green label under the limit and a capped fine over it", () => {
    expect(ecoIncomeMult(company(2, 3))).toBeCloseTo(1 + ECO.greenBonus);
    const dirty = company(30, 10);
    expect(pollution(dirty)).toBeGreaterThan(pollutionLimit(ECO.fromEarned));
    expect(ecoIncomeMult(dirty)).toBeCloseTo(1 - ECO.maxFine);
  });

  it("lets the limit rise as the company grows", () => {
    expect(pollutionLimit(ECO.fromEarned * 1000)).toBeCloseTo(ECO.limitBase + 3 * ECO.limitPerDecade);
  });

  it("cuts pollution a tenth per programme level, each level dearer", () => {
    const s = company(5, 6);
    const before = pollution(s);
    const c0 = ecoCost(s, 100)!;
    expect(buyEco(s, 100)).toBe(true);
    expect(pollution(s)).toBeCloseTo(before * (1 - ECO.cutPerLevel));
    expect(ecoCost(s, 100)!).toBeGreaterThan(c0);
    s.eco = ECO.maxLevel;
    expect(ecoCost(s, 100)).toBeNull();
    expect(buyEco(s, 100)).toBe(false);
  });

  it("keeps the programme's level in the save", () => {
    const s = company(1, 1);
    s.eco = 3;
    expect(decodeSave(encodeSave(s), 0).eco).toBe(3);
  });
});
