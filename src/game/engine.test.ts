import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { MAX_WAIT, PLANT_BY_ID } from "./config/chain";
import { MANAGER_BY_ID } from "./config/managers";
import { PRESTIGE } from "./config/prestige";
import { DEPOT, MARKET, STARTER_PLOT, WORLD_MAP } from "./city/layout";
import * as A from "./engine/actions";
import * as Ch from "./engine/chain";
import * as C from "./engine/city";
import * as D from "./engine/design";
import * as I from "./engine/imperium";
import * as L from "./engine/logistics";
import { geometricCost, maxAffordable, snapshot } from "./engine/economy";
import { collectOffline, settleOffline } from "./engine/offline";
import { canPrestige, pendingPoints, prestige } from "./engine/prestige";
import { incomeStalled } from "./engine/insights";
import { checkAchievements, claimDaily, claimMilestone, dailyProgress, recordHistory, refreshDaily } from "./engine/progress";
import { currentTip } from "./engine/tips";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { formatMoney, formatNumber } from "./format";
import { decodeSave, encodeSave, migrate } from "./save/serialize";
import type { GameEvent, GameState, PlantType } from "./types";

const T0 = Date.UTC(2026, 0, 1, 12);
const freePlots = () => WORLD_MAP.plots.filter((p) => p.zone === "town" && p.kind === "plot" && !p.starter && !p.big).map((p) => p.id);

/** Runs the game in small steps, as the store does. */
function run(s: GameState, seconds: number, step = 0.5): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += step) events.push(...tick(s, step));
  return events;
}

function build(s: GameState, plot: string, type: PlantType) {
  // the Engine Factory unlocks after 12 bodies
  s.lifetime.parts.body = Math.max(s.lifetime.parts.body, 12);
  s.cash += Ch.plantBuildCost(s, type);
  expect(C.buildStructure(s, plot, type)).toBe(true);
}

describe("number formatting", () => {
  it("uses compact suffixes", () => {
    expect(formatMoney(1250)).toBe("$1,250");
    expect(formatMoney(25_400)).toBe("$25.4K");
    expect(formatMoney(3_200_000)).toBe("$3.2M");
    expect(formatMoney(4.7e9)).toBe("$4.7B");
    expect(formatMoney(2.8e12)).toBe("$2.8T");
    // never rounds up past what you have (999,500 is not "$1000K")
    expect(formatMoney(999_500)).toBe("$999K");
    expect(formatMoney(999_999_999)).toBe("$999M");
    expect(formatNumber(1e40)).toMatch(/^[\d.]+[a-z]{2}$/);
  });

  it("geometric helpers agree", () => {
    const n = maxAffordable(25, 1.22, 10_000);
    expect(geometricCost(25, 1.22, n)).toBeLessThanOrEqual(10_000);
    expect(geometricCost(25, 1.22, n + 1)).toBeGreaterThan(10_000);
  });
});

