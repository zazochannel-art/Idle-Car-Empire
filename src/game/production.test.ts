// Phases 3–4 of the economy audit: raw materials → components → car. The
// supplier sells raw materials; finished parts only where the company has
// no plant for them (tyres early, drivetrain), dearer, paid up front and
// delivered by truck; bodies and engines are always made in-house.
import { describe, expect, it } from "vitest";
import { DEPOT, STARTER_PLOT } from "./city/layout";
import { CAR_BY_ID } from "./config/cars";
import { OUTSOURCE, OUTSOURCED_PARTS } from "./config/chain";
import * as C from "./engine/city";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import { componentStdCost } from "./engine/costs";
import { snapshot } from "./engine/economy";
import * as M from "./engine/materials";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import type { GameState, PlantType } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const run = (s: GameState, seconds: number, step = 0.5) => {
  for (let t = 0; t < seconds; t += step) tick(s, step);
};
const P = (type: PlantType) => Co.plotsFor(type)[0];

function build(s: GameState, type: PlantType) {
  s.lifetime.parts.body = Math.max(s.lifetime.parts.body, 12);
  s.cash += Ch.plantBuildCost(s, type);
  expect(C.buildStructure(s, P(type), type)).toBe(true);
  Co.constructionTick(s, 1e9);
  return s.city.buildings[P(type)].plant!;
}

describe("suppliers: raw materials, and finished parts only where there is no plant", () => {
  it("the material supplier delivers raw material into the warehouse, paid when ordered", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    const steel0 = p.stock.steel ?? 0;
    const cash = s.cash;
    const r = M.buyMaterial(s, STARTER_PLOT, "steel", 100);
    expect(r.ok).toBe(true);
    expect(s.cash).toBeCloseTo(cash - (r.ok ? r.cost : 0), 9);
    expect(s.chain.shipments.some((sh) => sh.from === DEPOT && sh.to === STARTER_PLOT && sh.item === "raw")).toBe(true);
    run(s, 120);
    expect(p.stock.steel ?? 0).toBeGreaterThan(steel0 - 60 * p.made);
  });

  it("only tyres and drivetrain parts can be bought finished; bodies and engines never", () => {
    expect(OUTSOURCED_PARTS).toEqual(["tires", "transmission", "wheels", "brakes"]);
    const s = createInitialState(T0);
    expect(Ch.supplied(s, "body")).toBe(false);
    expect(Ch.supplied(s, "engine")).toBe(false);
    expect(Ch.supplied(s, "interior")).toBe(false);
    expect(Ch.supplied(s, "tires")).toBe(true);
    // an assembly plant whose engine factory is gone gets no engines from anyone
    build(s, "engineFactory");
    const asm = build(s, "assemblyPlant");
    delete s.city.buildings[P("engineFactory")];
    s.cash = 1e6;
    run(s, 120);
    expect(asm.inputs.engine ?? 0).toBe(0);
    expect(s.chain.shipments.some((sh) => sh.item === "engine")).toBe(false);
    expect(Ch.carLock(s, CAR_BY_ID.city, snapshot(s).gm)).toEqual({ kind: "plant", plant: "engineFactory" });
  });

  it("outsourced tyres cost more than making them, are paid up front and arrive by truck", () => {
    const s = createInitialState(T0);
    build(s, "engineFactory");
    const asm = build(s, "assemblyPlant");
    const id = P("assemblyPlant");
    s.cash = 50_000;
    s.chain.owed = 0;
    const price = Ch.supplierPrice("tires", 1);
    expect(price).toBeCloseTo(componentStdCost("tires", 1) * OUTSOURCE.markup, 9);
    expect(OUTSOURCE.markup).toBeGreaterThan(1.3);
    tick(s, 0.5);
    const order = s.chain.shipments.find((sh) => sh.item === "tires" && sh.to === id);
    expect(order).toBeDefined();
    expect(order!.from).toBe(DEPOT);
    expect(order!.value).toBeCloseTo(order!.qty * price, 6);
    // paid now, nothing on account, nothing in the plant yet
    expect(s.chain.owed).toBe(0);
    expect(asm.inputs.tires ?? 0).toBe(0);
    expect(s.chain.ledger.run.materials + s.chain.ledger.pending.materials).toBeCloseTo(order!.value, 6);
    for (let i = 0; i < 400 && !(asm.inputs.tires ?? 0); i++) tick(s, 0.5);
    expect(asm.inputs.tires).toBe(order!.qty);
  });

  it("without cash the supplier gives trade credit for the next batch only", () => {
    const s = createInitialState(T0);
    build(s, "engineFactory");
    const asm = build(s, "assemblyPlant");
    const id = P("assemblyPlant");
    s.cash = 0;
    s.chain.owed = 0;
    asm.inputs = { body: 3, engine: 3 };
    tick(s, 0.5);
    const order = s.chain.shipments.find((sh) => sh.item === "tires" && sh.to === id)!;
    const lines = snapshot(s).chain.plants[id].lines;
    expect(order.qty).toBe(lines);
    expect(s.chain.owed).toBeGreaterThanOrEqual(order.value - 1e-6);
    // one delivery at a time: no second order on credit while it drives
    tick(s, 0.5);
    expect(s.chain.shipments.filter((sh) => sh.item === "tires" && !sh.back).length).toBe(1);
  });

  it("emergency parts are never on credit", () => {
    const s = createInitialState(T0);
    build(s, "engineFactory");
    build(s, "tireFactory");
    const asm = build(s, "assemblyPlant");
    const id = P("assemblyPlant");
    for (const [, b] of Ch.plantsOf(s)) if (b.type === "tireFactory") b.plant.status = "noRaw";
    Ch.setBackupParts(s, id, true);
    s.cash = 0;
    s.chain.owed = 0;
    asm.inputs = { body: 3, engine: 3 };
    tick(s, 0.5);
    expect(s.chain.shipments.some((sh) => sh.item === "tires" && sh.from === DEPOT)).toBe(false);
  });

  it("with its own Tire Factory the supplier sells no tyres at all", () => {
    const s = createInitialState(T0);
    build(s, "engineFactory");
    build(s, "tireFactory");
    build(s, "assemblyPlant");
    s.cash = 1e6;
    expect(Ch.supplied(s, "tires")).toBe(false);
    run(s, 60);
    expect(s.chain.shipments.some((sh) => sh.item === "tires" && sh.from === DEPOT)).toBe(false);
  });
});

