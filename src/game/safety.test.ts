import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { carValue } from "./engine/chain";
import { snapshot } from "./engine/economy";
import { crashTestTick, migrateSafety, SAFETY, safetyMult, safetyScore, startCrashTest, starsFor } from "./engine/safety";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const built = () => {
  const s = createInitialState(0);
  s.lifetime.carsByType.city = 3;
  s.cash = 1e9;
  return s;
};

describe("crash tests", () => {
  it("turn a score into 1–5 stars", () => {
    expect(starsFor(0)).toBe(1);
    expect(starsFor(30)).toBe(2);
    expect(starsFor(55)).toBe(4);
    expect(starsFor(70)).toBe(5);
    expect(starsFor(100)).toBe(5);
  });

  it("give a basic city car 2 stars and a top-grade model 5, before the day's luck", () => {
    const s = createInitialState(0);
    expect(starsFor(safetyScore(s, CAR_BY_ID.city, 48))).toBe(2);
    expect(starsFor(safetyScore(s, CAR_BY_ID.suv, 100))).toBe(5);
  });

  it("score safety research and big bodies higher", () => {
    const s = createInitialState(0);
    const base = safetyScore(s, CAR_BY_ID.city, 60);
    expect(safetyScore({ research: ["sensor_fusion"] }, CAR_BY_ID.city, 60)).toBeGreaterThan(base);
    expect(safetyScore(s, CAR_BY_ID.suv, 60)).toBeGreaterThan(base);
  });

  it("test a model the company has built, one at a time, and pay for it", () => {
    const s = built();
    expect(startCrashTest(s, "sedan", 60, 100, 0)).toBe(false);
    expect(startCrashTest(s, "city", 60, 100, 0)).toBe(true);
    expect(s.cash).toBe(1e9 - 100);
    expect(startCrashTest(s, "city", 60, 100, 0)).toBe(false);
  });

  it("give the stars when the time is up, and the stars move the model's price", () => {
    const s = built();
    const snap = snapshot(s);
    const before = carValue(s, CAR_BY_ID.city, snap.gm);
    startCrashTest(s, "city", 100, 0, 0);
    expect(crashTestTick(s, CAR_BY_ID, SAFETY.minutes * 60_000 - 1)).toBeNull();
    const r = crashTestTick(s, CAR_BY_ID, SAFETY.minutes * 60_000, () => 1)!;
    expect(r.car).toBe("city");
    expect(s.safety.test).toBeNull();
    expect(safetyMult(s, "city")).toBeCloseTo(1 + SAFETY.perStar * (r.stars - 3));
    expect(carValue(s, CAR_BY_ID.city, snap.gm) / before).toBeCloseTo(safetyMult(s, "city"));
  });

  it("are saved and cleaned on load", () => {
    const s = built();
    s.safety.stars.city = 4;
    expect(decodeSave(encodeSave(s), 0).safety.stars.city).toBe(4);
    expect(migrateSafety({ stars: { city: 9, nope: 3 }, test: { car: "nope" } }, (id) => id in CAR_BY_ID)).toEqual({ stars: { city: 5 }, test: null, tests: 0 });
  });
});