describe("the start: a small car body works", () => {
  it("a new company owns only the Small Car Body Works, stocked with steel", () => {
    const s = createInitialState(T0);
    const b = s.city.buildings[STARTER_PLOT];
    expect(b.type).toBe("bodyWorks");
    expect(b.level).toBe(1);
    expect(Ch.plantsOf(s)).toHaveLength(1);
    expect(b.plant!.raw).toBeGreaterThan(0);
    expect(s.cash).toBe(250);
    expect(Object.values(s.dealers).some((d) => d.owned)).toBe(false);
  });

  it("makes a body every 20s and a truck sells it at the Body Market for $150", () => {
    const s = createInitialState(T0);
    run(s, 19);
    expect(s.lifetime.parts.body).toBe(0);
    run(s, 2);
    expect(s.lifetime.parts.body).toBe(1);
    expect(s.city.buildings[STARTER_PLOT].plant!.out).toBe(1);
    // the truck waits a little for a fuller load, then drives to the market
    run(s, MAX_WAIT + 1);
    const truck = s.chain.shipments.find((sh) => sh.from === STARTER_PLOT);
    expect(truck).toMatchObject({ to: MARKET, item: "body", qty: 1, back: false });
    expect(s.cash).toBe(250);
    const events = run(s, truck!.dur - truck!.t + 0.6);
    expect(s.cash).toBeCloseTo(400);
    expect(events.some((e) => e.type === "sale" && e.plot === MARKET && e.amount === 150)).toBe(true);
    expect(s.lifetime.deliveries).toBe(1);
    // and comes back empty
    expect(s.chain.shipments.find((sh) => sh.from === STARTER_PLOT)?.back).toBe(true);
  });

  it("buys steel from the depot when it runs low, and stops without cash", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    s.cash = 0;
    p.raw = 0;
    run(s, 5);
    expect(s.chain.shipments.some((sh) => sh.from === DEPOT)).toBe(false); // couldn't pay
    expect(p.raw).toBe(0);
    expect(p.status).toBe("noRaw");
    s.cash = 10_000;
    run(s, 1);
    const supply = s.chain.shipments.find((sh) => sh.from === DEPOT);
    expect(supply?.item).toBe("raw");
    expect(s.cash).toBeLessThan(10_000); // paid when the truck left
    run(s, supply!.dur + 1);
    expect(p.raw).toBeGreaterThan(0);
    run(s, 31);
    expect(p.status).toBe("ok");
  });

  it("upgrades: levels add lines and trucks, speed shortens the cycle, grades add value", () => {
    const s = createInitialState(T0);
    s.cash = 1e12;
    const gm = snapshot(s).gm;
    const before = snapshot(s).chain.plants[STARTER_PLOT];
    expect(Ch.upgradePlantLevel(s, STARTER_PLOT, gm)).toBe(true);
    expect(Ch.upgradePlantSpeed(s, STARTER_PLOT, gm)).toBe(true);
    expect(Ch.upgradeAutomation(s, STARTER_PLOT, gm)).toBe(true);
    expect(Ch.upgradeGrade(s, STARTER_PLOT, gm)).toBe(true);
    const after = snapshot(s).chain.plants[STARTER_PLOT];
    expect(after.lines).toBe(2);
    expect(after.unitsPerSec).toBeGreaterThan(before.unitsPerSec * 2);
    expect(after.unitValue).toBeCloseTo(before.unitValue * 2.5);
    expect(Ch.trucksOf(s.city.buildings[STARTER_PLOT])).toBe(2);
  });
});

describe("growing the chain", () => {
  it("plants unlock in order: engine after body works, then tyres, then assembly…", () => {
    const s = createInitialState(T0);
    const [a, b] = freePlots();
    // the Engine Factory needs 12 bodies first
    expect(Ch.plantLock(s, "engineFactory")).toEqual({ kind: "made", item: "body", n: 12, have: 0 });
    s.lifetime.parts.body = 12;
    expect(Ch.plantLock(s, "engineFactory")).toBeNull();
    expect(Ch.plantLock(s, "tireFactory")).toEqual({ kind: "plant", plant: "engineFactory" });
    expect(Ch.plantLock(s, "interiorFactory")).toEqual({ kind: "plant", plant: "assemblyPlant" });
    expect(Ch.plantBuildCost(s, "engineFactory")).toBe(1_500);
    s.cash = 1_499;
    expect(C.buildStructure(s, a, "engineFactory")).toBe(false);
    s.cash = 1_500;
    expect(C.buildStructure(s, a, "engineFactory")).toBe(true);
    expect(s.cash).toBe(0);
    expect(Ch.plantLock(s, "tireFactory")).toBeNull();
    // a second engine factory costs more
    expect(Ch.plantBuildCost(s, "engineFactory")).toBe(1_500 * 6);
    expect(Ch.plantLock(s, "batteryFactory")).not.toBeNull();
    expect(C.buildStructure(s, b, "assemblyPlant")).toBe(false);
  });

  it("without an assembly plant, engines are sold at the market", () => {
    const s = createInitialState(T0);
    const [a] = freePlots();
    build(s, a, "engineFactory");
    run(s, 60);
    expect(s.lifetime.parts.engine).toBeGreaterThan(0);
    expect(s.chain.shipments.some((sh) => sh.from === a && sh.to === MARKET && sh.item === "engine")).toBe(true);
  });
});

