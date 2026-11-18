import { describe, expect, it } from "vitest";
import { AUCTION, askPrice, auctionBonus, auctionUnit, buyBlock, clampAsk, listBlock, migrateAuction, payPurchase, paySale, saleMoney } from "./engine/auction";
import { computeGlobalMods } from "./engine/modifiers";
import { snapshot } from "./engine/economy";
import { createInitialState } from "./engine/state";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 10, 18);

function open(): GameState {
  const s = createInitialState(T0);
  s.lifetime.moneyEarned = AUCTION.unlockEarned;
  return s;
}

describe("auction house", () => {
  it("prices in the player's own money: an ask of whole units of their income", () => {
    const snap = snapshot(createInitialState(T0));
    expect(auctionUnit(snap)).toBeGreaterThanOrEqual(AUCTION.minUnit);
    expect(clampAsk(0)).toBe(1);
    expect(clampAsk(99)).toBe(20);
    expect(clampAsk(Number.NaN)).toBe(1);
    expect(askPrice(5, snap)).toBe(5 * auctionUnit(snap));
    expect(saleMoney(5, snap)).toBeCloseTo(askPrice(5, snap) * 0.9);
  });

  it("sells only finishes found and models built, once it opens", () => {
    const s = createInitialState(T0);
    expect(listBlock(s, "city", "gold")).toBe("locked");
    s.lifetime.moneyEarned = AUCTION.unlockEarned;
    expect(listBlock(s, "city", "gold")).toBe("edition");
    s.editions.got.push({ id: "gold", car: "city", at: T0 });
    expect(listBlock(s, "city", "gold")).toBe("car");
    s.lifetime.carsByType.city = 3;
    expect(listBlock(s, "city", "gold")).toBeNull();
  });

  it("buys into the collector garage, each car and finish once, for income", () => {
    const s = open();
    const snap = snapshot(s);
    const price = askPrice(4, snap);
    s.cash = price - 1;
    expect(buyBlock(s, "city", "pearl", 4, snap)).toBe("cash");
    s.cash = price * 2;
    expect(buyBlock(s, "city", "pearl", 4, snap)).toBeNull();
    const before = computeGlobalMods(s).income;
    expect(payPurchase(s, "city", "pearl", 4, snap, T0)).toBe(price);
    expect(s.cash).toBeCloseTo(price);
    expect(s.auction.got).toHaveLength(1);
    expect(buyBlock(s, "city", "pearl", 4, snap)).toBe("owned");
    expect(auctionBonus(s)).toBeCloseTo(AUCTION.perCar);
    expect(computeGlobalMods(s).income).toBeCloseTo(before * (1 + AUCTION.perCar));
    // an unknown car pays nothing and adds nothing
    expect(payPurchase(s, "hovercraft", "pearl", 4, snap, T0)).toBe(0);
    expect(s.auction.got).toHaveLength(1);
  });

  it("never takes the wallet below zero", () => {
    const s = open();
    const snap = snapshot(s);
    s.cash = 10;
    expect(payPurchase(s, "city", "gold", 20, snap, T0)).toBe(10);
    expect(s.cash).toBe(0);
  });

  it("caps the garage's bonus", () => {
    const s = open();
    s.auction.got = Array.from({ length: 50 }, (_, i) => ({ car: "city", edition: "gold", at: i }));
    expect(auctionBonus(s)).toBe(AUCTION.maxBonus);
  });

  it("pays a sale, less the fee, as a reward", () => {
    const s = open();
    const snap = snapshot(s);
    const cash = s.cash;
    const money = paySale(s, 10, snap);
    expect(money).toBeCloseTo(askPrice(10, snap) * (1 - AUCTION.fee));
    expect(s.cash).toBeCloseTo(cash + money);
    expect(s.auction.sold).toBe(1);
    expect(s.run.moneyEarned).toBe(0);
  });

  it("keeps only known, distinct cars from a save", () => {
    const a = migrateAuction({
      got: [{ car: "city", edition: "gold", at: 5 }, { car: "city", edition: "gold", at: 6 }, { car: "nope", edition: "gold" }, { car: "city", edition: "plaid" }, 7],
      bought: 3.7,
      sold: -2,
      spent: "x",
      earned: 40,
    });
    expect(a.got).toEqual([{ car: "city", edition: "gold", at: 5 }]);
    expect(a).toMatchObject({ bought: 3, sold: 0, spent: 0, earned: 40 });
    expect(migrateAuction(null).got).toEqual([]);
  });
});
