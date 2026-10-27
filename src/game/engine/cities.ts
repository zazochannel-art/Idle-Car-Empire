// The company's cities (config/cities.ts). The city being played lives in the
// state's own fields: its wallet, lots and buildings, production chain,
// logistics, dealers, chargers, map bonus, landmark works, showroom, export
// and fleet division. The others are parked in `s.cities`, each with the
// steady income it was making when the company left it. A parked city's world
// stands still (stocks and trucks wait where they are), but it brings in
// CITY_RULES.passiveShare of that income, into its own wallet, and its
// building sites carry on: they catch up when the company comes back.
// Everything else (Stars, research, managers, designs, the racing team, the
// stock) belongs to the company. The racing team stays in the first city:
// what it pays and wins goes through that city's wallet and books (withCity).
import { CITY_IDS, CITY_RULES } from "../config/cities";
import { BUYABLE_TERRITORIES } from "../config/city";
import { setWorld, withWorld } from "../city/layout";
import type { CityId, GameState } from "../types";
import { createChain, plantsOf } from "./chain";
import { createCity } from "./city";
import { constructionTick } from "./construction";
import { snapshot } from "./economy";
import { createExport, createFleet } from "./expansion";
import { createLandmarks } from "./landmarks";
import { createLogistics } from "./logistics";
import { createMapBonus } from "./map-bonus";
import { createDealers, createShowroom } from "./state";
import { payDividends } from "./stock";

/** The parts of the state that belong to a city. */
export const CITY_KEYS = ["cash", "city", "chain", "logistics", "dealers", "ev", "mapBonus", "landmarks", "showroom", "export", "fleet"] as const satisfies readonly (keyof GameState)[];
export type CityKey = (typeof CITY_KEYS)[number];
export type CityBundle = Pick<GameState, CityKey>;

/** A city the company is not playing in. */
export interface ParkedCity extends CityBundle {
  /** When the company left it (ms): its building sites catch up from then. */
  at: number;
  /** The steady income it was making then ($/s, the company's bonuses included). */
  steady: number;
}

function put<K extends CityKey>(to: CityBundle, from: CityBundle, k: K) {
  to[k] = from[k];
}

/** The active city's parts (the same objects, not copies). */
export function bundleOf(s: GameState): CityBundle {
  const b = {} as CityBundle;
  for (const k of CITY_KEYS) put(b, s, k);
  return b;
}

/** A new city: its own small capital and an empty map but for its first plant. */
export function createCityBundle(): CityBundle {
  return {
    cash: CITY_RULES.startCash,
    city: createCity(),
    chain: createChain(),
    logistics: createLogistics(),
    dealers: createDealers(),
    ev: { chargers: {} },
    mapBonus: createMapBonus(),
    landmarks: createLandmarks(),
    showroom: createShowroom(),
    export: createExport(),
    fleet: createFleet(),
  };
}

export const ownsCity = (s: GameState, id: CityId) => id === s.activeCity || !!s.cities[id];

/** The company's cities, the one being played first. */
export const ownedCities = (s: GameState): CityId[] => [s.activeCity, ...CITY_IDS.filter((id) => id !== s.activeCity && s.cities[id])];

/** The cities the company is not playing in. */
export const parkedCities = (s: GameState) => CITY_IDS.flatMap((id) => (id !== s.activeCity && s.cities[id] ? [[id, s.cities[id]] as const] : []));

/** What a city's wallet holds. */
export const walletOf = (s: GameState, id: CityId) => (id === s.activeCity ? s.cash : (s.cities[id]?.cash ?? 0));

/** The city a lot (with a building on it) belongs to. */
export function cityOfPlot(s: GameState, plot: string): CityId | null {
  if (s.city.buildings[plot]) return s.activeCity;
  for (const [id, c] of parkedCities(s)) if (c.city.buildings[plot]) return id;
  return null;
}

/** Plants in one of the company's cities. */
export function cityPlants(s: GameState, id: CityId): number {
  if (id === s.activeCity) return plantsOf(s).length;
  const c = s.cities[id];
  return c ? Object.values(c.city.buildings).filter((b) => !!b.plant).length : 0;
}

/** What a city brings in now ($/s): the one being played its steady income, a parked one its autopilot share. */
export function cityIncome(s: GameState, id: CityId, steadyNow: number): number {
  if (id === s.activeCity) return Math.max(0, steadyNow);
  const c = s.cities[id];
  return c ? Math.max(0, c.steady) * CITY_RULES.passiveShare : 0;
}

