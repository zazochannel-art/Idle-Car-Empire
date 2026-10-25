import { describe, expect, it } from "vitest";
import { snapshot } from "./engine/economy";
import { BREAKDOWN, CREW, floorTick, wearLimit } from "./engine/floor";
import * as Mt from "./engine/maintenance";
import { collectOffline } from "./engine/offline";
import { resetRun } from "./engine/reset";
import { createInitialState } from "./engine/state";
import * as St from "./engine/stock";
import { decodeSave, encodeSave, migrate } from "./save/serialize";
import type { GameState, PlantData } from "./types";

const T0 = Date.UTC(2026, 9, 25, 12);

/** A company earning `perSec` steadily, with `earned` in all. */
function company(perSec: number, earned = 5e9) {
  const s = createInitialState(T0);
  s.chain.steady = perSec;
  s.chain.rate = perSec;
  s.lifetime.moneyEarned = earned;
  return s;
}

/** Runs one plant's floor for `seconds` in one-second steps: the breakdowns, the first one's repair time and the morale right after it. */
function runFloor(crew: number, seconds: number) {
  const p = { made: 1000, status: "ok" } as unknown as PlantData;
  let breaks = 0;
  let repair = 0;
  let morale = 0;
  for (let t = 0; t < seconds; t++) {
    if (floorTick("b:test:0", p, 1, { running: true, offline: false, managed: false, crew })) {
      breaks++;
      if (!repair) {
        repair = p.broken ?? 0;
        morale = p.morale ?? 0;
      }
    }
  }
  return { breaks, repair, morale };
}

describe("maintenance crew", () => {
  it("each level: fewer breakdowns and quicker repairs; from level 3 morale is spared", () => {
    const none = runFloor(0, 6 * 3600);
    const best = runFloor(CREW.maxLevel, 6 * 3600);
    expect(none.breaks).toBeGreaterThan(best.breaks);
    expect(none.repair).toBe(BREAKDOWN.repair);
    expect(best.repair).toBeCloseTo(BREAKDOWN.repair * (1 - CREW.repairPerLevel * CREW.maxLevel));
    // the wear needed for the first breakdown takes twice as long at the top level
    expect(wearLimit("b:test:0", 0)).toBeGreaterThan(0);
    const calm = runFloor(CREW.calmFrom, 2 * 3600);
    const tired = runFloor(CREW.calmFrom - 1, 2 * 3600);
    expect(calm.morale).toBeGreaterThan(tired.morale);
  });

  it("levels are bought at a price that follows the income, up to the top", () => {
    const s = company(10_000);
    const snap = snapshot(s);
    const cost = Mt.maintenanceCost(s, snap)!;
    expect(cost).toBe(Math.max(Mt.MAINTENANCE_COST.min[0], 10_000 * Mt.MAINTENANCE_COST.seconds[0]));
    s.cash = cost - 1;
    expect(Mt.upgradeMaintenance(s, snap)).toBe(false);
    s.cash = 1e15;
    for (let i = 0; i < CREW.maxLevel; i++) expect(Mt.upgradeMaintenance(s, snapshot(s))).toBe(true);
    expect(s.maintenance.level).toBe(CREW.maxLevel);
    expect(Mt.maintenanceCost(s, snapshot(s))).toBeNull();
    expect(Mt.upgradeMaintenance(s, snapshot(s))).toBe(false);
    expect(Mt.migrateMaintenance({ level: 99 })).toEqual({ level: CREW.maxLevel });
    expect(Mt.migrateMaintenance({ level: "x" })).toEqual({ level: 0 });
  });
});

