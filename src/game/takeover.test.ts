import { describe, expect, it } from "vitest";
import { RIVALS } from "./config/rivals";
import { computeGlobalMods } from "./engine/modifiers";
import { createInitialState } from "./engine/state";
import { buyTenth, controls, migrateTakeover, TAKEOVER, takeoverEffects, tenthPrice, tenthsOf } from "./engine/takeover";
import { decodeSave, encodeSave } from "./save/serialize";

const rich = () => {
  const s = createInitialState(0);
  s.cash = 1e15;
  s.rivalsBeaten = ["volta"];
  return s;
};

describe("rival takeovers", () => {
  it("sell a rival's shares only once it has been overtaken", () => {
    const s = createInitialState(0);
    s.cash = 1e15;
    expect(buyTenth(s, "volta", 0)).toBe(false);
    s.rivalsBeaten = ["volta"];
    expect(buyTenth(s, "volta", 0)).toBe("bought");
    expect(buyTenth(s, "kaiser", 0)).toBe(false);
  });

  it("price each tenth higher than the one before, and take the rival at the majority", () => {
    const s = rich();
    const volta = RIVALS[0];
    const p0 = tenthPrice(s, volta, 0)!;
    buyTenth(s, "volta", 0);
    expect(tenthPrice(s, volta, 0)!).toBeGreaterThan(p0);
    let last: string | false = false;
    while (tenthsOf(s, "volta") < TAKEOVER.control) last = buyTenth(s, "volta", 0);
    expect(last).toBe("taken");
    expect(controls(s, "volta")).toBe(true);
    while (tenthsOf(s, "volta") < TAKEOVER.tenths) buyTenth(s, "volta", 0);
    expect(tenthPrice(s, volta, 0)).toBeNull();
    expect(buyTenth(s, "volta", 0)).toBe(false);
  });

  it("raise income with every tenth, and dealer room with each rival taken over", () => {
    const s = rich();
    const before = computeGlobalMods(s);
    for (let i = 0; i < TAKEOVER.control; i++) buyTenth(s, "volta", 0);
    expect(takeoverEffects(s)).toEqual({ income: 1 + TAKEOVER.incomePerTenth * TAKEOVER.control + TAKEOVER.takenIncome, dealerCap: 1 + TAKEOVER.takenDealerCap });
    const after = computeGlobalMods(s);
    expect(after.income / before.income).toBeCloseTo(takeoverEffects(s).income);
    expect(after.dealerCap / before.dealerCap).toBeCloseTo(takeoverEffects(s).dealerCap);
  });

  it("is saved and cleaned on load", () => {
    const s = rich();
    buyTenth(s, "volta", 0);
    expect(tenthsOf(decodeSave(encodeSave(s), 0), "volta")).toBe(1);
    expect(migrateTakeover({ volta: 99, nope: 3, kaiser: -1 })).toEqual({ volta: TAKEOVER.tenths });
  });
});
