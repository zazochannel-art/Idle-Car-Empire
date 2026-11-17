import { describe, expect, it } from "vitest";
import { answerStaff, cardCost, createStaff, migrateStaff, STAFF, staffSpeed, staffTick } from "./engine/staff";
import { computeGlobalMods } from "./engine/modifiers";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const H = 3_600_000;
const ready = () => {
  const s = createInitialState(0);
  s.lifetime.carsProduced = STAFF.firstAfterCars;
  s.cash = 1e9;
  return s;
};

describe("staff morale", () => {
  it("speeds the plants up or slows them a little with morale, half with a strike", () => {
    const st = createStaff();
    expect(staffSpeed({ staff: { ...st, morale: STAFF.start } }, 0)).toBeCloseTo(1);
    expect(staffSpeed({ staff: { ...st, morale: 100 } }, 0)).toBeCloseTo(STAFF.speedAt100);
    expect(staffSpeed({ staff: { ...st, morale: 0 } }, 0)).toBeCloseTo(STAFF.speedAt0);
    expect(staffSpeed({ staff: { ...st, morale: STAFF.start, strikeUntil: 10 } }, 5)).toBeCloseTo(STAFF.strikeSpeed);
  });

  it("brings no card before the first cars, then one every few hours", () => {
    const s = createInitialState(0);
    expect(staffTick(s, 10 * H, 1, 100)).toBeNull();
    s.lifetime.carsProduced = STAFF.firstAfterCars;
    expect(staffTick(s, 10 * H, 1, 100)).toBeNull();
    expect(staffTick(s, 10 * H + STAFF.everyMs, 1, 100, () => 0)).toBe("raise");
    expect(s.staff.card).toEqual({ id: "raise", cost: cardCost("raise", 100) });
    expect(staffTick(s, 20 * H + STAFF.everyMs, 1, 100)).toBeNull();
  });

  it("a refused raise costs morale and may bring a strike; a paid one costs cash", () => {
    const s = ready();
    s.staff.card = { id: "raise", cost: 1000 };
    expect(answerStaff(s, false, 0, () => 0)).toBe("strike");
    expect(s.staff.morale).toBe(STAFF.start + STAFF.raise.no);
    expect(s.staff.strikeUntil).toBe(STAFF.raise.strikeMs);
    s.staff.card = { id: "raise", cost: 1000 };
    expect(answerStaff(s, true, 0)).toBe("accepted");
    expect(s.cash).toBe(1e9 - 1000);
    s.staff.card = { id: "party", cost: 5 };
    s.cash = 0;
    expect(answerStaff(s, true, 0)).toBe(false);
  });

  it("overtime speeds the whole company up for a while", () => {
    const s = ready();
    s.lastActiveAt = 1000;
    const before = computeGlobalMods(s).speed;
    s.staff.card = { id: "overtime", cost: 0 };
    answerStaff(s, true, 1000);
    expect(computeGlobalMods(s).speed).toBeGreaterThan(before);
  });

  it("is saved and cleaned on load", () => {
    const s = ready();
    s.staff.card = { id: "party", cost: 12 };
    s.staff.morale = 33;
    const back = decodeSave(encodeSave(s), 0);
    expect(back.staff.card).toEqual({ id: "party", cost: 12 });
    expect(back.staff.morale).toBe(33);
    expect(migrateStaff({ morale: 500, card: { id: "nope" }, boost: 9 })).toMatchObject({ morale: 100, card: null, boost: 2 });
  });
});