describe("production: materials → components → car", () => {
  it("a component uses exactly its recipe from the warehouse", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.warehouse = 10;
    p.stock = Ch.starterStock("bodyWorks", 1, 10);
    const need = M.unitMaterials("bodyWorks", 1);
    run(s, 200);
    expect(p.made).toBeGreaterThan(0);
    expect(p.stock.steel).toBe(10 * need.steel! - p.made * need.steel!);
    expect(p.stock.plastic).toBe(10 * need.plastic! - p.made * need.plastic!);
  });

  it("without materials a plant makes nothing (noRaw), and costs nothing to run", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = { steel: 59, plastic: 6 }; // one steel short of a body
    s.cash = 5_000; // enough to buy material (nobody does here)
    run(s, 120);
    expect(p.made).toBe(0);
    expect(p.status).toBe("noRaw");
    expect(p.short).toBe("steel");
    expect(s.chain.ledger.run.labor).toBe(0);
  });

  it("a full output store stops the line (full) without using material", () => {
    const s = createInitialState(T0);
    const st = snapshot(s).chain.plants[STARTER_PLOT];
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.out = st.outCap;
    p.outValue = st.outCap * st.unitValue;
    // no truck may take it away
    const stock = { ...p.stock };
    s.chain.shipments = Array.from({ length: st.trucks }, (_, i) => ({ id: 1000 + i, from: STARTER_PLOT, to: DEPOT, item: "body" as const, qty: 1, value: 0, t: 0, dur: 1e9, back: true, vehicle: "van" as const }));
    run(s, 60);
    expect(p.status).toBe("full");
    expect(p.stock).toEqual(stock);
  });

  it("a car needs every part of its recipe: no car while one is missing", () => {
    const s = createInitialState(T0);
    build(s, "engineFactory");
    build(s, "tireFactory");
    const asm = build(s, "assemblyPlant");
    // stop the part plants so only what we put in is there
    for (const [, b] of Ch.plantsOf(s)) if (b.type !== "assemblyPlant") b.plant.stock = {};
    s.city.buildings[STARTER_PLOT].plant!.stock = {};
    asm.inputs = { body: 2, engine: 2 };
    run(s, 200);
    expect(asm.made).toBe(0);
    expect(asm.status).toBe("noParts");
    expect(asm.missing).toBe("tires");
    asm.inputs.tires = 1;
    run(s, 200);
    expect(asm.made).toBe(1);
    expect(asm.inputs).toMatchObject({ body: 1, engine: 1, tires: 0 });
  });
});
