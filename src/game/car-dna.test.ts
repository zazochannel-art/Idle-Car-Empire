import { describe, expect, it } from "vitest";
import { WORLD_MAP } from "./city/layout";
import { CAR_BY_ID } from "./config/cars";
import { RACE_EVENTS } from "./config/racing";
import * as Ch from "./engine/chain";
import * as D from "./engine/car-dna";
import * as R from "./engine/racing";
import * as Sh from "./engine/showroom";
import { carDemandMult, carPriceMult } from "./engine/market";
import * as Br from "./engine/brand";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { migrate } from "./save/serialize";
import type { GameEvent, GameState, RaceCarState } from "./types";

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
    expect(s.racing.cars[0].home).toBe(free[1]);
  });
});

describe("My Cars on the road", () => {
  function lotWithCar() {
    const s = createInitialState(T0);
    s.cash = 1e6;
    const free = WORLD_MAP.plots.filter((x) => x.kind === "plot" && x.zone === "town" && !x.big && !s.city.buildings[x.id]).map((x) => x.id);
    s.city.buildings[free[0]] = { type: "assemblyPlant", level: 1, plant: Ch.newPlant() };
    const rc = car(s);
    return { s, rc, lot: free[0] };
  }

  it("a car at the factory lot can't race until a transporter takes it to the paddock", () => {
    const { s, rc, lot } = lotWithCar();
    expect(Ch.sendCar(s, rc.id, "racing")).toBe(false); // no Racing District yet
    s.racing.unlocked = true;
    const amateur = RACE_EVENTS.find((e) => e.type !== "championship" && e.classes.includes(R.classOf(rc.car)))!;
    s.racing.rep = amateur.minRep;
    expect(R.eventLock(s, amateur, rc)).toEqual({ kind: "away" });
    expect(R.bestEventFor(s, rc)).toBeNull();

    const cash = s.cash;
    expect(Ch.sendCar(s, rc.id, "racing")).toBe(true);
    expect(s.cash).toBeLessThan(cash);
    expect(rc.location).toBe("transit");
    const sh = s.chain.shipments.find((x) => x.fleet?.includes(rc.id))!;
    expect(sh).toMatchObject({ from: lot, vehicle: "carrier", models: ["sports"] });
    // on the road: no test, no second trip, no race
    expect(Ch.sendCar(s, rc.id, "racing")).toBe(false);
    expect(D.runTest(s, rc.id)).toBeNull();
    expect(Ch.carEta(s, rc.id)?.to).toBe("racing");

    for (let i = 0; i < 2000 && rc.location === "transit"; i++) tick(s, 0.5);
    expect(rc.location).toBe("racing");
    expect(R.eventLock(s, amateur, rc)).not.toEqual({ kind: "away" });
    // and back home
    expect(Ch.sendCar(s, rc.id, "factory")).toBe(true);
    expect(s.chain.shipments.find((x) => x.fleet?.includes(rc.id) && !x.back)?.to).toBe(lot);
    for (let i = 0; i < 2000 && rc.location === "transit"; i++) tick(s, 0.5);
    expect(rc.location).toBe("factory");
  });

  it("a trip survives a save; a car whose transporter was lost is back at the lot", () => {
    const { s, rc } = lotWithCar();
    s.racing.unlocked = true;
    Ch.sendCar(s, rc.id, "racing");
    const kept = migrate(JSON.parse(JSON.stringify(s)), T0);
    expect(kept.racing.cars[0].location).toBe("transit");
    expect(kept.chain.shipments.some((x) => x.fleet?.includes(rc.id))).toBe(true);
    const raw = JSON.parse(JSON.stringify(s));
    raw.chain.shipments = [];
    expect(migrate(raw, T0).racing.cars[0].location).toBe("factory");
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

describe("the showroom", () => {
  function shop() {
    const s = createInitialState(T0);
    s.cash = 1e6;
    s.chain.firstCar = true;
    const free = WORLD_MAP.plots.filter((x) => x.kind === "plot" && x.zone === "town" && !x.big && !s.city.buildings[x.id]).map((x) => x.id);
    s.city.buildings[free[0]] = { type: "assemblyPlant", level: 1, plant: Ch.newPlant() };
    s.dealers.local.owned = true;
    const rc = car(s);
    return { s, rc };
  }

  it("a transporter takes the car to a dealer the company owns, where it waits for a buyer", () => {
    const { s, rc } = shop();
    const fair = Sh.fairPrice(s, rc);
    expect(Ch.sendCar(s, rc.id, "showroom")).toBe(false); // needs a price
    expect(Ch.sendCar(s, rc.id, "showroom", fair)).toBe(true);
    expect(rc.location).toBe("transit");
    expect(Ch.carEta(s, rc.id)?.to).toBe("showroom");
    for (let i = 0; i < 2000 && rc.location === "transit"; i++) tick(s, 0.5);
    expect(rc.location).toBe("showroom");
    expect(R.atTrack(rc)).toBe(false);
    // a buyer comes: the car is sold at the asking price
    const cash = s.cash;
    const ev: GameEvent[] = [];
    expect(Sh.showroomTick(s, 1, ev, () => 0)).toBe(1);
    expect(s.cash).toBeCloseTo(cash + fair);
    expect(s.racing.cars).toHaveLength(0);
    expect(s.showroom.sold).toBe(1);
    expect(ev[0]).toMatchObject({ type: "sale", plot: "d:local" });
  });

  it("buyers weigh the price against the car: dearer sells slower, a racing record and reputation pay", () => {
    const { s, rc } = shop();
    const fair = Sh.fairPrice(s, rc);
    expect(Sh.expectedSale(s, rc, fair * 1.5)).toBeGreaterThan(Sh.expectedSale(s, rc, fair) * 4);
    expect(Sh.expectedSale(s, rc, fair * 0.8)).toBeLessThan(Sh.expectedSale(s, rc, fair));
    rc.wins = 5;
    rc.podiums = 8;
    expect(Sh.fairPrice(s, rc)).toBeGreaterThan(fair * 1.2);
    s.quality.rep = 90;
    expect(Sh.fairPrice(s, rc)).toBeGreaterThan(fair * 1.25);
    rc.wear.engine = 0.3;
    expect(Sh.fairPrice(s, rc)).toBeLessThan(fair * 1.25);
    // the asking price stays within reason
    Ch.sendCar(s, rc.id, "showroom", fair);
    expect(Sh.setPrice(s, rc.id, 1e15)).toBe(true);
    expect(rc.listing!.price).toBeCloseTo(Sh.fairPrice(s, rc) * 3);
  });

  it("a marketing campaign costs money and speeds up dealer customers and showroom buyers", () => {
    const { s, rc } = shop();
    const before = carDemandMult(s, "city");
    const slow = Sh.buyerRate(s, rc, 1e5);
    const cash = s.cash;
    expect(Sh.startCampaign(s)).toBe(true);
    expect(s.cash).toBeLessThan(cash);
    expect(Sh.startCampaign(s)).toBe(false); // one at a time
    expect(carDemandMult(s, "city")).toBeCloseTo(before * 1.5);
    expect(Sh.buyerRate(s, rc, 1e5)).toBeCloseTo(slow * 2);
    s.market.t += 601;
    expect(carDemandMult(s, "city")).toBeCloseTo(before);
  });

  it("a showroom listing survives a save; without the dealer the car is back at the lot", () => {
    const { s, rc } = shop();
    Ch.sendCar(s, rc.id, "showroom", 12_345);
    s.chain.shipments = [];
    rc.location = "showroom";
    const back = migrate(JSON.parse(JSON.stringify(s)), T0);
    expect(back.racing.cars[0]).toMatchObject({ location: "showroom", listing: { price: 12_345, dealer: "local" } });
    s.dealers.local.owned = false;
    const lost = migrate(JSON.parse(JSON.stringify(s)), T0);
    expect(lost.racing.cars[0].location).toBe("factory");
    expect(lost.racing.cars[0].listing).toBeUndefined();
  });
});

describe("the brand", () => {
  it("attributes are earned in the other systems, and racing image is not build quality", () => {
    const s = createInitialState(T0);
    const a = Br.brandAttrs(s);
    expect(a.quality).toBe(50);
    expect(a.sport).toBe(0);
    s.racing.rep = 3000;
    Object.assign(s.lifetime.carsByType, { city: 10, luxury: 10 });
    s.research = ["a", "b", "c", "d", "e"];
    s.proto.done = { sports: 80 };
    const b = Br.brandAttrs(s);
    expect(b.sport).toBeGreaterThan(80);
    expect(b.luxury).toBeGreaterThan(a.luxury + 30);
    expect(b.innovation).toBeGreaterThan(a.innovation + 10);
    expect(b.quality).toBe(50); // winning races doesn't make the cars better built
  });

  it("a strong brand raises what dealers and the showroom pay, only for the classes judged on it", () => {
    const s = createInitialState(T0);
    s.chain.firstCar = true;
    expect(Br.brandPriceMult(s, "city")).toBe(1);
    const sports0 = carPriceMult(s, "sports");
    s.racing.rep = 5000; // racing image ~96
    expect(Br.brandPriceMult(s, "sports")).toBeGreaterThan(1.08);
    expect(carPriceMult(s, "sports")).toBeGreaterThan(sports0 * 1.08);
    expect(Br.brandPriceMult(s, "city")).toBe(1);
    // being known for racing counts more
    const plain = Br.brandPriceMult(s, "sports");
    expect(Br.setBrand(s, { style: "sport" })).toBe(true);
    expect(Br.brandPriceMult(s, "sports")).toBeGreaterThan(plain);
    const rc = car(s);
    const fair = Sh.fairPrice(s, rc);
    s.racing.rep = 0;
    expect(Sh.fairPrice(s, rc)).toBeLessThan(fair);
  });

  it("identity: the first name is free, a rebrand costs; the livery wears the brand colours", () => {
    const s = createInitialState(T0);
    s.cash = 0;
    expect(Br.setBrand(s, { name: "  Apex   Motors " })).toBe(true);
    expect(s.brand.name).toBe("Apex Motors");
    expect(Br.setBrand(s, { name: "Nova" })).toBe(false); // no money for a rebrand
    s.cash = 1e6;
    expect(Br.setBrand(s, { name: "Nova" })).toBe(true);
    expect(s.cash).toBe(1e6 - 50_000);
    Br.setBrand(s, { color: "#ef4444", accent: "#111827", logo: "🐺", style: "nope" as never });
    expect(s.brand).toMatchObject({ color: "#ef4444", accent: "#111827", logo: "🐺", style: "value" });
    const rc = car(s);
    s.designs[rc.car].color = "";
    expect(R.liveryOf(s, rc)).toEqual({ color: "#ef4444", accent: "#111827" });
    // saves keep it, junk is cleaned
    const raw = JSON.parse(JSON.stringify(s));
    raw.brand.color = "red";
    raw.brand.style = 42;
    const back = migrate(raw, T0);
    expect(back.brand).toMatchObject({ name: "Nova", logo: "🐺", color: "#f5c451", style: "value", renames: 2 });
  });
});
