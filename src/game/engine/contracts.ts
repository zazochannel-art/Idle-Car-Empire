// Customer contracts: a client orders N cars of one model by a deadline.
// They give the mid-game short, active goals and a reason to switch what an
// assembly line builds. Only one offer or contract at a time.

import type { CarId, GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { unlockedCarIds } from "./economy";
import { hasPlant } from "./chain";
import { grantReward, niceNumber } from "./progress";

export const CLIENTS = ["taxi", "rental", "police", "delivery", "racing", "embassy"] as const;
export type ClientId = (typeof CLIENTS)[number];

export interface Contract {
  id: string;
  client: ClientId;
  car: CarId;
  n: number;
  minutes: number;
  reward: Reward;
  /** Set when accepted: cars of this model built so far, and the deadline. */
  start?: number;
  deadline?: number;
}

export interface ContractsState {
  offer: Contract | null;
  active: Contract | null;
  /** No new offer before this time. */
  nextAt: number;
  done: number;
}

export const CONTRACT_COOLDOWN_MS = 5 * 60_000;
export const CONTRACT_FAIL_COOLDOWN_MS = 10 * 60_000;
/** Every this many finished contracts, the client adds a ⭐ Star. */
export const STAR_EVERY = 5;

const built = (s: GameState, car: CarId) => s.lifetime.carsByType[car] ?? 0;

export function contractProgress(s: GameState, c: Contract): number {
  return c.start === undefined ? 0 : Math.max(0, built(s, c.car) - c.start);
}

/** Offers a contract when none is open, scaled to the current car output. */
export function refreshContracts(s: GameState, now: number, snap: EconomySnapshot): "offer" | "expired" | null {
  const k = s.contracts;
  const a = k.active;
  if (a?.deadline !== undefined && now > a.deadline && contractProgress(s, a) < a.n) {
    k.active = null;
    k.nextAt = now + CONTRACT_FAIL_COOLDOWN_MS;
    return "expired";
  }
  if (k.offer || k.active || now < k.nextAt || !hasPlant(s, "assemblyPlant") || snap.carsPerSec <= 0) return null;
  const cars = [...unlockedCarIds(s, snap.gm)];
  if (!cars.length) return null;
  // seeded by time so a reload does not reroll the offer
  const r = Math.abs(Math.sin(now / 60_000 + s.createdAt)) * 1e4;
  const car = cars[Math.floor(r) % cars.length];
  const minutes = [15, 20, 30][Math.floor(r * 7) % 3];
  // a share of what all lines make: one dedicated line can do it
  const n = Math.max(3, niceNumber(snap.carsPerSec * minutes * 60 * 0.5));
  const star = (k.done + 1) % STAR_EVERY === 0;
  k.offer = {
    id: `c${now}`,
    client: CLIENTS[Math.floor(r * 13) % CLIENTS.length],
    car,
    n,
    minutes,
    reward: { incomeSeconds: minutes * 90, ...(star ? { stars: 1 } : {}) },
  };
  return "offer";
}

export function acceptContract(s: GameState, now: number): boolean {
  const o = s.contracts.offer;
  if (!o || s.contracts.active) return false;
  s.contracts.active = { ...o, start: built(s, o.car), deadline: now + o.minutes * 60_000 };
  s.contracts.offer = null;
  return true;
}

export function declineContract(s: GameState, now: number): boolean {
  if (!s.contracts.offer) return false;
  s.contracts.offer = null;
  s.contracts.nextAt = now + CONTRACT_COOLDOWN_MS;
  return true;
}

export function claimContract(s: GameState, now: number, snap: EconomySnapshot): boolean {
  const a = s.contracts.active;
  if (!a || contractProgress(s, a) < a.n) return false;
  grantReward(s, a.reward, snap);
  s.contracts.active = null;
  s.contracts.done += 1;
  s.contracts.nextAt = now + CONTRACT_COOLDOWN_MS;
  return true;
}


