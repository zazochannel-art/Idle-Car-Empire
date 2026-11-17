// Own sources (config/sources.ts): levels bought per material, what each costs, and the discount
// they give on that material's market price (materials.ts marketPrice). Company-wide: the same
// in every city, kept when the player moves between cities.
import { MATERIAL_BY_ID, MATERIAL_IDS, type MaterialId } from "../config/economy";
import { SOURCES } from "../config/sources";
import type { GameState } from "../types";

export type SourcesState = Partial<Record<MaterialId, number>>;

export const createSources = (): SourcesState => ({});

/** The level of a material's own source (0: none). */
export const sourceLevel = (s: Pick<GameState, "sources">, m: MaterialId) => Math.max(0, Math.min(SOURCES.maxLevel, Math.floor(s.sources?.[m] ?? 0)));

/** What the material's own source takes off its market price (0–0.3). */
export const sourceDiscount = (s: Pick<GameState, "sources">, m: MaterialId) => SOURCES.discountPerLevel * sourceLevel(s, m);

/** True once the company has earned enough to buy sources. */
export const sourcesOpen = (s: Pick<GameState, "lifetime">) => s.lifetime.moneyEarned >= SOURCES.unlockEarned;

/** The price of the next level of a material's source (null at the top level). */
export function sourceCost(s: Pick<GameState, "sources">, m: MaterialId): number | null {
  const lv = sourceLevel(s, m);
  if (lv >= SOURCES.maxLevel) return null;
  const weight = Math.sqrt(MATERIAL_BY_ID[m].price / SOURCES.refPrice);
  return Math.round(SOURCES.baseCost * weight * SOURCES.growth ** lv);
}

/** Buys the next level of a material's source. False when it is locked, at the top, or the cash is short. */
export function buySource(s: GameState, m: MaterialId): boolean {
  if (!Object.hasOwn(MATERIAL_BY_ID, m) || !sourcesOpen(s)) return false;
  const cost = sourceCost(s, m);
  if (cost === null || !(s.cash >= cost)) return false;
  s.cash -= cost;
  s.sources = { ...s.sources, [m]: sourceLevel(s, m) + 1 };
  return true;
}

/** A saved sources record: known materials only, whole levels within range. */
export function migrateSources(raw: unknown): SourcesState {
  const out = createSources();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const m of MATERIAL_IDS) {
    const v = r[m];
    if (typeof v === "number" && Number.isFinite(v) && v >= 1) out[m] = Math.min(SOURCES.maxLevel, Math.floor(v));
  }
  return out;
}