/** A company with every plant of the base recipe (body, engine, tyres) and an assembly plant. */
function fullChain() {
  const s = createInitialState(T0);
  const plots = freePlots();
  const types: PlantType[] = ["engineFactory", "tireFactory", "assemblyPlant"];
  types.forEach((ty, i) => build(s, plots[i], ty));
  return { s, assembly: plots[2] };
}

describe("motorized chassis", () => {
  it("an engine factory can fit engines into bodies and sell them for more", () => {
    const s = createInitialState(T0);
    const [a] = freePlots();
    build(s, a, "engineFactory");
    s.cash = 1e6;
    const st0 = snapshot(s).chain.plants[a];
    expect(st0.combine).toBe(false);
    expect(Ch.setCombine(s, a, true)).toBe(true);
    const st = snapshot(s).chain.plants[a];
    expect(st.combine).toBe(true);
    expect(st.unitValue).toBeCloseTo((st0.engineValue + 150) * 1.3);
    // without bodies it waits for them
    run(s, 40);
    const p = s.city.buildings[a].plant!;
    expect(p.status === "noParts" || (p.inputs.body ?? 0) > 0 || p.made > 0).toBe(true);
    // bodies drive to the engine factory, chassis drive to the market
    const events = run(s, 400);
    expect(s.chain.shipments.some((sh) => sh.to === a && sh.item === "body") || p.made > 0).toBe(true);
    expect(p.made).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "sale" && e.item === "chassis")).toBe(true);
  });

  it("once an assembly plant exists, engines go to it again", () => {
    const { s, assembly } = fullChain();
    const engine = Ch.plantsOf(s).find(([, b]) => b.type === "engineFactory")![0];
    Ch.setCombine(s, engine, true);
    expect(snapshot(s).chain.plants[engine].combine).toBe(false);
    run(s, 300);
    expect(s.city.buildings[assembly].plant!.made).toBeGreaterThan(0);
  });
});

describe("automotive milestones", () => {
  it("pay permanent income boosts and Stars, and count money from cars", () => {
    const s = createInitialState(T0);
    const income0 = snapshot(s).gm.income;
    s.lifetime.moneyEarned = 1e6;
    expect(claimMilestone(s, "m_earn_1m")).toBe(true);
    expect(s.boost).toBeCloseTo(0.02);
    expect(snapshot(s).gm.income).toBeCloseTo(income0 * 1.02);
    expect(claimMilestone(s, "m_sport")).toBe(false); // no Sport car yet
    s.lifetime.carsProduced = 1000;
    expect(claimMilestone(s, "m_cars_1000")).toBe(true);
    expect(s.stars).toBe(1);
    // car sales count towards "Earn $100,000 from cars"
    const { s: c } = fullChain();
    run(c, 600);
    expect(c.lifetime.carRevenue).toBeGreaterThan(0);
  });
});

describe("manager categories", () => {
  it("the Engineer makes upgrades cheaper and the Designer makes every car worth more", () => {
    const s = createInitialState(T0);
    s.cash = 1e12;
    s.lifetime.moneyEarned = 1e9;
    const gm0 = snapshot(s).gm;
    expect(A.hireManager(s, "nina", STARTER_PLOT)).toBe(true);
    expect(A.hireManager(s, "leo")).toBe(true);
    A.assignManager(s, "leo", STARTER_PLOT); // takes Nina's place (one manager per plant)
    A.assignManager(s, "nina", null);
    // global managers work while assigned anywhere
    const free = freePlots()[0];
    build(s, free, "engineFactory");
    A.assignManager(s, "nina", free);
    const gm = snapshot(s).gm;
    expect(gm.costMult).toBeCloseTo(gm0.costMult * 0.97);
    expect(gm.value[1]).toBeCloseTo(gm0.value[1] * 1.1);
    expect(MANAGER_BY_ID.nina.rarity).toBe("rare");
    expect(MANAGER_BY_ID.leo.category).toBe("designer");
  });
});

