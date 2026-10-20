// The weekly cup (the server keeps the board: supabase/migrations/0013, save/social.ts): one
// track a week, the same for every player, raced against the clock with the player's ghost car
// (engine/ghost.ts: unworn, so any garage can take part). Three timed runs a day (UTC); the
// best time of the week goes on the board, and when the week is over each player's place
// pays a prize (Stars, income, racing reputation) once.
import { RACE_NOISE, RATING_SOFTEN, TRACKS, type TrackConfig } from "../config/racing";
import type { CarId, GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { duelCar, duelRating } from "./ghost";
import { grantReward, rewardCash } from "./progress";
import { gauss, liveryOf, rng } from "./racing";

const DAY = 86_400_000;

export type CupTier = "gold" | "podium" | "top" | "half" | "finisher";

export interface CupPrize {
  tier: CupTier;
  /** Up to this place (or this share of the entrants, for "top" and "half"). */
  rank?: number;
  share?: number;
  /** A week with fewer entrants doesn't pay this tier. */
  minEntrants: number;
  stars: number;
  incomeSeconds: number;
  rep: number;
}

export const CUP = {
  runsPerDay: 3,
  /** A car rated this laps the cup track in the track's reference time. */
  refRating: 500,
  /** From the best prize down: a place pays the first tier it reaches. */
  prizes: [
    { tier: "gold", rank: 1, minEntrants: 5, stars: 5, incomeSeconds: 7_200, rep: 60 },
    { tier: "podium", rank: 3, minEntrants: 5, stars: 3, incomeSeconds: 5_400, rep: 40 },
    { tier: "top", share: 0.25, minEntrants: 4, stars: 2, incomeSeconds: 3_600, rep: 25 },
    { tier: "half", share: 0.5, minEntrants: 2, stars: 1, incomeSeconds: 2_700, rep: 15 },
    { tier: "finisher", minEntrants: 1, stars: 0, incomeSeconds: 1_800, rep: 10 },
  ] as CupPrize[],
};

export const CUP_ICON: Record<CupTier, string> = { gold: "🥇", podium: "🏆", top: "🎖️", half: "🏅", finisher: "🏁" };

/** The cup's week: weeks start on Monday 00:00 UTC (1970-01-05 began week 1). */
export const cupWeek = (now: number) => Math.floor((Math.floor(now / DAY) + 3) / 7);
export const cupWeekStart = (week: number) => (week * 7 - 3) * DAY;
export const cupWeekEnd = (week: number) => cupWeekStart(week + 1);
/** The UTC day, which the runs a day count by (as the server does). */
const utcDay = (now: number) => Math.floor(now / DAY);

/** The week's track: every track in turn, whatever the player's reputation. */
export const cupTrack = (week: number): TrackConfig => TRACKS[((week % TRACKS.length) + TRACKS.length) % TRACKS.length];

/** The fastest total a car can drive on a track (the best rating, the luckiest laps): the server refuses anything faster. */
export const cupFloorSeconds = (t: TrackConfig) => t.refLap * t.laps * 0.49;

/** A time as on a stopwatch: 3:06.40. */
export function cupTime(seconds: number): string {
  // to the millisecond first, as the board keeps it, so both show the same hundredths
  const cs = Math.max(0, Math.round(Math.round(seconds * 1000) / 10));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

/** This week's cup state (a new week starts empty). */
function current(s: GameState, now: number): GameState["cup"] {
  const week = cupWeek(now);
  return s.cup.week === week ? s.cup : { week, day: utcDay(now), runs: 0, best: 0, laps: [], car: "", sent: 0, claimed: s.cup.claimed };
}

export const cupRunsLeft = (s: GameState, now: number) => {
  const c = current(s, now);
  return Math.max(0, CUP.runsPerDay - (c.day === utcDay(now) ? c.runs : 0));
};

export type CupBlock = "racing" | "noCar" | "limit" | null;

/** Why the player can't race a timed run now (null: they can). */
export function cupBlock(s: GameState, now: number): CupBlock {
  if (!s.racing.unlocked) return "racing";
  if (!duelCar(s)) return "noCar";
  if (!cupRunsLeft(s, now)) return "limit";
  return null;
}

export interface CupRun {
  week: number;
  track: TrackConfig["id"];
  car: CarId;
  laps: number[];
  /** Seconds. */
  total: number;
  /** The week's best before this run (0: none). */
  before: number;
  best: boolean;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Laps against the clock: the track's reference time scaled by the car's rating, with a little form and noise. */
export function cupLaps(rating: number, t: TrackConfig, r: () => number): number[] {
  const base = ((t.refLap * (CUP.refRating + RATING_SOFTEN)) / (Math.max(0, rating) + RATING_SOFTEN)) * (1 + gauss(r) * RACE_NOISE.form);
  return Array.from({ length: t.laps }, (_, l) => base * (1 + gauss(r) * RACE_NOISE.lap) * (l === 0 ? 1.04 : 1));
}

/** Races a timed run and records it (the week's best is kept); null when not allowed now. */
export function cupRun(s: GameState, now: number): CupRun | null {
  if (cupBlock(s, now)) return null;
  const rc = duelCar(s)!;
  const c = current(s, now);
  const day = utcDay(now);
  const runs = c.day === day ? c.runs : 0;
  const t = cupTrack(c.week);
  // each run of the day is its own: reloading doesn't race it again
  const laps = cupLaps(duelRating(rc), t, rng(hash(`cup|${c.week}|${day}|${runs}|${rc.id}|${s.createdAt}`)));
  const total = Math.max(cupFloorSeconds(t), laps.reduce((a, b) => a + b, 0));
  const best = !c.best || total < c.best;
  s.cup = { ...c, day, runs: runs + 1, ...(best ? { best: total, laps, car: rc.car } : {}) };
  return { week: c.week, track: t.id, car: rc.car, laps, total, before: c.best, best };
}

/** The week's best, to send to the board (null: none, or it's already there). */
export function cupToSend(s: GameState, now: number): { week: number; ms: number; car: CarId; color: string } | null {
  const c = s.cup;
  if (c.week !== cupWeek(now) || !c.best || !c.car || Math.round(c.best * 1000) === c.sent) return null;
  const rc = duelCar(s);
  const color = rc && rc.car === c.car ? liveryOf(s, rc).color : "#ffffff";
  return { week: c.week, ms: Math.round(c.best * 1000), car: c.car as CarId, color };
}

/** The board has the best time (or turned it away for good: a closed week). */
export function cupSent(s: GameState, ms: number) {
  s.cup.sent = ms;
}

/** The prize a place pays, among this many entrants. */
export function cupPrize(rank: number, entrants: number): CupPrize {
  const n = Math.max(1, entrants);
  for (const p of CUP.prizes) {
    if (n < p.minEntrants) continue;
    if (p.rank !== undefined && rank <= p.rank) return p;
    if (p.share !== undefined && rank <= Math.max(1, Math.ceil(n * p.share))) return p;
    if (p.rank === undefined && p.share === undefined) return p;
  }
  return CUP.prizes[CUP.prizes.length - 1];
}

/** Pays a finished week's place (once per week: the server hands each one out once). */
export function payCupPrize(s: GameState, week: number, rank: number, entrants: number, snap: EconomySnapshot): { prize: CupPrize; money: number } | null {
  if (week <= s.cup.claimed) return null;
  const prize = cupPrize(rank, entrants);
  const money = rewardCash({ incomeSeconds: prize.incomeSeconds }, snap);
  grantReward(s, { stars: prize.stars, incomeSeconds: prize.incomeSeconds }, snap);
  s.racing.rep += prize.rep;
  s.cup.claimed = week;
  return { prize, money };
}