/** Plants in every city. */
export function plantsEverywhere(s: GameState): number {
  return parkedCities(s).reduce((a, [, c]) => a + Object.values(c.city.buildings).filter((b) => !!b.plant).length, plantsOf(s).length);
}

/**
 * Runs `fn` with only the wallet of city `id` in `s.cash` (what it pays and
 * earns stays in that city), then puts the active city's back.
 */
export function withWallet<T>(s: GameState, id: CityId, fn: () => T): T {
  const other = id === s.activeCity ? null : s.cities[id];
  if (!other) return fn();
  const own = s.cash;
  s.cash = other.cash;
  try {
    return fn();
  } finally {
    other.cash = s.cash;
    s.cash = own;
  }
}

/**
 * Runs `fn` with all of city `id` in the state's own fields, on its map (its
 * wallet, buildings and books: what the racing team uses), then puts the
 * active city back. A city the company doesn't have: `fn` runs on the active one.
 */
export function withCity<T>(s: GameState, id: CityId, fn: () => T): T {
  const other = id === s.activeCity ? null : s.cities[id];
  if (!other) return fn();
  const own = bundleOf(s);
  for (const k of CITY_KEYS) put(s, other, k);
  try {
    return withWorld(id, fn);
  } finally {
    for (const k of CITY_KEYS) put(other, s, k);
    for (const k of CITY_KEYS) put(s, own, k);
  }
}

/**
 * Moves the company to another of its cities: the one being played is parked
 * (with the steady income it makes now), the other comes back with its map,
 * and its building sites catch up on the time it stood parked.
 */
export function switchCity(s: GameState, to: CityId, now: number): boolean {
  const target = s.cities[to];
  if (to === s.activeCity || !target) return false;
  const from = s.activeCity;
  const parked: ParkedCity = { ...bundleOf(s), at: now, steady: Math.max(0, snapshot(s).steadyIncomePerSec) };
  const cities = { ...s.cities, [from]: parked };
  delete cities[to];
  s.cities = cities;
  for (const k of CITY_KEYS) put(s, target, k);
  s.activeCity = to;
  setWorld(to);
  constructionTick(s, Math.max(0, (now - target.at) / 1000));
  return true;
}

/** What still stands between the company and a new city: the first city's territories open, and its wallet. */
export function cityUnlockStatus(s: GameState, id: CityId) {
  const open = (s.activeCity === "home" ? s.city : s.cities.home?.city)?.territories ?? [];
  const territories = BUYABLE_TERRITORIES.filter((t) => open.includes(t.id)).length;
  const owned = ownsCity(s, id);
  const ready = id !== "home" && !owned && territories >= BUYABLE_TERRITORIES.length && walletOf(s, "home") >= CITY_RULES.unlockCash;
  return { owned, territories, needed: BUYABLE_TERRITORIES.length, price: CITY_RULES.unlockCash, ready };
}

/**
 * Opens a new city, paid from the first one's wallet. The new city starts
 * parked, with its own small capital.
 */
export function unlockCity(s: GameState, id: CityId, now: number): boolean {
  if (!cityUnlockStatus(s, id).ready) return false;
  withWallet(s, "home", () => (s.cash -= CITY_RULES.unlockCash));
  s.cities = { ...s.cities, [id]: { ...withWorld(id, createCityBundle), at: now, steady: 0 } };
  return true;
}

/** What the parked cities bring in over `seconds` (`eff` for time away): by city. */
export function parkedEarnings(s: GameState, seconds: number, eff = 1): Partial<Record<CityId, number>> {
  const out: Partial<Record<CityId, number>> = {};
  for (const [id, c] of parkedCities(s)) {
    const got = c.steady * CITY_RULES.passiveShare * eff * seconds;
    if (got > 0 && Number.isFinite(got)) out[id] = got;
  }
  return out;
}

/** The parked cities' autopilot over `dt` seconds: their share, into their own wallets (the shareholders take their part). */
export function parkedTick(s: GameState, dt: number) {
  for (const [id, got] of Object.entries(parkedEarnings(s, dt)) as [CityId, number][]) {
    s.run.moneyEarned += got;
    s.lifetime.moneyEarned += got;
    withWallet(s, id, () => {
      s.cash += got;
      payDividends(s, got);
    });
  }
}
