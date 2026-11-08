// The season pass: 28-day seasons of 30 tiers, free for everyone, and a premium
// track beside it for the players who buy it for the season (config/iap.ts "pass"). XP comes from the daily
// missions and three weekly challenges; every tier pays something, and a few
// pay a hall style, a race livery or a limited-edition race car. All balance
// numbers live here; engine/pass.ts runs them.
import type { CarId, Reward } from "../types";
import type { SkinId } from "./collection";

export const PASS = {
  /** Seasons follow each other every `days` days from this Monday (local calendar dates). */
  epoch: { y: 2026, m: 0, d: 5 },
  days: 28,
  tiers: 30,
  xpPerTier: 500,
  /** XP for each daily mission taken, and for each weekly challenge. */
  xp: { daily: 120, weekly: 600 },
};

export type WeeklyId = "cars" | "earned" | "races" | "levels";

export const WEEKLY = {
  /** Hours of the empire's output a challenge asks for (cars, money), with a floor for a young company. */
  carsHours: 4,
  earnedHours: 8,
  minCars: 30,
  minEarned: 100_000,
  wins: 6,
  levels: 20,
};

export interface PassTier {
  reward: Reward;
  /** A plant hall style (config/collection.ts) or a race livery (config/racing.ts SKINS). */
  hall?: SkinId;
  livery?: string;
  /** A limited-edition race car of this model, in this livery. */
  car?: { model: CarId; livery: string };
}

/** The 30 tiers: more income each tier, a Star every fifth, and the collectibles on the way. */
export const PASS_TIERS: PassTier[] = Array.from({ length: PASS.tiers }, (_, i) => {
  const n = i + 1;
  const reward: Reward = { incomeSeconds: 600 + 60 * n };
  if (n % 2 === 0) reward.rp = 50 * n;
  if (n % 5 === 0) reward.stars = n === PASS.tiers ? 3 : 1;
  const tier: PassTier = { reward };
  if (n === 6) tier.hall = "chrome";
  if (n === 12) tier.livery = "pulse";
  if (n === 18) tier.car = { model: "supercar", livery: "pulse" };
  if (n === 24) tier.hall = "gold";
  if (n === 30) {
    tier.livery = "legend";
    tier.car = { model: "hypercar", livery: "legend" };
  }
  return tier;
});

/**
 * The premium track: bought for one season (the "pass" purchase), it pays a second reward at every
 * tier reached, on top of the free one: more income and research, a Star every third tier (5 at the
 * end), the Gold Rush livery, and a limited hypercar in it.
 */
export const PREMIUM_TIERS: PassTier[] = Array.from({ length: PASS.tiers }, (_, i) => {
  const n = i + 1;
  // at least $2,000 a tier, so a young company that buys the pass gets something it can feel
  const reward: Reward = { incomeSeconds: 1_200 + 120 * n, minCash: 2_000, rp: 80 * n };
  if (n % 3 === 0) reward.stars = n === PASS.tiers ? 5 : 1;
  const tier: PassTier = { reward };
  if (n === 15) tier.livery = "goldrush";
  if (n === 30) tier.car = { model: "hypercar", livery: "goldrush" };
  return tier;
});
