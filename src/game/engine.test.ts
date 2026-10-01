import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { OFFLINE, PRESTIGE } from "./config/prestige";
import * as A from "./engine/actions";
import { geometricCost, isAutomated, maxAffordable, snapshot, unlockedCarIds, upgradeCost } from "./engine/economy";
import { computeOffline, collectOffline, settleOffline } from "./engine/offline";
import { canPrestige, pendingPoints, prestige } from "./engine/prestige";
import { checkAchievements, claimDaily, dailyProgress, refreshDaily } from "./engine/progress";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { formatMoney, formatNumber } from "./format";
import { decodeSave, encodeSave, migrate } from "./save/serialize";

const T0 = Date.UTC(2026, 0, 1, 12);

describe("number formatting", () => {
  it("uses compact suffixes", () => {
    expect(formatMoney(1250)).toBe("$1,250");
    expect(formatMoney(25_400)).toBe("$25.4K");
    expect(formatMoney(3_200_000)).toBe("$3.2M");
    expect(formatMoney(4.7e9)).toBe("$4.7B");
    expect(formatMoney(2.8e12)).toBe("$2.8T");
    expect(formatNumber(1e40)).toMatch(/^[\d.]+[a-z]{2}$/);
  });
});

describe("costs", () => {
  it("geometric helpers agree", () => {
    const n = maxAffordable(25, 1.22, 10_000);
    expect(geometricCost(25, 1.22, n)).toBeLessThanOrEqual(10_000);
    expect(geometricCost(25, 1.22, n + 1)).toBeGreaterThan(10_000);
  });

  it("garage upgrades follow the $100 → $300 → $1,000 curve", () => {
    const s = createInitialState(T0);
    expect(upgradeCost(s, "garage", "production")).toBe(100);
    s.factories.garage.upgrades.production = 1;
    expect(upgradeCost(s, "garage", "production")).toBe(300);
    s.factories.garage.upgrades.production = 2;
    expect(upgradeCost(s, "garage", "production")).toBe(1000);
  });
});

describe("production", () => {
  it("the first car is built by hand in 10s and earns $50", () => {
    const s = createInitialState(T0);
    expect(isAutomated(s, "garage")).toBe(false);
    tick(s, 20);
    expect(s.cash).toBe(0); // nothing happens until BUILD
    A.startProduction(s, "garage");
    tick(s, 9.9, () => 1);
    expect(s.cash).toBe(0);
    tick(s, 0.2, () => 1);
    expect(s.cash).toBe(CAR_BY_ID.compact.price - CAR_BY_ID.compact.cost);
    expect(s.factories.garage.running).toBe(false);
    expect(s.lifetime.carsProduced).toBe(1);
  });

  it("hiring a manager automates the garage", () => {
    const s = createInitialState(T0);
    s.cash = 1000;
    expect(A.hireManager(s, "mike", "garage")).toBe(true);
    expect(isAutomated(s, "garage")).toBe(true);
    tick(s, 100, () => 1);
    expect(s.lifetime.carsProduced).toBeGreaterThanOrEqual(9);
  });

  it("large time steps are counted analytically", () => {
    const a = createInitialState(T0);
    a.factories.garage.upgrades.automation = 1;
    const b = structuredClone(a);
    tick(a, 3600, () => 1);
    for (let i = 0; i < 36_000; i++) tick(b, 0.1, () => 1);
    expect(a.lifetime.carsProduced).toBe(b.lifetime.carsProduced);
  });

  it("technology unlocks the next car tier", () => {
    const s = createInitialState(T0);
    s.cash = 1e6;
    expect(unlockedCarIds(s, snapshot(s).gm).has("sedan")).toBe(false);
    expect(A.buyUpgrade(s, "garage", "technology")).toBe(true);
    expect(snapshot(s).factories.garage!.car.id).toBe("sedan");
  });

  it("cannot buy what you cannot afford", () => {
    const s = createInitialState(T0);
    expect(A.buyFactory(s, "local")).toBe(false);
    expect(A.buyLevels(s, "garage", 1)).toBe(0);
    expect(s.cash).toBe(0);
  });

  it("electric factory needs research", () => {
    const s = createInitialState(T0);
    s.cash = 1e30;
    expect(A.buyFactory(s, "electricFactory")).toBe(false);
    s.research.push("battery_cells", "advanced_engines", "electric_motors");
    expect(A.buyFactory(s, "electricFactory")).toBe(true);
  });
});

