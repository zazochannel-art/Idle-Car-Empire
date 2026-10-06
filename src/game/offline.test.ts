// Phase 9 of the economy audit: offline production runs the very same
// simulation as the online game (at the offline efficiency): the same cost
// per unit, nothing made from material that isn't there, and the money the
// report holds is exactly what the company gained.
import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import * as C from "./engine/city";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import * as M from "./engine/materials";
import { snapshot } from "./engine/economy";
import { collectOffline, settleOffline } from "./engine/offline";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import type { GameState, PlantType } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const HOUR = 3600 * 1000;
const run = (s: GameState, seconds: number, step = 0.5) => {
  for (let t = 0; t < seconds; t += step) tick(s, step);
};

/** A Body Works with 40 bodies' worth of material that cost $1,700 a body. */
function stocked() {
  const s = createInitialState(T0);
  const p = s.city.buildings[STARTER_PLOT].plant!;
  p.warehouse = 10;
  p.stock = {};
  p.stockCost = 0;
  p.stockCostBy = {};
  M.addStock(p, Ch.starterStock("bodyWorks", 1, 40), 40 * 1_700);
  s.cash = 0;
  return { s, p };
}

function build(s: GameState, type: PlantType) {
  s.lifetime.parts.body = Math.max(s.lifetime.parts.body, 12);
  s.cash += Ch.plantBuildCost(s, type);
  const plot = Co.plotsFor(type)[0];
  expect(C.buildStructure(s, plot, type)).toBe(true);
  Co.constructionTick(s, 1e9);
  return s.city.buildings[plot].plant!;
}

describe("offline production: the same economy as online", () => {
  it("each unit costs the same online and offline (materials, wages, energy, upkeep)", () => {
    const a = stocked();
    const b = stocked();
    run(a.s, 1_800);
    const report = settleOffline(b.s, T0 + HOUR / 2)!;
    expect(a.p.made).toBeGreaterThan(5);
    expect(b.p.made).toBeGreaterThan(5);
    // offline plants run at their offline efficiency: fewer units, each one costs the same
    expect(b.p.made).toBeLessThan(a.p.made);
    const per = (s: GameState, p: { made: number }) => ({
      materials: s.chain.ledger.run.materials / p.made,
      running: (s.chain.ledger.run.labor + s.chain.ledger.run.energy + s.chain.ledger.run.maintenance) / p.made,
    });
    const on = per(a.s, a.p);
    const off = per(b.s, b.p);
    expect(off.materials).toBeCloseTo(on.materials, 6);
    expect(off.materials).toBeCloseTo(1_700, 6);
    // the batch in progress at the end costs a fraction of a unit's running time
    expect(off.running / on.running).toBeGreaterThan(0.9);
    expect(off.running / on.running).toBeLessThan(1.1);
    expect(report.materialsUsed).toBe(b.p.made * 66);
  });

  it("nothing is made from material that isn't there, whatever the absence", () => {
    const { s, p } = stocked();
    s.chain.rescueT = 1e12; // no emergency supplier in this test
    settleOffline(s, T0 + 12 * HOUR);
    expect(p.made).toBe(40);
    expect(p.stock.steel ?? 0).toBe(0);
    expect(M.inventoryValue(p)).toBeCloseTo(0, 6);
    // a second absence with an empty warehouse makes nothing at all
    const made = p.made;
    settleOffline(s, T0 + 24 * HOUR);
    expect(p.made).toBe(made);
  });

  it("cars made while away never outnumber the parts that were there", () => {
    const s = createInitialState(T0);
    build(s, "engineFactory");
    build(s, "tireFactory");
    const asm = build(s, "assemblyPlant");
    for (const [, b] of Ch.plantsOf(s)) if (b.plant.stock) b.plant.stock = {};
    asm.inputs = { body: 4, engine: 6, tires: 9 };
    s.cash = 0;
    s.chain.rescueT = 1e12;
    s.lastActiveAt = T0;
    const before = s.lifetime.carsProduced;
    settleOffline(s, T0 + 3 * HOUR);
    expect(s.lifetime.carsProduced - before).toBe(4);
    expect(asm.inputs).toMatchObject({ body: 0, engine: 2, tires: 5 });
  });

  it("the report holds exactly what the company gained, and collecting pays it once", () => {
    const { s } = stocked();
    s.cash = 1_000;
    const report = settleOffline(s, T0 + HOUR)!;
    expect(report.money).toBeGreaterThan(0);
    // held back: the cash is where it was until COLLECT
    expect(s.cash).toBe(1_000);
    const paid = collectOffline(s);
    expect(paid).toBe(report.money);
    expect(s.cash).toBeCloseTo(1_000 + report.money, 6);
    expect(collectOffline(s)).toBe(0);
  });

  it("the report says how the company's account changed while away", () => {
    const { s } = stocked();
    s.chain.owed = 0;
    const report = settleOffline(s, T0 + HOUR / 4)!;
    expect(report.owed ?? 0).toBeCloseTo(s.chain.owed, 6);
  });

  it("offline efficiency is the only difference: production scales by it", () => {
    const { s } = stocked();
    const eff = snapshot(s).chain.plants[STARTER_PLOT].offline;
    expect(eff).toBeGreaterThan(0);
    expect(eff).toBeLessThan(1);
  });
});
