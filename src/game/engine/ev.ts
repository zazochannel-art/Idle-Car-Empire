// The electric and self-driving late game: charging stations at the dealers
// (Charging Network research) and software subscriptions for the Autonomous
// Lounges on the road (Over-the-Air Updates). Both earn on their own, like
// the map's buildings: the city snapshot carries their income, so it is
// credited every tick and while the player is away.
import { CHARGING, EV_CARS, SUBSCRIPTION } from "../config/ev";
import { DEALER_IDS } from "../config/dealerships";
import type { CarId, DealerId, GameState } from "../types";
import { plantsOf } from "./chain";

export const chargingUnlocked = (s: GameState) => s.research.includes("charging_network");
export const subscriptionsUnlocked = (s: GameState) => s.research.includes("ota_updates");

/** The charging station level at a dealer (0: none). */
export const chargerLevel = (s: GameState, id: DealerId) => Math.max(0, Math.min(CHARGING.maxLevel, Math.floor(s.ev?.chargers[id] ?? 0)));

/** Station levels across the whole network. */
export const networkLevels = (s: GameState) => DEALER_IDS.reduce((a, id) => a + (s.dealers[id]?.owned ? chargerLevel(s, id) : 0), 0);

/** Price of the next station level at a dealer, or null (locked, not owned, or at the top). */
export function chargerCost(s: GameState, id: DealerId): number | null {
  const lvl = chargerLevel(s, id);
  if (!chargingUnlocked(s) || !s.dealers[id]?.owned || lvl >= CHARGING.maxLevel) return null;
  return CHARGING.cost * Math.pow(CHARGING.growth, lvl);
}

/** Builds (or extends) the charging station at a dealer. */
export function buildCharger(s: GameState, id: DealerId): boolean {
  const cost = chargerCost(s, id);
  if (cost === null || s.cash < cost) return false;
  s.cash -= cost;
  s.ev.chargers[id] = chargerLevel(s, id) + 1;
  return true;
}

/** The stations of a save: known dealers only, whole levels within 1–5. */
export function migrateEv(raw: unknown): GameState["ev"] {
  const chargers: Partial<Record<DealerId, number>> = {};
  const saved = raw && typeof raw === "object" ? (raw as { chargers?: unknown }).chargers : undefined;
  if (saved && typeof saved === "object")
    for (const id of DEALER_IDS) {
      const v = (saved as Record<string, unknown>)[id];
      if (typeof v === "number" && Number.isFinite(v) && v >= 1) chargers[id] = Math.min(CHARGING.maxLevel, Math.floor(v));
    }
  return { chargers };
}

/** Electric cars of this run on the road (every one the plants finished). */
export const evFleet = (s: GameState) => EV_CARS.reduce((a, c) => a + (s.run.carsByType[c] ?? 0), 0);

/** Cars the network can charge at once. */
export const chargingCapacity = (s: GameState) => networkLevels(s) * CHARGING.carsPerLevel * (s.research.includes("fast_charging") ? CHARGING.fastMult : 1);

/** How much faster electric cars find a buyer thanks to the network (1 = no stations). */
export function evDemandMult(s: GameState, car: CarId | undefined): number {
  if (!car || !EV_CARS.includes(car)) return 1;
  return 1 + Math.min(CHARGING.demandMax, networkLevels(s) * CHARGING.demandPerLevel);
}

/** Autonomous Lounges on the road, and how many of them the Software Studios keep subscribed. */
export function subscriptions(s: GameState): { cars: number; capacity: number; active: number } {
  const cars = s.run.carsByType.autonomous ?? 0;
  const capacity = plantsOf(s)
    .filter(([, b]) => b.type === "softwareStudio")
    .reduce((a, [, b]) => a + b.level * SUBSCRIPTION.perStudioLevel, 0);
  return { cars, capacity, active: subscriptionsUnlocked(s) ? Math.min(cars, capacity) : 0 };
}

export interface EvIncome {
  /** Charging income per dealer ($/s), for the "+$" over each one. */
  chargers: Partial<Record<DealerId, number>>;
  charging: number;
  subs: number;
  /** Cars charging right now (at most the network's capacity). */
  charged: number;
}

/** What charging and subscriptions earn per second, with the empire's income bonuses. */
export function evIncome(s: GameState, incomeMult: number): EvIncome {
  const out: EvIncome = { chargers: {}, charging: 0, subs: 0, charged: 0 };
  const levels = networkLevels(s);
  if (levels > 0) {
    out.charged = Math.min(evFleet(s), chargingCapacity(s));
    out.charging = out.charged * CHARGING.fee * incomeMult;
    // shared out by station size
    for (const id of DEALER_IDS) {
      const l = s.dealers[id]?.owned ? chargerLevel(s, id) : 0;
      if (l > 0) out.chargers[id] = (out.charging * l) / levels;
    }
  }
  out.subs = subscriptions(s).active * SUBSCRIPTION.fee * incomeMult;
  return out;
}