describe("offline progress", () => {
  it("only automated factories earn, capped at 12 hours", () => {
    const s = createInitialState(T0);
    expect(computeOffline(s, T0 + 3600_000).money).toBe(0);
    s.factories.garage.upgrades.automation = 1;
    const twelve = computeOffline(s, T0 + 12 * 3600_000);
    const day = computeOffline(s, T0 + 48 * 3600_000);
    expect(twelve.money).toBeGreaterThan(0);
    expect(day.cappedSeconds).toBe(OFFLINE.baseCapHours * 3600);
    expect(day.money).toBeCloseTo(twelve.money);
  });

  it("long absences wait for COLLECT, then pay out", () => {
    const s = createInitialState(T0);
    s.factories.garage.upgrades.automation = 1;
    const report = settleOffline(s, T0 + 2 * 3600_000);
    expect(report).not.toBeNull();
    expect(s.cash).toBe(0);
    const paid = collectOffline(s);
    expect(paid).toBeGreaterThan(0);
    expect(s.cash).toBe(paid);
    expect(s.pendingOffline).toBeNull();
    expect(s.lastActiveAt).toBe(T0 + 2 * 3600_000);
  });
});

describe("prestige", () => {
  it("resets the run but keeps permanent progress", () => {
    const s = createInitialState(T0);
    expect(canPrestige(s)).toBe(false);
    s.cash = 5e9;
    s.run.moneyEarned = PRESTIGE.minRunEarnings;
    s.lifetime.moneyEarned = PRESTIGE.minRunEarnings;
    s.factories.local.owned = true;
    s.research.push("advanced_engines");
    s.managers.mike = { hired: true, level: 3, assignedTo: "garage" };
    const expected = pendingPoints(s);
    expect(expected).toBeGreaterThan(0);
    expect(prestige(s, T0 + 1)).toBe(expected);
    expect(s.empirePoints).toBe(expected);
    expect(s.factories.local.owned).toBe(false);
    expect(s.research).toContain("advanced_engines");
    expect(s.managers.mike).toMatchObject({ hired: true, level: 3, assignedTo: null });
    expect(pendingPoints(s)).toBe(0);
    // Empire Points raise income: +2% each.
    expect(snapshot(s).gm.income).toBeGreaterThan(1);
  });
});

describe("achievements and missions", () => {
  it("unlocks achievements once and pays rewards", () => {
    const s = createInitialState(T0);
    s.lifetime.carsProduced = 1;
    expect(checkAchievements(s)).toContain("first_car");
    expect(checkAchievements(s)).toEqual([]);
    expect(s.cash).toBe(50);
  });

  it("daily missions count progress from when they were handed out", () => {
    const s = createInitialState(T0);
    s.lifetime.levelsBought = 100;
    refreshDaily(s, T0);
    expect(s.missions.daily).toHaveLength(3);
    const m = s.missions.daily[0];
    expect(dailyProgress(s, m)).toBe(0);
    expect(claimDaily(s, m.id)).toBe(false);
    expect(refreshDaily(s, T0 + 1000)).toBe(false);
    expect(refreshDaily(s, T0 + 86_400_000)).toBe(true);
  });
});

describe("save system", () => {
  it("round-trips and fills in missing fields", () => {
    const s = createInitialState(T0);
    s.cash = 1234;
    s.managers.mike = { hired: true, level: 2, assignedTo: "garage" };
    const back = decodeSave(encodeSave(s), T0);
    expect(back.cash).toBe(1234);
    expect(back.managers.mike.assignedTo).toBe("garage");

    const partial = migrate({ cash: "oops", rp: 5, factories: { garage: { level: 7 } } }, T0);
    expect(partial.cash).toBe(0);
    expect(partial.rp).toBe(5);
    expect(partial.factories.garage.level).toBe(7);
    expect(partial.factories.garage.upgrades.production).toBe(0);
    expect(partial.factories.mega.owned).toBe(false);
  });
});
