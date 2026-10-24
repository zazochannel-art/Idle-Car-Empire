// Bonuses that turn up on the Empire Map while the game is played: a golden
// car in the town's traffic, a drone dropping a crate on one of the plants, a
// VIP's limousine, and a truck broken down on the road that holds up every
// delivery until someone helps. One at a time; tapping it takes its reward.

export type MapBonusKind = "golden" | "drone" | "vip" | "breakdown";

export interface MapBonusConfig {
  kind: MapBonusKind;
  emoji: string;
  /** How often it comes, against the others. */
  weight: number;
  /** Seconds of play it stays on the map. */
  stay: number;
  /** The reward: seconds of the company's steady income (at least MAP_BONUS.minReward). */
  incomeSeconds: number;
}

export const MAP_BONUS = {
  /** Seconds of play on the map between two bonuses (a random wait in this range). */
  gap: [150, 300] as [number, number],
  /** Before the first one of a game session. */
  first: 75,
  /** Bonuses a day at most (the next day they come again). */
  perDay: 30,
  /** The smallest reward ($). */
  minReward: 250,
  /** While a truck is broken down, every delivery drives at this share of its speed. */
  breakdownSlow: 0.65,
};

export const MAP_BONUSES: MapBonusConfig[] = [
  { kind: "golden", emoji: "✨", weight: 4, stay: 35, incomeSeconds: 90 },
  { kind: "drone", emoji: "📦", weight: 3, stay: 50, incomeSeconds: 60 },
  { kind: "vip", emoji: "💎", weight: 1.5, stay: 40, incomeSeconds: 150 },
  { kind: "breakdown", emoji: "🔧", weight: 2, stay: 60, incomeSeconds: 30 },
];

export const MAP_BONUS_BY_KIND = Object.fromEntries(MAP_BONUSES.map((b) => [b.kind, b])) as Record<MapBonusKind, MapBonusConfig>;
