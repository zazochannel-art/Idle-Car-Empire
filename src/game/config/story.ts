// The company's story beyond the numbers: now and then a decision lands on
// the CEO's desk (two choices, each with its consequences shown up front),
// and a rival, Kaiser Werke, follows the company chapter by chapter, from
// the first cars to the day it overtakes them.
import type { MetricId, Reward } from "../types";

/** What a choice does. Money and research are counted in minutes of the company's output, so they matter at every stage. */
export type StoryEffect =
  /** Money: + paid to the company, − it costs (the choice needs the cash). */
  | { kind: "cash"; minutes: number }
  /** The crew's mood, at every plant or at the plant the decision is about. */
  | { kind: "morale"; amount: number; scope: "all" | "plant" }
  /** The brand's reputation (0–100). */
  | { kind: "rep"; amount: number }
  /** Research points: minutes of the research output (at least `min`). */
  | { kind: "rp"; minutes: number; min: number }
  /** A machine at the plant breaks down (the mechanic comes as usual). */
  | { kind: "breakdown" }
  /** The plant's line runs at double speed for this long (s), no cooldown. */
  | { kind: "boost"; seconds: number };

export interface Dilemma {
  id: "raise" | "chips" | "inspector" | "overtime" | "journalist" | "party" | "patent" | "storm";
  icon: string;
  /** The decision is about one plant (named in the text). */
  plant: boolean;
  choices: [StoryEffect[], StoryEffect[]];
}

export const DILEMMAS: Dilemma[] = [
  {
    id: "raise",
    icon: "💼",
    plant: false,
    choices: [
      [{ kind: "cash", minutes: -3 }, { kind: "morale", amount: 15, scope: "all" }],
      [{ kind: "morale", amount: -10, scope: "all" }],
    ],
  },
  {
    id: "chips",
    icon: "📦",
    plant: false,
    choices: [
      [{ kind: "cash", minutes: 5 }, { kind: "rep", amount: -5 }],
      [{ kind: "rep", amount: 2 }],
    ],
  },
  {
    id: "inspector",
    icon: "🦺",
    plant: true,
    choices: [
      [{ kind: "breakdown" }, { kind: "rep", amount: 5 }, { kind: "morale", amount: 8, scope: "plant" }],
      [{ kind: "rep", amount: -4 }],
    ],
  },
  {
    id: "overtime",
    icon: "🌙",
    plant: true,
    choices: [
      [{ kind: "boost", seconds: 90 }, { kind: "morale", amount: -10, scope: "plant" }],
      [{ kind: "morale", amount: 5, scope: "plant" }],
    ],
  },
  {
    id: "journalist",
    icon: "📰",
    plant: false,
    choices: [
      [{ kind: "cash", minutes: -1 }, { kind: "rep", amount: 6 }],
      [{ kind: "rep", amount: -2 }],
    ],
  },
  {
    id: "party",
    icon: "🎉",
    plant: false,
    choices: [
      [{ kind: "cash", minutes: -4 }, { kind: "morale", amount: 20, scope: "all" }],
      [{ kind: "morale", amount: -5, scope: "all" }],
    ],
  },
  {
    id: "patent",
    icon: "💡",
    plant: false,
    choices: [
      [{ kind: "cash", minutes: -5 }, { kind: "rp", minutes: 15, min: 30 }],
      [],
    ],
  },
  {
    id: "storm",
    icon: "⛈️",
    plant: true,
    choices: [[{ kind: "cash", minutes: -2 }], [{ kind: "breakdown" }]],
  },
];

export const DILEMMA_BY_ID = Object.fromEntries(DILEMMAS.map((d) => [d.id, d])) as Record<Dilemma["id"], Dilemma>;

export const STORY = {
  /** Online play (s) before the first decision… */
  first: 15 * 60,
  /** …then one every 20–35 minutes of play. */
  every: 20 * 60,
  spread: 15 * 60,
  /** How long a decision waits for the CEO (s of play) before it is dropped. */
  expires: 10 * 60,
} as const;

/** What a chapter of the rival campaign asks for. */
export type ChapterGoal = { type: "metric"; metric: MetricId; target: number } | { type: "income"; target: number } | { type: "rival"; id: "volta" | "kaiser" | "sakura" };

export interface Chapter {
  goal: ChapterGoal;
  reward: Reward;
}

/** The rival campaign against Kaiser Werke, in order. */
export const CHAPTERS: Chapter[] = [
  { goal: { type: "metric", metric: "carsProduced", target: 25 }, reward: { incomeSeconds: 600 } },
  { goal: { type: "metric", metric: "factoriesOwned", target: 4 }, reward: { incomeSeconds: 900 } },
  { goal: { type: "income", target: 1_000 }, reward: { rp: 1_000 } },
  { goal: { type: "metric", metric: "maxFactoryLevel", target: 5 }, reward: { boost: 0.02 } },
  { goal: { type: "income", target: 100_000 }, reward: { stars: 1 } },
  { goal: { type: "rival", id: "kaiser" }, reward: { stars: 3, boost: 0.05 } },
];

/** The rival's CEO, who comments on each chapter. */
export const RIVAL_CEO = { emoji: "🦅", rival: "kaiser" as const };
