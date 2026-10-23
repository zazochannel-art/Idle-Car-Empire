import { describe, expect, it } from "vitest";
import { WORLD_MAP } from "./city/layout";
import { CAR_BY_ID } from "./config/cars";
import { CLASS_DEMAND } from "./config/economy";
import { CHARGING, SUBSCRIPTION } from "./config/ev";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import * as Ev from "./engine/ev";
import { snapshot } from "./engine/economy";
import { carDemandMult } from "./engine/market";
import { resetRun } from "./engine/reset";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { migrate } from "./save/serialize";
import type { GameState, PlantType } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);

function late(): GameState {
  const s = createInitialState(T0);
  s.cash = 1e12;
  s.chain.firstCar = true;
  s.city.zones = ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global"];
  s.dealers.local.owned = true;
  return s;
}

/** Puts a finished plant of `type` on the first free plot that takes it. */
function plant(s: GameState, type: PlantType, level = 1) {
  const id = Co.plotsFor(type).find((p) => !s.city.buildings[p])!;
  s.city.buildings[id] = { type, level, plant: Ch.newPlant() };
  return id;
}

describe("electric & autonomous late game", () => {
  it("the Software Studio needs its research and a Battery Factory; the Autonomous Lounge is tier 10 and needs software", () => {
    const s = late();
    expect(Ch.plantLock(s, "softwareStudio")).toMatchObject({ kind: "plant", plant: "batteryFactory" });
    plant(s, "batteryFactory");
    expect(Ch.plantLock(s, "softwareStudio")).toMatchObject({ kind: "research", research: "driving_software" });
    s.research.push("electric_motors", "ai_factory", "driving_software");
    expect(Ch.plantLock(s, "softwareStudio")).toBeNull();
    const car = CAR_BY_ID.autonomous;
    expect(car.tier).toBe(10);
    expect(car.extras).toContain("software");
    expect(car.extras).toContain("battery");
    expect(Ch.carLock(s, car, snapshot(s).gm)).toMatchObject({ kind: "research", research: "self_driving" });
    s.research.push("charging_network", "self_driving");
    // researched: what is left is building the plants
    expect(Ch.carLock(s, car, snapshot(s).gm)?.kind).toBe("plant");
  });

  it("earns more than the Electric Performance once its own research is done", () => {
    const s = late();
    s.research.push("electric_motors", "solid_state", "ai_factory", "driving_software", "charging_network", "self_driving");
    const margin = (id: "electric" | "autonomous") => Ch.carMarginMult(s, CAR_BY_ID[id], snapshot(s).gm);
    const value = (id: "electric" | "autonomous") => Ch.carValue(s, CAR_BY_ID[id], snapshot(s).gm);
    // the Electric Performance has Solid-State Batteries (×2); the Lounge gets Fleet Learning, then the Robotaxi Fleet
    expect(margin("electric")).toBeCloseTo(margin("autonomous") * 2);
    const before = value("autonomous");
    s.research.push("fleet_learning");
    expect(margin("autonomous")).toBeCloseTo(margin("electric"));
    expect(value("autonomous")).toBeGreaterThan(before);
    // a luxury car: it sells for a little less than the hypercar but finds buyers far faster
    const perDealer = (id: "electric" | "autonomous") => value(id) * CLASS_DEMAND[CAR_BY_ID[id].class];
    expect(perDealer("autonomous")).toBeGreaterThan(perDealer("electric") * 1.5);
    // the Robotaxi Fleet makes it the dearest car of all
    s.research.push("neural_design", "robotaxi");
    expect(margin("autonomous")).toBeCloseTo(margin("electric") * 2);
    expect(value("autonomous")).toBeGreaterThan(value("electric"));
  });

  it("builds the Software Studio on an Electronics Factory plot, without rezoning the map", () => {
    const s = late();
    const electronics = Co.plotsFor("electronicsFactory");
    expect(electronics.length).toBeGreaterThan(0);
    expect(Co.plotsFor("softwareStudio")).toEqual(electronics);
    // every plot keeps what it was zoned for
    for (const id of electronics) expect(WORLD_MAP.plotById[id].use).toBe("electronicsFactory");
    const id = electronics[0];
    expect(Co.plotUses(id)).toEqual(["electronicsFactory", "softwareStudio"]);
    // locked until the research and a Battery Factory
    expect(Co.buyAndBuild(s, id, "softwareStudio")).toBe(false);
    plant(s, "electronicsFactory");
    plant(s, "batteryFactory");
    // (the Electronics Factory itself is still locked here: no Paint Factory; the plot is open for the studio all the same)
    s.research.push("electric_motors", "ai_factory", "driving_software");
    // the studio is dearer than the factory the plot is zoned for
    expect(Co.constructionCost(s, id, "softwareStudio")).toBeGreaterThan(Co.constructionCost(s, id));
    const target = Co.freePlotFor(s, "softwareStudio")!;
    expect(Co.buyAndBuild(s, target, "softwareStudio")).toBe(true);
    expect(s.city.sites[target].type).toBe("softwareStudio");
    expect(Co.plotStatus(s, target)).toBe("construction");
    // not something the plot can't take
    const other = Co.plotsFor("glassFactory")[0];
    expect(Co.buyAndBuild(s, other, "softwareStudio")).toBe(false);
  });

  it("charging stations: research first, owned dealers only, five levels at rising prices", () => {
    const s = late();
    expect(Ev.chargerCost(s, "local")).toBeNull();
    s.research.push("charging_network");
    expect(Ev.chargerCost(s, "premium")).toBeNull(); // not owned
    const first = Ev.chargerCost(s, "local")!;
    expect(first).toBe(CHARGING.cost);
    for (let i = 0; i < CHARGING.maxLevel; i++) expect(Ev.buildCharger(s, "local")).toBe(true);
    expect(Ev.chargerLevel(s, "local")).toBe(CHARGING.maxLevel);
    expect(Ev.buildCharger(s, "local")).toBe(false);
    expect(Ev.chargerCost(s, "local")).toBeNull();
    // the network sells electric cars faster, and only those
    expect(carDemandMult(s, "electric")).toBeCloseTo(carDemandMult(s, "hypercar") * (1 + CHARGING.maxLevel * CHARGING.demandPerLevel));
    // a Reset Imperium takes them down with the dealers
    resetRun(s, T0);
    expect(Ev.chargerLevel(s, "local")).toBe(0);
  });

  it("drivers pay to charge, up to what the stations can serve; Fast Charging doubles it", () => {
    const s = late();
    s.research.push("charging_network");
    s.run.carsByType.electric = 1_000;
    expect(snapshot(s).city.ev.charging).toBe(0); // no station yet
    Ev.buildCharger(s, "local");
    const one = snapshot(s).city.ev;
    expect(one.charged).toBe(CHARGING.carsPerLevel);
    expect(one.charging).toBeGreaterThan(0);
    expect(snapshot(s).city.structureIncome["d:local"]).toBeCloseTo(one.charging);
    s.research.push("fast_charging");
    expect(snapshot(s).city.ev.charged).toBe(CHARGING.carsPerLevel * CHARGING.fastMult);
    // fewer cars than chargers: only the cars on the road pay
    s.run.carsByType.electric = 10;
    expect(snapshot(s).city.ev.charged).toBe(10);
    // it is paid every tick
    const earned = s.run.moneyEarned;
    const snap = snapshot(s);
    tick(s, 10, snap);
    expect(s.run.moneyEarned - earned).toBeGreaterThanOrEqual(snap.city.ev.charging * 10 - 1e-6);
  });

  it("software subscriptions: Over-the-Air Updates, as many as the studios' levels keep running", () => {
    const s = late();
    s.run.carsByType.autonomous = 500;
    plant(s, "softwareStudio", 3);
    expect(Ev.subscriptions(s).active).toBe(0);
    expect(snapshot(s).city.ev.subs).toBe(0);
    s.research.push("ota_updates");
    expect(Ev.subscriptions(s)).toEqual({ cars: 500, capacity: 3 * SUBSCRIPTION.perStudioLevel, active: 3 * SUBSCRIPTION.perStudioLevel });
    const subs = snapshot(s).city.ev.subs;
    expect(subs).toBeGreaterThan(0);
    // it counts toward the steady income rewards are sized on
    expect(snapshot(s).steadyIncomePerSec).toBeGreaterThanOrEqual(subs);
  });

  it("stations survive a save; older saves load with none, and junk levels are ignored", () => {
    const s = late();
    s.research.push("charging_network");
    s.dealers.city.owned = true;
    Ev.buildCharger(s, "local");
    Ev.buildCharger(s, "city");
    Ev.buildCharger(s, "city");
    expect(migrate(JSON.parse(JSON.stringify(s)), T0).ev).toEqual({ chargers: { local: 1, city: 2 } });
    const raw = JSON.parse(JSON.stringify(s));
    raw.ev.chargers = { local: 99, city: -1, nowhere: 3, premium: "4" };
    expect(migrate(raw, T0).ev).toEqual({ chargers: { local: CHARGING.maxLevel } });
    delete raw.ev;
    expect(migrate(raw, T0).ev).toEqual({ chargers: {} });
    // a level edited past the top counts as the top
    s.ev.chargers.local = 99;
    expect(Ev.chargerLevel(s, "local")).toBe(CHARGING.maxLevel);
  });
});
