import { describe, expect, it } from "vitest";
import { WORLD_MAP } from "./city/layout";
import { CARS, CAR_BY_ID } from "./config/cars";
import { PLANT_BY_ID } from "./config/chain";
import { LANDMARK, LANDMARKS, LANDMARK_BY_TERRITORY } from "./config/landmarks";
import { activeCar, carLock, carValue, newPlant } from "./engine/chain";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import * as Lm from "./engine/landmarks";
import { marketPrice } from "./engine/materials";
import { createInitialState } from "./engine/state";
import { unlockTerritory } from "./engine/territory";
import { decodeSave, encodeSave } from "./save/serialize";
import type { TerritoryId } from "./config/city";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 9, 25, 12);
const lotOf = (t: string) => `w:${t}`;

/** A company with the territory open and its works standing (restored). */
function withWorks(t: TerritoryId, s = createInitialState(T0)) {
  const l = LANDMARK_BY_TERRITORY[t]!;
  (s.city.territories ??= []).push(t);
  s.city.buildings[lotOf(t)] = { type: l.works, level: 1, plant: newPlant() };
  return s;
}

describe("landmark works", () => {
  it("one in each buyable territory, each with its own lot, part and car line", () => {
    expect(LANDMARKS.map((l) => l.territory).sort()).toEqual(["airport", "boulevard", "mountain", "port", "raw", "suburbs"]);
    for (const l of LANDMARKS) {
      const lots = WORLD_MAP.plots.filter((p) => p.territory === l.territory);
      expect(lots, l.territory).toHaveLength(1);
      expect(lots[0].use).toBe(l.works);
      expect(PLANT_BY_ID[l.works].landmark).toBe(l.territory);
      const car = CAR_BY_ID[l.car];
      expect(car.line).toBe(l.territory);
      // the line needs the works' own part
      expect(car.extras).toContain(PLANT_BY_ID[l.works].item);
    }
    expect(CARS.filter((c) => c.line)).toHaveLength(LANDMARKS.length);
  });

  it("a works' lot opens with its territory, then with the plant before it in the chain", () => {
    const s = createInitialState(T0);
    s.cash = 1e12;
    s.city.zones.push("industrial");
    expect(Co.landLock(s, lotOf("raw"))).toEqual({ kind: "territory", territory: "raw" });
    expect(Co.plotStatus(s, lotOf("raw"))).toBe("locked");
    expect(unlockTerritory(s, "raw")).toBe(true);
    // the Frame Works comes after the first assembly plant
    expect(Co.landLock(s, lotOf("raw"))).toMatchObject({ kind: "chain" });
    s.city.buildings["b:industrial:0"] = { type: "assemblyPlant", level: 1, plant: newPlant() };
    expect(Co.landLock(s, lotOf("raw"))).toBeNull();
    expect(Co.buyAndBuild(s, lotOf("raw"))).toBe(true);
    expect(s.city.sites[lotOf("raw")]?.type).toBe("frameWorks");
  });

  it("a line car needs its works, and an assembly plant never switches to it on its own", () => {
    const s = createInitialState(T0);
    // every other part of the pickup is made (or bought from the supplier)
    for (const t of ["assemblyPlant", "engineFactory", "interiorFactory", "suspensionFactory"] as const) s.city.buildings[`x:${t}`] = { type: t, level: 1, plant: newPlant() };
    const gm = snapshot(s).gm;
    expect(carLock(s, CAR_BY_ID.pickup, gm)).toMatchObject({ kind: "plant", plant: "frameWorks" });
    withWorks("raw", s);
    const after = snapshot(s);
    expect(carLock(s, CAR_BY_ID.pickup, after.gm)).toBeNull();
    const cars = CARS.filter((c) => carLock(s, c, after.gm) === null);
    expect(cars.map((c) => c.id)).toContain("pickup");
    // the plant keeps to the regular line unless the pickup is chosen
    const p = newPlant();
    expect(activeCar(s, p, cars)?.line).toBeUndefined();
    p.car = "pickup";
    expect(activeCar(s, p, cars)?.id).toBe("pickup");
  });

  it("levels: 1 when restored, then with the cars of the line; local buyers pay more", () => {
    const s = createInitialState(T0);
    const l = LANDMARK_BY_TERRITORY.mountain!;
    const gm = snapshot(s).gm;
    const before = carValue(s, CAR_BY_ID.offroad, gm);
    expect(Lm.landmarkLevel(s, l)).toBe(0);
    withWorks("mountain", s);
    expect(Lm.landmarkLevel(s, l)).toBe(1);
    expect(Lm.nextLevelAt(s, l)).toBe(LANDMARK.levels[0]);
    expect(carValue(s, CAR_BY_ID.offroad, gm)).toBeCloseTo(before * (1 + LANDMARK.localPerLevel));
    s.lifetime.carsByType.offroad = LANDMARK.levels[3];
    expect(Lm.landmarkLevel(s, l)).toBe(LANDMARK.maxLevel);
    expect(Lm.nextLevelAt(s, l)).toBeNull();
    // the other lines are not touched
    expect(carValue(s, CAR_BY_ID.suv, gm)).toBeCloseTo(carValue(createInitialState(T0), CAR_BY_ID.suv, gm));
  });

  it("the line's first car pays once (money and a Star); a new level is announced once", () => {
    const s = withWorks("suburbs");
    s.chain.steady = 100;
    const stars = s.stars;
    const cash = s.cash;
    // restored: level 1, no toast of its own (the construction has one)
    expect(Lm.landmarkNews(s)).toEqual({ firstCar: [], levelUp: [] });
    s.lifetime.carsByType.minivan = 1;
    const news = Lm.landmarkNews(s);
    expect(news.firstCar).toEqual([{ territory: "suburbs", car: "minivan", cash: Math.max(LANDMARK.firstCar.minCash, 100 * LANDMARK.firstCar.incomeSeconds), stars: 1 }]);
    expect(s.stars).toBe(stars + 1);
    expect(s.cash).toBeGreaterThan(cash);
    s.lifetime.carsByType.minivan = LANDMARK.levels[0];
    expect(Lm.landmarkNews(s)).toEqual({ firstCar: [], levelUp: [{ territory: "suburbs", level: 2 }] });
    expect(Lm.landmarkNews(s)).toEqual({ firstCar: [], levelUp: [] });
  });

  it("specialties: materials, leasing, races, editions, exports and the robotaxi fleet grow with the level", () => {
    const s = createInitialState(T0);
    const price = marketPrice(s, "steel");
    withWorks("raw", s);
    expect(marketPrice(s, "steel")).toBeCloseTo(price * (1 - LANDMARK.raw.materials));
    expect(Lm.raceMult(s)).toBe(1);
    withWorks("mountain", s);
    expect(Lm.raceMult(s)).toBeCloseTo(1 + LANDMARK.mountain.race);
    withWorks("boulevard", s);
    expect(Lm.editionsSooner(s)).toBeCloseTo(LANDMARK.boulevard.editions);
    withWorks("port", s);
    expect(Lm.exportBonus(s)).toBeCloseTo(1 + LANDMARK.port.exports);
    // leasing: a share of each minivan sold comes back as rent
    withWorks("suburbs", s);
    Lm.landmarkSale(s, "minivan", 100_000);
    expect(s.landmarks.lease).toBeCloseTo(100_000 * LANDMARK.suburbs.lease);
    let rent = 0;
    for (let i = 0; i < 60; i++) Lm.landmarkTick(s, 60, (a) => (rent += a));
    expect(rent).toBeGreaterThan(100_000 * LANDMARK.suburbs.lease * 0.99);
    expect(s.landmarks.lease).toBeLessThan(100_000 * LANDMARK.suburbs.lease * 0.01);
    // the fleet: shuttles join up to the level's limit and earn their rides
    Lm.landmarkSale(s, "shuttle", 1e6);
    expect(s.landmarks.fleet).toBe(0);
    withWorks("airport", s);
    for (let i = 0; i < 20; i++) Lm.landmarkSale(s, "shuttle", 1e6);
    expect(s.landmarks.fleet).toBe(LANDMARK.airport.fleetPerLevel);
    expect(Lm.fleetIncome(s)).toBeCloseTo((LANDMARK.airport.fleetPerLevel * 1e6 * LANDMARK.airport.earn) / 3600);
  });

  it("a save keeps what was paid and announced, within bounds", () => {
    const s = withWorks("airport");
    s.landmarks = { lease: 500, fleet: 3, fleetValue: 2e6, rewarded: ["airport"], levels: { airport: 2 } };
    const back = decodeSave(encodeSave(s), T0) as GameState;
    expect(back.landmarks).toEqual(s.landmarks);
    expect(Lm.migrateLandmarks({ fleet: 1e9, rewarded: ["airport", "atlantis", "airport"], levels: { nowhere: 3 } })).toEqual({ lease: 0, fleet: LANDMARK.airport.fleetPerLevel * LANDMARK.maxLevel, fleetValue: 0, rewarded: ["airport"], levels: {} });
    expect(Lm.migrateLandmarks(undefined)).toEqual(Lm.createLandmarks());
  });
});
