import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { CHASSIS_BONUS, MAX_WAIT, PLANT_BY_ID, VEHICLE_CAPACITY } from "./config/chain";
import { COMPONENT_TIME, DEALER_FEE, PARTS_MARGIN, SALES_TAX, START_CASH } from "./config/economy";
import * as M from "./engine/materials";
import { componentStdCost } from "./engine/costs";
import { MANAGER_BY_ID } from "./config/managers";
import { PRESTIGE } from "./config/prestige";
import { DEPOT, MARKET, STARTER_PLOT, WORLD_MAP } from "./city/layout";
import * as A from "./engine/actions";
import * as Ch from "./engine/chain";
import * as C from "./engine/city";
import * as D from "./engine/design";
import * as K from "./engine/contracts";
import * as R from "./engine/retention";
import { seasonAt } from "./engine/season";
import * as Ev from "./engine/events";
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
import { decodeTransfer, transferCodeIn, transferLink } from "./save/transfer";
import type { GameEvent, GameState, PlantType } from "./types";

// outside every season (seasons add income) and outside market events
const T0 = Date.UTC(2026, 2, 1, 12);
const freePlots = () => WORLD_MAP.plots.filter((p) => p.zone === "town" && p.kind === "plot" && !p.starter && !p.big).map((p) => p.id);

/** Runs the game in small steps, as the store does. */
function run(s: GameState, seconds: number, step = 0.5): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += step) events.push(...tick(s, step));
  return events;
}

function build(s: GameState, plot: string, type: PlantType, units = 30) {
  // the Engine Factory unlocks after 12 bodies
  s.lifetime.parts.body = Math.max(s.lifetime.parts.body, 12);
  s.cash += Ch.plantBuildCost(s, type);
  expect(C.buildStructure(s, plot, type)).toBe(true);
  supply(s, plot, units);
}

