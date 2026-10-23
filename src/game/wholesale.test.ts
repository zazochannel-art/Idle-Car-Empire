// Phase 8 of the economy audit: wholesale can't turn stock into cash without
// limit. Cars never go to the wholesale buyer any more (they wait for a
// dealer); the Parts Market — the wholesale outlet for components — pays
// full price only up to its appetite, then less, down to a wholesale floor.
import { describe, expect, it } from "vitest";
import { MARKET, STARTER_PLOT } from "./city/layout";
import { PARTS_DEMAND, WHOLESALE } from "./config/chain";
import * as Ch from "./engine/chain";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import type { GameState, Shipment } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);

/** A load of bodies arriving at the Parts Market right now. */
function deliver(s: GameState, qty: number, value: number) {
  const sh: Shipment = { id: s.chain.nextShip++, from: STARTER_PLOT, to: MARKET, item: "body", qty, value, t: 1e9, dur: 1, back: false, vehicle: "truck" };
  s.chain.shipments.push(sh);
  const before = s.chain.ledger.pending.partSales + s.chain.ledger.run.partSales;
  tick(s, 0.01);
  return s.chain.ledger.pending.partSales + s.chain.ledger.run.partSales - before;
}

describe("wholesale and the Parts Market", () => {
  it("the car wholesale price stays 70% of value and only serves loads already on their way in old saves", () => {
    expect(WHOLESALE).toBe(0.7);
    const s = createInitialState(T0);
    s.chain.shipments.push({ id: 1, from: STARTER_PLOT, to: MARKET, item: "car", qty: 2, value: 10_000, t: 1e9, dur: 1, back: false, vehicle: "carrier", models: ["city", "city"] });
    tick(s, 0.01);
    expect(s.chain.ledger.pending.carSales + s.chain.ledger.run.carSales).toBeCloseTo(7_000, 6);
  });

  it("full price within the market's appetite", () => {
    const s = createInitialState(T0);
    const depth = Ch.partsDepth(s, "body");
    expect(depth).toBe(PARTS_DEMAND.depth * 2); // a Level 1 Body Works
    expect(deliver(s, 5, 10_000)).toBeCloseTo(10_000, 6);
  });

  it("beyond it every extra unit fetches less, never below the wholesale floor", () => {
    const s = createInitialState(T0);
    const depth = Ch.partsDepth(s, "body");
    s.chain.demand = { body: depth * 1.2 };
    const m = Ch.partsPriceMult(s, "body", 2);
    expect(m).toBeCloseTo(depth / (depth * 1.2 + 1), 9);
    expect(m).toBeLessThan(1);
    expect(deliver(s, 2, 1_000)).toBeCloseTo(1_000 * m, 6);
    s.chain.demand = { body: depth * 100 };
    expect(Ch.partsPriceMult(s, "body")).toBe(PARTS_DEMAND.floor);
    expect(PARTS_DEMAND.floor).toBeGreaterThanOrEqual(0.5);
    expect(PARTS_DEMAND.floor).toBeLessThanOrEqual(0.6);
  });

  it("the market's memory fades over its window; bigger plants widen its appetite", () => {
    const s = createInitialState(T0);
    s.chain.demand = { body: 1_000 };
    for (let t = 0; t < PARTS_DEMAND.window; t += 1) tick(s, 1);
    expect(s.chain.demand.body!).toBeCloseTo(1_000 * Math.exp(-1), -1);
    const d1 = Ch.partsDepth(s, "body");
    s.city.buildings[STARTER_PLOT].level = 5;
    expect(Ch.partsDepth(s, "body")).toBe(d1 + 4 * PARTS_DEMAND.depth);
  });
});
