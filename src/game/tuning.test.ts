import { describe, expect, it } from "vitest";
import { PAINTS, RIMS, SPOILERS } from "./config/tuning";
import { carStats, carWorth, liveryOf, migrateRacing, receiveRaceCar } from "./engine/racing";
import { createInitialState } from "./engine/state";
import { tune, tuneCost, tuningOf } from "./engine/tuning";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 9, 12);

function withCar(): { s: GameState; id: number } {
  const s = createInitialState(T0);
  s.racing.unlocked = true;
  s.cash = 1e9;
  const rc = receiveRaceCar(s, "sports");
  return { s, id: rc.id };
}

describe("tuning garage", () => {
  it("rims make a car lighter, grippier and quicker off the line", () => {
    const { s, id } = withCar();
    const rc = s.racing.cars[0];
    const before = carStats(rc, false);
    expect(tune(s, id, { kind: "rims", id: "carbon" })).toBe(true);
    const after = carStats(rc, false);
    expect(after.weight).toBeLessThan(before.weight);
    expect(after.handling).toBeGreaterThan(before.handling);
    expect(after.accel).toBeGreaterThan(before.accel);
  });

  it("a spoiler trades a little top speed for downforce and grip", () => {
    const { s, id } = withCar();
    const rc = s.racing.cars[0];
    const before = carStats(rc, false);
    tune(s, id, { kind: "spoiler", id: "gt" });
    const after = carStats(rc, false);
    expect(after.aero).toBeGreaterThan(before.aero);
    expect(after.handling).toBeGreaterThan(before.handling);
    expect(after.speed).toBeLessThan(before.speed);
  });

  it("pays a part once per car; fitting it again is free, a respray is paid each time", () => {
    const { s, id } = withCar();
    const rc = s.racing.cars[0];
    const worth = carWorth(rc);
    const cash = s.cash;
    expect(tuneCost(rc, { kind: "rims", id: "standard" })).toBeNull(); // already on
    expect(tuneCost(rc, { kind: "rims", id: "forged" })).toBe(Math.round(worth * RIMS.forged.cost));
    tune(s, id, { kind: "rims", id: "forged" });
    expect(s.cash).toBe(cash - Math.round(worth * RIMS.forged.cost));
    tune(s, id, { kind: "rims", id: "standard" });
    expect(tuneCost(rc, { kind: "rims", id: "forged" })).toBe(0);
    const c2 = s.cash;
    tune(s, id, { kind: "rims", id: "forged" });
    expect(s.cash).toBe(c2);
    expect(tuneCost(rc, { kind: "spoiler", id: "lip" })).toBe(Math.round(worth * SPOILERS.lip.cost));
    // paint: any colour on offer, paid each time; back to the livery is free
    expect(tuneCost(rc, { kind: "paint", id: "#123456" })).toBeNull();
    expect(tune(s, id, { kind: "paint", id: PAINTS[0] })).toBe(true);
    expect(liveryOf(s, rc).color).toBe(PAINTS[0]);
    expect(tuneCost(rc, { kind: "paint", id: PAINTS[1] })).toBeGreaterThan(0);
    expect(tuneCost(rc, { kind: "paint", id: "" })).toBe(0);
    tune(s, id, { kind: "paint", id: "" });
    expect(tuningOf(rc).paint).toBe("");
    expect(liveryOf(s, rc).color).not.toBe(PAINTS[0]);
  });

  it("not while the car races, nor without the money", () => {
    const { s, id } = withCar();
    s.racing.live = { car: id } as GameState["racing"]["live"];
    expect(tune(s, id, { kind: "spoiler", id: "wing" })).toBe(false);
    s.racing.live = null;
    s.cash = 0;
    expect(tune(s, id, { kind: "spoiler", id: "wing" })).toBe(false);
    expect(tune(s, id, { kind: "paint", id: "" })).toBe(false); // nothing to change
    expect(tuningOf(s.racing.cars[0]).spoiler).toBe("none");
  });

  it("keeps the tuning in a save, and only known parts and colours", () => {
    const { s, id } = withCar();
    tune(s, id, { kind: "spoiler", id: "wing" });
    tune(s, id, { kind: "paint", id: PAINTS[3] });
    const back = migrateRacing(JSON.parse(JSON.stringify(s.racing)));
    expect(back.cars[0].tuning).toEqual({ paint: PAINTS[3], spoiler: "wing", owned: ["spoiler:wing"] });
    const bad = JSON.parse(JSON.stringify(s.racing));
    bad.cars[0].tuning = { paint: "javascript:", rims: "gold", spoiler: "wing", owned: ["x", "rims:carbon", 5] };
    expect(migrateRacing(bad).cars[0].tuning).toEqual({ spoiler: "wing", owned: ["rims:carbon"] });
  });
});