describe("logistics center", () => {
  it("upgrades and transport tiers speed up every truck and add trucks, storage and prices", () => {
    const s = createInitialState(T0);
    s.cash = 1e15;
    const before = snapshot(s).chain.plants[STARTER_PLOT];
    expect(L.buyLogistics(s, "speed")).toBe(true);
    expect(L.buyLogistics(s, "capacity")).toBe(true);
    expect(L.buyLogistics(s, "warehouse")).toBe(true);
    expect(L.buyLogistics(s, "fleet")).toBe(true);
    expect(L.buyLogistics(s, "loading")).toBe(true);
    const after = snapshot(s).chain.plants[STARTER_PLOT];
    expect(after.pace).toBeCloseTo(before.pace / 1.1);
    expect(after.trucks).toBe(before.trucks + 1);
    expect(after.outCap).toBeCloseTo(before.outCap * 1.2);
    expect(after.dock).toBeCloseTo(0.9);
    // Truck → Train → Port → Export
    for (let i = 0; i < 3; i++) expect(L.buyTier(s)).toBe(true);
    expect(L.buyTier(s)).toBe(false);
    expect(L.logisticsMods(s).cars).toBeGreaterThan(0);
    // Global Expansion starts the logistics over
    s.run.moneyEarned = s.lifetime.moneyEarned = 1e11;
    prestige(s, T0 + 1);
    expect(s.logistics.tier).toBe(0);
  });
});

describe("design studio", () => {
  it("developing options raises the car's value and build time; names and colours are kept", () => {
    const { s, assembly } = fullChain();
    s.cash = 1e12;
    const gm = snapshot(s).gm;
    const city = CAR_BY_ID.city;
    const before = Ch.carValue(s, city, gm);
    const t0 = snapshot(s).chain.plants[assembly].cycle;
    const cost = D.developCost(Ch.carBaseValue(s, city, gm), s.designs.city, "engine");
    expect(D.develop(s, "city", "engine", cost)).toBe(true);
    expect(s.designs.city.engine).toBe(1);
    expect(Ch.carValue(s, city, gm)).toBeCloseTo(before * 1.08);
    expect(snapshot(s).chain.plants[assembly].cycle).toBeCloseTo(t0 * 1.05);
    expect(Ch.modelStats(s, city).hp).toBeGreaterThan(city.hp);
    D.renameDesign(s, "city", "  MC Rocket  ");
    expect(s.designs.city.name).toBe("MC Rocket");
    expect(D.setDesignColor(s, "city", "#1b46b8")).toBe(true);
    expect(D.setDesignColor(s, "city", "#123456")).toBe(false);
    // Global Expansion keeps the name and colour, the options start over
    s.run.moneyEarned = s.lifetime.moneyEarned = 1e11;
    prestige(s, T0 + 1);
    expect(s.designs.city).toMatchObject({ name: "MC Rocket", color: "#1b46b8", engine: 0 });
  });
});

