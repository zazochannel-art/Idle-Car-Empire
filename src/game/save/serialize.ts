import { migrateChain } from "../engine/chain";
import { migrateBrand } from "../engine/brand";
import { migrateRacing } from "../engine/racing";
import { migrateQuality } from "../engine/market";
import { migrateLive } from "../engine/live";
import { migrateClassics } from "../engine/classics";
import { migrateExpansion } from "../engine/expansion";
import { migrateFunnel } from "../engine/funnel";
import { migrateEv } from "../engine/ev";
import { migratePass } from "../engine/pass";
import { migrateAds } from "../engine/ads";
import { migrateMapBonus } from "../engine/map-bonus";
import { migrateLandmarks } from "../engine/landmarks";
import { migrateIap } from "../engine/iap";
import { migrateShop } from "../engine/shop";
import { migrateCity, unlockOwnedZones } from "../engine/city";
import { createInitialState, MAP_VERSION, SAVE_VERSION } from "../engine/state";
import { ACHIEVEMENTS } from "../config/achievements";
import type { GameState, Lang } from "../types";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Overlays a saved object onto fresh defaults. Keys the save doesn't know
 * about (added in newer versions) keep their defaults; values with the wrong
 * type are ignored, so a corrupted field cannot crash the game.
 */
const LANGS: Record<Lang, true> = { en: true, ro: true, ru: true, es: true, pt: true, de: true };

/** A setting with a fixed set of values: anything else from a save is the default. */
function cleanSettings(state: GameState, saved: unknown): GameState {
  if (!["auto", "on", "off"].includes(state.settings.saver)) state.settings.saver = "auto";
  if (!Object.hasOwn(LANGS, state.settings.lang)) state.settings.lang = "en";
  // a save from before the music: a player who turned the sounds off doesn't get music either
  if (isObject(saved) && typeof saved.music !== "boolean") state.settings.music = state.settings.sound;
  // hidden players: account ids with the name they had, at most the last 200
  const hidden: unknown[] = Array.isArray(state.settings.hidden) ? state.settings.hidden : [];
  state.settings.hidden = hidden
    .filter((h): h is { id: string; name: unknown } => isObject(h) && typeof h.id === "string" && h.id.length > 0 && h.id.length <= 64)
    .map((h) => ({ id: h.id, name: typeof h.name === "string" ? h.name.slice(0, 40) : "" }))
    .slice(-200);
  return state;
}

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
 * settings and research.
 */
function fromOldEconomy(raw: Json, now: number): GameState {
  const state = createInitialState(now);
  const kept = mergeDefaults(
    { settings: state.settings, research: [] as string[], createdAt: now },
    raw,
  );
  Object.assign(state, kept);
  state.research = kept.research.filter((r) => typeof r === "string");
  return cleanSettings(state, raw.settings);
}

/**
 * Saves from an older world map (the isometric grid, map versions 1–2): the
 * lots and roads they refer to are gone, so the company starts over on the
 * island map. Only the settings (language, graphics, sound) are kept.
 */
function fromOldMap(raw: Json, now: number): GameState {
  const state = createInitialState(now);
  state.settings = mergeDefaults(state.settings, raw.settings);
  return cleanSettings(state, raw.settings);
}

export function migrate(raw: unknown, now: number): GameState {
  const fresh = createInitialState(now);
  if (!isObject(raw)) return fresh;
  if (typeof raw.version !== "number" || raw.version < SAVE_VERSION) return fromOldEconomy(raw, now);
  // a save from an older world map: its lots don't exist on this one
  if (raw.mapVersion !== MAP_VERSION) return fromOldMap(raw, now);
  const state = mergeDefaults(fresh, raw);
  // the Custom Garage is out of the game for now: a save's build and line stay as they were, for when it comes back
  if (raw.customGarageDesign != null) state.customGarageDesign = raw.customGarageDesign;
  if (raw.customGarageProduction != null) state.customGarageProduction = raw.customGarageProduction;
  state.mapVersion = MAP_VERSION;
  // Global Expansion is gone (its regions, Empire Points and perks): each expansion
  // already made becomes a ⭐ Star; the old fields are not carried over
  const expansions = typeof raw.prestigeCount === "number" && Number.isFinite(raw.prestigeCount) ? Math.max(0, Math.min(6, Math.floor(raw.prestigeCount))) : 0;
  state.stars += expansions;
  // achievements that no longer exist (the Global Expansion ones) don't count toward the income bonus
  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  state.achievements = state.achievements.filter((id) => typeof id === "string" && known.has(id));
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
  // a car on a transporter that didn't survive the save is back at its factory lot
  for (const rc of state.racing.cars) {
    if (rc.location === "transit" && !state.chain.shipments.some((sh) => !sh.back && sh.fleet?.includes(rc.id))) {
      rc.location = "factory";
      delete rc.listing;
    }
    // a showroom car needs its listing and its dealer
    if (rc.location === "showroom" && (!rc.listing || !state.dealers[rc.listing.dealer]?.owned)) {
      rc.location = "factory";
      delete rc.listing;
    }
  }
  state.quality = migrateQuality(raw.quality);
  // a save from before the funnel is not a new player: it is never counted
  state.funnel = migrateFunnel(raw.funnel);
  // the charging stations are keyed by dealer (an open-ended record)
  state.ev = migrateEv(raw.ev);
  // the season pass has open-ended lists (tiers taken, challenges, hall styles)
  state.pass = migratePass(raw.pass);
  state.ads = migrateAds(state.ads, now);
  state.mapBonus = migrateMapBonus(state.mapBonus);
  state.landmarks = migrateLandmarks(raw.landmarks);
  state.shop = migrateShop(state.shop, now);
  state.iap = migrateIap(raw.iap);
  migrateLive(raw, state);
  state.classics = migrateClassics(raw.classics);
  migrateExpansion(raw, state);
  migrateBrand(state);
  state.unlocks = state.unlocks.filter((u) => typeof u === "string");
  // a missing or future start date would skew rivals, contracts and stats
  if (!(state.createdAt > 0 && state.createdAt <= now)) state.createdAt = Math.min(now, state.lastActiveAt > 0 ? state.lastActiveAt : now);
  unlockOwnedZones(state);
  state.version = SAVE_VERSION;
  return cleanSettings(state, raw.settings);
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
