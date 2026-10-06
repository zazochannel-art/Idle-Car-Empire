// Phase 11 of the economy audit: the Economy dashboard's figures all come
// from one place, the same ledger the HUD profit reads.
import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { snapshot } from "./engine/economy";
import * as M from "./engine/materials";
import { economyReport } from "./engine/report";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";

const T0 = Date.UTC(2026, 2, 1, 12);

describe("economy dashboard: one source of truth", () => {
  it("net profit is the HUD's profit; revenue − costs = net; margin = net ÷ revenue", () => {
    const s = createInitialState(T0);
    for (let t = 0; t < 300; t += 0.5) tick(s, 0.5);
    const r = economyReport(s);
    expect(r.netPerSec).toBe(snapshot(s).incomePerSec);
    expect(r.revenuePerSec - r.costsPerSec).toBeCloseTo(r.netPerSec, 9);
    expect(r.margin).toBeCloseTo(r.netPerSec / r.revenuePerSec, 9);
    expect(r.runNet).toBe(M.ledgerNet(s.chain.ledger.run));
    expect(r.cash).toBe(s.cash);
  });

  it("stock value, debt and cars come from the game state, not from a screen formula", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = {};
    p.stockCostBy = {};
    p.stockCost = 0;
    M.addStock(p, { steel: 100 }, 2_500);
    s.chain.owed = 1_500;
    s.chain.dealers.local = { cars: 4, value: 20_000, models: ["city", "city", "city", "city"], next: 10, sold: 0 };
    s.chain.shipments.push({ id: 99, from: STARTER_PLOT, to: "d:local", item: "car", qty: 2, value: 10_000, t: 0, dur: 10, back: false, vehicle: "carrier", models: ["city", "city"] });
    M.buyMaterial(s, STARTER_PLOT, "plastic", 10);
    s.run.carsProduced = 12;
    s.run.carsSold = 6;
    const r = economyReport(s);
    expect(r.inventoryValue).toBe(2_500);
    expect(r.inventoryIncoming).toBeCloseTo(M.orderCost(s, "plastic", 10), 6);
    expect(r.owed).toBe(1_500);
    expect(r.debtLimit).toBe(M.debtLimit(s));
    expect(r.carsInStorage).toBe(6);
    expect(r.carsProduced).toBe(12);
    expect(r.carsSold).toBe(6);
  });
});
