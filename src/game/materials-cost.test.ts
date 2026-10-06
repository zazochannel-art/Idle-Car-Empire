// Phase 2 of the economy audit: every material in a warehouse carries its own
// cost basis (weighted average of what was paid for it); using a unit books
// exactly that unit's cost, never an average over the whole warehouse.
import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { MATERIAL_BY_ID } from "./config/economy";
import * as Ch from "./engine/chain";
import * as M from "./engine/materials";
import { settleOffline } from "./engine/offline";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { decodeSave, encodeSave, migrate } from "./save/serialize";
import type { GameState, PlantData } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const run = (s: GameState, seconds: number, step = 0.5) => {
  for (let t = 0; t < seconds; t += step) tick(s, step);
};
const booked = (s: GameState) => s.chain.ledger.pending.materials + s.chain.ledger.run.materials;

/** A warehouse with 100 Steel at $25 and 1 Electronics at $120. */
function warehouse() {
  const s = createInitialState(T0);
  const p: PlantData = { ...Ch.newPlant(), stock: {}, stockCost: 0, stockCostBy: {} };
  M.addStock(p, { steel: 100 }, 2_500);
  M.addStock(p, { electronics: 1 }, 120);
  return { s, p };
}

describe("material cost: each material at its own cost", () => {
  it("TEST 1: 100 Steel @ $25 + 1 Electronics @ $120 — using 1 Electronics costs $120", () => {
    const { s, p } = warehouse();
    expect(M.inventoryValue(p)).toBe(2_620);
    expect(M.unitCostOf(p, "electronics")).toBe(120);
    expect(M.unitCostOf(p, "steel")).toBe(25);
    M.spendMaterials(s, p, { electronics: 1 }, 1);
    expect(booked(s)).toBe(120);
    expect(p.stock.electronics).toBe(0);
    expect(M.inventoryValue(p)).toBe(2_500);
  });

  it("TEST 2: using 10 Steel costs $250", () => {
    const { s, p } = warehouse();
    M.spendMaterials(s, p, { steel: 10 }, 1);
    expect(booked(s)).toBeCloseTo(250, 9);
    expect(M.unitCostOf(p, "steel")).toBeCloseTo(25, 9);
    expect(M.inventoryValue(p)).toBeCloseTo(2_370, 9);
  });

  it("TEST 3: mixed use — 3 units of (10 Steel + some Electronics) cost each material's own price", () => {
    const { s, p } = warehouse();
    M.addStock(p, { electronics: 2 }, 240);
    M.spendMaterials(s, p, { steel: 10, electronics: 1 }, 3);
    expect(booked(s)).toBeCloseTo(30 * 25 + 3 * 120, 9);
    expect(p.stock).toEqual({ steel: 70, electronics: 0 });
    expect(M.inventoryValue(p)).toBeCloseTo(70 * 25, 9);
    // the stock's value plus what was booked is exactly what was paid
    expect(M.inventoryValue(p) + booked(s)).toBeCloseTo(2_500 + 120 + 240, 9);
  });

  it("TEST 4: purchases at different prices average out (weighted average)", () => {
    const s = createInitialState(T0);
    const p: PlantData = { ...Ch.newPlant(), stock: {}, stockCost: 0, stockCostBy: {} };
    M.addStock(p, { steel: 100 }, 2_500); // $25
    M.addStock(p, { steel: 100 }, 3_500); // $35
    expect(M.unitCostOf(p, "steel")).toBeCloseTo(30, 9);
    M.spendMaterials(s, p, { steel: 50 }, 1);
    expect(booked(s)).toBeCloseTo(1_500, 9);
    expect(M.inventoryValue(p)).toBeCloseTo(4_500, 9);
    // a delivery with several materials shares its price by list price
    const q: PlantData = { ...Ch.newPlant(), stock: {}, stockCost: 0, stockCostBy: {} };
    M.addStock(q, { steel: 10, electronics: 1 }, 740); // list: 250 + 120 = 370 → paid twice list
    expect(M.unitCostOf(q, "steel")).toBeCloseTo(50, 9);
    expect(M.unitCostOf(q, "electronics")).toBeCloseTo(240, 9);
  });

  it("a real order: what the plant pays is what its bodies book, material by material", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = {};
    p.stockCost = 0;
    p.stockCostBy = {};
    const steel = M.buyMaterial(s, STARTER_PLOT, "steel", 300);
    const plastic = M.buyMaterial(s, STARTER_PLOT, "plastic", 30);
    expect(steel.ok && plastic.ok).toBe(true);
    // nothing is a cost until it is used
    expect(booked(s)).toBe(0);
    run(s, 300);
    const paid = (steel.ok ? steel.cost : 0) + (plastic.ok ? plastic.cost : 0);
    expect(p.made).toBeGreaterThan(0);
    expect(booked(s) + M.inventoryValue(p)).toBeCloseTo(paid, 6);
    // each body booked 60 steel and 6 plastic at their own unit prices
    const steelUnit = (steel.ok ? steel.cost : 0) / 300;
    const plasticUnit = (plastic.ok ? plastic.cost : 0) / 30;
    expect(booked(s)).toBeCloseTo(p.made * (60 * steelUnit + 6 * plasticUnit), 6);
  });

  it("TEST 5: the cost basis survives save/load; old saves split their total by list price", () => {
    const { p } = warehouse();
    const s = createInitialState(T0);
    s.city.buildings[STARTER_PLOT].plant = { ...s.city.buildings[STARTER_PLOT].plant!, stock: { ...p.stock }, stockCost: p.stockCost, stockCostBy: { ...p.stockCostBy } };
    // body works don't use electronics, but the warehouse keeps whatever it holds
    const back = decodeSave(encodeSave(s), T0).city.buildings[STARTER_PLOT].plant!;
    expect(back.stockCostBy).toEqual({ steel: 2_500, electronics: 120 });
    expect(back.stockCost).toBe(2_620);

    // a save from before per-material costs: only the total
    const raw = JSON.parse(JSON.stringify(s));
    const plant = raw.city.buildings[STARTER_PLOT].plant;
    plant.stock = { steel: 100, plastic: 50 };
    plant.stockCost = 3_000;
    delete plant.stockCostBy;
    const old = migrate(raw, T0).city.buildings[STARTER_PLOT].plant!;
    const listSteel = 100 * MATERIAL_BY_ID.steel.price;
    const listPlastic = 50 * MATERIAL_BY_ID.plastic.price;
    expect(old.stockCostBy!.steel).toBeCloseTo((3_000 * listSteel) / (listSteel + listPlastic), 9);
    expect(M.inventoryValue(old)).toBeCloseTo(3_000, 9);

    // broken values fall back to the total too (never NaN, never lost)
    plant.stockCostBy = { steel: "lots", plastic: 10 };
    const broken = migrate(JSON.parse(JSON.stringify(raw)), T0).city.buildings[STARTER_PLOT].plant!;
    expect(M.inventoryValue(broken)).toBeCloseTo(3_000, 9);
    expect(Number.isFinite(broken.stockCostBy!.steel!)).toBe(true);
  });

  it("TEST 6: offline production books exactly the stock it used, and makes nothing from nothing", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.warehouse = 10;
    p.stock = {};
    p.stockCost = 0;
    p.stockCostBy = {};
    M.addStock(p, Ch.starterStock("bodyWorks", 1, 20), 20 * 1_700);
    const value0 = M.inventoryValue(p);
    const steel0 = p.stock.steel!;
    const report = settleOffline(s, T0 + 2 * 3600 * 1000)!;
    const made = report.components ?? 0;
    expect(made).toBeGreaterThan(0);
    // no material appeared: what was made is at most what the stock allowed
    expect(made).toBeLessThanOrEqual(20);
    expect(p.stock.steel!).toBe(steel0 - 60 * made);
    // the cost booked while away is exactly the value that left the warehouse
    expect(report.ledger!.materials).toBeCloseTo(value0 - M.inventoryValue(p), 6);
  });
});
