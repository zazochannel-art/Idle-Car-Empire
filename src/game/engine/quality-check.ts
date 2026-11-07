// Quality control: now and then the inspector asks for a hand at the end of the line. Cars roll
// past one by one; the player taps the ones with a defect. Catching them all pays some income and
// lifts the company's reputation a little; tapping good cars costs points. One inspection, then a
// break. The round is drawn from the clock, so it can't be rerolled.
import type { GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./rewards";

export interface QcState {
  /** No inspection before this time. */
  nextAt: number;
  runs: number;
  /** The best score (0–100). */
  best: number;
}

export const createQc = (): QcState => ({ nextAt: 0, runs: 0, best: 0 });

export const QC = {
  /** A break between inspections. */
  cooldown: 30 * 60_000,
  /** Cars on the line, and how long each one is in view (ms). */
  cars: 12,
  carMs: 1_300,
  /** Seconds of income for a perfect round, and reputation points (of 100). */
  rewardSeconds: 15 * 60,
  rep: 2,
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

export const qcReady = (s: GameState, now: number) => now >= s.qc.nextAt;

/** A round's score, 0–100: defects caught, less good cars tapped, out of the defects there were. */
export function qcScore(defects: number, caught: number, wrong: number): number {
  if (defects <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, (Math.min(caught, defects) - wrong) / defects)) * 100);
}

/** Ends an inspection: pays for the score and starts the break. Returns the money and the score (null: not now). */
export function finishQc(s: GameState, round: (DefectKind | null)[], tapped: number[], snap: EconomySnapshot, now: number): { money: number; score: number } | null {
  if (!qcReady(s, now) || round.length !== QC.cars) return null;
  const taps = [...new Set(tapped.filter((i) => Number.isInteger(i) && i >= 0 && i < round.length))];
  const defects = round.filter(Boolean).length;
  const caught = taps.filter((i) => round[i]).length;
  const score = qcScore(defects, caught, taps.length - caught);
  const reward = { incomeSeconds: Math.round((QC.rewardSeconds * score) / 100) };
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  s.quality.rep = Math.min(100, s.quality.rep + (QC.rep * score) / 100);
  s.qc.nextAt = now + QC.cooldown;
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
  return out;
}
