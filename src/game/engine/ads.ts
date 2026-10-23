// Rewarded ads: what an ad the player chose to watch gives, and when one can be
// had. The ad itself is shown by the Android app (lib/ads.ts); a reward is
// granted here only once the ad network says the ad was watched to the end.
import { ADS, type AdReward } from "../config/ads";
import { SHOP } from "../config/shop";
import type { GameState } from "../types";
import { finishNow, remainingOf } from "./construction";
import { collectOffline } from "./offline";
import { dateKey } from "./progress";

export interface AdsState {
  /** The day (dateKey) `count` is for: rewarded ads watched that day. */
  day: string;
  count: number;
  /** Seconds of play left on the ×2 sales boost. */
  boostLeft: number;
  /** When the last instant build was granted (ms). */
  buildAt: number;
}

export const createAds = (): AdsState => ({ day: "", count: 0, boostLeft: 0, buildAt: 0 });

/** Rewarded ads watched today. */
export const adsToday = (s: GameState, now: number) => (s.ads.day === dateKey(now) ? s.ads.count : 0);

/** Why a reward can't be had now: today's limit, nothing to give, a boost already running, the pause after an instant build. */
export type AdBlock = "limit" | "nothing" | "active" | "wait" | null;

export function adBlock(s: GameState, reward: AdReward, now: number, plot?: string): AdBlock {
  if (adsToday(s, now) >= ADS.perDay) return "limit";
  switch (reward) {
    case "offline":
      return (s.pendingOffline?.money ?? 0) > 0 ? null : "nothing";
    case "boost":
      return s.ads.boostLeft > 0 ? "active" : null;
    case "build":
      if (!plot || remainingOf(s, plot) <= 0) return "nothing";
      return now < s.ads.buildAt + ADS.buildCooldown ? "wait" : null;
  }
}

/** Milliseconds until the next instant build can be had (0: now). */
export const buildWait = (s: GameState, now: number) => Math.max(0, s.ads.buildAt + ADS.buildCooldown - now);

/**
 * Grants the reward of one watched ad: the offline money ×2 (collected now),
 * the job on `plot` finished, or the ×2 sales boost. False when it can't be had
 * (then nothing changes).
 */
export function grantAd(s: GameState, reward: AdReward, now: number, plot?: string): boolean {
  if (adBlock(s, reward, now, plot)) return false;
  if (reward === "offline") collectOffline(s, ADS.offlineMult);
  else if (reward === "boost") s.ads.boostLeft = ADS.boostSeconds;
  else if (!finishNow(s, plot!)) return false;
  else s.ads.buildAt = now;
  countAd(s, now);
  return true;
}

/** One more rewarded ad watched today (the shop's ad packs count too). */
export function countAd(s: GameState, now: number) {
  const day = dateKey(now);
  s.ads.count = (s.ads.day === day ? s.ads.count : 0) + 1;
  s.ads.day = day;
}

/** The sales boost runs down with play time only (the game closed, it waits). */
export function adsTick(s: GameState, dt: number) {
  if (s.ads.boostLeft > 0) s.ads.boostLeft = Math.max(0, s.ads.boostLeft - dt);
}

/** A save's ad state, within bounds (the merge already gave every field its type). */
export function migrateAds(a: AdsState, now: number): AdsState {
  return {
    day: a.day,
    count: Math.max(0, Math.min(ADS.perDay, Math.floor(a.count))),
    // an ad gives 30 minutes; the shop's long boost can add up to its cap
    boostLeft: Math.max(0, Math.min(SHOP.boostCap, a.boostLeft)),
    // a time from the future (a clock set back) would hold the pause for ever
    buildAt: Math.max(0, Math.min(now, a.buildAt)),
  };
}
