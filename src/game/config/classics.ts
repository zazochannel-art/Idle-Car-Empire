// Classic cars: barn finds restored in a garage and shown in the Car Museum,
// where they sell tickets. The collection stays through every expansion.

export interface ClassicConfig {
  id: string;
  emoji: string;
  year: number;
  /** Paint shown on the card and in the museum. */
  color: string;
  /** What the barn find plus the restoration costs. */
  cost: number;
  /** Real minutes in the garage. */
  minutes: number;
  /** Museum tickets per second it adds (× district scale, + 20% per museum level). */
  ticket: number;
}

export const CLASSICS: ClassicConfig[] = [
  { id: "arrow55", emoji: "🚗", year: 1955, color: "#b3b9c0", cost: 40_000, minutes: 5, ticket: 3 },
  { id: "riviera63", emoji: "🚙", year: 1963, color: "#1b46b8", cost: 150_000, minutes: 10, ticket: 10 },
  { id: "thunder69", emoji: "🏎️", year: 1969, color: "#f2681c", cost: 500_000, minutes: 20, ticket: 30 },
  { id: "rally72", emoji: "🚘", year: 1972, color: "#1c9a3c", cost: 2_000_000, minutes: 30, ticket: 110 },
  { id: "hothatch85", emoji: "🚗", year: 1985, color: "#c3141b", cost: 8_000_000, minutes: 45, ticket: 400 },
  { id: "turbo90", emoji: "🏁", year: 1990, color: "#121418", cost: 30_000_000, minutes: 60, ticket: 1_400 },
  { id: "lemans98", emoji: "🏆", year: 1998, color: "#f2f2ef", cost: 120_000_000, minutes: 90, ticket: 5_000 },
  { id: "concept04", emoji: "💎", year: 2004, color: "#6a2fd6", cost: 500_000_000, minutes: 120, ticket: 19_000 },
];

export const CLASSIC_BY_ID = Object.fromEntries(CLASSICS.map((c) => [c.id, c])) as Record<string, ClassicConfig>;

/** Each museum level adds this much to its ticket sales. */
export const MUSEUM_LEVEL_BONUS = 0.2;
