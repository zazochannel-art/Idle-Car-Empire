// The daily streaks across a daylight-saving change: the day after spring forward is 23 hours
// after the day before, so "yesterday" is the calendar's, not 24 hours ago.
import { describe, expect, it } from "vitest";

process.env.TZ = "Europe/Berlin";
const { createInitialState } = await import("./engine/state");
const R = await import("./engine/retention");

describe("the login streak across a daylight-saving change", () => {
  it("logging in at 00:30 the day after spring forward keeps the streak", () => {
    const s = createInitialState(Date.UTC(2026, 2, 20));
    // Sunday 29 March 2026: Berlin goes from 02:00 to 03:00
    R.updateLogin(s, new Date(2026, 2, 29, 0, 30).getTime());
    const streak = s.login.streak;
    R.updateLogin(s, new Date(2026, 2, 30, 0, 30).getTime());
    expect(s.login.streak).toBe(streak + 1);
  });
});
