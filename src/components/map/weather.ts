// The weather over the Empire Map: the same for every player at the same
// time (it follows the clock, in blocks of a few minutes), and in tune with
// the season: snow all through the winter festival, petals in spring, more
// sun in summer, mist round Halloween. Only looks; the game is the same in
// any weather. Nothing here pulls in three.js.
import type { Season } from "@/game/engine/season";

export type WeatherKind = "clear" | "rain" | "fog" | "snow" | "petals";

/** How long one spell of weather lasts (ms), and how long it takes to come and go. */
export const WEATHER_BLOCK_MS = 12 * 60_000;
const FADE_MS = 45_000;

/** How likely each weather is in a block, by season. */
const ODDS: Record<Season | "none", Partial<Record<WeatherKind, number>>> = {
  none: { clear: 0.62, rain: 0.24, fog: 0.14 },
  halloween: { clear: 0.4, rain: 0.25, fog: 0.35 },
  winter: { clear: 0.35, snow: 0.55, fog: 0.1 },
  spring: { clear: 0.3, petals: 0.45, rain: 0.15, fog: 0.1 },
  summer: { clear: 0.85, rain: 0.1, fog: 0.05 },
};

/** A number in [0, 1) from a block's index (the same everywhere). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function kindOf(block: number, season: Season | null): WeatherKind {
  const odds = ODDS[season ?? "none"];
  let k = hash(block);
  for (const [kind, p] of Object.entries(odds) as [WeatherKind, number][]) if ((k -= p) < 0) return kind;
  return "clear";
}

export interface Weather {
  kind: WeatherKind;
  /** How strong it is now (0–1): it builds up at the start of its block and eases off at the end. */
  k: number;
  /** Snow lies on the ground (0–1): all through the winter festival. */
  snowCover: number;
}

export function weatherAt(now: number, season: Season | null): Weather {
  const block = Math.floor(now / WEATHER_BLOCK_MS);
  const kind = kindOf(block, season);
  const into = now - block * WEATHER_BLOCK_MS;
  // no fade between two blocks of the same weather
  const up = kindOf(block - 1, season) === kind ? 1 : Math.min(1, into / FADE_MS);
  const down = kindOf(block + 1, season) === kind ? 1 : Math.min(1, (WEATHER_BLOCK_MS - into) / FADE_MS);
  const k = kind === "clear" ? 0 : Math.min(up, down);
  return { kind, k: k * k * (3 - 2 * k), snowCover: season === "winter" ? 0.75 + (kind === "snow" ? 0.25 * k : 0) : 0 };
}
