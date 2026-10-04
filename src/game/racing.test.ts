import { describe, expect, it } from "vitest";
import { RACE_EVENT_BY_ID, RACING_DISTRICT } from "./config/racing";
import { STARTER_PLOT, RACING, WORLD_MAP } from "./city/layout";
import * as R from "./engine/racing";
import * as Ch from "./engine/chain";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { computeOffline } from "./engine/offline";
import { migrate } from "./save/serialize";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);

function team(): GameState {
  const s = createInitialState(T0);
  s.chain.firstCar = true;
  s.lifetime.carsByType.city = 1;
  if (!s.city.zones.includes("industrial")) s.city.zones.push("industrial");
  s.cash = RACING_DISTRICT.cost + 1e6;
  expect(R.unlockRacing(s)).toBe(true);
  return s;
}

describe("racing district", () => {
  it("opens after the first car, with the Industrial District and the money", () => {
    const s = createInitialState(T0);
    expect(R.racingBlocker(s)).toBe("firstCar");
    s.chain.firstCar = true;
    s.city.zones = s.city.zones.filter((z) => z !== "industrial");
    expect(R.racingBlocker(s)).toBe("industrial");
    s.city.zones.push("industrial");
    s.cash = 0;
    expect(R.racingBlocker(s)).toBe("cash");
    s.cash = RACING_DISTRICT.cost;
    expect(R.unlockRacing(s)).toBe(true);
    expect(s.cash).toBe(0);
  });

  it("race cars come off the assembly line on a car transporter", () => {
    const s = team();
    expect(R.orderRaceCar(s, "city")).toBe(true);
    expect(R.orderRaceCar(s, "city")).toBe(false); // one slot at garage level 1
    // an assembly plant building city cars, with a finished car waiting
    const free = WORLD_MAP.plots.filter((x) => x.kind === "plot" && x.zone === "town" && !x.big && !s.city.buildings[x.id]).map((x) => x.id);
    s.city.buildings[free[0]] = { type: "engineFactory", level: 1, plant: Ch.newPlant() };
    s.city.buildings[free[1]] = { type: "tireFactory", level: 1, plant: Ch.newPlant() };
    const plot = free[2];
    s.city.buildings[plot] = { type: "assemblyPlant", level: 1, plant: Ch.newPlant() };
    const p = s.city.buildings[plot].plant!;
    p.out = 1;
    p.outValue = 6_000;
    tick(s, 0.5);
    const sh = s.chain.shipments.find((x) => x.to === RACING);
    expect(sh?.models).toEqual(["city"]);
    expect(s.racing.orders).toEqual([]);
    for (let i = 0; i < 400 && !s.racing.cars.length; i++) tick(s, 0.5);
    expect(s.racing.cars.length).toBe(1);
    expect(s.racing.selected).toBe(s.racing.cars[0].id);
  });

  it("better parts and development make a faster car", () => {
    const s = team();
    const rc = R.receiveRaceCar(s, "city");
    const stock = R.carRating(rc, "circuit");
    rc.grades.engine = 3;
    expect(R.carRating(rc, "circuit")).toBeGreaterThan(stock);
    const base = R.carStats(rc);
    rc.upgrades.tires = 2;
    expect(R.carStats(rc).handling).toBeGreaterThan(base.handling);
    // a drag race cares about acceleration, not handling
    expect(R.rating({ ...base, handling: 100 }, "drag")).toBe(R.rating(base, "drag"));
  });

  it("a race is decided by lap times, pays by position and wears the car", () => {
    const s = team();
    const rc = R.receiveRaceCar(s, "city");
    const rec = R.enterRace(s, "amateurCup")!;
    expect(rec.entrants.length).toBe(4);
    expect(rec.entrants.every((e) => e.laps.length === 3)).toBe(true);
    const totals = rec.order.map((id) => rec.entrants.find((e) => e.id === id)!.total);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    const cash = s.cash;
    for (let i = 0; i < 400 && s.racing.live; i++) tick(s, 0.5);
    expect(s.racing.live).toBeNull();
    const rw = s.racing.last!.result!;
    expect(s.cash).toBeGreaterThan(cash);
    expect(rw.prize).toBe([5_000, 3_000, 2_000, 1_000][rw.position]);
    expect(R.condition(rc)).toBeLessThan(1);
    expect(R.repairCost(s, rc)).toBeGreaterThan(0);
    expect(R.repairCar(s, rc.id)).toBe(true);
    expect(R.condition(rc)).toBe(1);
  });

  it("a stock city car is a fair match in the Amateur Cup; a developed one wins most races", () => {
    const s = team();
    const rc = R.receiveRaceCar(s, "city");
    const wins = (n = 40) => {
      let w = 0;
      for (let i = 0; i < n; i++) {
        const rec = R.runRace(s, R.setupFor(s, "amateurCup")!, rc, 0);
        if (rec.order[0] === "player") w++;
      }
      return w / n;
    };
    const stock = wins();
    expect(stock).toBeGreaterThan(0.1);
    expect(stock).toBeLessThan(0.8);
    for (const u of ["engine", "tires", "transmission"] as const) rc.upgrades[u] = 2;
    expect(wins()).toBeGreaterThan(stock);
  });

  it("classes keep a city car out of supercar races; reputation opens events", () => {
    const s = team();
    const rc = R.receiveRaceCar(s, "city");
    expect(R.eventLock(s, RACE_EVENT_BY_ID.citySprint, rc)).toEqual({ kind: "rep", need: 60 });
    s.racing.rep = 1e6;
    expect(R.eventLock(s, RACE_EVENT_BY_ID.grandPrix, rc)).toEqual({ kind: "class", classes: ["A"] });
    expect(R.eventLock(s, RACE_EVENT_BY_ID.citySprint, rc)).toBeNull();
  });

  it("development costs money and components from the plants", () => {
    const s = team();
    const rc = R.receiveRaceCar(s, "city");
    const cost = R.raceUpgradeCost(s, rc, "engine")!;
    expect(cost.parts).toBe(1);
    expect(R.upgradeRaceCar(s, rc.id, "engine")).toBe(false); // no engines in stock
    s.city.buildings[STARTER_PLOT] = { type: "engineFactory", level: 1, plant: { ...Ch.newPlant(), out: 3, outValue: 3_000 } };
    const cash = s.cash;
    expect(R.upgradeRaceCar(s, rc.id, "engine")).toBe(true);
    expect(s.cash).toBeCloseTo(cash - cost.money);
    expect(s.city.buildings[STARTER_PLOT].plant!.out).toBe(2);
    expect(rc.upgrades.engine).toBe(1);
    // racing parts can stand in for components
    s.racing.parts = 5;
    expect(R.upgradeRaceCar(s, rc.id, "tires", true)).toBe(true);
    expect(s.racing.parts).toBe(4);
  });

  it("a championship scores every round and crowns a champion after the final", () => {
    const s = team();
    s.racing.rep = 1e5;
    R.receiveRaceCar(s, "city");
    const ev = RACE_EVENT_BY_ID.amateurChampionship;
    for (let round = 0; round < ev.tracks.length; round++) {
      const rec = R.enterRace(s, ev.id)!;
      expect(rec.round).toBe(round);
      expect(rec.track).toBe(ev.tracks[round]);
      for (let i = 0; i < 600 && s.racing.live; i++) tick(s, 0.5);
    }
    expect(s.racing.championship).toBeNull();
    expect(s.racing.last!.result!.title).toBeDefined();
  });

  it("automatic racing keeps going offline, with a report", () => {
    const s = team();
    R.receiveRaceCar(s, "city");
    s.racing.garage = 2;
    expect(R.setAutoRacing(s, true)).toBe(true);
    s.lastActiveAt = T0;
    const rep = computeOffline(s, T0 + 3 * 3600_000);
    expect(rep.racing?.races).toBeGreaterThanOrEqual(5);
    expect(rep.racing!.prize).toBeGreaterThan(0);
    expect(s.racing.stats.races).toBe(rep.racing!.races);
  });

  it("saves keep the team and drop anything broken", () => {
    const s = team();
    const rc = R.receiveRaceCar(s, "city");
    rc.upgrades.engine = 2;
    s.racing.rep = 321;
    const back = migrate(JSON.parse(JSON.stringify(s)), T0);
    expect(back.racing.unlocked).toBe(true);
    expect(back.racing.cars[0].upgrades.engine).toBe(2);
    expect(back.racing.rep).toBe(321);
    const old = JSON.parse(JSON.stringify(s));
    delete old.racing;
    expect(migrate(old, T0).racing.unlocked).toBe(false);
    const bad = JSON.parse(JSON.stringify(s));
    bad.racing.cars.push({ car: "tank" }, null);
    expect(migrate(bad, T0).racing.cars.length).toBe(1);
  });
});
