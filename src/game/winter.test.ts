import { describe, expect, it } from "vitest";
import { snapshot } from "./engine/economy";
import { seasonAt } from "./engine/season";
import { createInitialState } from "./engine/state";
import { ADVENT, WINTER, adventDay, claimWinterGoal, goalProgress, openDoor, winterTick, winterWaiting, winterYear } from "./engine/winter";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

describe("winter festival", () => {
  it("runs from 1 December to 6 January, with the winter season", () => {
    expect(winterYear(at(2026, 10, 30))).toBeNull();
    expect(winterYear(at(2026, 11, 1))).toBe(2026);
    expect(winterYear(at(2027, 0, 6))).toBe(2026);
    expect(winterYear(at(2027, 0, 7))).toBeNull();
    expect(seasonAt(at(2026, 11, 1))).toBe("winter");
    expect(adventDay(at(2026, 11, 5))).toBe(5);
    expect(adventDay(at(2026, 11, 30))).toBe(24);
    expect(adventDay(at(2027, 0, 3))).toBe(24);
    expect(adventDay(at(2026, 6, 1))).toBe(0);
  });

  it("sets its goals from the empire when it starts, once a year", () => {
    const s = createInitialState(at(2026, 0, 1));
    const snap = snapshot(s);
    expect(winterTick(s, snap, at(2026, 10, 30))).toBe(false);
    expect(winterTick(s, snap, at(2026, 11, 2))).toBe(true);
    expect(s.winter.year).toBe(2026);
    expect(s.winter.target!.cars).toBeGreaterThanOrEqual(WINTER.minCars);
    expect(s.winter.target!.earned).toBeGreaterThanOrEqual(WINTER.minEarned);
    expect(winterTick(s, snap, at(2026, 11, 20))).toBe(false);
    // the next festival starts afresh
    s.winter.doors = [1, 2];
    expect(winterTick(s, snap, at(2027, 11, 1))).toBe(true);
    expect(s.winter.doors).toEqual([]);
  });

  it("opens each door once, only on or after its day; the 24th brings Stars and a livery", () => {
    const s = createInitialState(at(2026, 0, 1));
    const snap = snapshot(s);
    winterTick(s, snap, at(2026, 11, 3));
    expect(openDoor(s, 4, snap, at(2026, 11, 3))).toBeNull();
    const cash = s.cash;
    const m1 = openDoor(s, 1, snap, at(2026, 11, 3))!;
    expect(m1).toBeGreaterThan(0);
    expect(s.cash).toBeCloseTo(cash + m1);
    expect(openDoor(s, 1, snap, at(2026, 11, 3))).toBeNull();
    // a missed door can still be opened later
    expect(openDoor(s, 2, snap, at(2026, 11, 26))).not.toBeNull();
    const stars = s.stars;
    openDoor(s, 6, snap, at(2026, 11, 26));
    expect(s.stars).toBe(stars + 1);
    openDoor(s, 24, snap, at(2026, 11, 26));
    expect(s.stars).toBe(stars + 1 + (ADVENT[23].stars ?? 0));
    expect(s.racing.skins).toContain(WINTER.doorSkin);
    // not after the festival
    expect(openDoor(s, 7, snap, at(2027, 0, 8))).toBeNull();
  });

  it("pays a goal once it is reached; all three bring the second livery", () => {
    const s = createInitialState(at(2026, 0, 1));
    const snap = snapshot(s);
    const now = at(2026, 11, 10);
    winterTick(s, snap, now);
    expect(claimWinterGoal(s, "cars", snap, now)).toBeNull();
    expect(winterWaiting(s, now)).toBe(true); // doors to open
    s.lifetime.carsProduced += s.winter.target!.cars;
    s.lifetime.moneyEarned += s.winter.target!.earned;
    s.racing.stats.wins += s.winter.target!.wins;
    expect(goalProgress(s, "wins").value).toBe(WINTER.wins);
    const stars = s.stars;
    expect(claimWinterGoal(s, "cars", snap, now)).toBeGreaterThan(0);
    expect(claimWinterGoal(s, "cars", snap, now)).toBeNull();
    expect(s.racing.skins).not.toContain(WINTER.goalsSkin);
    claimWinterGoal(s, "earned", snap, now);
    claimWinterGoal(s, "wins", snap, now);
    expect(s.stars).toBe(stars + 3 * (WINTER.goalReward.stars ?? 0));
    expect(s.racing.skins).toContain(WINTER.goalsSkin);
  });
});
