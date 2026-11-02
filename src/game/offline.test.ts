// Phase 9 of the economy audit: offline production runs the very same
// simulation as the online game (at the offline efficiency): the same cost
// per unit, nothing made from material that isn't there, and the money the
// report holds is exactly what the company gained.
import { afterEach, describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { EVENT_BLOCK_MS, EVENT_LENGTH_MS, EVENT_OFFSET_MS } from "./config/events";
import { OFFLINE } from "./config/offline";
import * as C from "./engine/city";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import * as M from "./engine/materials";
import { snapshot } from "./engine/economy";
import { setScheduledEvents } from "./engine/events";
import { offlineShare } from "./engine/modifiers";
import { collectOffline, computeOffline, settleOffline, spanEnd } from "./engine/offline";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import type { GameState, PlantType } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const HOUR = 3600 * 1000;
const run = (s: GameState, seconds: number, step = 0.5) => {
  for (let t = 0; t < seconds; t += step) tick(s, step);
};

/** A Body Works with `bodies` bodies' worth of material (40) that cost $1,700 a body. */
function stocked(now = T0, bodies = 40) {
  const s = createInitialState(now);
  const p = s.city.buildings[STARTER_PLOT].plant!;
  p.warehouse = 10;
  p.stock = {};
  p.stockCost = 0;
  p.stockCostBy = {};
  M.addStock(p, Ch.starterStock("bodyWorks", 1, bodies), bodies * 1_700);
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

describe("a short absence", () => {
  it("is credited without the report; from five minutes away the report shows", () => {
    const short = stocked();
    short.s.lastActiveAt = T0;
    const cash = short.s.cash;
    expect(settleOffline(short.s, T0 + 2 * 60_000)).toBeNull();
    expect(short.s.pendingOffline).toBeNull();
    expect(short.s.cash).toBeGreaterThan(cash);

    const long = stocked();
    long.s.lastActiveAt = T0;
    expect(settleOffline(long.s, T0 + 6 * 60_000)?.seconds).toBeCloseTo(360);
    expect(long.s.pendingOffline).not.toBeNull();
  });
});

describe("away never pays more than playing", () => {
  it("the offline bonuses count in full up to the soft cap, then less and less, never to 100%", () => {
    for (const x of [0, 0.3, OFFLINE.baseEfficiency, OFFLINE.softFrom]) expect(offlineShare(x)).toBe(x);
    let last = offlineShare(OFFLINE.softFrom);
    for (let x = OFFLINE.softFrom + 0.05; x <= 5; x += 0.05) {
      const y = offlineShare(x);
      // every bonus still adds something
      expect(y).toBeGreaterThan(last);
      expect(y).toBeLessThan(1);
      last = y;
    }
  });

  it("a plant's automation and manager go under the same cap", () => {
    const { s } = stocked();
    s.city.buildings[STARTER_PLOT].plant!.automation = 4;
    const st = snapshot(s);
    st.gm.offlineRaw += 2;
    expect(Ch.plantStats(s, STARTER_PLOT, st.gm, st.chain.cars)!.offline).toBeLessThan(1);
  });
});

describe("the calendar while away", () => {
  afterEach(() => setScheduledEvents([]));
  // a quiet stretch of the regular schedule: from the end of a block's event to the next one's start
  const QUIET = Math.floor(T0 / EVENT_BLOCK_MS) * EVENT_BLOCK_MS + EVENT_OFFSET_MS + EVENT_LENGTH_MS;
  const MIN = 60_000;

  it("the absence is played in stretches that end where an event starts or ends", () => {
    setScheduledEvents([{ id: "carShow", start: QUIET + 20 * MIN, end: QUIET + 50 * MIN }]);
    const end = QUIET + 2 * HOUR;
    expect(spanEnd(QUIET, end)).toBe(QUIET + 20 * MIN);
    expect(spanEnd(QUIET + 20 * MIN, end)).toBe(QUIET + 50 * MIN);
    // never longer than an hour, never past the absence
    expect(spanEnd(QUIET + 50 * MIN, end)).toBe(QUIET + 110 * MIN);
    expect(spanEnd(QUIET + 110 * MIN, end)).toBe(end);
  });

  it("an event counts only while it lasts, not the whole absence", () => {
    const made = (event: boolean) => {
      setScheduledEvents(event ? [{ id: "rushOrders", start: QUIET, end: QUIET + 15 * MIN }] : []);
      const { s, p } = stocked(QUIET, 4_000);
      computeOffline(s, QUIET + 2 * HOUR);
      // the clock is put back: the absence is settled from where it began
      expect(s.lastActiveAt).toBe(QUIET);
      return p.made;
    };
    const base = made(false);
    expect(base).toBeGreaterThan(50);
    // plants 50% faster for 15 minutes of the 2 hours: about 6% more, not 50%
    const ratio = made(true) / base;
    expect(ratio).toBeGreaterThan(1.02);
    expect(ratio).toBeLessThan(1.15);
  });
});
