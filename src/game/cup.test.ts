import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRACKS } from "./config/racing";
import { CUP, cupBlock, cupFloorSeconds, cupLaps, cupPrize, cupRun, cupRunsLeft, cupSent, cupTime, cupToSend, cupTrack, cupWeek, cupWeekEnd, cupWeekStart, payCupPrize } from "./engine/cup";
import { snapshot } from "./engine/economy";
import { receiveRaceCar, rng } from "./engine/racing";
import { cloneState, createInitialState } from "./engine/state";
import type { GameState } from "./types";

// Tuesday 20 October 2026, noon UTC (the week began on Monday the 19th)
const T0 = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;

function racer(): GameState {
  const s = createInitialState(T0);
  s.racing.unlocked = true;
  receiveRaceCar(s, "city");
  return s;
}

describe("weekly cup: weeks and tracks", () => {
  it("weeks run from Monday 00:00 UTC to the next", () => {
    const w = cupWeek(T0);
    expect(cupWeekStart(w)).toBe(Date.UTC(2026, 9, 19));
    expect(cupWeekEnd(w)).toBe(Date.UTC(2026, 9, 26));
    expect(cupWeek(Date.UTC(2026, 9, 19))).toBe(w);
    expect(cupWeek(Date.UTC(2026, 9, 25, 23, 59, 59))).toBe(w);
    expect(cupWeek(Date.UTC(2026, 9, 26))).toBe(w + 1);
    expect(cupWeek(Date.UTC(2026, 9, 18, 23, 59, 59))).toBe(w - 1);
  });

  it("every track comes in turn, the same list as the server's (0013)", () => {
    const seen = new Set(Array.from({ length: TRACKS.length }, (_, i) => cupTrack(i).id));
    expect(seen.size).toBe(TRACKS.length);
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/0013_weekly_cup.sql"), "utf8");
    const rows = [...sql.matchAll(/\((\d+), '(\w+)', (\d+), (\d+)\)/g)].map((m) => ({ n: +m[1], id: m[2], laps: +m[3], refLap: +m[4] }));
    expect(rows).toEqual(TRACKS.map((t, n) => ({ n, id: t.id, laps: t.laps, refLap: t.refLap })));
    // the server's floor: laps × reference lap × 490 ms
    expect(sql).toContain("trk.laps * trk.ref_lap * 490");
    for (const t of TRACKS) expect(cupFloorSeconds(t) * 1000).toBeCloseTo(t.laps * t.refLap * 490);
  });

  it("no car can lap faster than the server allows, nor slower than it refuses", () => {
    for (const t of TRACKS) {
      for (let seed = 1; seed < 200; seed++) {
        const best = cupLaps(1000, t, rng(seed)).reduce((a, b) => a + b, 0);
        const worst = cupLaps(0, t, rng(seed)).reduce((a, b) => a + b, 0);
        expect(best).toBeGreaterThan(cupFloorSeconds(t));
        expect(worst * 1000).toBeLessThan(t.laps * t.refLap * 20_000);
      }
    }
  });

  it("shows times like a stopwatch", () => {
    expect(cupTime(186.4)).toBe("3:06.40");
    expect(cupTime(59.999)).toBe("1:00.00");
    // the same hundredths as the board's milliseconds
    expect(cupTime(189.3549)).toBe(cupTime(189_355 / 1000));
    expect(cupTime(0)).toBe("0:00.00");
  });
});

