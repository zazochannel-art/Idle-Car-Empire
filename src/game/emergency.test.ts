// Phase 7 of the economy audit: the free "rescue" (material for nothing and
// the debt written off) is now the emergency supplier — material at +50%,
// on the company's account, nothing forgiven, at most once per cooldown.
import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { RESCUE } from "./config/economy";
import * as M from "./engine/materials";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import type { GameEvent, GameState } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const run = (s: GameState, seconds: number, step = 0.5) => {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += step) events.push(...tick(s, step));
  return events;
};

/** A company with nothing: an empty warehouse, $100 and an old debt. */
function stuck() {
  const s = createInitialState(T0);
  const p = s.city.buildings[STARTER_PLOT].plant!;
  p.stock = {};
  p.stockCost = 0;
  p.stockCostBy = {};
  s.cash = 100;
  s.chain.owed = 700;
  return { s, p };
}

describe("emergency supplier (instead of a free rescue)", () => {
  it("a stuck company gets material at the emergency price, on its account; nothing is written off", () => {
    const { s } = stuck();
    const events = run(s, 1);
    const order = s.chain.shipments.find((sh) => sh.to === STARTER_PLOT && sh.materials);
    expect(order).toBeDefined();
    const need = M.unitMaterials("bodyWorks", 1);
    expect(order!.materials).toEqual({ steel: need.steel! * RESCUE.units, plastic: need.plastic! * RESCUE.units });
    expect(order!.value).toBeCloseTo(M.emergencyCost(s, order!.materials!), 6);
    // +50% on the market price: dearer than a normal order of the same material
    const normal = (Object.entries(order!.materials!) as [Parameters<typeof M.orderCost>[1], number][]).reduce((a, [m, n]) => a + M.orderCost(s, m, n), 0);
    expect(order!.value).toBeGreaterThan(normal * 1.4);
    // paid from the cash first, the rest owed — on top of what was owed before
    expect(s.cash).toBe(0);
    expect(s.chain.owed).toBeCloseTo(700 + order!.value - 100, 6);
    expect(events.some((e) => e.type === "emergency")).toBe(true);
  });

  it("the material enters the warehouse at what it cost, and is booked at that cost when used", () => {
    const { s, p } = stuck();
    run(s, 1);
    const cost = s.chain.shipments.find((sh) => sh.materials)!.value;
    run(s, 200);
    expect(p.made).toBe(RESCUE.units);
    expect(s.chain.ledger.run.materials).toBeCloseTo(cost, 6);
    expect(M.inventoryValue(p)).toBeCloseTo(0, 6);
  });

  it("at most once per cooldown, and only when the company really is stuck", () => {
    const { s } = stuck();
    run(s, 1);
    s.chain.shipments = [];
    run(s, 60);
    expect(s.chain.shipments.some((sh) => sh.materials)).toBe(false);
    // cash for one unit of material: the company can help itself
    const t = createInitialState(T0);
    t.city.buildings[STARTER_PLOT].plant!.stock = {};
    t.cash = 5_000;
    run(t, 1);
    expect(t.chain.shipments.some((sh) => sh.materials)).toBe(false);
    // material in the warehouse: nothing to rescue
    const u = createInitialState(T0);
    u.cash = 0;
    run(u, 1);
    expect(u.chain.shipments.some((sh) => sh.materials)).toBe(false);
  });

  it("selling what the emergency material made leaves cash for normal material again (the debt stays to be paid)", () => {
    const { s } = stuck();
    s.chain.owed = 0;
    run(s, 1);
    const owed = s.chain.owed;
    expect(owed).toBeGreaterThan(0);
    // bodies are made, shipped and sold at the Parts Market: the sale is cash, the account is paid out of profit
    run(s, 600);
    expect(s.cash).toBeGreaterThan(1_000);
    expect(s.chain.owed).toBeGreaterThan(owed * 0.5);
  });

  it("never more than an emergency line of twice the account's limit", () => {
    const { s } = stuck();
    s.chain.restructuredT = 0; // the last resort was used a moment ago
    s.chain.owed = 2 * M.debtLimit(s) - 100;
    const owed = s.chain.owed;
    run(s, 1);
    expect(s.chain.shipments.some((sh) => sh.materials)).toBe(false);
    expect(s.chain.owed).toBeGreaterThanOrEqual(owed - 1);
  });

  it("last resort: stuck with the emergency line full, the account is cut to its limit — paid with reputation, once an hour", () => {
    const { s } = stuck();
    s.cash = 0;
    const limit = (() => {
      tick(s, 0.5);
      return M.debtLimit(s);
    })();
    s.chain.shipments = [];
    s.chain.rescueT = undefined;
    s.chain.owed = 2 * limit + 5_000;
    const rep = s.quality.rep;
    const events = run(s, 1);
    expect(events.some((e) => e.type === "restructured")).toBe(true);
    expect(s.quality.rep).toBeCloseTo(Math.max(0, rep - RESCUE.restructure.rep), 1);
    // the account was cut to its limit, then the emergency delivery went on it
    const order = s.chain.shipments.find((sh) => sh.materials)!;
    expect(order).toBeDefined();
    expect(s.chain.owed).toBeCloseTo(limit + order.value, 6);
    // not again within the hour, even stuck again
    s.chain.shipments = [];
    s.chain.rescueT = undefined;
    s.chain.owed = 2 * limit + 5_000;
    const again = run(s, 1);
    expect(again.some((e) => e.type === "restructured")).toBe(false);
  });
});
