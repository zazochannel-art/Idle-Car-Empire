// The shop's Style section: looks bought with ⭐ Stars, kept for good, with no effect on the game.
// A livery joins the racing team's paint schemes (config/racing.ts SKINS); the holiday decor dresses
// every city's map for the holidays all year (components/map/world/festive.ts).
import type { GameState } from "../types";

export type CosmeticId = "skinMidnight" | "skinCandy" | "skinTiger" | "decorAllYear";

export interface CosmeticConfig {
  id: CosmeticId;
  icon: string;
  stars: number;
  /** The race livery it unlocks (config/racing.ts SKINS). */
  skin?: string;
}

export const COSMETICS: CosmeticConfig[] = [
  { id: "skinMidnight", icon: "🌙", stars: 3, skin: "midnight" },
  { id: "skinCandy", icon: "🍬", stars: 3, skin: "candy" },
  { id: "skinTiger", icon: "🐯", stars: 3, skin: "tiger" },
  { id: "decorAllYear", icon: "🎄", stars: 10 },
];
export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c])) as Record<CosmeticId, CosmeticConfig>;

export const ownsCosmetic = (s: Pick<GameState, "cosmetics">, id: CosmeticId) => (s.cosmetics ?? []).includes(id);

/** Buys a look with Stars. False when it is owned already or the Stars are short. */
export function buyCosmetic(s: GameState, id: CosmeticId): boolean {
  const c = COSMETIC_BY_ID[id];
  if (!c || ownsCosmetic(s, id) || !(s.stars >= c.stars)) return false;
  s.stars -= c.stars;
  s.cosmetics = [...(s.cosmetics ?? []), id];
  if (c.skin && !s.racing.skins.includes(c.skin)) s.racing.skins.push(c.skin);
  return true;
}

export function migrateCosmetics(raw: unknown): CosmeticId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is CosmeticId => typeof x === "string" && Object.hasOwn(COSMETIC_BY_ID, x)))];
}
