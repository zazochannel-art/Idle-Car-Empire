// Classic cars (config/classics.ts): restore in a garage, show in the museum.
import { CLASSICS, CLASSIC_BY_ID, MUSEUM_LEVEL_BONUS } from "../config/classics";
import type { GameState } from "../types";

export interface ClassicsState {
  /** Restored cars, on show in the museum. */
  owned: string[];
  /** The car in the garage now, and when it is done (ms). */
  restoring: { id: string; until: number } | null;
}

export const createClassics = (): ClassicsState => ({ owned: [], restoring: null });

export const hasGarage = (s: GameState) => Object.values(s.city.buildings).some((b) => b.type === "garage");
export const hasMuseum = (s: GameState) => Object.values(s.city.buildings).some((b) => b.type === "museum");

export type ClassicLock = "owned" | "busy" | "garage" | "cash" | null;

export function classicLock(s: GameState, id: string): ClassicLock {
  const c = CLASSIC_BY_ID[id];
  if (!c || s.classics.owned.includes(id) || s.classics.restoring?.id === id) return "owned";
  if (s.classics.restoring) return "busy";
  if (!hasGarage(s)) return "garage";
  if (s.cash < c.cost) return "cash";
  return null;
}

/** Buys a barn find and starts restoring it in the garage. */
export function restoreClassic(s: GameState, id: string, now: number): boolean {
  if (classicLock(s, id) !== null) return false;
  const c = CLASSIC_BY_ID[id];
  s.cash -= c.cost;
  s.classics.restoring = { id, until: now + c.minutes * 60_000 };
  return true;
}

/** Finishes a restoration whose time is up. Returns the car's id. */
export function classicsTick(s: GameState, now: number): string | null {
  const r = s.classics.restoring;
  if (!r || now < r.until) return null;
  s.classics.restoring = null;
  if (!s.classics.owned.includes(r.id)) s.classics.owned.push(r.id);
  return r.id;
}

/** Ticket sales a museum of this level makes per second, before district scale and income bonuses. */
export function museumTickets(s: GameState, level: number): number {
  const base = s.classics.owned.reduce((a, id) => a + (CLASSIC_BY_ID[id]?.ticket ?? 0), 0);
  return base * (1 + MUSEUM_LEVEL_BONUS * (level - 1));
}

export function migrateClassics(raw: unknown): ClassicsState {
  const out = createClassics();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.owned)) out.owned = [...new Set(r.owned.filter((x): x is string => typeof x === "string" && x in CLASSIC_BY_ID))];
  const rs = r.restoring as Record<string, unknown> | null;
  if (rs && typeof rs === "object" && typeof rs.id === "string" && rs.id in CLASSIC_BY_ID && typeof rs.until === "number" && Number.isFinite(rs.until)) out.restoring = { id: rs.id, until: rs.until };
  return out;
}

export const nextClassic = (s: GameState) => CLASSICS.find((c) => !s.classics.owned.includes(c.id) && s.classics.restoring?.id !== c.id) ?? null;
