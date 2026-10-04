import { describe, expect, it } from "vitest";
import { WORLD_MAP } from "./city/layout";
import { CAR_BY_ID } from "./config/cars";
import * as Ch from "./engine/chain";
import * as D from "./engine/car-dna";
import * as R from "./engine/racing";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { migrate } from "./save/serialize";
import type { GameState, RaceCarState } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);

function car(s: GameState, grades: RaceCarState["grades"] = {}): RaceCarState {
  s.lifetime.carsByType.sports = 1;
  const rc = R.receiveRaceCar(s, "sports", "factory");
  Object.assign(rc.grades, grades);
  return rc;
}

describe("Car DNA", () => {
  it("the parts fitted decide the car: a better engine makes more power and a quicker car", () => {
    const s = createInitialState(T0);
    const base = car(s, { engine: 2, tires: 2, body: 2, suspension: 2 });
    const strong = car(s, { engine: 4, tires: 2, body: 2, suspension: 2 });
    const a = D.carDNA(s, base);
    const b = D.carDNA(s, strong);
    expect(b.hp).toBeGreaterThan(a.hp * 1.4);
    expect(b.torque).toBeGreaterThan(a.torque);
    expect(b.engine).not.toBe(a.engine);
    expect(D.testCar(strong).zeroTo100).toBeLessThan(D.testCar(base).zeroTo100);
    expect(D.testCar(strong).topSpeed).toBeGreaterThan(D.testCar(base).topSpeed);
    expect(b.performance).toBeGreaterThan(a.performance);
  });

  it("poor tyres and brakes mean a longer stop and less grip", () => {
    const s = createInitialState(T0);
    const cheap = car(s, { engine: 2, tires: 1, body: 2, suspension: 1 });
    const good = car(s, { engine: 2, tires: 5, body: 2, suspension: 5 });
    expect(D.testCar(cheap).braking).toBeGreaterThan(D.testCar(good).braking);
    expect(D.testCar(cheap).cornering).toBeLessThan(D.testCar(good).cornering);
    expect(D.carDNA(s, good).tires).not.toBe(D.carDNA(s, cheap).tires);
    // a lighter carbon body: lighter car
    const carbon = car(s, { engine: 2, tires: 2, body: 5, suspension: 2 });
    expect(D.carDNA(s, carbon).weight).toBeLessThan(D.carDNA(s, cheap).weight);
    expect(D.carDNA(s, carbon).chassis).toBe("Carbon tub");
  });

  it("racing upgrades change the real figures, and wear shows up in the test", () => {
    const s = createInitialState(T0);
    const rc = car(s, { engine: 3, tires: 3, body: 3, suspension: 3 });
    const before = D.testCar(rc);
    rc.upgrades.engine = 3;
    rc.upgrades.brakes = 3;
    const after = D.testCar(rc);
    expect(after.hp).toBeGreaterThan(before.hp);
    expect(after.braking).toBeLessThan(before.braking);
    rc.wear.tires = 0.2;
    expect(D.testCar(rc).cornering).toBeLessThan(after.cornering);
  });

  it("the figures look like real cars", () => {
    const s = createInitialState(T0);
    s.lifetime.carsByType.city = 1;
    const city = R.receiveRaceCar(s, "city", "factory");
    const t = D.testCar(city);
    expect(t.zeroTo100).toBeGreaterThan(8);
    expect(t.zeroTo100).toBeLessThan(16);
    expect(t.topSpeed).toBeGreaterThan(150);
    expect(t.topSpeed).toBeLessThan(220);
    expect(t.braking).toBeGreaterThan(30);
    expect(t.braking).toBeLessThan(60);
  });

  it("the Test Track charges a fee, keeps the report and adds mileage", () => {
    const s = createInitialState(T0);
    const rc = car(s, { engine: 2 });
    s.cash = 0;
    expect(D.runTest(s, rc.id)).toBeNull();
    s.cash = 1e6;
    const r = D.runTest(s, rc.id)!;
    expect(r.hp).toBe(D.carDNA(s, rc).hp);
    expect(rc.test).toEqual(r);
    expect(rc.mileage).toBe(D.TEST_TRACK.km);
    expect(s.cash).toBeCloseTo(1e6 - D.testFee(rc));
    const back = migrate(JSON.parse(JSON.stringify(s)), T0).racing.cars[0];
    expect(back.test).toEqual(r);
    expect(back.mileage).toBe(D.TEST_TRACK.km);
    expect(back.location).toBe("factory");
  });

  it("My Cars: before the Racing District, a kept car stays at the factory lot", () => {
    const s = createInitialState(T0);
    s.lifetime.carsByType.city = 1;
    expect(R.fleetCap(s)).toBe(R.MY_CARS_LOT);
    expect(R.orderRaceCar(s, "city")).toBe(true);
    const free = WORLD_MAP.plots.filter((x) => x.kind === "plot" && x.zone === "town" && !x.big && !s.city.buildings[x.id]).map((x) => x.id);
    s.city.buildings[free[0]] = { type: "engineFactory", level: 1, plant: Ch.newPlant() };
    s.city.buildings[free[1]] = { type: "assemblyPlant", level: 1, plant: Ch.newPlant() };
    const p = s.city.buildings[free[1]].plant!;
    p.out = 1;
    p.outValue = 6_000;
    tick(s, 0.5);
    expect(s.racing.orders).toEqual([]);
    expect(s.racing.cars).toHaveLength(1);
    expect(s.racing.cars[0].location).toBe("factory");
    expect(s.racing.cars[0].built).toBe(s.lastActiveAt);
  });
});

