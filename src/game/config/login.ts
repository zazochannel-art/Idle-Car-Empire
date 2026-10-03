import type { Reward } from "../types";

/** Daily login rewards, day 1 → 7, then the week starts again. */
export const LOGIN_REWARDS: Reward[] = [
  { incomeSeconds: 300 },
  { incomeSeconds: 600 },
  { incomeSeconds: 900 },
  { stars: 1 },
  { incomeSeconds: 1_800 },
  { incomeSeconds: 2_700 },
  { stars: 3 },
];
