import { migrateChain } from "../engine/chain";
import { migrateRacing } from "../engine/racing";
import { migrateQuality } from "../engine/market";
import { migrateLive } from "../engine/live";
import { migrateClassics } from "../engine/classics";
import { migrateExpansion } from "../engine/expansion";
import { migrateCity, unlockOwnedZones } from "../engine/city";
import { applyStartPerks } from "../engine/prestige";
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

/**
 * Saves from before the supply chain (v1–v2) described a different economy:
 * the company starts over from the Small Car Body Works, keeping the
 * settings, Empire Points and research.
 */
function fromOldEconomy(raw: Json, now: number): GameState {
  const state = createInitialState(now);
  const kept = mergeDefaults(
    { settings: state.settings, empirePoints: 0, empirePointsEarned: 0, prestigeCount: 0, research: [] as string[], createdAt: now },
    raw,
  );
  Object.assign(state, kept);
  state.research = kept.research.filter((r) => typeof r === "string");
  applyStartPerks(state);
  return state;
}

export function migrate(raw: unknown, now: number): GameState {
  const fresh = createInitialState(now);
  if (!isObject(raw)) return fresh;
  if (typeof raw.version !== "number" || raw.version < SAVE_VERSION) return fromOldEconomy(raw, now);
  const state = mergeDefaults(fresh, raw);
  // Nullable fields have no typed default to merge against.
  state.pendingOffline = isObject(raw.pendingOffline) ? (raw.pendingOffline as unknown as GameState["pendingOffline"]) : null;
  // The city has open-ended keys (plot ids), so it is validated on its own.
  state.city = migrateCity(raw.city);
  for (const [id, m] of Object.entries(state.managers)) {
    const saved = (raw.managers as Json | undefined)?.[id];
    const plot = isObject(saved) && typeof saved.assignedTo === "string" ? saved.assignedTo : null;
    m.assignedTo = plot && state.city.buildings[plot]?.plant ? plot : null;
  }
  state.chain = migrateChain(raw.chain, state);
  state.racing = migrateRacing(raw.racing);
  state.quality = migrateQuality(raw.quality);
  migrateLive(raw, state);
  state.classics = migrateClassics(raw.classics);
  migrateExpansion(raw, state);
  state.unlocks = state.unlocks.filter((u) => typeof u === "string");
  // a missing or future start date would skew rivals, contracts and stats
  if (!(state.createdAt > 0 && state.createdAt <= now)) state.createdAt = Math.min(now, state.lastActiveAt > 0 ? state.lastActiveAt : now);
  unlockOwnedZones(state);
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