/** Puts materials for `units` finished units straight into a plant's warehouse (and the body works'). */
function supply(s: GameState, plot: string, units: number) {
  for (const id of [plot, STARTER_PLOT]) {
    const b = s.city.buildings[id];
    if (b?.plant && PLANT_BY_ID[b.type as PlantType].item) {
      b.plant.warehouse = 10;
      b.plant.stock = Ch.starterStock(b.type as PlantType, b.plant.grade, units);
    }
  }
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
    expect(M.stockTotal(b.plant!.stock)).toBeGreaterThan(0);
    expect(s.cash).toBe(START_CASH);
    expect(Object.values(s.dealers).some((d) => d.owned)).toBe(false);
  });

  it("makes a body every 45s out of steel and plastic, and a truck sells it at the Parts Market", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    const steel = p.stock.steel!;
    run(s, COMPONENT_TIME.body - 1);
    expect(s.lifetime.parts.body).toBe(0);
    run(s, 2);
    expect(s.lifetime.parts.body).toBe(1);
    expect(p.stock.steel).toBe(steel - 60); // one body uses 60 steel and 6 plastic
    expect(p.out).toBe(1);
    // wages, energy and upkeep were paid while it worked
    expect(s.cash).toBeLessThan(START_CASH);
    run(s, MAX_WAIT + 1);
    const truck = s.chain.shipments.find((sh) => sh.from === STARTER_PLOT);
    expect(truck).toMatchObject({ to: MARKET, item: "body", back: false });
    const value = Ch.componentValue("body", 1, snapshot(s).gm);
    const events = run(s, truck!.dur - truck!.t + 0.6);
    // the market pays the body's value; the tax comes off
    const sale = events.find((e): e is Extract<GameEvent, { type: "sale" }> => e.type === "sale" && e.plot === MARKET);
    expect(sale!.amount / sale!.count).toBeCloseTo(value * (1 - SALES_TAX));
    expect(s.chain.ledger.run.partSales).toBeGreaterThan(0);
    expect(s.chain.ledger.run.labor).toBeGreaterThan(0);
    expect(s.lifetime.deliveries).toBeGreaterThan(0);
    // and comes back empty
    expect(s.chain.shipments.find((sh) => sh.from === STARTER_PLOT)?.back).toBe(true);
  });

  it("stops without materials; bought materials arrive by truck into the warehouse", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = {};
    run(s, 5);
    expect(p.status).toBe("noRaw");
    expect(p.short).toBe("steel");
    expect(s.chain.shipments.some((sh) => sh.from === DEPOT)).toBe(false); // nobody buys for you
    // only materials the plant uses, only what fits, only what you can pay for
    expect(M.buyMaterial(s, STARTER_PLOT, "rubber", 10).ok).toBe(false);
    expect(M.buyMaterial(s, STARTER_PLOT, "steel", 100_000).ok).toBe(false);
    const cash = s.cash;
    const cost = M.orderCost(s, "steel", 120);
    expect(M.buyMaterial(s, STARTER_PLOT, "steel", 120)).toMatchObject({ ok: true });
    expect(M.buyMaterial(s, STARTER_PLOT, "plastic", 12)).toMatchObject({ ok: true });
    expect(s.cash).toBeLessThan(cash - cost + 1); // paid up front
    const supplyTruck = s.chain.shipments.find((sh) => sh.from === DEPOT)!;
    expect(supplyTruck.materials).toEqual({ steel: 120 });
    run(s, supplyTruck.dur + 1);
    expect(p.stock.steel).toBe(120);
    run(s, 2);
    expect(p.status).toBe("ok");
    // volume discounts and a bigger order never cost less in total
    expect(M.orderCost(s, "steel", 100)).toBeGreaterThan(M.orderCost(s, "steel", 99) * 0.9);
    expect(M.orderCost(s, "steel", 100) / 100).toBeLessThan(M.orderCost(s, "steel", 99) / 99);
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
    // a better grade uses more material and sells for more
    expect(after.unitValue).toBeGreaterThan(before.unitValue * 1.5);
    expect(after.unitCost).toBeGreaterThan(before.unitCost * 1.5);
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
    expect(Ch.plantBuildCost(s, "engineFactory")).toBe(6_000);
    s.cash = 5_999;
    expect(C.buildStructure(s, a, "engineFactory")).toBe(false);
    s.cash = 6_000;
    expect(C.buildStructure(s, a, "engineFactory")).toBe(true);
    expect(s.cash).toBe(0);
    expect(Ch.plantLock(s, "tireFactory")).toBeNull();
    // a second engine factory costs more
    expect(Ch.plantBuildCost(s, "engineFactory")).toBe(6_000 * 2.5);
    expect(Ch.plantLock(s, "batteryFactory")).not.toBeNull();
    expect(C.buildStructure(s, b, "assemblyPlant")).toBe(false);
  });

  it("without an assembly plant, engines are sold at the market", () => {
    const s = createInitialState(T0);
    const [a] = freePlots();
    build(s, a, "engineFactory");
    run(s, 120);
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
    expect(st.unitValue).toBeCloseTo((st0.engineValue + Ch.componentValue("body", 1, snapshot(s).gm)) * CHASSIS_BONUS);
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
    run(s, 700);
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
    run(c, 1200);
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
  it("upgrades and transport tiers raise the delivery rate and add trucks, storage and prices", () => {
    const s = createInitialState(T0);
    s.cash = 1e15;
    const before = snapshot(s).chain.plants[STARTER_PLOT];
    expect(L.buyLogistics(s, "speed")).toBe(true);
    expect(L.buyLogistics(s, "capacity")).toBe(true);
    expect(L.buyLogistics(s, "warehouse")).toBe(true);
    expect(L.buyLogistics(s, "fleet")).toBe(true);
    expect(L.buyLogistics(s, "loading")).toBe(true);
    const after = snapshot(s).chain.plants[STARTER_PLOT];
    // every vehicle drives the same road speed; the delivery rate (+10%) and
    // Bigger loads (+15%) fill each truck more, Loading (−10%) shortens the docks
    expect(after.pace).toBeCloseTo(before.pace);
    expect(before.capacity).toBe(VEHICLE_CAPACITY[before.vehicle]);
    expect(after.capacity).toBe(Math.round(VEHICLE_CAPACITY[before.vehicle] * 1.15 * 1.1));
    expect(after.load).toBeCloseTo(0.9 / 1.1);
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
    // options widen the car's margin: it sells for more, but not 8% more of its cost
    expect(Ch.carValue(s, city, gm)).toBeGreaterThan(before);
    expect(Ch.carValue(s, city, gm)).toBeLessThan(before * 1.08);
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
    const events = run(s, 900);
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
    run(s, 900);
    expect(s.dealers.local.owned).toBe(true); // opened by the first car, for free
    const earned = s.lifetime.moneyEarned;
    run(s, 600);
    expect(s.lifetime.carsSold).toBeGreaterThan(0);
    expect(s.chain.dealers.local?.sold).toBe(s.lifetime.carsSold);
    expect(s.lifetime.moneyEarned).toBeGreaterThan(earned);
  });

  it("dealers specialise in classes: their cars sell for a little more; fees and tax come off", () => {
    expect(Ch.dealerMatches("local", "city")).toBe(true);
    expect(Ch.dealerMatches("local", "sports")).toBe(false);
    expect(Ch.dealerMatches("supercar", "hypercar")).toBe(true);
    const { s } = fullChain();
    const events = run(s, 1500);
    const sale = events.find((e): e is Extract<GameEvent, { type: "sale" }> => e.type === "sale" && e.plot === "d:local");
    expect(sale).toBeDefined();
    // a City Car at the Economy Dealer: value × (1 + 0% markup + 6% speciality), less the dealer's fee and tax
    const each = Ch.carValue(s, CAR_BY_ID.city, snapshot(s).gm);
    expect(sale!.amount / each).toBeCloseTo(1.06 * (1 - DEALER_FEE - SALES_TAX), 2);
    expect(s.chain.ledger.run.dealerFees).toBeGreaterThan(0);
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
    supply(s, STARTER_PLOT, 40);
    const report = settleOffline(s, T0 + 3600 * 1000);
    expect(report).not.toBeNull();
    // only what the warehouse held could be made: no material, no production
    expect(report!.components).toBeGreaterThan(20);
    expect(report!.components).toBeLessThanOrEqual(40);
    expect(report!.ledger!.partSales).toBeGreaterThan(0);
    expect(report!.ledger!.labor).toBeGreaterThan(0);
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
    expect(s.cash).toBe(START_CASH + 100);
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

describe("market events", () => {
  it("runs one 45-minute event per 3-hour block, never the same twice in a row", () => {
    const H = 3_600_000;
    expect(Ev.activeEvent(0)).toBeNull();
    const w = Ev.activeEvent(H + 1);
    expect(w).not.toBeNull();
    expect(w!.end - w!.start).toBe(45 * 60_000);
    expect(Ev.activeEvent(w!.end)).toBeNull();
    expect(Ev.nextEvent(w!.end).start).toBe(w!.start + 3 * H);
    for (let b = 1; b < 50; b++) expect(Ev.activeEvent(b * 3 * H + H)!.event.id).not.toBe(Ev.activeEvent((b - 1) * 3 * H + H)!.event.id);
  });

  it("applies the running event to the economy", () => {
    const s = createInitialState(0);
    const base = snapshot(s).gm;
    const t = [...Array(20)].map((_, b) => b * 3 * 3_600_000 + 3_600_000 + 1).find((x) => Ev.activeEvent(x)!.event.id === "rushOrders")!;
    s.lastActiveAt = t;
    expect(snapshot(s).gm.speed).toBeCloseTo(base.speed * 1.5);
  });
});

describe("save transfer", () => {
  it("round-trips a save through a compressed link", async () => {
    const s = createInitialState(T0);
    s.cash = 12_345;
    const link = await transferLink(s, "https://example.com/Idle-Car-Empire/");
    const code = transferCodeIn(new URL(link).hash)!;
    const back = decodeSave(await decodeTransfer(code), T0);
    expect(back.cash).toBe(12_345);
    expect(link.length).toBeLessThan(encodeSave(s).length);
    await expect(decodeTransfer("z1.broken")).rejects.toThrow();
  });
});

describe("late-game depth", () => {
  it("opens plant levels 11-15 one region at a time", () => {
    const { s, assembly } = fullChain();
    const b = s.city.buildings[assembly];
    b.level = 10;
    expect(Ch.levelCost(b, snapshot(s).gm)).toBeNull();
    s.prestigeCount = 2; // Germany → up to level 12
    expect(Ch.levelCost(b, snapshot(s).gm)).not.toBeNull();
    b.level = 12;
    expect(Ch.levelCost(b, snapshot(s).gm)).toBeNull();
  });

  it("auto-upgrade buys cheap upgrades on automated plants only", () => {
    const s = createInitialState(T0);
    const [id, b] = Ch.plantsOf(s)[0];
    s.cash = 1e6;
    b.plant.auto = true;
    expect(Ch.autoUpgrade(s, snapshot(s).gm)).toBe(0); // still Manual
    b.plant.automation = 2;
    const before = b.level + b.plant.speed;
    expect(Ch.autoUpgrade(s, snapshot(s).gm)).toBe(1);
    expect(s.city.buildings[id].level + s.city.buildings[id].plant!.speed).toBe(before + 1);
    s.cash = 0;
    expect(Ch.autoUpgrade(s, snapshot(s).gm)).toBe(0);
  });

  it("runs a customer contract from offer to payout", () => {
    const { s } = fullChain();
    s.cash = 1e9;
    run(s, 300);
    const snap = snapshot(s);
    expect(K.refreshContracts(s, T0 + 1, snap)).toBe("offer");
    const offer = s.contracts.offer!;
    expect(offer.n).toBeGreaterThanOrEqual(3);
    expect(K.acceptContract(s, T0 + 1)).toBe(true);
    expect(K.claimContract(s, T0 + 2, snap)).toBe(false);
    s.lifetime.carsByType[offer.car] = (s.lifetime.carsByType[offer.car] ?? 0) + offer.n;
    const cash = s.cash;
    expect(K.claimContract(s, T0 + 3, snap)).toBe(true);
    expect(s.cash).toBeGreaterThan(cash);
    expect(s.contracts.done).toBe(1);
    // an unfinished contract expires at its deadline
    expect(K.refreshContracts(s, T0 + 3, snap)).toBeNull(); // cooldown
    s.contracts.nextAt = 0;
    K.refreshContracts(s, T0 + 10 * 60_000, snap);
    K.acceptContract(s, T0 + 10 * 60_000);
    expect(K.refreshContracts(s, T0 + 10 * 60_000 + 31 * 60_000, snap)).toBe("expired");
  });
});

describe("coming back", () => {
  it("counts a daily login streak and restarts it after a missed day", () => {
    const s = createInitialState(T0);
    const day = 86_400_000;
    const t = new Date(2026, 9, 1, 12).getTime();
    expect(R.updateLogin(s, t)).toBe(true);
    expect(s.login.streak).toBe(1);
    expect(R.updateLogin(s, t + 1000)).toBe(false);
    expect(R.claimLogin(s, snapshot(s))).toBe(true);
    expect(R.claimLogin(s, snapshot(s))).toBe(false);
    R.updateLogin(s, t + day);
    expect(s.login.streak).toBe(2);
    R.updateLogin(s, t + 3 * day);
    expect(s.login.streak).toBe(1);
    // day 7 wraps back to day 1
    s.login.streak = 7;
    R.updateLogin(s, t + 4 * day);
    expect(s.login.streak).toBe(1);
  });

  it("pays Stars for overtaking rivals, once", () => {
    const s = createInitialState(T0);
    expect(R.checkRivals(s, T0)).toEqual([]);
    s.lifetime.moneyEarned = 5e9;
    expect(R.checkRivals(s, T0).map((r) => r.id)).toEqual(["volta"]);
    expect(s.stars).toBe(1);
    expect(R.checkRivals(s, T0)).toEqual([]);
    expect(R.leaderboard(s, T0)[0].id).toBe("sakura");
  });

  it("has seasons with a small income bonus", () => {
    expect(seasonAt(new Date(2026, 9, 20).getTime())).toBe("halloween");
    expect(seasonAt(new Date(2026, 11, 24).getTime())).toBe("winter");
    expect(seasonAt(new Date(2026, 6, 1).getTime())).toBeNull();
    const s = createInitialState(T0);
    s.lastActiveAt = new Date(2026, 6, 1).getTime();
    const base = snapshot(s).gm.income;
    s.lastActiveAt = new Date(2026, 9, 20).getTime();
    expect(snapshot(s).gm.income).toBeGreaterThan(base * 1.09);
  });
});

describe("insight", () => {
  it("scores models 1-5 stars and moves their price with the review", () => {
    expect(D.reviewStars(0, 0, 0)).toBe(1);
    expect(D.reviewStars(100, 100, 100)).toBe(5);
    expect(D.reviewStars(50, 50, 50)).toBe(2.5);
    const s = createInitialState(T0);
    const car = CAR_BY_ID.city;
    const before = Ch.modelStats(s, car);
    s.designs.city.interior = 3;
    s.designs.city.rims = 3;
    const after = Ch.modelStats(s, car);
    expect(after.stars).toBeGreaterThan(before.stars);
  });

  it("reports the value each plant adds per minute", () => {
    const s = createInitialState(T0);
    const st = Object.values(snapshot(s).chain.plants)[0];
    const per = Ch.plantProfitPerMin(st, snapshot(s).gm);
    expect(per).toBeCloseTo(st.unitsPerSec * 60 * (st.unitValue * (1 - SALES_TAX) - Ch.plantUnitCost(st, snapshot(s).gm)));
    // a thin but real margin on parts
    expect(per).toBeGreaterThan(0);
    expect(st.unitValue * (1 - SALES_TAX)).toBeLessThan(st.unitCost * 1.15);
  });
});

describe("selling cars", () => {
  it("cars wait in storage when every dealer is full: nothing is sold off instantly", () => {
    const { s, assembly } = fullChain();
    // a big chain, one small dealer
    for (const [id, b] of Ch.plantsOf(s)) {
      b.level = 8;
      b.plant.speed = 24;
      supply(s, id, 400);
    }
    s.cash = 1e12;
    run(s, 1500);
    const made = s.lifetime.carsProduced;
    expect(made).toBeGreaterThan(20);
    // the dealer sells one car at a time; the rest wait on its lot or at the plant
    expect(s.lifetime.carsSold).toBeLessThan(made);
    const st = snapshot(s).chain.plants[assembly];
    expect(s.city.buildings[assembly].plant!.out).toBeLessThanOrEqual(st.outCap);
    expect(s.chain.wholesale).toBe(0);
    expect(s.chain.shipments.some((sh) => sh.item === "car" && sh.to === MARKET)).toBe(false);
  });

  it("dealers sell at their pace, popular classes faster", () => {
    const { s } = fullChain();
    const ds = snapshot(s).chain.dealers;
    expect(ds.local).toBeUndefined();
    run(s, 900);
    const d = snapshot(s).chain.dealers.local!;
    // about one customer every 30 s at Level 1 (a City Car finds one faster)
    expect(d.interval).toBeCloseTo(30);
    expect(d.stockCap).toBe(10);
  });
});

describe("no money from nothing", () => {
  it("upgrades, purchases and refunds never create money", () => {
    const s = createInitialState(T0);
    const gm = snapshot(s).gm;
    const cash = s.cash;
    // buying material spends cash; there is no way to sell material back
    M.buyMaterial(s, STARTER_PLOT, "steel", 100);
    expect(s.cash).toBeLessThan(cash);
    const after = s.cash;
    Ch.upgradePlantSpeed(s, STARTER_PLOT, gm);
    expect(s.cash).toBeLessThan(after);
    // a plant with no materials makes nothing, and earns nothing
    const t = createInitialState(T0);
    t.city.buildings[STARTER_PLOT].plant!.stock = {};
    const e0 = t.lifetime.moneyEarned;
    run(t, 300);
    expect(t.lifetime.moneyEarned).toBe(e0);
    expect(t.lifetime.parts.body).toBe(0);
  });

  it("parts sell for barely more than they cost; cars earn their class margin", () => {
    const s = createInitialState(T0);
    const gm = snapshot(s).gm;
    for (const c of ["body", "engine", "tires", "interior"] as const) {
      const net = Ch.componentValue(c, 1, gm) * (1 - SALES_TAX);
      const cost = componentStdCost(c, 1);
      expect(net / cost).toBeGreaterThan(1);
      expect(net / cost).toBeLessThanOrEqual(1 + PARTS_MARGIN + 1e-9);
    }
    const city = CAR_BY_ID.city;
    const cost = Ch.carPartsValue(city);
    const net = Ch.carValue(s, city, gm) * (1 - DEALER_FEE - SALES_TAX);
    expect(net / cost).toBeGreaterThan(1.1);
    expect(net / cost).toBeLessThan(1.25);
  });

  it("a stuck company gets material on supplier credit — never cash — and only then", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = {};
    s.cash = 100;
    run(s, 1);
    expect(s.cash).toBeLessThanOrEqual(100);
    const gift = s.chain.shipments.find((sh) => sh.to === STARTER_PLOT && sh.materials);
    expect(gift?.materials?.steel).toBeGreaterThan(0);
    // not again before the cooldown, even when stuck again
    s.chain.shipments = [];
    run(s, 60);
    expect(s.chain.shipments.some((sh) => sh.materials)).toBe(false);
    // with material to work with (or cash for one unit), no credit
    const t = createInitialState(T0);
    t.cash = 0;
    run(t, 1);
    expect(t.chain.shipments.some((sh) => sh.materials)).toBe(false);
    const u = createInitialState(T0);
    u.city.buildings[STARTER_PLOT].plant!.stock = {};
    u.cash = 5_000;
    run(u, 1);
    expect(u.chain.shipments.some((sh) => sh.materials)).toBe(false);
  });
});

describe("economy audit fixes", () => {
  it("a one-tap order never exceeds the warehouse or the cash", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = {};
    const need = M.unitMaterials("bodyWorks", 1);
    // a level 1 warehouse can't hold 10 bodies' worth of steel: the plan shrinks to what fits
    const plan = M.restockPlan(s, STARTER_PLOT, need, 10, true);
    expect(plan.units).toBeGreaterThan(0);
    expect(plan.units).toBeLessThan(10);
    expect(M.stockTotal(plan.want)).toBeLessThanOrEqual(M.warehouseCap(p));
    s.cash = 1e6;
    expect(M.buyPlan(s, STARTER_PLOT, plan)).toBe(true);
    // with little cash it plans fewer units, or none
    const t = createInitialState(T0);
    t.city.buildings[STARTER_PLOT].plant!.stock = {};
    t.cash = 2_000;
    const small = M.restockPlan(t, STARTER_PLOT, need, 10);
    expect(small.cost).toBeLessThanOrEqual(2_000);
    expect(small.units).toBe(1);
    t.cash = 100;
    expect(M.restockPlan(t, STARTER_PLOT, need, 10).units).toBe(0);
  });

  it("materials are a cost when used, not when bought", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.stock = {};
    p.stockCost = 0;
    const r = M.buyMaterial(s, STARTER_PLOT, "steel", 300);
    expect(r.ok).toBe(true);
    expect(s.chain.ledger.pending.materials + s.chain.ledger.run.materials).toBe(0);
    M.buyMaterial(s, STARTER_PLOT, "plastic", 30);
    run(s, 60);
    // delivered: the stock carries what it cost, and each body made books its share
    expect(s.chain.ledger.run.materials).toBeGreaterThan(0);
    const paid = (r.ok ? r.cost : 0) + M.orderCost(s, "plastic", 30);
    expect(s.chain.ledger.run.materials + (p.stockCost ?? 0)).toBeCloseTo(paid, -1);
  });

  it("auto-restock keeps minutes of work in stock, not a full warehouse", () => {
    const s = createInitialState(T0);
    s.market.bought = 1e6; // a supplier with deliveries
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.warehouse = 10;
    p.stock = {};
    p.autoBuy = true;
    s.cash = 1e9;
    const rate = snapshot(s).chain.plants[STARTER_PLOT].unitsPerSec;
    M.autoRestock(s, STARTER_PLOT, rate);
    const coming = M.stockTotal(M.incomingMaterials(s, STARTER_PLOT));
    expect(coming).toBeGreaterThan(0);
    expect(coming).toBeLessThan(M.warehouseCap(p) * 0.1);
  });

  it("the first goal of a new company is buying materials, not an upgrade", async () => {
    const { nextGoals } = await import("./engine/insights");
    const s = createInitialState(T0);
    expect(nextGoals(s, snapshot(s), 2)[0].kind).toBe("materials");
  });

  it("rewards are sized on the steady income, not a lucky second", () => {
    const s = createInitialState(T0);
    s.chain.rate = 5_000;
    s.chain.steady = 50;
    const snap = snapshot(s);
    expect(snap.incomePerSec).toBeGreaterThan(4_000);
    expect(snap.steadyIncomePerSec).toBeLessThan(100);
  });
});
