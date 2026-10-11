// Decisions on the CEO's desk and the rival campaign (see config/story.ts).
//
// Deterministic like the shop floor: the next decision comes after a play
// time drawn from how many came before, the decision and the plant it is
// about follow from the same count, so a save plays the same way.
import { CHAPTERS, DILEMMA_BY_ID, DILEMMAS, STORY, type Chapter, type Dilemma, type StoryEffect } from "../config/story";
import type { GameState } from "../types";
import { plantsOf } from "./chain";
import { passiveIncome, type EconomySnapshot } from "./economy";
import { BREAKDOWN, moraleOf } from "./floor";
import { payReward } from "./materials";
import { conditionProgress, grantReward } from "./progress";

export interface StoryState {
  /** Play time (s) at which the next decision comes (0: not scheduled yet). */
  nextAt: number;
  /** The decision waiting on the desk, the plant it is about, and when it is dropped (play time, s). */
  pending: { id: Dilemma["id"]; plot: string; until: number } | null;
  /** Decisions offered so far. */
  seen: number;
  /** The last decision taken (for the story page). */
  last: { id: Dilemma["id"]; choice: 0 | 1; plot: string } | null;
  /** Rival campaign: chapters completed, and the chapter whose goal was announced as met. */
  chapter: number;
  told: number;
}

export const createStory = (): StoryState => ({ nextAt: 0, pending: null, seen: 0, last: null, chapter: 0, told: -1 });

/** A fixed pseudo-random number in [0, 1) for a string. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Which decision comes as the n-th one: every one of them in turn (3 and 8 share no factor), in a mixed order. */
export const dilemmaAt = (n: number): Dilemma => DILEMMAS[(n * 3 + 1) % DILEMMAS.length];

const playTime = (s: GameState) => s.lifetime.playTime;

/**
 * Moves the story on (online play only): drops a decision left too long,
 * puts a new one on the desk when its time comes, and notices a chapter goal
 * newly met. Returns what the UI should announce.
 */
export function storyTick(s: GameState, snap: EconomySnapshot): "offer" | "expired" | "chapter" | null {
  const st = s.story;
  const t = playTime(s);
  if (!st.nextAt) st.nextAt = t + STORY.first;
  // (a save edited by hand, or from a newer version, may name a decision that does not exist)
  if (st.pending && !DILEMMA_BY_ID[st.pending.id]) st.pending = null;
  if (st.pending && t >= st.pending.until) {
    st.pending = null;
    return "expired";
  }
  const ch = CHAPTERS[st.chapter];
  if (ch && st.told < st.chapter && chapterProgress(s, ch, snap).done) {
    st.told = st.chapter;
    return "chapter";
  }
  if (st.pending || t < st.nextAt) return null;
  // nothing to decide before the company runs a plant
  const plants = plantsOf(s).filter(([, b]) => b.plant!.made > 0);
  if (!plants.length) {
    st.nextAt = t + 60;
    return null;
  }
  const d = dilemmaAt(st.seen);
  const plot = d.plant ? plants[st.seen % plants.length][0] : "";
  st.pending = { id: d.id, plot, until: t + STORY.expires };
  st.seen++;
  st.nextAt = t + STORY.every + hash01(`story:${st.seen}`) * STORY.spread;
  return "offer";
}

/** Money a choice moves (+ in, − out) at the company's current output. */
export function effectCash(e: StoryEffect, snap: EconomySnapshot): number {
  return e.kind === "cash" ? Math.round(e.minutes * 60 * Math.max(passiveIncome(snap), 5)) : 0;
}

/** Research points a choice brings. */
export function effectRp(e: StoryEffect, snap: EconomySnapshot): number {
  return e.kind === "rp" ? Math.max(e.min, Math.round(e.minutes * 60 * snap.rpPerSec)) : 0;
}

/** What a choice costs (≥ 0). */
export function choiceCost(effects: StoryEffect[], snap: EconomySnapshot): number {
  return effects.reduce((a, e) => a + Math.max(0, -effectCash(e, snap)), 0);
}

export function canChoose(s: GameState, choice: 0 | 1, snap: EconomySnapshot): boolean {
  const p = s.story.pending;
  if (!p) return false;
  return s.cash >= choiceCost(DILEMMA_BY_ID[p.id].choices[choice], snap);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Takes a decision: applies everything the choice said it would. */
export function decide(s: GameState, choice: 0 | 1, snap: EconomySnapshot): boolean {
  const p = s.story.pending;
  if (!p || !canChoose(s, choice, snap)) return false;
  const plant = p.plot ? s.city.buildings[p.plot]?.plant : undefined;
  for (const e of DILEMMA_BY_ID[p.id].choices[choice]) {
    switch (e.kind) {
      case "cash": {
        const v = effectCash(e, snap);
        if (v > 0) payReward(s, v);
        else s.cash -= -v;
        break;
      }
      case "morale": {
        const targets = e.scope === "all" ? plantsOf(s).map(([, b]) => b.plant!) : plant ? [plant] : [];
        for (const pl of targets) pl.morale = clamp(moraleOf(pl) + e.amount, 0, 100);
        break;
      }
      case "rep":
        s.quality.rep = clamp(s.quality.rep + e.amount, 0, 100);
        break;
      case "rp":
        s.rp += effectRp(e, snap);
        break;
      case "breakdown":
        if (plant && !plant.broken) {
          plant.broken = BREAKDOWN.repair;
          plant.breaks = (plant.breaks ?? 0) + 1;
          plant.wear = 0;
        }
        break;
      case "boost":
        if (plant) plant.boost = Math.max(plant.boost ?? 0, e.seconds);
        break;
    }
  }
  s.story.last = { id: p.id, choice, plot: p.plot };
  s.story.pending = null;
  return true;
}

/** How far the company is on a chapter's goal. */
export function chapterProgress(s: GameState, ch: Chapter, snap: EconomySnapshot): { value: number; target: number; done: boolean } {
  const g = ch.goal;
  if (g.type === "rival") {
    const v = s.rivalsBeaten.includes(g.id) ? 1 : 0;
    return { value: v, target: 1, done: v >= 1 };
  }
  const { value, target } = conditionProgress(s, g.type === "income" ? { type: "income", target: g.target } : { type: "metric", metric: g.metric, target: g.target }, snap);
  return { value, target, done: value >= target };
}

/** Closes the current chapter and pays its reward. */
export function claimChapter(s: GameState, snap: EconomySnapshot): boolean {
  const ch = CHAPTERS[s.story.chapter];
  if (!ch || !chapterProgress(s, ch, snap).done) return false;
  grantReward(s, ch.reward, snap);
  s.story.chapter++;
  return true;
}

/** Something on the story page waits for the player (a decision, a chapter to close). */
export function storyWaiting(s: GameState, snap: EconomySnapshot): boolean {
  const ch = CHAPTERS[s.story.chapter];
  return !!s.story.pending || (!!ch && chapterProgress(s, ch, snap).done);
}
