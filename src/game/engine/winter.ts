// The winter festival (1 December – 6 January): an advent calendar, three
// goals sized to the empire when the festival starts, and two race liveries
// to win. It runs alongside the winter season (snow on the map, +10% income:
// engine/season.ts). Everything it pays is a reward: it counts toward no reset.
import type { GameState, Reward } from "../types";
import { passiveIncome, type EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./progress";

export type WinterGoal = "cars" | "earned" | "wins";
export const WINTER_GOALS: WinterGoal[] = ["cars", "earned", "wins"];

export const WINTER = {
  /** Race liveries: door 24, and all three goals. */
  doorSkin: "frost",
  goalsSkin: "aurora",
  /** A goal: hours of the empire's output when the festival began (cars, money), or race wins. */
  carsHours: 3,
  earnedHours: 6,
  wins: 10,
  minCars: 20,
  minEarned: 1e6,
  goalReward: { incomeSeconds: 3600, stars: 2 } as Reward,
};

/** The 24 doors: a little more each day, a Star every sixth day, the most on the 24th. */
export const ADVENT: Reward[] = Array.from({ length: 24 }, (_, i) => {
  const day = i + 1;
  if (day === 24) return { incomeSeconds: 2 * 3600, stars: 3 };
  if (day % 6 === 0) return { incomeSeconds: 30 * 60, stars: 1 };
  return { incomeSeconds: 5 * 60 + i * 60 };
});

/** The festival's year (its December) when `now` falls in it, else null. */
export function winterYear(now: number): number | null {
  const d = new Date(now);
  if (d.getMonth() === 11) return d.getFullYear();
  if (d.getMonth() === 0 && d.getDate() <= 6) return d.getFullYear() - 1;
  return null;
}

/** The last advent door open now (1–24; after the 24th all stay open until the festival ends), 0 outside it. */
export function adventDay(now: number): number {
  if (winterYear(now) === null) return 0;
  const d = new Date(now);
  return d.getMonth() === 11 ? Math.min(24, d.getDate()) : 24;
}

/** When the festival ends (the end of 6 January), for the countdown. */
export function winterEnd(year: number): number {
  return new Date(year + 1, 0, 7).getTime();
}

/**
 * Starts this year's festival the first time the game runs in it: the goals
 * are set from what the empire makes now. Returns true when it just started.
 */
export function winterTick(s: GameState, snap: EconomySnapshot, now: number): boolean {
  const year = winterYear(now);
  if (year === null || s.winter.year === year) return false;
  s.winter = {
    year,
    doors: [],
    goals: [],
    base: { cars: s.lifetime.carsProduced, earned: s.lifetime.moneyEarned, wins: s.racing.stats.wins },
    target: {
      cars: Math.max(WINTER.minCars, Math.round(snap.carsPerSec * 3600 * WINTER.carsHours)),
      earned: Math.max(WINTER.minEarned, Math.round(passiveIncome(snap) * 3600 * WINTER.earnedHours)),
      wins: WINTER.wins,
    },
  };
  return true;
}

/** Progress toward a goal since the festival began. */
export function goalProgress(s: GameState, g: WinterGoal): { value: number; target: number } {
  const w = s.winter;
  const now = g === "cars" ? s.lifetime.carsProduced : g === "earned" ? s.lifetime.moneyEarned : s.racing.stats.wins;
  return { value: Math.max(0, now - (w.base?.[g] ?? now)), target: w.target?.[g] ?? 1 };
}

function unlockSkin(s: GameState, skin: string) {
  if (!s.racing.skins.includes(skin)) s.racing.skins.push(skin);
}

/** Opens an advent door that is open now and not opened yet; returns the money (null: not allowed). */
export function openDoor(s: GameState, day: number, snap: EconomySnapshot, now: number): number | null {
  if (winterYear(now) !== s.winter.year || day < 1 || day > adventDay(now) || s.winter.doors.includes(day)) return null;
  const reward = ADVENT[day - 1];
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  s.winter.doors.push(day);
  if (day === 24) unlockSkin(s, WINTER.doorSkin);
  return money;
}

/** Takes a finished goal's reward; the last of the three also brings a livery. Returns the money (null: not allowed). */
export function claimWinterGoal(s: GameState, g: WinterGoal, snap: EconomySnapshot, now: number): number | null {
  if (winterYear(now) !== s.winter.year || s.winter.goals.includes(g)) return null;
  const p = goalProgress(s, g);
  if (p.value < p.target) return null;
  const money = rewardCash(WINTER.goalReward, snap);
  grantReward(s, WINTER.goalReward, snap);
  s.winter.goals.push(g);
  if (WINTER_GOALS.every((x) => s.winter.goals.includes(x))) unlockSkin(s, WINTER.goalsSkin);
  return money;
}

/** Something to take now (a door or a finished goal): for the badge. */
export function winterWaiting(s: GameState, now: number): boolean {
  if (winterYear(now) !== s.winter.year) return false;
  const doors = adventDay(now) > s.winter.doors.length;
  return doors || WINTER_GOALS.some((g) => !s.winter.goals.includes(g) && goalProgress(s, g).value >= goalProgress(s, g).target);
}
