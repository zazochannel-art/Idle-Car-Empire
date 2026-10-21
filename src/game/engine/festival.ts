// The spring and summer festivals: while one of those seasons runs (engine/season.ts: on the
// calendar, or put on by the game's owner), three goals sized to the empire when it began,
// each paying Stars and income, and a race livery for all three. Every run of a season (a year's
// spring, or a scheduled one) is new. Everything it pays is a reward: it counts toward no reset.
import type { GameState, Reward } from "../types";
import { passiveIncome, type EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./progress";
import { seasonWindow, type FestivalSeason } from "./season";

export type FestivalGoal = "cars" | "earned" | "wins";
export const FESTIVAL_GOALS: FestivalGoal[] = ["cars", "earned", "wins"];

export const FESTIVAL = {
  /** A goal: hours of the empire's output when the festival began (cars, money), or race wins. */
  carsHours: 2,
  earnedHours: 4,
  wins: 6,
  minCars: 15,
  minEarned: 500_000,
  goalReward: { incomeSeconds: 3600, stars: 1 } as Reward,
  /** The livery for all three goals, by season. */
  skin: { spring: "blossom", summer: "sunset" } as Record<FestivalSeason, string>,
};

/** The spring or summer season running now, with its window (null: neither). */
export function festivalNow(now: number) {
  const w = seasonWindow(now);
  return w && (w.season === "spring" || w.season === "summer") ? { ...w, season: w.season as FestivalSeason } : null;
}

/**
 * Starts the festival the first time the game runs in this season's run: the goals are set from
 * what the empire makes now. Returns the season when it just started.
 */
export function festivalTick(s: GameState, snap: EconomySnapshot, now: number): FestivalSeason | null {
  const w = festivalNow(now);
  if (!w || s.festival.key === w.key) return null;
  s.festival = {
    key: w.key,
    season: w.season,
    goals: [],
    base: { cars: s.lifetime.carsProduced, earned: s.lifetime.moneyEarned, wins: s.racing.stats.wins },
    target: {
      cars: Math.max(FESTIVAL.minCars, Math.round(snap.carsPerSec * 3600 * FESTIVAL.carsHours)),
      earned: Math.max(FESTIVAL.minEarned, Math.round(passiveIncome(snap) * 3600 * FESTIVAL.earnedHours)),
      wins: FESTIVAL.wins,
    },
  };
  return w.season;
}

/** Progress toward a goal since the festival began. */
export function festivalProgress(s: GameState, g: FestivalGoal): { value: number; target: number } {
  const f = s.festival;
  const now = g === "cars" ? s.lifetime.carsProduced : g === "earned" ? s.lifetime.moneyEarned : s.racing.stats.wins;
  return { value: Math.max(0, now - (f.base?.[g] ?? now)), target: f.target?.[g] ?? 1 };
}

/** Takes a finished goal's reward while the festival runs; the last of the three also brings a livery. Returns the money (null: not allowed). */
export function claimFestivalGoal(s: GameState, g: FestivalGoal, snap: EconomySnapshot, now: number): number | null {
  const w = festivalNow(now);
  if (!w || w.key !== s.festival.key || s.festival.goals.includes(g)) return null;
  const p = festivalProgress(s, g);
  if (p.value < p.target) return null;
  const money = rewardCash(FESTIVAL.goalReward, snap);
  grantReward(s, FESTIVAL.goalReward, snap);
  s.festival.goals.push(g);
  const skin = FESTIVAL.skin[w.season];
  if (FESTIVAL_GOALS.every((x) => s.festival.goals.includes(x)) && !s.racing.skins.includes(skin)) s.racing.skins.push(skin);
  return money;
}

/** A finished goal to take now: for the badge. */
export function festivalWaiting(s: GameState, now: number): boolean {
  const w = festivalNow(now);
  if (!w || w.key !== s.festival.key) return false;
  return FESTIVAL_GOALS.some((g) => !s.festival.goals.includes(g) && festivalProgress(s, g).value >= festivalProgress(s, g).target);
}
