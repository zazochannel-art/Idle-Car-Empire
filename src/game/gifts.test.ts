import { describe, expect, it } from "vitest";
import { passiveIncome, snapshot } from "./engine/economy";
import { GIFT, giftSent, receiveGifts } from "./engine/gifts";
import { createInitialState } from "./engine/state";

const T0 = Date.UTC(2026, 0, 1);

describe("gifts between players", () => {
  it("pays a received gift as a few minutes of the receiver's income, into the wallet only", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const income = Math.max(passiveIncome(snap), 5);
    const cash = s.cash;
    const earned = s.run.moneyEarned;
    const money = receiveGifts(s, 2, snap);
    expect(money).toBeCloseTo(2 * GIFT.receiveSeconds * income);
    expect(s.cash).toBeCloseTo(cash + money);
    // a reward: it counts toward no reset
    expect(s.run.moneyEarned).toBe(earned);
    expect(s.lifetime.moneyEarned).toBe(0);
  });

  it("pays nothing for no gifts, and at most a capped number at once", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const cash = s.cash;
    expect(receiveGifts(s, 0, snap)).toBe(0);
    expect(receiveGifts(s, -3, snap)).toBe(0);
    expect(receiveGifts(s, Number.NaN, snap)).toBe(0);
    expect(s.cash).toBe(cash);
    expect(receiveGifts(s, 10_000, snap)).toBeCloseTo(receiveGifts(createInitialState(T0), GIFT.maxAtOnce, snap));
  });

  it("thanks the sender with less than a received gift", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const cash = s.cash;
    const thanks = giftSent(s, snap);
    expect(thanks).toBeGreaterThan(0);
    expect(thanks).toBeLessThan(receiveGifts(createInitialState(T0), 1, snap));
    expect(s.cash).toBeCloseTo(cash + thanks);
  });
});
