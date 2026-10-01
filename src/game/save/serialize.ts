import { createInitialState, SAVE_VERSION } from "../engine/state";
import type { GameState } from "../types";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Overlays a saved object onto fresh defaults. Keys the save doesn't know
 * about (added in newer versions) keep their defaults; values with the wrong
 * type are ignored, so a corrupted field cannot crash the game.
 */
function mergeDefaults<T>(defaults: T, saved: unknown): T {
  if (Array.isArray(defaults)) return (Array.isArray(saved) ? saved : defaults) as T;
  if (isObject(defaults)) {
    if (!isObject(saved)) return defaults;
    const out: Json = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (key in saved) out[key] = mergeDefaults((defaults as Json)[key], saved[key]);
    }
    return out as T;
  }
  if (defaults === null) return (saved ?? null) as T;
  if (typeof defaults === "number") return (typeof saved === "number" && Number.isFinite(saved) ? saved : defaults) as T;
  return (typeof saved === typeof defaults ? saved : defaults) as T;
}

export function migrate(raw: unknown, now: number): GameState {
  const fresh = createInitialState(now);
  if (!isObject(raw)) return fresh;
  const state = mergeDefaults(fresh, raw);
  // Nullable fields have no typed default to merge against.
  state.pendingOffline = isObject(raw.pendingOffline) ? (raw.pendingOffline as unknown as GameState["pendingOffline"]) : null;
  for (const [id, f] of Object.entries(state.factories)) {
    const savedCar = (raw.factories as Json | undefined)?.[id];
    f.carId = isObject(savedCar) && typeof savedCar.carId === "string" ? (savedCar.carId as typeof f.carId) : null;
  }
  for (const [id, m] of Object.entries(state.managers)) {
    const saved = (raw.managers as Json | undefined)?.[id];
    m.assignedTo = isObject(saved) && typeof saved.assignedTo === "string" ? (saved.assignedTo as typeof m.assignedTo) : null;
  }
  state.version = SAVE_VERSION;
  return state;
}

export function encodeSave(state: GameState): string {
  const json = JSON.stringify(state);
  return typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString("base64");
}

export function decodeSave(text: string, now: number): GameState {
  const trimmed = text.trim();
  const json = trimmed.startsWith("{")
    ? trimmed
    : typeof atob === "function"
      ? decodeURIComponent(escape(atob(trimmed)))
      : Buffer.from(trimmed, "base64").toString("utf8");
  return migrate(JSON.parse(json), now);
}
