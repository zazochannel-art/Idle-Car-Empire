// Phase 1 of the economy audit: every dollar is booked once, under one key,
// and every figure the game shows comes from the same sums.
import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import * as C from "./engine/city";
import { carStdCost, componentStdCost } from "./engine/costs";
import { CAR_BY_ID } from "./config/cars";
import * as Co from "./engine/construction";
import * as Ex from "./engine/expansion";
import * as M from "./engine/materials";
import { snapshot } from "./engine/economy";
import { settleOffline } from "./engine/offline";
import { grantReward } from "./engine/progress";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import * as Ch from "./engine/chain";
import type { GameState, LedgerValues } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const L = (v: Partial<LedgerValues>): LedgerValues => ({ ...M.emptyLedgerValues(), ...v });
const run = (s: GameState, seconds: number, step = 0.5) => {
  for (let t = 0; t < seconds; t += step) tick(s, step);
};

describe("accounting: revenue − costs = net, each category once", () => {
  it("revenue only", () => {
    const v = L({ carSales: 1000 });
    expect(M.ledgerNet(v)).toBe(1000);
    expect(M.chainNet(v)).toBe(1000);
    expect(M.sideNet(v)).toBe(0);
  });

  it("services only (garage income is revenue of a side business)", () => {
    const v = L({ services: 100 });
    expect(M.ledgerNet(v)).toBe(100);
    expect(M.chainNet(v)).toBe(0);
    expect(M.sideNet(v)).toBe(100);
  });

  it("racing only (prizes are revenue of the racing team)", () => {
    const v = L({ racing: 50 });
    expect(M.ledgerNet(v)).toBe(50);
    expect(M.chainNet(v)).toBe(0);
    expect(M.sideNet(v)).toBe(50);
  });

  it("repairs only (entry fees and repairs are a racing cost)", () => {
    const v = L({ repairs: 20 });
    expect(M.ledgerNet(v)).toBe(-20);
    expect(M.chainNet(v)).toBe(0);
    expect(M.sideNet(v)).toBe(-20);
  });

  it("mixed: $1000 sales + $100 services + $50 racing − $20 repairs", () => {
    const v = L({ carSales: 1000, services: 100, racing: 50, repairs: 20 });
    expect(M.ledgerNet(v)).toBe(1130);
    expect(M.chainNet(v)).toBe(1000);
    expect(M.sideNet(v)).toBe(130);
    // the whole is exactly the sum of its parts: nothing taken out twice
    expect(M.ledgerNet(v)).toBe(M.chainNet(v) + M.sideNet(v));
    expect(M.ledgerNet(v)).not.toBe(1000 - 100 - 50 - 100 - 50 + 20);
  });

  it("$1000 revenue and $100 costs = $900 net", () => {
    const v = L({ carSales: 1000, materials: 100 });
    expect(M.ledgerRevenue(v)).toBe(1000);
    expect(M.ledgerCosts(v)).toBe(100);
    expect(M.ledgerNet(v)).toBe(900);
    expect(M.chainNet(v)).toBe(900);
  });

  it("many expense categories at once", () => {
    const v = L({ carSales: 1000, partSales: 200, services: 30, materials: 300, labor: 50, energy: 10, maintenance: 5, logistics: 15, dealerFees: 60, tax: 80, repairs: 7 });
    expect(M.ledgerRevenue(v)).toBe(1230);
    expect(M.ledgerCosts(v)).toBe(527);
    expect(M.ledgerNet(v)).toBe(703);
    expect(M.chainNet(v)).toBe(1200 - 520);
    expect(M.sideNet(v)).toBe(30 - 7);
    expect(M.ledgerNet(v)).toBe(M.chainNet(v) + M.sideNet(v));
  });

  it("every key is in exactly one group, and the result doesn't depend on order", () => {
    const groups = [M.CHAIN_REVENUE_KEYS, M.CHAIN_COST_KEYS, M.SIDE_REVENUE_KEYS, M.SIDE_COST_KEYS, M.OTHER_KEYS];
    for (const k of M.LEDGER_KEYS) expect(groups.filter((g) => g.includes(k)).length).toBe(1);
    expect(groups.flat().length).toBe(M.LEDGER_KEYS.length);
    const v = L({ carSales: 10.5, partSales: 3.25, services: 2, racing: 1, materials: 4, labor: 1.5, repairs: 0.75 });
    const shuffled = Object.fromEntries(Object.entries(v).reverse()) as LedgerValues;
    expect(M.ledgerNet(shuffled)).toBe(M.ledgerNet(v));
    expect(M.ledgerNet(v)).toBe(M.ledgerNet(v));
  });

  it("rewards are booked below the line: in no revenue, cost or net", () => {
    const v = L({ carSales: 100, rewards: 5_000 });
    expect(M.ledgerRevenue(v)).toBe(100);
    expect(M.ledgerNet(v)).toBe(100);
    expect(M.chainNet(v)).toBe(100);
  });
});