describe("weekly cup: timed runs", () => {
  it("needs the racing team and a car at the track", () => {
    const s = createInitialState(T0);
    expect(cupBlock(s, T0)).toBe("racing");
    s.racing.unlocked = true;
    expect(cupBlock(s, T0)).toBe("noCar");
    receiveRaceCar(s, "city");
    expect(cupBlock(s, T0)).toBeNull();
  });

  it("three runs a UTC day; the week keeps the best; a new day and a new week start again", () => {
    const s = racer();
    const totals: number[] = [];
    for (let i = 0; i < CUP.runsPerDay; i++) {
      const run = cupRun(s, T0 + i * 60_000)!;
      expect(run.laps).toHaveLength(cupTrack(cupWeek(T0)).laps);
      totals.push(run.total);
    }
    expect(cupRunsLeft(s, T0)).toBe(0);
    expect(cupBlock(s, T0)).toBe("limit");
    expect(cupRun(s, T0)).toBeNull();
    expect(s.cup.best).toBeCloseTo(Math.min(...totals));
    // tomorrow: three more, the week's best kept
    const tomorrow = T0 + DAY;
    expect(cupRunsLeft(s, tomorrow)).toBe(CUP.runsPerDay);
    const best = s.cup.best;
    const run = cupRun(s, tomorrow)!;
    expect(s.cup.best).toBeCloseTo(Math.min(best, run.total));
    expect(run.best).toBe(run.total < best);
    // next week: an empty board
    const next = cupWeekEnd(cupWeek(T0)) + 60_000;
    expect(cupRunsLeft(s, next)).toBe(CUP.runsPerDay);
    const first = cupRun(s, next)!;
    expect(first.before).toBe(0);
    expect(first.best).toBe(true);
    expect(s.cup.week).toBe(cupWeek(next));
  });

  it("a run is decided once: reloading the same state races the same laps", () => {
    const a = racer();
    const b = cloneState(a);
    expect(cupRun(a, T0)!.laps).toEqual(cupRun(b, T0)!.laps);
    // the next run of the day is another one
    expect(cupRun(a, T0)!.laps).not.toEqual(cupRun(cloneState(racer()), T0)!.laps);
  });

  it("sends the week's best once, and again only when it improves", () => {
    const s = racer();
    expect(cupToSend(s, T0)).toBeNull();
    cupRun(s, T0);
    const send = cupToSend(s, T0)!;
    expect(send.week).toBe(cupWeek(T0));
    expect(send.ms).toBe(Math.round(s.cup.best * 1000));
    expect(send.car).toBe("city");
    expect(send.color).toMatch(/^#[0-9a-f]{6}$/i);
    cupSent(s, send.ms);
    expect(cupToSend(s, T0)).toBeNull();
    s.cup.best -= 1;
    expect(cupToSend(s, T0)?.ms).toBe(send.ms - 1000);
    // a week that's over isn't sent
    expect(cupToSend(s, cupWeekEnd(cupWeek(T0)))).toBeNull();
  });
});

describe("weekly cup: prizes", () => {
  it("pays by place, and a small field pays the smaller prizes only", () => {
    expect(cupPrize(1, 20).tier).toBe("gold");
    expect(cupPrize(3, 20).tier).toBe("podium");
    expect(cupPrize(5, 20).tier).toBe("top");
    expect(cupPrize(10, 20).tier).toBe("half");
    expect(cupPrize(11, 20).tier).toBe("finisher");
    // alone or nearly so: no gold for being the only one
    expect(cupPrize(1, 1).tier).toBe("finisher");
    expect(cupPrize(1, 2).tier).toBe("half");
    expect(cupPrize(1, 4).tier).toBe("top");
    expect(cupPrize(1, 5).tier).toBe("gold");
    // better places never pay less
    for (const n of [1, 2, 3, 5, 8, 13, 50]) {
      for (let r = 2; r <= n; r++) expect(cupPrize(r, n).stars).toBeLessThanOrEqual(cupPrize(r - 1, n).stars);
    }
  });

  it("pays each finished week once, as a reward (not earnings)", () => {
    const s = racer();
    const before = { stars: s.stars, rep: s.racing.rep, earned: s.lifetime.moneyEarned };
    const w = cupWeek(T0) - 1;
    const paid = payCupPrize(s, w, 1, 10, snapshot(s))!;
    expect(paid.prize.tier).toBe("gold");
    expect(s.stars).toBe(before.stars + paid.prize.stars);
    expect(s.racing.rep).toBe(before.rep + paid.prize.rep);
    expect(paid.money).toBeGreaterThan(0);
    expect(s.lifetime.moneyEarned).toBe(before.earned);
    expect(payCupPrize(s, w, 1, 10, snapshot(s))).toBeNull();
    expect(payCupPrize(s, w - 1, 1, 10, snapshot(s))).toBeNull();
    expect(payCupPrize(s, w + 1, 2, 10, snapshot(s))?.prize.tier).toBe("podium");
  });

  it("an old save gets an empty cup", () => {
    const s = createInitialState(T0);
    expect(s.cup).toEqual({ week: 0, day: 0, runs: 0, best: 0, laps: [], car: "", sent: 0, claimed: 0 });
  });
});
