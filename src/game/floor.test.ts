import { describe, expect, it } from "vitest";
import { BOOST, BREAKDOWN, MORALE, boostPlant, brokenSlot, floorPace, floorTick, repairPlant, wearLimit } from "./engine/floor";
import { createInitialState } from "./engine/state";
import type { GameState, PlantData } from "./types";

const T0 = Date.UTC(2026, 0, 1);

function withPlant(): { s: GameState; id: string; p: PlantData } {
  const s = createInitialState(T0);
  const id = "test:plant";
  const p = { speed: 0, automation: 0, fleet: 1, grade: 1, route: "auto", progress: 0, stock: {}, warehouse: 1, power: 0, inputs: {}, out: 0, outValue: 0, car: null, wait: 0, made: 100, status: "ok" } as unknown as PlantData;
  s.city.buildings[id] = { type: "engineFactory", level: 1, plant: p } as unknown as GameState["city"]["buildings"][string];
  return { s, id, p };
}

describe("the shop floor", () => {
  it("works at the plant's own pace when all is well", () => {
    const { p } = withPlant();
    expect(floorPace(p)).toBe(1);
  });

  it("boosts a running line to double speed for a while, then cools down, at a cost in morale", () => {
    const { s, id, p } = withPlant();
    expect(boostPlant(s, id)).toBe(true);
    expect(floorPace(p)).toBeCloseTo(BOOST.mult * (1 - BOOST.morale * MORALE.per));
    expect(boostPlant(s, id)).toBe(false); // cooling down
    floorTick(id, p, BOOST.dur + 1, { running: true, offline: false, managed: false });
    expect(p.boost).toBe(0);
    expect(boostPlant(s, id)).toBe(false);
    floorTick(id, p, BOOST.cooldown, { running: true, offline: false, managed: false });
    expect(boostPlant(s, id)).toBe(true);
  });

  it("doesn't boost a plant that stands", () => {
    const { s, id, p } = withPlant();
    p.status = "full";
    expect(boostPlant(s, id)).toBe(false);
  });

  it("wears a running machine out after a fixed run time, slows the line, and the mechanic or a tap fixes it", () => {
    const { s, id, p } = withPlant();
    const limit = wearLimit(id, 0);
    expect(limit).toBeGreaterThanOrEqual(BREAKDOWN.min);
    expect(limit).toBeLessThanOrEqual(BREAKDOWN.max);
    expect(floorTick(id, p, limit - 1, { running: true, offline: false, managed: false })).toBe(false);
    expect(floorTick(id, p, 2, { running: true, offline: false, managed: false })).toBe(true);
    expect(p.broken).toBe(BREAKDOWN.repair);
    expect(floorPace(p)).toBeLessThan(BREAKDOWN.slow + 0.01);
    expect(brokenSlot(id, p)).toBeGreaterThanOrEqual(0);
    expect(repairPlant(s, id)).toBe(true);
    expect(p.broken).toBe(0);
    expect(repairPlant(s, id)).toBe(false);
    // the mechanic gets there by himself, faster with a manager
    p.wear = wearLimit(id, p.breaks ?? 0);
    floorTick(id, p, 0.01, { running: true, offline: false, managed: true });
    expect(p.broken).toBeCloseTo(BREAKDOWN.repairManaged, 1);
    floorTick(id, p, BREAKDOWN.repairManaged, { running: true, offline: false, managed: true });
    expect(p.broken).toBe(0);
  });

  it("never breaks while the player is away, nor before a new plant has run in", () => {
    const { id, p } = withPlant();
    expect(floorTick(id, p, BREAKDOWN.max * 3, { running: true, offline: true, managed: false })).toBe(false);
    p.made = 0;
    expect(floorTick(id, p, BREAKDOWN.max * 3, { running: true, offline: false, managed: false })).toBe(false);
  });

  it("lets morale drift back home, a little higher with a manager", () => {
    const { id, p } = withPlant();
    p.morale = 40;
    floorTick(id, p, 3600, { running: false, offline: false, managed: false });
    expect(p.morale).toBe(MORALE.base);
    floorTick(id, p, 3600, { running: false, offline: false, managed: true });
    expect(p.morale).toBe(MORALE.base + MORALE.managed);
    expect(floorPace(p)).toBeGreaterThan(1);
  });
});
