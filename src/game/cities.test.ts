// The company's cities: each on its own map, with its own wallet; the city
// not being played brings in its share of steady income; the racing team
// stays in the first city; saves keep every city on its own map.
import { afterEach, describe, expect, it } from "vitest";
import { DEPOT, MARKET, RACING, RACING_AREA, STARTER_PLOT, WORLD_MAP, setWorld, withWorld, worldOf } from "./city/layout";
import { CITY_RULES } from "./config/cities";
import { BUYABLE_TERRITORIES } from "./config/city";
import * as C from "./engine/city";
import * as Ch from "./engine/chain";
import * as Cy from "./engine/cities";
import * as Co from "./engine/construction";
import * as Rc from "./engine/racing";
import * as St from "./engine/stock";
import { snapshot } from "./engine/economy";
import { metric } from "./engine/progress";
import { collectOffline, settleOffline } from "./engine/offline";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { migrate } from "./save/serialize";
import * as Mk from "./engine/market";
import { nextGoals } from "./engine/insights";
import { setPlaceNames, translate } from "@/i18n";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 9, 26, 12);
const MIN = 60_000;
/** Each city's first plant. */
const FIRST = worldOf("home").plots.find((p) => p.starter)!.id;
const NORTH_FIRST = worldOf("north").plots.find((p) => p.starter)!.id;

afterEach(() => {
  setWorld("home");
  setPlaceNames("home");
});

/** A company that has opened every territory of its first city and has the price of Nordheim. */
function ready(): GameState {
  const s = createInitialState(T0);
  s.city.territories = BUYABLE_TERRITORIES.map((t) => t.id);
  s.cash = CITY_RULES.unlockCash + 5e6;
  return s;
}

/** That company with Nordheim open (still playing in the first city). */
function withNorth(): GameState {
  const s = ready();
  expect(Cy.unlockCity(s, "north", T0)).toBe(true);
  return s;
}

const roundTrip = (s: GameState, now = T0) => migrate(JSON.parse(JSON.stringify(s)), now);