describe("assembly and sales", () => {
  it("an assembly plant waits for missing parts, then builds the first car", () => {
    const { s, assembly } = fullChain();
    const p = s.city.buildings[assembly].plant!;
    run(s, 1);
    expect(p.status).toBe("noParts");
    expect(p.missing).toBeDefined();
    // every part arrives by truck…
    const events = run(s, 400);
    for (const c of ["body", "engine", "tires"] as const) expect(s.lifetime.parts[c]).toBeGreaterThan(0);
    expect(s.lifetime.carsProduced).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === "carBuilt" && e.first)).toHaveLength(1);
    expect(s.chain.firstCar).toBe(true);
    // the first car opens the Local Dealer
    expect(s.dealers.local.owned).toBe(true);
  });

  it("dealerships open after the first car; transporters deliver and customers buy", () => {
    const { s } = fullChain();
    s.cash = 1e12;
    expect(A.buyDealer(s, "city")).toBe(false); // no car yet
    run(s, 400);
    expect(s.dealers.local.owned).toBe(true); // opened by the first car, for free
    const earned = s.lifetime.moneyEarned;
    run(s, 300);
    expect(s.lifetime.carsSold).toBeGreaterThan(0);
    expect(s.chain.dealers.local?.sold).toBe(s.lifetime.carsSold);
    expect(s.lifetime.moneyEarned).toBeGreaterThan(earned);
  });

  it("dealers specialise in classes: their cars sell for +20%", () => {
    expect(Ch.dealerMatches("local", "city")).toBe(true);
    expect(Ch.dealerMatches("local", "sports")).toBe(false);
    expect(Ch.dealerMatches("supercar", "hypercar")).toBe(true);
    const { s } = fullChain();
    const events = run(s, 600);
    const sale = events.find((e): e is Extract<GameEvent, { type: "sale" }> => e.type === "sale" && e.plot === "d:local");
    expect(sale).toBeDefined();
    // a City Car at the Economy Dealer: value × (1 + 0% markup + 20% speciality)
    const each = Ch.carValue(s, CAR_BY_ID.city, snapshot(s).gm);
    expect(sale!.amount / each).toBeGreaterThan(1.15);
  });

  it("better cars need better component grades", () => {
    const { s } = fullChain();
    const gm = snapshot(s).gm;
    expect(Ch.availableCars(s, gm).map((c) => c.id)).toEqual(["city"]);
    // the sedan also needs seats from an interior factory
    expect(Ch.carLock(s, CAR_BY_ID.sedan, gm)).toEqual({ kind: "plant", plant: "interiorFactory" });
    expect(Ch.carLock(s, { ...Ch.availableCars(s, gm)[0], grade: 2 }, gm)?.kind).toBe("grade");
  });
});

describe("offline progress", () => {
  it("plants keep producing and trucks keep selling while away; money waits for COLLECT", () => {
    const s = createInitialState(T0);
    s.cash = 5_000;
    const report = settleOffline(s, T0 + 3600 * 1000);
    expect(report).not.toBeNull();
    expect(report!.components).toBeGreaterThan(50);
    expect(report!.deliveries).toBeGreaterThan(0);
    expect(report!.money).toBeGreaterThan(0);
    const before = s.cash;
    const paid = collectOffline(s);
    expect(paid).toBe(report!.money);
    expect(s.cash).toBeCloseTo(before + paid);
    expect(s.pendingOffline).toBeNull();
  });

  it("is capped at the offline limit", () => {
    const a = createInitialState(T0);
    const b = createInitialState(T0);
    a.cash = b.cash = 1e6;
    const r12 = settleOffline(a, T0 + 12 * 3600 * 1000)!;
    const r48 = settleOffline(b, T0 + 48 * 3600 * 1000)!;
    expect(r48.cappedSeconds).toBe(r12.cappedSeconds);
  });
});

describe("prestige", () => {
  it("resets the company but keeps permanent progress", () => {
    const s = createInitialState(T0);
    expect(canPrestige(s)).toBe(false);
    s.run.moneyEarned = PRESTIGE.minRunEarnings;
    s.lifetime.moneyEarned = PRESTIGE.minRunEarnings;
    build(s, freePlots()[0], "engineFactory");
    s.research.push("advanced_engines");
    s.managers.mike = { hired: true, level: 3, assignedTo: STARTER_PLOT };
    const expected = pendingPoints(s);
    expect(expected).toBeGreaterThan(0);
    expect(prestige(s, T0 + 1)).toBe(expected);
    expect(s.empirePoints).toBe(expected);
    expect(Ch.plantsOf(s)).toHaveLength(1);
    expect(s.chain.shipments).toHaveLength(0);
    expect(s.research).toContain("advanced_engines");
    expect(s.managers.mike).toMatchObject({ hired: true, level: 3, assignedTo: null });
    expect(snapshot(s).gm.income).toBeGreaterThan(1);
  });
});

