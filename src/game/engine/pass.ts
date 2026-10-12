// The free season pass (config/pass.ts): a new 28-day season starts by
// itself; XP comes from the daily missions taken and three weekly challenges
// sized to the empire; every tier reached pays when the player takes it, and
// whatever is left untaken when a season ends is paid as the next one starts.
import { PASS, PASS_TIERS, WEEKLY, type PassTier, type WeeklyId } from "../config/pass";
import type { SkinId } from "../config/collection";
import type { GameState } from "../types";
import { passiveIncome, type EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./progress";
import { receiveRaceCar } from "./racing";

export interface WeeklyState {
  id: WeeklyId;
  target: number;
  /** The metric when the week began. */
  start: number;
  done: boolean;
}

export interface PassState {
  /** The season the XP and tiers belong to (0: none yet). */
  season: number;
  xp: number;
  /** Tiers whose reward was taken. */
  claimed: number[];
  /** The week (counted from the first season) the challenges belong to. */
  week: number;
  weekly: WeeklyState[];
  /** Hall styles won on a pass: kept for good, through every season and reset. */
  halls: SkinId[];
}

export const createPass = (): PassState => ({ season: 0, xp: 0, claimed: [], week: -1, weekly: [], halls: [] });

const DAY = 86_400_000;
/** A local calendar day as a number (so seasons turn at local midnight). */
const dayNo = (now: number) => {
  const d = new Date(now);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};
const EPOCH = Math.floor(Date.UTC(PASS.epoch.y, PASS.epoch.m, PASS.epoch.d) / DAY);

/** The season running at `now` (season 1 began on the epoch). */
export const passSeason = (now: number) => Math.floor((dayNo(now) - EPOCH) / PASS.days) + 1;
/** The week running at `now`, counted from the epoch. */
export const passWeek = (now: number) => Math.floor((dayNo(now) - EPOCH) / 7);
/** When a season ends (local midnight as the next one starts). */
export const passEnd = (season: number) => new Date(PASS.epoch.y, PASS.epoch.m, PASS.epoch.d + season * PASS.days).getTime();
/** When this week's challenges end. */
export const weekEnd = (week: number) => new Date(PASS.epoch.y, PASS.epoch.m, PASS.epoch.d + (week + 1) * 7).getTime();

/** Tiers reached with this much XP. */
export const tierOf = (xp: number) => Math.max(0, Math.min(PASS.tiers, Math.floor(xp / PASS.xpPerTier)));

function metric(s: GameState, id: WeeklyId): number {
  switch (id) {
    case "cars":
      return s.lifetime.carsProduced;
    case "earned":
      return s.lifetime.moneyEarned;
    case "races":
      return s.racing.stats.wins;
    case "levels":
      return s.lifetime.levelsBought;
  }
}

/** This week's three challenges, sized to what the empire makes now (races once the Racing District is open). */
export function generateWeekly(s: GameState, snap: EconomySnapshot): WeeklyState[] {
  const ids: WeeklyId[] = ["cars", "earned", s.racing.unlocked ? "races" : "levels"];
  const target = (id: WeeklyId) => {
    if (id === "cars") return Math.max(WEEKLY.minCars, Math.round(snap.carsPerSec * 3600 * WEEKLY.carsHours));
    if (id === "earned") return Math.max(WEEKLY.minEarned, Math.round(passiveIncome(snap) * 3600 * WEEKLY.earnedHours));
    return id === "races" ? WEEKLY.wins : WEEKLY.levels;
  };
  return ids.map((id) => ({ id, target: target(id), start: metric(s, id), done: false }));
}

export const weeklyProgress = (s: GameState, w: WeeklyState) => Math.max(0, metric(s, w.id) - w.start);

/**
 * Keeps the pass on the season and week of `now`: a new season starts from
 * zero (paying what was left untaken in the last one), a new week brings new
 * challenges. Returns what happened, for the toasts.
 */
export function passTick(s: GameState, snap: EconomySnapshot, now: number): { season?: number; leftover?: number; week?: boolean } {
  const out: { season?: number; leftover?: number; week?: boolean } = {};
  const season = passSeason(now);
  const P = s.pass;
  if (P.season !== season) {
    if (P.season > 0) {
      let left = 0;
      for (let n = 1; n <= tierOf(P.xp); n++) if (claimTier(s, n, snap, now, true) !== null) left++;
      if (left) out.leftover = left;
    }
    s.pass = { ...P, season, xp: 0, claimed: [], week: -1, weekly: [] };
    out.season = season;
  }
  const week = passWeek(now);
  if (s.pass.week !== week) {
    s.pass.week = week;
    s.pass.weekly = generateWeekly(s, snap);
    out.week = true;
  }
  return out;
}

/** XP toward the tiers (a daily mission taken, a weekly challenge done). */
export function addPassXp(s: GameState, xp: number) {
  s.pass.xp = Math.min(PASS.tiers * PASS.xpPerTier, s.pass.xp + Math.max(0, xp));
}

/** Takes a finished weekly challenge: its XP. */
export function claimWeekly(s: GameState, id: WeeklyId): boolean {
  const w = s.pass.weekly.find((x) => x.id === id);
  if (!w || w.done || weeklyProgress(s, w) < w.target) return false;
  w.done = true;
  addPassXp(s, PASS.xp.weekly);
  return true;
}

/** The collectibles of a tier: a hall style, a livery, a limited race car (in that livery, marked with its season). */
function collect(s: GameState, t: PassTier, season: number) {
  if (t.hall && !s.pass.halls.includes(t.hall)) s.pass.halls.push(t.hall);
  const livery = (id: string) => {
    if (!s.racing.skins.includes(id)) s.racing.skins.push(id);
  };
  if (t.livery) livery(t.livery);
  if (t.car) {
    livery(t.car.livery);
    const rc = receiveRaceCar(s, t.car.model, s.racing.unlocked ? "racing" : "factory");
    rc.skin = t.car.livery;
    rc.limited = season;
  }
}

/** Takes a reached tier's reward. Returns the money paid (null: not reached or already taken). */
export function claimTier(s: GameState, n: number, snap: EconomySnapshot, now: number, leftover = false): number | null {
  if (!leftover) passTick(s, snap, now);
  const P = s.pass;
  if (!Number.isInteger(n) || n < 1 || n > tierOf(P.xp) || P.claimed.includes(n)) return null;
  const t = PASS_TIERS[n - 1];
  const money = rewardCash(t.reward, snap);
  grantReward(s, t.reward, snap);
  collect(s, t, P.season);
  P.claimed.push(n);
  return money;
}

/** Takes every reached tier at once; returns how many and the money. */
export function claimAllTiers(s: GameState, snap: EconomySnapshot, now: number): { tiers: number; money: number } {
  passTick(s, snap, now);
  const out = { tiers: 0, money: 0 };
  for (let n = 1; n <= tierOf(s.pass.xp); n++) {
    const m = claimTier(s, n, snap, now, true);
    if (m !== null) {
      out.tiers++;
      out.money += m;
    }
  }
  return out;
}

/** Things to take now (tiers reached, challenges finished): for the badge. */
export function passWaiting(s: GameState): number {
  const P = s.pass;
  let n = 0;
  for (let t = 1; t <= tierOf(P.xp); t++) if (!P.claimed.includes(t)) n++;
  return n + P.weekly.filter((w) => !w.done && weeklyProgress(s, w) >= w.target).length;
}

/** The pass of a save, checked field by field. */
export function migratePass(raw: unknown): PassState {
  const p = createPass();
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, min: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min);
  p.season = int(r.season, 0);
  p.xp = Math.min(PASS.tiers * PASS.xpPerTier, int(r.xp, 0));
  p.claimed = Array.isArray(r.claimed) ? [...new Set(r.claimed.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= PASS.tiers))] : [];
  p.week = typeof r.week === "number" && Number.isFinite(r.week) ? Math.floor(r.week) : -1;
  const ids: WeeklyId[] = ["cars", "earned", "races", "levels"];
  p.weekly = Array.isArray(r.weekly)
    ? r.weekly
        .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && ids.includes((w as { id: WeeklyId }).id))
        .map((w) => ({ id: w.id as WeeklyId, target: Math.max(1, int(w.target, 1)), start: typeof w.start === "number" && Number.isFinite(w.start) ? w.start : 0, done: w.done === true }))
    : [];
  const halls: SkinId[] = ["chrome", "gold"];
  p.halls = Array.isArray(r.halls) ? [...new Set(r.halls.filter((h): h is SkinId => halls.includes(h as SkinId)))] : [];
  return p;
}
