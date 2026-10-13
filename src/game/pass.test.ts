import { describe, expect, it } from "vitest";
import { PASS, PASS_TIERS } from "./config/pass";
import { skinUnlocked } from "./engine/collection";
import { snapshot } from "./engine/economy";
import * as P from "./engine/pass";
import { claimDaily } from "./engine/progress";
import { createInitialState } from "./engine/state";
import { migrate } from "./save/serialize";
import type { GameState } from "./types";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const EPOCH = at(PASS.epoch.y, PASS.epoch.m, PASS.epoch.d);
const NOW = at(2026, 9, 12);

function fresh(now = NOW): GameState {
  const s = createInitialState(now);
  s.lastActiveAt = now;
  P.passTick(s, snapshot(s), now);
  return s;
}

describe("season pass", () => {
  it("runs 28-day seasons and 7-day weeks from the first Monday of 2026", () => {
    expect(P.passSeason(EPOCH)).toBe(1);
    expect(P.passSeason(at(2026, 0, 5 + 27, 23))).toBe(1);
    expect(P.passSeason(at(2026, 0, 5 + 28, 0))).toBe(2);
    expect(P.passEnd(1)).toBe(new Date(2026, 1, 2).getTime());
    expect(P.passWeek(at(2026, 0, 11))).toBe(0);
    expect(P.passWeek(at(2026, 0, 12))).toBe(1);
    expect(P.weekEnd(0)).toBe(new Date(2026, 0, 12).getTime());
    const s = fresh();
    expect(s.pass.season).toBe(P.passSeason(NOW));
    expect(s.pass.weekly.map((w) => w.id)).toEqual(["cars", "earned", "levels"]);
  });

  it("a daily mission taken brings XP", () => {
    const s = fresh();
    s.missions.daily = [{ id: "d1", title: "", metric: "carsProduced", target: 0, start: 0, reward: { cash: 1 }, claimed: false }];
    expect(claimDaily(s, "d1")).toBe(true);
    expect(s.pass.xp).toBe(PASS.xp.daily);
    expect(claimDaily(s, "d1")).toBe(false);
    expect(s.pass.xp).toBe(PASS.xp.daily);
  });

  it("weekly challenges: sized to the empire, done once, races once the Racing District is open", () => {
    const s = fresh();
    const levels = s.pass.weekly.find((w) => w.id === "levels")!;
    expect(P.claimWeekly(s, "levels")).toBe(false);
    s.lifetime.levelsBought += levels.target;
    expect(P.passWaiting(s)).toBe(1);
    expect(P.claimWeekly(s, "levels")).toBe(true);
    expect(P.claimWeekly(s, "levels")).toBe(false);
    expect(s.pass.xp).toBe(PASS.xp.weekly);
    // next week: new challenges, with races now
    s.racing.unlocked = true;
    P.passTick(s, snapshot(s), NOW + 7 * 86_400_000);
    expect(s.pass.weekly.map((w) => w.id)).toEqual(["cars", "earned", "races"]);
    expect(s.pass.weekly.every((w) => !w.done)).toBe(true);
    expect(s.pass.xp).toBe(PASS.xp.weekly);
  });

  it("pays each tier reached once; the collectibles are a hall style, liveries and limited race cars", () => {
    const s = fresh();
    const snap = snapshot(s);
    expect(PASS_TIERS).toHaveLength(30);
    P.addPassXp(s, 6 * PASS.xpPerTier);
    expect(P.tierOf(s.pass.xp)).toBe(6);
    expect(P.claimTier(s, 7, snap, NOW)).toBeNull();
    expect(skinUnlocked(s, "chrome")).toBe(false);
    const cash = s.cash;
    expect(P.claimTier(s, 6, snap, NOW)).toBeGreaterThan(0);
    expect(s.cash).toBeGreaterThan(cash);
    expect(skinUnlocked(s, "chrome")).toBe(true);
    expect(P.claimTier(s, 6, snap, NOW)).toBeNull();
    expect(P.claimAllTiers(s, snap, NOW).tiers).toBe(5);
    expect(P.passWaiting(s)).toBe(0);
    // to the top: Stars, the liveries and two limited cars
    const stars = s.stars;
    P.addPassXp(s, 1e9);
    expect(P.tierOf(s.pass.xp)).toBe(PASS.tiers);
    P.claimAllTiers(s, snap, NOW);
    expect(s.stars - stars).toBe(PASS_TIERS.slice(6).reduce((a, t) => a + (t.reward.stars ?? 0), 0));
    expect(s.racing.skins).toEqual(expect.arrayContaining(["pulse", "legend"]));
    expect(skinUnlocked(s, "gold")).toBe(true);
    const limited = s.racing.cars.filter((c) => c.limited);
    expect(limited.map((c) => [c.car, c.skin, c.limited])).toEqual([
      ["supercar", "pulse", s.pass.season],
      ["hypercar", "legend", s.pass.season],
    ]);
    // racing not open yet: they wait at the factory lot
    expect(limited.every((c) => c.location === "factory")).toBe(true);
  });

  it("a new season starts from zero and pays what was left untaken; hall styles stay", () => {
    const s = fresh();
    P.addPassXp(s, 7 * PASS.xpPerTier);
    P.claimTier(s, 1, snapshot(s), NOW);
    const cash = s.cash;
    const season = s.pass.season;
    const next = P.passEnd(season) + 3600_000;
    const r = P.passTick(s, snapshot(s), next);
    expect(r).toMatchObject({ season: season + 1, leftover: 6, week: true });
    expect(s.cash).toBeGreaterThan(cash);
    expect(s.pass).toMatchObject({ season: season + 1, xp: 0, claimed: [] });
    expect(s.pass.halls).toEqual(["chrome"]);
    expect(skinUnlocked(s, "chrome")).toBe(true);
  });

  it("survives a save; junk is dropped", () => {
    const s = fresh();
    P.addPassXp(s, 18 * PASS.xpPerTier);
    P.claimAllTiers(s, snapshot(s), NOW);
    const back = migrate(JSON.parse(JSON.stringify(s)), NOW);
    expect(back.pass).toEqual(s.pass);
    expect(back.racing.cars.find((c) => c.limited)?.limited).toBe(s.pass.season);
    const raw = JSON.parse(JSON.stringify(s));
    raw.pass = { season: "x", xp: -5, claimed: [0, 3, 3, 99, "2"], week: null, weekly: [{ id: "nope" }, { id: "cars", target: 10, start: 2, done: true }], halls: ["gold", "neon"] };
    expect(migrate(raw, NOW).pass).toEqual({ season: 0, xp: 0, claimed: [3], week: -1, weekly: [{ id: "cars", target: 10, start: 2, done: true }], halls: ["gold"] });
    delete raw.pass;
    expect(migrate(raw, NOW).pass).toEqual(P.createPass());
  });
});