describe("achievements and missions", () => {
  it("unlocks achievements once and pays rewards", () => {
    const s = createInitialState(T0);
    s.lifetime.parts.body = 1;
    expect(checkAchievements(s)).toContain("first_body");
    expect(checkAchievements(s)).toEqual([]);
    expect(s.cash).toBe(350);
  });

  it("daily missions count progress from when they were handed out", () => {
    const s = createInitialState(T0);
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
  it("round-trips the chain, trucks included", () => {
    const s = createInitialState(T0);
    s.cash = 1234;
    run(s, 60);
    s.managers.mike = { hired: true, level: 2, assignedTo: STARTER_PLOT };
    const back = decodeSave(encodeSave(s), T0);
    expect(back.cash).toBe(s.cash);
    expect(back.managers.mike.assignedTo).toBe(STARTER_PLOT);
    expect(back.city.buildings[STARTER_PLOT]).toEqual(s.city.buildings[STARTER_PLOT]);
    expect(back.chain.shipments.map((sh) => [sh.from, sh.to, sh.qty])).toEqual(s.chain.shipments.map((sh) => [sh.from, sh.to, sh.qty]));
  });

  it("saves from the old economy start a new company but keep Empire Points", () => {
    const old = { version: 2, cash: 5e9, empirePoints: 42, empirePointsEarned: 42, prestigeCount: 3, research: ["advanced_engines"], settings: { lang: "ro", buyAmount: 10 }, factories: { garage: { owned: true, level: 80 } } };
    const s = migrate(old, T0);
    expect(s.cash).toBeLessThan(1e9);
    expect(s.empirePoints).toBe(42);
    expect(s.settings.lang).toBe("ro");
    expect(s.research).toEqual(["advanced_engines"]);
    expect(s.city.buildings[STARTER_PLOT].type).toBe("bodyWorks");
    expect(PLANT_BY_ID.bodyWorks.time).toBe(20);
  });
});

describe("global expansion regions", () => {
  it("moves the empire region by region with bigger income and costs", () => {
    const s = createInitialState(0);
    const local = snapshot(s).gm.income;
    const cost = Ch.plantBuildCost(s, "engineFactory");
    s.prestigeCount = 2; // Germany
    expect(snapshot(s).gm.income).toBeCloseTo(local * 2);
    expect(Ch.plantBuildCost(s, "engineFactory")).toBeCloseTo(cost * 1.25);
    s.prestigeCount = 99; // capped at Global Empire
    expect(snapshot(s).gm.costMult).toBeCloseTo(2);
  });
});

describe("reset imperium", () => {
  it("trades Empire Points, region and research for permanent Stars", () => {
    const s = createInitialState(0);
    expect(I.canImperium(s)).toBe(false);
    s.prestigeCount = 6;
    s.empirePoints = 500;
    s.empirePointsEarned = 500;
    s.research = ["x"];
    s.run.moneyEarned = 1e12;
    s.lifetime.moneyEarned = 1e14;
    expect(I.canImperium(s)).toBe(true);
    const gained = I.imperium(s, 1);
    expect(gained).toBe(9);
    expect(s.stars).toBe(9);
    expect(s.empirePoints).toBe(0);
    expect(s.prestigeCount).toBe(0);
    expect(s.research).toEqual([]);
    // Empire Points count again from the reset
    expect(pendingPoints(s)).toBe(0);

    const speed = snapshot(s).gm.speed;
    expect(I.buyStarUpgrade(s, "production")).toBe(true);
    expect(I.buyStarUpgrade(s, "production")).toBe(true);
    expect(s.stars).toBe(6);
    expect(snapshot(s).gm.speed).toBeCloseTo(speed * 1.2);
  });
});

describe("smarter guidance", () => {
  it("samples income once a minute and spots a stalled run", () => {
    const s = createInitialState(0);
    s.runStartedAt = 0;
    expect(recordHistory(s, 0, 100)).toBe(true);
    expect(recordHistory(s, 30_000, 100)).toBe(false);
    for (let m = 1; m <= 25; m++) recordHistory(s, m * 60_000, 100 + m * 0.2);
    expect(incomeStalled(s)).toBe(true);
    s.history.push({ t: 26 * 60_000, income: 1_000 });
    expect(incomeStalled(s)).toBe(false);
  });

  it("walks a new player through the first steps, once", () => {
    const s = createInitialState(0);
    expect(currentTip(s)).toBe("start");
    s.tips.push("start");
    expect(currentTip(s)).toBeNull();
    s.lifetime.parts.body = 12;
    expect(currentTip(s)).toBe("engine");
  });
});
