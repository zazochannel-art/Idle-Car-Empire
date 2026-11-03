import { describe, expect, it } from "vitest";
import { DAILY_CHEST, DAILY_TEMPLATES } from "./config/missions";
import * as P from "./engine/progress";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 3, 12).getTime();

/** A company whose missions for `now` are all done and taken. */
function allTaken(s = createInitialState(T0), now = T0) {
  P.refreshDaily(s, now);
  for (const m of s.missions.daily) m.claimed = true;
  return s;
}

describe("the daily chest", () => {
  it("waits until every daily mission is taken, opens once a day", () => {
    const s = createInitialState(T0);
    P.refreshDaily(s, T0);
    expect(s.missions.daily.length).toBeGreaterThan(0);
    expect(P.dailyChestReady(s, T0)).toBe(false);
    expect(P.claimDailyChest(s, T0)).toBeNull();
    for (const m of s.missions.daily) m.claimed = true;
    expect(P.dailyChestReady(s, T0)).toBe(true);
    expect(P.claimableCount(s, undefined, T0)).toBe(1);
    const cash = s.cash;
    const r = P.claimDailyChest(s, T0);
    expect(r?.incomeSeconds).toBe(DAILY_CHEST.incomeSeconds);
    expect(s.cash).toBeGreaterThan(cash);
    expect(P.dailyChestReady(s, T0)).toBe(false);
    expect(P.claimDailyChest(s, T0)).toBeNull();
    expect(s.missions.chestStreak).toBe(1);
  });

  it("grows with every day in a row, starts over after a missed day, a star on the 7th", () => {
    const s = createInitialState(T0);
    for (let d = 0; d < 7; d++) {
      allTaken(s, T0 + d * DAY);
      const r = P.claimDailyChest(s, T0 + d * DAY)!;
      const mult = 1 + DAILY_CHEST.streakStep * (Math.min(d + 1, DAILY_CHEST.streakMax) - 1);
      expect(r.incomeSeconds).toBe(Math.round(DAILY_CHEST.incomeSeconds * mult));
      expect(r.stars ?? 0).toBe(d === 6 ? 1 : 0);
    }
    expect(s.missions.chestStreak).toBe(7);
    // a day missed: the streak starts again
    allTaken(s, T0 + 9 * DAY);
    expect(P.chestStreakToday(s, T0 + 9 * DAY)).toBe(1);
    P.claimDailyChest(s, T0 + 9 * DAY);
    expect(s.missions.chestStreak).toBe(1);
  });

  it("is kept in the save, and an old save gets the defaults", () => {
    const s = allTaken();
    P.claimDailyChest(s, T0);
    const back = decodeSave(encodeSave(s), T0)!;
    expect(back.missions.chestDate).toBe(P.dateKey(T0));
    expect(back.missions.chestStreak).toBe(1);
    const old = JSON.parse(JSON.stringify(s));
    delete old.missions.chestDate;
    delete old.missions.chestStreak;
    delete old.lifetime.mapEvents;
    const back2 = decodeSave(encodeSave(old), T0)!;
    expect(back2.missions.chestStreak).toBe(0);
    expect(back2.missions.chestDate).toBe("");
    expect(back2.lifetime.mapEvents).toBe(0);
  });

  it("hands out the map mission only once the map bonuses come", () => {
    expect(DAILY_TEMPLATES.some((t) => t.metric === "mapEvents")).toBe(true);
    for (let d = 0; d < 30; d++) {
      const s = createInitialState(T0);
      expect(P.generateDaily(s, T0 + d * DAY).some((m) => m.metric === "mapEvents")).toBe(false);
    }
  });
});
