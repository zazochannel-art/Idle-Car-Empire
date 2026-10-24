// Bonuses on the Empire Map (config/map-bonus.ts): when the next one turns up,
// what it is, how long it stays, and its reward. The map draws them (a golden
// car, a drone's crate, a limousine, a broken-down truck); a tap takes the
// reward. They come only while the map is on screen, one at a time, and a
// game reopened never finds one waiting.
import { MAP_BONUS, MAP_BONUSES, MAP_BONUS_BY_KIND, type MapBonusKind } from "../config/map-bonus";
import type { GameState } from "../types";
import { plantsOf } from "./chain";
import { payReward } from "./materials";
import { dateKey } from "./progress";

export interface MapBonus {
  id: number;
  kind: MapBonusKind;
  /** Seconds of play it stays on the map. */
  left: number;
  /** Where the drone drops its crate (a plant's plot). */
  plot?: string;
}

export interface MapBonusState {
  active: MapBonus | null;
  /** Seconds of play on the map before the next one. */
  wait: number;
  /** The day (dateKey) `taken` counts. */
  day: string;
  taken: number;
  /** The last bonus's id. */
  seq: number;
}

export const createMapBonus = (): MapBonusState => ({ active: null, wait: MAP_BONUS.first, day: "", taken: 0, seq: 0 });

/** Bonuses taken today. */
export const bonusesToday = (s: GameState, now: number) => (s.mapBonus.day === dateKey(now) ? s.mapBonus.taken : 0);

/** Bonuses come once the first car is built. */
export const mapBonusOpen = (s: GameState) => s.chain.firstCar || s.lifetime.carsProduced > 0;

/** The truck broken down on the road slows every delivery (1: nothing is broken down). */
export const deliverySlowdown = (s: GameState) => (s.mapBonus.active?.kind === "breakdown" ? MAP_BONUS.breakdownSlow : 1);

const gap = (rand: () => number) => MAP_BONUS.gap[0] + rand() * (MAP_BONUS.gap[1] - MAP_BONUS.gap[0]);

/** Whether a kind of bonus makes sense now: the drone needs a plant, the breakdown a truck on the road, the VIP a dealership. */
function possible(s: GameState, kind: MapBonusKind): boolean {
  switch (kind) {
    case "golden":
      return true;
    case "drone":
      return plantsOf(s).length > 0;
    case "vip":
      return Object.values(s.dealers).some((d) => d.owned);
    case "breakdown":
      return s.chain.shipments.length > 0;
  }
}

/**
 * Seconds of play on the map (`dt`): the bonus on the map runs out, or the
 * next one turns up. "spawned" and "expired" for the UI.
 */
export function mapBonusTick(s: GameState, dt: number, now: number, rand: () => number = Math.random): "spawned" | "expired" | null {
  const mb = s.mapBonus;
  if (!(dt > 0)) return null;
  if (mb.active) {
    mb.active.left -= dt;
    if (mb.active.left > 0) return null;
    mb.active = null;
    mb.wait = gap(rand);
    return "expired";
  }
  if (!mapBonusOpen(s) || bonusesToday(s, now) >= MAP_BONUS.perDay) return null;
  mb.wait -= dt;
  if (mb.wait > 0) return null;
  const kinds = MAP_BONUSES.filter((b) => possible(s, b.kind));
  let k = rand() * kinds.reduce((a, b) => a + b.weight, 0);
  const cfg = kinds.find((b) => (k -= b.weight) < 0) ?? kinds[0];
  const bonus: MapBonus = { id: ++mb.seq, kind: cfg.kind, left: cfg.stay };
  if (cfg.kind === "drone") {
    const plants = plantsOf(s);
    bonus.plot = plants[Math.floor(rand() * plants.length) % plants.length][0];
  }
  mb.active = bonus;
  return "spawned";
}

/** What a bonus pays now: seconds of steady income, never less than the floor. */
export function mapBonusReward(s: GameState, kind: MapBonusKind): number {
  return Math.max(MAP_BONUS.minReward, Math.max(0, s.chain.steady ?? s.chain.rate) * MAP_BONUS_BY_KIND[kind].incomeSeconds);
}

/** Takes the bonus `id` (still on the map): its money, or null when it is gone. */
export function claimMapBonus(s: GameState, id: number, now: number, rand: () => number = Math.random): number | null {
  const mb = s.mapBonus;
  const a = mb.active;
  if (!a || a.id !== id) return null;
  const cash = mapBonusReward(s, a.kind);
  payReward(s, cash);
  const day = dateKey(now);
  mb.taken = (mb.day === day ? mb.taken : 0) + 1;
  mb.day = day;
  mb.active = null;
  mb.wait = gap(rand);
  return cash;
}

/** A save's bonus state: none waiting on the map (it was the last session's), the numbers within bounds. */
export function migrateMapBonus(m: MapBonusState): MapBonusState {
  const num = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
  return {
    active: null,
    wait: Math.max(MAP_BONUS.first, num(m.wait, 0, MAP_BONUS.gap[1])),
    day: typeof m.day === "string" ? m.day.slice(0, 16) : "",
    taken: Math.floor(num(m.taken, 0, MAP_BONUS.perDay)),
    seq: Math.floor(num(m.seq, 0, 1e9)),
  };
}
