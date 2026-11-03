// Bonuses that turn up on the Empire Map while the game is played: a golden
// car in the town's traffic, a drone dropping a crate on one of the plants, a
// VIP's limousine, and a truck broken down on the road that holds up every
// delivery until someone helps; in Nordheim, a snowstorm that slows them until
// the snowplough is sent. Road events too: a crash that blocks a lane until
// the tow truck comes, a traffic jam until the detour is opened, a police
// chase the player helps end. One at a time; tapping it takes its reward.

export type MapBonusKind = "golden" | "drone" | "vip" | "breakdown" | "storm" | "accident" | "jam" | "police";

export interface MapBonusConfig {
  kind: MapBonusKind;
  emoji: string;
  /** How often it comes, against the others. */
  weight: number;
  /** Seconds of play it stays on the map. */
  stay: number;
  /** The reward: seconds of the company's steady income (at least MAP_BONUS.minReward). */
  incomeSeconds: number;
  /** While it is on the map, every delivery drives at this share of its speed (none: no slowdown). */
  slow?: number;
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
  { kind: "breakdown", emoji: "🔧", weight: 2, stay: 60, incomeSeconds: 30, slow: MAP_BONUS.breakdownSlow },
  // road events: a crash blocks a lane (the tow truck clears it), a jam holds everyone up (the detour opens it)
  { kind: "accident", emoji: "💥", weight: 1.5, stay: 60, incomeSeconds: 45, slow: 0.5 },
  { kind: "jam", emoji: "🚦", weight: 1.5, stay: 50, incomeSeconds: 30, slow: 0.75 },
  // a police chase through the town: help stop the speeder (nothing slows)
  { kind: "police", emoji: "🚓", weight: 1.5, stay: 40, incomeSeconds: 100 },
  // Nordheim only: a snowstorm on the roads, the snowplough clears it
  { kind: "storm", emoji: "🌨️", weight: 2, stay: 60, incomeSeconds: 45, slow: MAP_BONUS.breakdownSlow },
];

export const MAP_BONUS_BY_KIND = Object.fromEntries(MAP_BONUSES.map((b) => [b.kind, b])) as Record<MapBonusKind, MapBonusConfig>;
