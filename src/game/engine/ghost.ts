// Duels with other players' ghosts: a player's best race car, as the server
// publishes it (save/social.ts), raced one against one by the player's own
// car. Decided here, lap by lap like every race (engine/racing.ts), with no
// wear; the rewards are the player's own, once a day per rival.
import { CAR_BY_ID } from "../config/cars";
import { RACE_NOISE, RATING_SOFTEN, TRACKS, type TrackId } from "../config/racing";
import type { CarId, GameState, RaceCarState } from "../types";
import type { EconomySnapshot } from "./economy";
import { dateKey, grantReward, rewardCash } from "./progress";
import { atTrack, carStats, gauss, liveryOf, raceCar, rating, rng, type RaceStats } from "./racing";

export const DUEL = {
  /** Duels a day in all (one per rival). */
  perDay: 5,
  laps: 3,
  win: { incomeSeconds: 120, rep: 5 },
  loss: { incomeSeconds: 30, rep: 1 },
};

export type GhostStats = Pick<RaceStats, "speed" | "accel" | "handling" | "braking" | "aero" | "reliability" | "hp" | "weight">;

/** What another player sees of a car: model, colours and performance (no wear). */
export interface Ghost {
  model: CarId;
  color: string;
  accent: string;
  stats: GhostStats;
}

const circuit = (st: GhostStats) => rating({ ...st, condition: 1 }, "circuit");

/** The car a player races as a ghost: their best one at the track (by circuit rating, unworn). */
export function bestCar(s: GameState): RaceCarState | null {
  let best: RaceCarState | null = null;
  let top = -1;
  for (const rc of s.racing.cars) {
    if (!atTrack(rc)) continue;
    const r = duelRating(rc);
    if (r > top) [best, top] = [rc, r];
  }
  return best;
}

/** The car the player duels with: the selected one if it is at the track, else the best. */
export function duelCar(s: GameState): RaceCarState | null {
  const sel = raceCar(s, s.racing.selected);
  return sel && atTrack(sel) ? sel : bestCar(s);
}

/** The player's ghost, as published (null: no race car at the track). */
export function ghostOf(s: GameState): Ghost | null {
  const rc = bestCar(s);
  if (!rc) return null;
  const st = carStats(rc, false);
  const look = liveryOf(s, rc);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    model: rc.car,
    color: look.color,
    accent: look.accent,
    stats: { speed: r1(st.speed), accel: r1(st.accel), handling: r1(st.handling), braking: r1(st.braking), aero: r1(st.aero), reliability: r1(st.reliability), hp: Math.round(st.hp), weight: Math.round(st.weight) },
  };
}

export const ghostRating = (g: Ghost) => circuit(g.stats);

/** The rating a car brings to a duel (circuit, unworn). */
export const duelRating = (rc: RaceCarState) => circuit(carStats(rc, false));

const HEX = /^#[0-9a-f]{6}$/i;

/** A ghost read from the server, or null when it isn't a valid one (numbers kept in range). */
export function parseGhost(v: unknown): Ghost | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  const st = (g.stats && typeof g.stats === "object" ? g.stats : {}) as Record<string, unknown>;
  if (typeof g.model !== "string" || !(g.model in CAR_BY_ID)) return null;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
  const pct = (k: string) => num(st[k], 0, 100, 0);
  return {
    model: g.model as CarId,
    color: typeof g.color === "string" && HEX.test(g.color) ? g.color : "#ffffff",
    accent: typeof g.accent === "string" && HEX.test(g.accent) ? g.accent : "#111827",
    stats: { speed: pct("speed"), accel: pct("accel"), handling: pct("handling"), braking: pct("braking"), aero: pct("aero"), reliability: pct("reliability"), hp: num(st.hp, 0, 5000, 0), weight: num(st.weight, 300, 5000, 1300) },
  };
}

/** Today's duels (the day's list starts empty). */
function today(s: GameState, now: number) {
  const day = dateKey(now);
  return s.duels.day === day ? s.duels : { day, raced: [] as string[] };
}

export type DuelBlock = "racing" | "noCar" | "raced" | "limit" | null;

/** Why the player can't duel this rival now (null: they can). */
export function duelBlock(s: GameState, rival: string, now: number): DuelBlock {
  if (!s.racing.unlocked) return "racing";
  if (!duelCar(s)) return "noCar";
  const d = today(s, now);
  if (d.raced.includes(rival)) return "raced";
  if (d.raced.length >= DUEL.perDay) return "limit";
  return null;
}

export const duelsLeft = (s: GameState, now: number) => Math.max(0, DUEL.perDay - today(s, now).raced.length);

export interface DuelResult {
  track: TrackId;
  car: CarId;
  ghost: CarId;
  mine: number[];
  theirs: number[];
  won: boolean;
  /** Seconds between the two at the line. */
  margin: number;
  money: number;
  rep: number;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Races the player's car against a ghost, pays and records it; null when not allowed now. */
export function duel(s: GameState, rival: string, ghost: Ghost, snap: EconomySnapshot, now: number): DuelResult | null {
  if (duelBlock(s, rival, now)) return null;
  const rc = duelCar(s)!;
  const day = today(s, now);
  // the same race all day for this pair: no rerolls
  const r = rng(hash(`${day.day}|${rival}|${rc.id}|${s.createdAt}`));
  const open = TRACKS.filter((t) => t.minRep <= s.racing.rep);
  const track = open[Math.floor(r() * open.length)] ?? TRACKS[0];
  const mineR = duelRating(rc);
  const theirR = ghostRating(ghost);
  const ref = Math.max(1, (mineR + theirR) / 2);
  const laps = (rt: number) => {
    const base = ((track.refLap * (ref + RATING_SOFTEN)) / (rt + RATING_SOFTEN)) * (1 + gauss(r) * RACE_NOISE.form);
    return Array.from({ length: DUEL.laps }, (_, l) => base * (1 + gauss(r) * RACE_NOISE.lap) * (l === 0 ? 1.04 : 1));
  };
  const mine = laps(mineR);
  const theirs = laps(theirR);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const won = sum(mine) < sum(theirs);
  const pay = won ? DUEL.win : DUEL.loss;
  const money = rewardCash({ incomeSeconds: pay.incomeSeconds }, snap);
  grantReward(s, { incomeSeconds: pay.incomeSeconds }, snap);
  s.racing.rep += pay.rep;
  s.duels = { day: day.day, raced: [...day.raced, rival] };
  return { track: track.id, car: rc.car, ghost: ghost.model, mine, theirs, won, margin: Math.abs(sum(mine) - sum(theirs)), money, rep: pay.rep };
}