describe("stock exchange", () => {
  it("opens with the company's earnings; a tenth at a time, never control", () => {
    const small = company(10_000, St.STOCK.unlockEarned - 1);
    expect(St.stockUnlocked(small)).toBe(false);
    expect(St.sellShares(small, snapshot(small))).toBe(0);

    const s = company(10_000);
    const snap = snapshot(s);
    const value = 10_000 * St.STOCK.valueSeconds;
    expect(St.companyValue(snap)).toBe(value);
    expect(St.sharePrice(snap)).toBe(value / St.STOCK.shares);
    const cash = s.cash;
    expect(St.sellShares(s, snap)).toBeCloseTo(value * St.STOCK.tranche);
    expect(s.cash).toBeCloseTo(cash + value * St.STOCK.tranche);
    expect(s.stock.sold).toBeCloseTo(0.1);
    for (let i = 0; i < 10; i++) St.sellShares(s, snap);
    expect(s.stock.sold).toBeCloseTo(St.STOCK.maxSold);
    expect(s.stock.raised).toBeCloseTo(value * St.STOCK.maxSold);
  });

  it("shareholders take their part of every profit, in play and away", () => {
    const s = company(10_000);
    St.sellShares(s, snapshot(s));
    St.sellShares(s, snapshot(s));
    s.cash = 1000;
    expect(St.payDividends(s, 1000)).toBeCloseTo(200);
    expect(s.cash).toBeCloseTo(800);
    expect(St.payDividends(s, -50)).toBe(0);
    // away: the report's money, less their part, reaches the wallet
    s.pendingOffline = { seconds: 4000, cappedSeconds: 4000, cars: 0, components: 0, deliveries: 0, money: 10_000, rp: 0, carsByType: {} };
    const before = s.cash;
    expect(collectOffline(s)).toBeCloseTo(8000);
    expect(s.cash).toBeCloseTo(before + 8000);
    expect(s.stock.dividends).toBeCloseTo(200 + 2000);
  });

  it("a tenth bought back costs what the company is worth then, with the premium", () => {
    const s = company(10_000);
    St.sellShares(s, snapshot(s));
    // the company has doubled meanwhile
    s.chain.steady = 20_000;
    const snap = snapshot(s);
    const cost = 20_000 * St.STOCK.valueSeconds * St.STOCK.tranche * (1 + St.STOCK.buyPremium);
    expect(St.buybackCost(s, snap)).toBeCloseTo(cost);
    s.cash = cost - 1;
    expect(St.buyBack(s, snap)).toBe(false);
    s.cash = cost;
    expect(St.buyBack(s, snap)).toBe(true);
    expect(s.stock.sold).toBe(0);
    expect(s.cash).toBeCloseTo(0);
    expect(St.buyBack(s, snap)).toBe(false);
  });

  it("selling high and buying back once the income has sunk costs at least what the tenth brought", () => {
    const s = company(10_000);
    const got = St.sellShares(s, snapshot(s));
    St.sellShares(s, snapshot(s));
    expect(s.stock.sales).toEqual([got, got]);
    // the income all but gone (plants stopped): the buyback is no bargain
    s.chain.steady = 1;
    s.chain.rate = 1;
    const snap = snapshot(s);
    expect(St.buybackCost(s, snap)).toBeCloseTo(got * (1 + St.STOCK.buyPremium));
    s.cash = 1e12;
    expect(St.buyBack(s, snap)).toBe(true);
    expect(s.cash).toBeCloseTo(1e12 - got * (1 + St.STOCK.buyPremium));
    expect(s.stock.sales).toEqual([got]);
    expect(St.migrateStock({ sold: 0.2, sales: [5, "x", 7, 9] }).sales).toEqual([7, 9]);
    expect(St.migrateStock({ sold: 0, sales: [5] }).sales).toEqual([]);
  });

  it("the price is noted for its chart; a save keeps it all, within bounds; a new run has all its shares", () => {
    const s = company(10_000);
    St.stockTick(s, snapshot(s), T0);
    St.stockTick(s, snapshot(s), T0 + 1000);
    expect(s.stock.history).toHaveLength(1);
    St.stockTick(s, snapshot(s), T0 + St.STOCK.sampleEvery);
    expect(s.stock.history).toHaveLength(2);
    St.sellShares(s, snapshot(s));
    const back = decodeSave(encodeSave(s), T0) as GameState;
    expect(back.stock).toEqual(s.stock);
    expect(St.migrateStock({ sold: 0.93, history: [1, "x", -2, 3], raised: Infinity })).toMatchObject({ sold: St.STOCK.maxSold, history: [1, 3], raised: 0 });
    resetRun(s, T0 + 1);
    expect(s.stock).toEqual(St.createStock());
  });
});

describe("notification settings", () => {
  it("kinds kept off the screen are saved: known ones, once each", () => {
    const s = createInitialState(T0);
    expect(s.settings.toastsOff).toEqual([]);
    const raw = JSON.parse(JSON.stringify(s));
    raw.settings.toastsOff = ["racing", "nonsense", "racing", "problems"];
    expect(migrate(raw, T0).settings.toastsOff).toEqual(["problems", "racing"]);
    delete raw.settings.toastsOff;
    expect(migrate(raw, T0).settings.toastsOff).toEqual([]);
  });
});
