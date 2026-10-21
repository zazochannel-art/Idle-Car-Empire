import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { snapshot } from "./engine/economy";
import { FESTIVAL, FESTIVAL_GOALS, claimFestivalGoal, festivalNow, festivalProgress, festivalTick, festivalWaiting } from "./engine/festival";
import { FESTIVAL_SEASONS, seasonAt, seasonWindow, setScheduledSeasons } from "./engine/season";
import { createInitialState } from "./engine/state";
import { parseLiveSeasons } from "@/lib/live-events";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const DAY = 86_400_000;

afterEach(() => setScheduledSeasons([]));

describe("seasons on the calendar", () => {
  it("spring and summer join Halloween and winter", () => {
    expect(seasonAt(at(2027, 2, 20))).toBeNull();
    expect(seasonAt(at(2027, 2, 21, 0))).toBe("spring");
    expect(seasonAt(at(2027, 3, 10, 23))).toBe("spring");
    expect(seasonAt(at(2027, 3, 11))).toBeNull();
    expect(seasonAt(at(2027, 6, 1))).toBeNull();
    expect(seasonAt(at(2027, 6, 15))).toBe("summer");
    expect(seasonAt(at(2027, 7, 10, 23))).toBe("summer");
    expect(seasonAt(at(2027, 7, 11))).toBeNull();
    expect(seasonAt(at(2026, 9, 20))).toBe("halloween");
    expect(seasonAt(at(2026, 11, 24))).toBe("winter");
    // early January is the winter that began the December before
    expect(seasonWindow(at(2027, 0, 6))?.key).toBe("winter-2026");
    expect(seasonWindow(at(2027, 2, 25))?.key).toBe("spring-2027");
  });
});

describe("seasons the owner schedules", () => {
  it("run in place of the calendar's, and only spring or summer, for a month at most", () => {
    const start = at(2026, 9, 20);
    setScheduledSeasons([{ season: "summer", start, end: start + 7 * DAY }]);
    expect(seasonAt(start + DAY)).toBe("summer");
    expect(seasonWindow(start + DAY)?.key).toBe(`summer@${start}`);
    // over: the calendar's season again
    expect(seasonAt(start + 8 * DAY)).toBe("halloween");
    setScheduledSeasons([
      { season: "winter", start, end: start + DAY },
      { season: "spring", start, end: start + 40 * DAY },
      { season: "spring", start: start + DAY, end: start },
    ]);
    expect(seasonAt(start + 1000)).toBe("halloween");
  });

  it("are read from the server only when they make sense", () => {
    const now = Date.UTC(2026, 9, 20);
    const iso = (t: number) => new Date(t).toISOString();
    const rows = [
      { season: "summer", starts_at: iso(now), ends_at: iso(now + 7 * DAY) },
      { season: "winter", starts_at: iso(now), ends_at: iso(now + DAY) },
      { season: "spring", starts_at: iso(now), ends_at: iso(now + 32 * DAY) },
      { season: "spring", starts_at: iso(now - 9 * DAY), ends_at: iso(now - DAY) },
      { season: "spring", starts_at: "soon", ends_at: iso(now + DAY) },
      null,
    ];
    expect(parseLiveSeasons(rows, now)).toEqual([{ season: "summer", start: now, end: now + 7 * DAY }]);
    expect(parseLiveSeasons({ not: "a list" }, now)).toEqual([]);
  });

  it("the server takes the same seasons as the game (0014)", () => {
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/0014_seasons.sql"), "utf8");
    expect(sql).toContain(`check (season in (${FESTIVAL_SEASONS.map((s) => `'${s}'`).join(", ")}))`);
    expect(sql).toContain("interval '31 days'");
  });
});

describe("the spring and summer festivals", () => {
  const spring = at(2027, 2, 25);

  it("start once per run of the season, sized to the empire", () => {
    const s = createInitialState(spring);
    expect(festivalTick(s, snapshot(s), at(2027, 5, 1))).toBeNull();
    expect(festivalTick(s, snapshot(s), spring)).toBe("spring");
    expect(s.festival.key).toBe("spring-2027");
    expect(s.festival.target).toMatchObject({ cars: FESTIVAL.minCars, earned: FESTIVAL.minEarned, wins: FESTIVAL.wins });
    expect(festivalTick(s, snapshot(s), spring + DAY)).toBeNull();
    // summer is a new festival, with new goals
    s.festival.goals.push("cars");
    expect(festivalTick(s, snapshot(s), at(2027, 6, 20))).toBe("summer");
    expect(s.festival.goals).toEqual([]);
    // so is a scheduled one
    const start = at(2027, 9, 1);
    setScheduledSeasons([{ season: "spring", start, end: start + 5 * DAY }]);
    expect(festivalTick(s, snapshot(s), start + 1000)).toBe("spring");
    expect(s.festival.key).toBe(`spring@${start}`);
  });

  it("pays each finished goal once while it runs, and the livery for all three", () => {
    const s = createInitialState(spring);
    festivalTick(s, snapshot(s), spring);
    expect(festivalWaiting(s, spring)).toBe(false);
    expect(claimFestivalGoal(s, "cars", snapshot(s), spring)).toBeNull();
    s.lifetime.carsProduced += s.festival.target!.cars;
    s.lifetime.moneyEarned += s.festival.target!.earned;
    s.racing.stats.wins += s.festival.target!.wins;
    for (const g of FESTIVAL_GOALS) expect(festivalProgress(s, g).value).toBeGreaterThanOrEqual(festivalProgress(s, g).target);
    expect(festivalWaiting(s, spring)).toBe(true);
    const stars = s.stars;
    const earned = s.lifetime.moneyEarned;
    expect(claimFestivalGoal(s, "cars", snapshot(s), spring)).toBeGreaterThan(0);
    expect(claimFestivalGoal(s, "cars", snapshot(s), spring)).toBeNull();
    expect(s.stars).toBe(stars + FESTIVAL.goalReward.stars!);
    expect(s.lifetime.moneyEarned).toBe(earned);
    expect(s.racing.skins).not.toContain(FESTIVAL.skin.spring);
    claimFestivalGoal(s, "earned", snapshot(s), spring);
    claimFestivalGoal(s, "wins", snapshot(s), spring);
    expect(s.racing.skins).toContain(FESTIVAL.skin.spring);
    expect(festivalWaiting(s, spring)).toBe(false);
  });

  it("is over when the season ends: nothing more to take", () => {
    const s = createInitialState(spring);
    festivalTick(s, snapshot(s), spring);
    s.lifetime.carsProduced += s.festival.target!.cars;
    const after = at(2027, 3, 12);
    expect(festivalNow(after)).toBeNull();
    expect(festivalWaiting(s, after)).toBe(false);
    expect(claimFestivalGoal(s, "cars", snapshot(s), after)).toBeNull();
  });
});