describe("accounting: the game books every dollar once", () => {
  it("the HUD profit is the dashboard's net, and the chain rate is read off the same ledger", () => {
    const s = createInitialState(T0);
    run(s, 300);
    const snap = snapshot(s);
    // the ledger, plus the change in what was made and isn't sold yet (at its cost)
    expect(snap.incomePerSec).toBe(M.ledgerNet(s.chain.ledger.rate) + (s.chain.goodsRate ?? 0));
    expect(s.chain.rate).toBeCloseTo(M.chainNet(s.chain.ledger.rate) + (s.chain.goodsRate ?? 0), 9);
    // a company losing money shows it: the profit is not clamped at zero
    s.chain.ledger.rate = L({ labor: 5 });
    s.chain.goodsRate = 0;
    expect(snapshot(s).incomePerSec).toBe(-5);
  });

  it("a cost the cash can't cover goes on the account, never disappears (truck & bus line)", () => {
    const s = createInitialState(T0);
    s.cash = 1e8;
    s.city.zones.push("industrial");
    expect(C.buildStructure(s, Co.plotsFor("fleetPlant")[0], "fleetPlant")).toBe(true);
    Co.constructionTick(s, 1e9);
    s.cash = 0;
    s.chain.owed = 0;
    const u = Ex.fleetUnit("van");
    s.fleet.carry = 0.999;
    Ex.fleetTick(s, 1);
    expect(s.fleet.built).toBe(1);
    // the parts were paid out of the sale or put on the account: cash + debt reflect the full cost
    expect(s.cash - s.chain.owed).toBeCloseTo(u.price - u.cost, 6);
    expect(s.chain.ledger.pending.materials).toBeCloseTo(u.cost, 6);
  });

  it("export ship fees and star engineers' salaries are paid or owed", () => {
    const s = createInitialState(T0);
    s.cash = 0;
    s.chain.owed = 0;
    s.chain.steady = 100;
    s.engineers.hired = [{ id: "kenji", pay: "fair" }];
    const pay = Ex.salaries(s) * 10;
    expect(pay).toBeGreaterThan(0);
    Ex.engineersTick(s, T0, 10);
    expect(s.chain.owed).toBeCloseTo(pay, 6);
    expect(s.chain.ledger.pending.labor).toBeCloseTo(pay, 6);
  });

  it("rewards are paid once and booked below the line", () => {
    const s = createInitialState(T0);
    const cash = s.cash;
    grantReward(s, { cash: 2_500 }, snapshot(s));
    expect(s.cash).toBe(cash + 2_500);
    expect(s.chain.ledger.pending.rewards).toBe(2_500);
    run(s, 1);
    expect(s.chain.ledger.run.rewards).toBe(2_500);
    expect(M.ledgerNet(s.chain.ledger.run)).toBe(M.ledgerNet({ ...s.chain.ledger.run, rewards: 0 }));
  });

  it("coming back from offline keeps the session's rates (the absence goes into the run totals)", () => {
    const s = createInitialState(T0);
    run(s, 120);
    const rates = { ...s.chain.ledger.rate };
    const runBefore = M.ledgerRevenue(s.chain.ledger.run);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.warehouse = 10;
    p.stock = Ch.starterStock("bodyWorks", 1, 30);
    s.lastActiveAt = T0;
    settleOffline(s, T0 + 2 * 3600 * 1000);
    expect(s.chain.ledger.rate).toEqual(rates);
    expect(s.chain.rate).toBeCloseTo(M.chainNet(rates), 9);
    expect(M.ledgerRevenue(s.chain.ledger.run)).toBeGreaterThan(runBefore);
  });
});

describe("the profit shown counts what was made and isn't sold yet", () => {
  it("parts and cars waiting to be sold are worth what they cost to make", () => {
    const s = createInitialState(T0);
    s.city.buildings[STARTER_PLOT].plant!.out = 0;
    s.chain.shipments = [];
    const base = Ch.goodsValue(s);
    // a car at the dealer and two bodies on their way to the market
    s.chain.dealers.local = { cars: 1, value: 6_000, models: ["city"], next: 1e9, sold: 0 };
    s.chain.shipments.push({ id: 7, from: STARTER_PLOT, to: "m:market", item: "body", qty: 2, value: 4_000, t: 0, dur: 1e9, back: false, vehicle: "truck" });
    const car = carStdCost(CAR_BY_ID.city, Ch.recipe(CAR_BY_ID.city));
    expect(Ch.goodsValue(s) - base).toBeCloseTo(car + 2 * componentStdCost("body", 1), 6);
  });

  it("selling a car takes its cost out of the stock: the profit shown is the sale minus what the car cost", () => {
    const s = createInitialState(T0);
    run(s, 2);
    s.dealers.local.owned = true;
    s.chain.dealers.local = { cars: 1, value: 6_000, models: ["city"], next: 1e9, sold: 0 };
    run(s, 0.5);
    const before = Ch.goodsValue(s);
    s.chain.dealers.local!.next = 0;
    run(s, 0.5);
    expect(s.chain.dealers.local!.cars).toBe(0);
    const car = carStdCost(CAR_BY_ID.city, Ch.recipe(CAR_BY_ID.city));
    // (the starter Body Works may have made something in the same half second)
    expect(before - Ch.goodsValue(s)).toBeGreaterThan(car - 2_000);
  });
});