describe("city maps", () => {
  it("Nordheim's map has its own lot names; the market, the depot, the paddock and the dealers keep theirs", () => {
    const home = worldOf("home");
    const north = worldOf("north");
    expect(north.id).toBe("north");
    expect(north.assets).toBe("/world-north");
    const lots = north.plots.filter((p) => p.kind === "plot");
    expect(lots.every((p) => p.id.startsWith("n:"))).toBe(true);
    for (const id of [MARKET, DEPOT, RACING, "d:local", "d:city", "d:premium", "d:luxury", "d:supercar", "d:global"]) expect(north.plotById[id]).toBeDefined();
    // no lot of one city is a lot of the other
    for (const p of lots) expect(home.plotById[p.id]).toBeUndefined();
    // no landmark works there
    expect(north.plots.some((p) => p.territory)).toBe(false);
    // the biggest island: more lots than the first one, in every district
    expect(lots.length).toBeGreaterThan(home.plots.filter((p) => p.kind === "plot" && !p.territory).length);
    for (const z of ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global"]) {
      expect(lots.filter((p) => p.zone === z && !p.big).length).toBeGreaterThanOrEqual(9);
      expect(lots.some((p) => p.zone === z && p.big)).toBe(true);
    }
    expect(north.plotById[NORTH_FIRST]).toMatchObject({ zone: "town", use: "bodyWorks", starter: true });
  });

  it("every Nordheim lot faces its road across its driveway, on its own ground", () => {
    const north = worldOf("north");
    for (const p of north.plots) {
      const fx = Math.sin(p.rot);
      const fy = Math.cos(p.rot);
      // the entry is where the lot's front looks at the road's centre line
      expect(Math.hypot(p.x + fx * (p.d / 2 + p.entry.drive) - p.entry.x, p.y + fy * (p.d / 2 + p.entry.drive) - p.entry.y)).toBeLessThan(0.15);
      expect(p.h).toBeGreaterThan(1);
      expect(north.roads[p.entry.edge]).toBeDefined();
    }
    // no two lots overlap: their centres are at least their half sizes apart
    for (let i = 0; i < north.plots.length; i++)
      for (let j = i + 1; j < north.plots.length; j++) {
        const a = north.plots[i];
        const b = north.plots[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((Math.min(a.w, a.d) + Math.min(b.w, b.d)) / 2);
      }
  });

  it("Nordheim's start is as close-knit as the first city's: the depot, the market and the first dealers near the first plant", () => {
    setWorld("north");
    expect(Ch.distance(DEPOT, NORTH_FIRST)).toBeLessThan(12);
    expect(Ch.distance(NORTH_FIRST, MARKET)).toBeLessThan(16);
    expect(Ch.distance(NORTH_FIRST, "d:local")).toBeLessThan(12);
    expect(Ch.distance(NORTH_FIRST, "d:city")).toBeLessThan(12);
    // every lot can be reached from the depot
    for (const p of WORLD_MAP.plots) expect(Ch.distance(DEPOT, p.id)).toBeLessThan(200);
  });

  it("switching the map moves the first plant, the paddock and the routes with it", () => {
    const home = STARTER_PLOT;
    const d = Ch.distance(DEPOT, home);
    setWorld("north");
    expect(WORLD_MAP.id).toBe("north");
    expect(STARTER_PLOT).toBe(NORTH_FIRST);
    expect(RACING_AREA.paddock).toBe(worldOf("north").plotById[RACING]);
    // Nordheim's own roads: its own delivery times
    expect(Ch.distance(DEPOT, STARTER_PLOT)).not.toBeCloseTo(d);
    expect(Co.plotsFor("garage").every((id) => id.startsWith("n:"))).toBe(true);
    // a lot of the other city is not on this map
    expect(Ch.distance(DEPOT, home)).toBe(20);
    setWorld("home");
    expect(STARTER_PLOT).toBe(home);
    expect(Co.plotsFor("garage").some((id) => id.startsWith("n:"))).toBe(false);
  });

  it("withWorld runs on another map and comes back, even when it throws", () => {
    expect(withWorld("north", () => WORLD_MAP.id)).toBe("north");
    expect(WORLD_MAP.id).toBe("home");
    expect(() =>
      withWorld("north", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(WORLD_MAP.id).toBe("home");
  });
});

describe("opening Nordheim", () => {
  it("takes every territory of the first city and the price from its wallet", () => {
    const s = createInitialState(T0);
    s.cash = CITY_RULES.unlockCash * 2;
    s.city.territories = BUYABLE_TERRITORIES.slice(0, -1).map((t) => t.id);
    expect(Cy.cityUnlockStatus(s, "north")).toMatchObject({ territories: BUYABLE_TERRITORIES.length - 1, needed: 6, ready: false });
    expect(Cy.unlockCity(s, "north", T0)).toBe(false);
    s.city.territories = BUYABLE_TERRITORIES.map((t) => t.id);
    s.cash = CITY_RULES.unlockCash - 1;
    expect(Cy.unlockCity(s, "north", T0)).toBe(false);
    s.cash = CITY_RULES.unlockCash + 100;
    expect(Cy.unlockCity(s, "north", T0)).toBe(true);
    expect(s.cash).toBeCloseTo(100);
    // it waits, parked, with its own small capital and its first plant
    expect(s.activeCity).toBe("home");
    const n = s.cities.north!;
    expect(n.cash).toBe(CITY_RULES.startCash);
    expect(Object.keys(n.city.buildings)).toEqual([NORTH_FIRST]);
    expect(n.city.zones).toEqual(["town"]);
    expect(n.steady).toBe(0);
    expect(Cy.ownedCities(s)).toEqual(["home", "north"]);
    // once
    expect(Cy.unlockCity(s, "north", T0)).toBe(false);
    expect(Cy.unlockCity(s, "home", T0)).toBe(false);
  });
});

describe("switching cities", () => {
  it("each city keeps its wallet, lots and chain; the map follows", () => {
    const s = withNorth();
    s.chain.steady = 2_000;
    const homeSteady = snapshot(s).steadyIncomePerSec;
    const homeCash = s.cash;
    const homeCity = s.city;
    expect(Cy.switchCity(s, "north", T0 + MIN)).toBe(true);
    expect(WORLD_MAP.id).toBe("north");
    expect(s.activeCity).toBe("north");
    expect(s.cash).toBe(CITY_RULES.startCash);
    expect(Object.keys(s.city.buildings)).toEqual([NORTH_FIRST]);
    expect(s.cities.north).toBeUndefined();
    expect(s.cities.home).toMatchObject({ cash: homeCash, at: T0 + MIN, steady: homeSteady });
    expect(s.cities.home!.city).toBe(homeCity);
    expect(Cy.walletOf(s, "home")).toBe(homeCash);
    // nothing to switch to
    expect(Cy.switchCity(s, "north", T0)).toBe(false);
    expect(Cy.switchCity(s, "home", T0 + 2 * MIN)).toBe(true);
    expect(WORLD_MAP.id).toBe("home");
    expect(s.cash).toBe(homeCash);
    expect(s.city).toBe(homeCity);
    expect(s.cities.north!.cash).toBe(CITY_RULES.startCash);
  });

  it("a parked city's building sites carry on while the company is away from it", () => {
    const s = withNorth();
    Cy.switchCity(s, "north", T0);
    s.cash = 1e9;
    const plot = Co.plotsFor("garage")[0];
    expect(C.buildStructure(s, plot, "garage")).toBe(true);
    const dur = s.city.sites[plot].dur;
    Cy.switchCity(s, "home", T0 + MIN);
    expect(s.cities.north!.city.sites[plot]).toBeDefined();
    Cy.switchCity(s, "north", T0 + MIN + dur * 1000 + 1000);
    expect(s.city.sites[plot]).toBeUndefined();
    expect(s.city.buildings[plot]?.type).toBe("garage");
  });

  it("plant counts and the company's value take in every city", () => {
    const s = withNorth();
    s.chain.steady = 1_000;
    const value = St.companyValue(s, snapshot(s));
    // the first plant of each city
    expect(metric(s, "factoriesOwned")).toBe(2);
    Cy.switchCity(s, "north", T0);
    expect(metric(s, "factoriesOwned")).toBe(2);
    // the first city is worth what it made when it was left, Nordheim what it makes now
    expect(St.companyValue(s, snapshot(s))).toBeCloseTo(value + Math.max(0, snapshot(s).steadyIncomePerSec) * St.STOCK.valueSeconds);
  });
});

describe("the city not being played", () => {
  it("brings in its share of steady income, into its own wallet, and pays the shareholders their part", () => {
    const s = withNorth();
    s.chain.steady = 1_000;
    const steady = snapshot(s).steadyIncomePerSec;
    Cy.switchCity(s, "north", T0);
    const home = s.cities.home!.cash;
    const north = s.cash;
    const earned = s.lifetime.moneyEarned;
    Cy.parkedTick(s, 10);
    const got = steady * CITY_RULES.passiveShare * 10;
    expect(s.cities.home!.cash).toBeCloseTo(home + got);
    expect(s.cash).toBe(north);
    expect(s.lifetime.moneyEarned).toBeCloseTo(earned + got);
    // with a fifth of the company sold, a fifth of it goes to the shareholders
    s.stock.sold = 0.2;
    Cy.parkedTick(s, 10);
    expect(s.cities.home!.cash).toBeCloseTo(home + got + got * 0.8);
    expect(s.stock.dividends).toBeCloseTo(got * 0.2);
    // the game's tick does it too
    const before = s.cities.home!.cash;
    tick(s, 1);
    expect(s.cities.home!.cash).toBeGreaterThan(before);
  });

  it("what it brought in while the game was closed waits in the report, for its own wallet", () => {
    const s = withNorth();
    s.chain.steady = 1_000;
    const steady = snapshot(s).steadyIncomePerSec;
    Cy.switchCity(s, "north", T0);
    s.lastActiveAt = T0;
    const home = s.cities.home!.cash;
    const report = settleOffline(s, T0 + 60 * MIN)!;
    const eff = snapshot(s).gm.offline;
    expect(report.cities?.home).toBeCloseTo(steady * CITY_RULES.passiveShare * eff * 3600);
    expect(s.cities.home!.cash).toBe(home);
    collectOffline(s, 2);
    expect(s.cities.home!.cash).toBeCloseTo(home + 2 * report.cities!.home!);
    expect(s.pendingOffline).toBeNull();
  });
});

describe("the racing team stays in the first city", () => {
  it("what it pays goes through the first city's wallet and lots, wherever the company is", () => {
    const s = withNorth();
    s.chain.firstCar = true;
    Cy.switchCity(s, "north", T0);
    const north = { cash: s.cash, zones: [...s.city.zones] };
    const home = s.cities.home!.cash;
    // Nordheim has made no car yet: on its own it could not open the Racing District
    expect(Rc.racingBlocker(s)).toBe("firstCar");
    expect(Cy.withCity(s, "home", () => Rc.unlockRacing(s))).toBe(true);
    expect(s.cash).toBe(north.cash);
    expect(s.city.zones).toEqual(north.zones);
    expect(s.cities.home!.cash).toBeLessThan(home);
    expect(s.cities.home!.city.zones).toContain("industrial");
    expect(WORLD_MAP.id).toBe("north");
  });

  it("withCity puts the active city back even when it throws", () => {
    const s = withNorth();
    Cy.switchCity(s, "north", T0);
    const city = s.city;
    expect(() =>
      Cy.withCity(s, "home", () => {
        s.cash += 5;
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(s.city).toBe(city);
    expect(WORLD_MAP.id).toBe("north");
    expect(s.cities.home!.cash).toBe(5e6 + 5);
  });
});

describe("saves", () => {
  it("a save from before the cities is all the first city's", () => {
    const s = createInitialState(T0);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.activeCity;
    delete raw.cities;
    const back = migrate(raw, T0);
    expect(back.activeCity).toBe("home");
    expect(back.cities).toEqual({});
    expect(back.city).toEqual(s.city);
    expect(back.cash).toBe(s.cash);
  });

  it("keeps every city on its own map, wherever the company is", () => {
    const s = withNorth();
    s.cash += 1e9;
    expect(C.buildStructure(s, Co.plotsFor("garage")[0], "garage")).toBe(true);
    Cy.switchCity(s, "north", T0 + MIN);
    s.cash = 1e9;
    const plot = Co.plotsFor("garage")[0];
    expect(C.buildStructure(s, plot, "garage")).toBe(true);
    // a manager runs a plant in the first city
    s.managers.mike.hired = true;
    s.managers.mike.assignedTo = FIRST;
    setWorld("home"); // the loader puts the right map back itself
    const back = roundTrip(s);
    expect(WORLD_MAP.id).toBe("home");
    expect(back.activeCity).toBe("north");
    expect(back.city).toEqual(s.city);
    expect(back.cash).toBe(s.cash);
    expect(back.cities.home!.city).toEqual(s.cities.home!.city);
    expect(back.cities.home!.cash).toBe(s.cities.home!.cash);
    expect(back.cities.home!.at).toBe(T0 + MIN);
    expect(back.cities.home!.steady).toBe(s.cities.home!.steady);
    expect(back.managers.mike.assignedTo).toBe(FIRST);
  });

  it("drops lots that are not on their city's map", () => {
    const s = withNorth();
    const raw = JSON.parse(JSON.stringify(s));
    // a lot of the first city in Nordheim's save, and one of Nordheim's in the first city's
    raw.cities.north.city.buildings[STARTER_PLOT] = raw.city.buildings[STARTER_PLOT];
    raw.city.buildings[NORTH_FIRST] = raw.city.buildings[STARTER_PLOT];
    const back = migrate(raw, T0);
    expect(Object.keys(back.city.buildings)).toEqual([STARTER_PLOT]);
    expect(Object.keys(back.cities.north!.city.buildings)).toEqual([NORTH_FIRST]);
    // a parked city never holds the one being played, and an unknown one is ignored
    raw.cities.home = raw.cities.north;
    raw.cities.atlantis = raw.cities.north;
    raw.activeCity = "atlantis";
    const odd = migrate(raw, T0);
    expect(odd.activeCity).toBe("home");
    expect(Object.keys(odd.cities)).toEqual(["north"]);
  });

  it("a report waiting for COLLECT keeps only the cities' money it can pay", () => {
    const s = withNorth();
    s.pendingOffline = { seconds: 7200, cappedSeconds: 7200, cars: 0, money: 10, rp: 0, carsByType: {}, cities: { north: 50 } };
    const raw = JSON.parse(JSON.stringify(s));
    raw.pendingOffline.cities = { north: 50, home: -4, atlantis: 9, foo: "x" };
    expect(migrate(raw, T0).pendingOffline?.cities).toEqual({ north: 50 });
  });
});

describe("playing in two cities", () => {
  it("a recall is paid by the city that built the cars, wherever the company is", () => {
    const s = withNorth();
    s.chain.firstCar = true;
    // the first city builds a faulty batch
    s.quality.defects = 10;
    Mk.onCarBuilt(s, "city", 0, "balanced");
    expect(s.quality.recall?.city).toBe("home");
    Cy.switchCity(s, "north", T0);
    s.cash = 100;
    const home = s.cities.home!.cash;
    expect(Mk.recallCity(s)).toBe("home");
    expect(Mk.recallWallet(s)).toBe(home);
    expect(Mk.payRecall(s, 1_000)).toBe(true);
    expect(s.cash).toBe(100);
    expect(s.cities.home!.cash).toBe(home - 1_000);
    // a save keeps where the recall came from
    s.quality.defects = 10;
    Mk.onCarBuilt(s, "city", 0, "balanced");
    expect(roundTrip(s).quality.recall?.city).toBe("north");
  });

  it("Nordheim's districts and territories have names of their own while it is played", () => {
    expect(translate("en", "zone.town")).toBe("Small Town");
    setPlaceNames("north");
    expect(translate("en", "zone.town")).toBe("Fjord Village");
    expect(translate("en", "territory.mountain")).toBe("Ski Peaks");
    // everything else is the same
    expect(translate("en", "nav.world")).toBe("World");
    setPlaceNames("home");
    expect(translate("en", "zone.town")).toBe("Small Town");
  });

  it("once every territory is open, opening Nordheim is a goal (in the first city only)", () => {
    const s = ready();
    s.chain.firstCar = true;
    const goal = () => nextGoals(s, snapshot(s), 30).find((g) => g.kind === "city");
    expect(goal()).toMatchObject({ city: "north", cost: CITY_RULES.unlockCash });
    s.city.territories = (s.city.territories ?? []).slice(1);
    expect(goal()).toBeUndefined();
    s.city.territories = BUYABLE_TERRITORIES.map((t) => t.id);
    Cy.unlockCity(s, "north", T0);
    expect(goal()).toBeUndefined();
  });
});