describe("drivetrain plants: transmission, wheels, brakes", () => {
  it("Sedans and up need them; the supplier delivers them until the plants exist", () => {
    expect(Ch.recipe(CAR_BY_ID.city)).not.toContain("brakes");
    for (const c of ["transmission", "wheels", "brakes"] as const) expect(Ch.recipe(CAR_BY_ID.sedan)).toContain(c);
    const s = createInitialState(T0);
    expect(Ch.supplied(s, "brakes")).toBe(true);
    // a Grade-2 model is not locked by them: the supplier delivers at the model's grade
    expect(Ch.suppliedGrade("brakes", CAR_BY_ID.suv)).toBe(2);
    expect(Ch.supplierPrice("brakes", 2)).toBeGreaterThan(Ch.supplierPrice("brakes", 1));
    const plot = WORLD_MAP.plots.find((x) => x.kind === "plot" && x.zone === "town" && !x.big && !s.city.buildings[x.id])!.id;
    s.city.buildings[plot] = { type: "brakeFactory", level: 1, plant: Ch.newPlant() };
    expect(Ch.supplied(s, "brakes")).toBe(false);
  });

  it("better brakes, gearboxes and wheels make a measurably better car", () => {
    const s = createInitialState(T0);
    const base = car(s, { engine: 3, tires: 3, body: 3, suspension: 3, transmission: 1, wheels: 1, brakes: 1 });
    const good = car(s, { engine: 3, tires: 3, body: 3, suspension: 3, transmission: 5, wheels: 5, brakes: 5 });
    const a = D.testCar(base);
    const b = D.testCar(good);
    expect(b.braking).toBeLessThan(a.braking);
    expect(b.zeroTo100).toBeLessThanOrEqual(a.zeroTo100);
    expect(b.cornering).toBeGreaterThan(a.cornering);
    expect(D.carDNA(s, good).brakes).toBe("Carbon-ceramic");
    expect(D.carDNA(s, good).gearbox).not.toBe(D.carDNA(s, base).gearbox);
  });
});

describe("the look of the build", () => {
  it("paint, rims, engine and brakes on the line come from the design studio and the factories", () => {
    const s = createInitialState(T0);
    s.designs.city.color = "#1b46b8";
    s.designs.city.rims = 2;
    const a = D.lineBuildLook(s, "city");
    expect(a.color).toBe("#1b46b8");
    expect(a.engine).toBe(1);
    const plot = WORLD_MAP.plots.find((x) => x.kind === "plot" && x.zone === "town" && !x.big && !s.city.buildings[x.id])!.id;
    s.city.buildings[plot] = { type: "engineFactory", level: 1, plant: { ...Ch.newPlant(), grade: 4 } };
    expect(D.lineBuildLook(s, "city").engine).toBe(4);
    // forged wheels grow the rims
    const w = D.buildLookFrom({ wheels: 5 }, { rims: 0 });
    expect(w.rimScale).toBeGreaterThan(D.buildLookFrom({ wheels: 1 }, { rims: 0 }).rimScale);
    expect(w.rims).toBe("black");
  });
});
