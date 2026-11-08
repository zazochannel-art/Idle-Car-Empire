// Quality control: now and then the inspector asks for a hand at the end of the line. Cars roll
// past one by one; the player taps the ones with a defect. Catching them all pays some income and
// lifts the company's reputation a little; tapping good cars costs points. One inspection, then a
// break, and a few inspections a day at most. The round is drawn when it starts, and starting it
// uses the inspection: leaving the game half-way doesn't bring the same round back.
import type { GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { balance } from "./balance";
import { grantReward, rewardCash } from "./rewards";
import { dateKey } from "./calendar";

export interface QcState {
  /** No inspection before this time. */
  nextAt: number;
  runs: number;
  /** The best score (0–100). */
  best: number;
  /** When the inspection running now began (0: none). */
  startedAt: number;
  /** The day (dateKey) `today` counts inspections for. */
  day: string;
  today: number;
}

export const createQc = (): QcState => ({ nextAt: 0, runs: 0, best: 0, startedAt: 0, day: "", today: 0 });

export const QC = {
  /** A break between inspections (from the start of one to the next), and the most a day. */
  cooldown: 60 * 60_000,
  perDay: 6,
  /** Cars on the line, and how long each one is in view (ms). */
  cars: 12,
  carMs: 1_300,
  /** Seconds of income for a perfect round, and reputation points (of 100). */
  rewardSeconds: 10 * 60,
  rep: 1,
  /** How long after its start an inspection can still be handed in (the cars' time, and some slack). */
  graceMs: 60_000,
};

export type DefectKind = "dent" | "wheel" | "paint" | "light";
export const DEFECTS: DefectKind[] = ["dent", "wheel", "paint", "light"];

/** The round that starts now: for each car on the line, its defect (null: a good car). Between 3 and 5 defects. */
export function qcRound(s: GameState): (DefectKind | null)[] {
  let seed = (s.qc.runs + 1) * 7919 ^ Math.floor(s.createdAt / 1000) ^ Math.floor(s.qc.nextAt / 60_000);
  const next = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const n = 3 + Math.floor(next() * 3);
  const out: (DefectKind | null)[] = Array.from({ length: QC.cars }, () => null);
  let placed = 0;
  while (placed < n) {
    const i = Math.floor(next() * QC.cars);
    if (out[i]) continue;
    out[i] = DEFECTS[Math.floor(next() * DEFECTS.length)];
    placed++;
  }
  return out;
}

/** Inspections done today. */
export const qcToday = (s: GameState, now: number) => (s.qc.day === dateKey(now) ? s.qc.today : 0);

/** Why an inspection can't start now: today's are used up, or the break isn't over. */
export function qcBlock(s: GameState, now: number): "limit" | "wait" | null {
  if (qcToday(s, now) >= QC.perDay) return "limit";
  return now < s.qc.nextAt ? "wait" : null;
}

export const qcReady = (s: GameState, now: number) => qcBlock(s, now) === null;

/** Starts an inspection: draws its round and starts the break. Null: not now. */
export function startQc(s: GameState, now: number): (DefectKind | null)[] | null {
  if (!qcReady(s, now)) return null;
  const round = qcRound(s);
  const day = dateKey(now);
  s.qc.today = (s.qc.day === day ? s.qc.today : 0) + 1;
  s.qc.day = day;
  s.qc.startedAt = now;
  s.qc.nextAt = now + QC.cooldown;
  return round;
}

/** A round's score, 0–100: defects caught, less good cars tapped, out of the defects there were. */
export function qcScore(defects: number, caught: number, wrong: number): number {
  if (defects <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, (Math.min(caught, defects) - wrong) / defects)) * 100);
}

/** Ends an inspection: pays for the score and starts the break. Returns the money and the score (null: not now). */
export function finishQc(s: GameState, round: (DefectKind | null)[], tapped: number[], snap: EconomySnapshot, now: number): { money: number; score: number } | null {
  const started = s.qc.startedAt;
  if (!started || now < started || now > started + QC.cars * QC.carMs + QC.graceMs || round.length !== QC.cars) return null;
  const taps = [...new Set(tapped.filter((i) => Number.isInteger(i) && i >= 0 && i < round.length))];
  const defects = round.filter(Boolean).length;
  const caught = taps.filter((i) => round[i]).length;
  const score = qcScore(defects, caught, taps.length - caught);
  const reward = { incomeSeconds: Math.round((QC.rewardSeconds * score * balance("qc")) / 100) };
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  s.quality.rep = Math.min(100, s.quality.rep + (QC.rep * score) / 100);
  s.qc.startedAt = 0;
  s.qc.runs += 1;
  s.qc.best = Math.max(s.qc.best, score);
  return { money, score };
}

export function migrateQc(raw: unknown): QcState {
  const out = createQc();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  out.nextAt = pos(r.nextAt);
  out.runs = Math.floor(pos(r.runs));
  out.best = Math.min(100, pos(r.best));
  out.startedAt = pos(r.startedAt);
  out.day = typeof r.day === "string" ? r.day : "";
  out.today = Math.floor(pos(r.today));
  return out;
}
