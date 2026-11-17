import { describe, expect, it } from "vitest";
import { claimNewYear, fromMidnight, newYearGiftDue, newYearShow, NEW_YEAR } from "./engine/new-year";
import { snapshot } from "./engine/economy";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m, d, h, min).getTime();

describe("New Year's Eve", () => {
  it("counts the minutes from the nearest New Year's midnight", () => {
    expect(fromMidnight(local(2026, 11, 31, 23, 50))).toEqual({ minutes: -10, year: 2027 });
    expect(fromMidnight(local(2027, 0, 1, 0, 30))).toEqual({ minutes: 30, year: 2027 });
  });

  it("puts fireworks on the map round midnight only, the big show in the year's first minutes", () => {
    expect(newYearShow(local(2026, 11, 31, 22, 0))).toBe(0);
    expect(newYearShow(local(2026, 11, 31, 23, 50))).toBe(1);
    expect(newYearShow(local(2027, 0, 1, 0, 5))).toBe(2);
    expect(newYearShow(local(2027, 0, 1, 0, 30))).toBe(1);
    expect(newYearShow(local(2027, 0, 1, 2, 0))).toBe(0);
    expect(newYearShow(local(2026, 6, 1, 0, 0))).toBe(0);
  });

  it("gives its gift once a year, round midnight, and saves that it did", () => {
    const s = createInitialState(0);
    const snap = snapshot(s);
    expect(claimNewYear(s, local(2026, 11, 31, 20, 0), snap)).toBeNull();
    const stars = s.stars;
    const got = claimNewYear(s, local(2027, 0, 1, 0, 2), snap);
    expect(got?.year).toBe(2027);
    expect(s.stars).toBe(stars + NEW_YEAR.gift.stars);
    expect(claimNewYear(s, local(2027, 0, 1, 1, 0), snap)).toBeNull();
    expect(newYearGiftDue(decodeSave(encodeSave(s), 0), local(2027, 0, 1, 1, 0))).toBeNull();
    expect(newYearGiftDue(s, local(2027, 11, 31, 23, 55))).toBe(2028);
  });
});
