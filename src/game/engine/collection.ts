// Hall styles and limited editions (see config/collection.ts).
import { EDITION, EDITION_BY_ID, EDITIONS, SKIN_BY_ID, type EditionConfig, type SkinId } from "../config/collection";
import type { CarId, GameState } from "../types";

export interface EditionsState {
  /** The collection, in the order it was found: which edition, on which model, when (ms). */
  got: { id: EditionConfig["id"]; car: CarId; at: number }[];
  /** Play time (s) from which the next car off a line can be one (0: not scheduled yet). */
  nextAt: number;
}

export const createEditions = (): EditionsState => ({ got: [], nextAt: 0 });

// ───────────────────────────── hall styles ─────────────────────────────

/** Whether the company has opened a hall style. */
export function skinUnlocked(s: GameState, id: SkinId): boolean {
  const u = SKIN_BY_ID[id]?.unlock;
  if (!SKIN_BY_ID[id]) return false;
  if (!u) return true;
  return u.type === "achievements" ? s.achievements.length >= u.n : s.story.chapter >= u.n;
}

/** Gives a plant's halls a style ("auto": the one its level brings). */
export function setPlantSkin(s: GameState, plot: string, id: SkinId): boolean {
  const p = s.city.buildings[plot]?.plant;
  if (!p || !skinUnlocked(s, id) || (p.skin ?? "auto") === id) return false;
  if (id === "auto") delete p.skin;
  else p.skin = id;
  return true;
}

// ───────────────────────────── limited editions ─────────────────────────────

/** A fixed pseudo-random number in [0, 1) for a string. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * After a while of play, the next car off an assembly line is a limited
 * edition, until the collection is complete. `built` is the model of a car
 * made this tick (null: none). Returns the edition found.
 */
export function editionTick(s: GameState, built: CarId | null, now: number): EditionConfig | null {
  const e = s.editions;
  const t = s.lifetime.playTime;
  if (!e.nextAt) e.nextAt = t + EDITION.first;
  if (!built || t < e.nextAt) return null;
  const next = EDITIONS.find((x) => !e.got.some((g) => g.id === x.id));
  if (!next) return null;
  e.got.push({ id: next.id, car: built, at: now });
  e.nextAt = t + EDITION.every + hash01(`edition:${e.got.length}`) * EDITION.spread;
  return next;
}

/** What the collection adds to income (0.03 = +3%). */
export function editionBonus(s: GameState): number {
  const n = s.editions?.got.filter((g) => EDITION_BY_ID[g.id]).length ?? 0;
  return n * EDITION.income + (n >= EDITIONS.length ? EDITION.fullSet : 0);
}
