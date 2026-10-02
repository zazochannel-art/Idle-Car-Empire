import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { MAX_WAIT, PLANT_BY_ID } from "./config/chain";
import { PRESTIGE } from "./config/prestige";
import { DEPOT, MARKET, STARTER_PLOT, WORLD_MAP } from "./city/layout";
import * as A from "./engine/actions";
import * as Ch from "./engine/chain";
import * as C from "./engine/city";
import { geometricCost, maxAffordable, snapshot } from "./engine/economy";
import { collectOffline, settleOffline } from "./engine/offline";
import { canPrestige, pendingPoints, prestige } from "./engine/prestige";
import { checkAchievements, claimDaily, dailyProgress, refreshDaily } from "./engine/progress";
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
  // the Engine Factory unlocks after 25 bodies
  s.lifetime.parts.body = Math.max(s.lifetime.parts.body, 25);
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
    // the Engine Factory needs 25 bodies first
    expect(Ch.plantLock(s, "engineFactory")).toEqual({ kind: "made", item: "body", n: 25, have: 0 });
    s.lifetime.parts.body = 25;
    expect(Ch.plantLock(s, "engineFactory")).toBeNull();
    expect(Ch.plantLock(s, "tireFactory")).toEqual({ kind: "plant", plant: "engineFactory" });
    expect(Ch.plantLock(s, "interiorFactory")).toEqual({ kind: "plant", plant: "assemblyPlant" });
    expect(Ch.plantBuildCost(s, "engineFactory")).toBe(3_000);
    s.cash = 2_999;
    expect(C.buildStructure(s, a, "engineFactory")).toBe(false);
    s.cash = 3_000;
    expect(C.buildStructure(s, a, "engineFactory")).toBe(true);
    expect(s.cash).toBe(0);
    expect(Ch.plantLock(s, "tireFactory")).toBeNull();
    // a second engine factory costs more
    expect(Ch.plantBuildCost(s, "engineFactory")).toBe(3_000 * 6);
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
