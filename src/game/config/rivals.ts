export interface Rival {
  id: "volta" | "kaiser" | "sakura";
  emoji: string;
  name: string;
  /** Lifetime earnings at the start; rivals grow 5% a day. */
  earned: number;
  /** ⭐ Stars for overtaking them. */
  stars: number;
}

/** Computer-run car makers you race up the earnings table. */
export const RIVALS: Rival[] = [
  { id: "volta", emoji: "⚡", name: "Volta Motors", earned: 1e9, stars: 1 },
  { id: "kaiser", emoji: "🦅", name: "Kaiser Werke", earned: 1e12, stars: 2 },
  { id: "sakura", emoji: "🌸", name: "Sakura Auto", earned: 1e15, stars: 3 },
];
export const RIVAL_DAILY_GROWTH = 0.05;
