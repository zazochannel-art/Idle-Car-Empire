// Rewarded ads, as the game's screens see them: whether one is ready to watch,
// and watching it. Safe to load anywhere: the AdMob code itself is only loaded
// inside the Android app (lib/native-ads.ts, started by lib/native.ts), and
// registers itself here. On the web nothing registers: no ad is ever offered.
// With the "ad-free rewards" purchase (lib/native.ts turns it on), an offer gives
// its reward at once, without an ad.
import { useSyncExternalStore } from "react";
import { dateKey } from "@/game/engine/calendar";

export interface AdStatus {
  /** An ad is loaded and may be shown (consent given or not needed). */
  ready: boolean;
  /** An ad is on screen. */
  showing: boolean;
  /** The player's region asks for a way to change the ad consent (Settings shows it). */
  privacyOptions: boolean;
  /** Ad-free rewards bought: every offer is ready, and gives its reward without an ad. */
  adFree: boolean;
  /** A full-screen (interstitial) ad is loaded. */
  interstitialReady: boolean;
}

/** What the Android app's ad code does for the game. */
export interface AdDriver {
  /** Shows the loaded ad; `onReward` runs (at most once) when the ad network says it was watched. */
  show(onReward: () => void): Promise<AdResult>;
  /** Google's form to change the ad consent. */
  privacyForm(): Promise<void>;
  /** Shows the loaded full-screen ad (true: it was shown and closed). */
  showInterstitial(): Promise<boolean>;
}

/** Rewarded (the reward was given), closed early (none), or the ad couldn't be shown. */
export type AdResult = "rewarded" | "closed" | "failed";

let status: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false };
let driver: AdDriver | null = null;
const listeners = new Set<() => void>();

export function setAdStatus(patch: Partial<AdStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function registerAdDriver(d: AdDriver) {
  driver = d;
}

/** Ad-free rewards on or off (the purchase owned by the company being played). */
export function setAdFree(on: boolean) {
  if (status.adFree !== on) setAdStatus({ adFree: on });
}

/** An offer can be taken now: an ad loaded and none on screen, or ad-free rewards. */
export const canWatch = (a: AdStatus) => a.adFree || (a.ready && !a.showing);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const current = () => status;

/** The ad status now (outside a screen). */
export const getAdStatus = () => status;
const SERVER: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false };

/** The ad status, for a screen that offers an ad. */
export function useAdStatus(): AdStatus {
  return useSyncExternalStore(subscribe, current, () => SERVER);
}

/** Shows an ad; `onReward` runs once if it was watched to the end (at once, with ad-free rewards). */
export async function watchAd(onReward: () => void): Promise<AdResult> {
  if (status.adFree) {
    onReward();
    return "rewarded";
  }
  if (!driver || !status.ready || status.showing) return "failed";
  lastAdAt = Date.now();
  // one ad, one reward, whatever the ad network reports (a shop pack would be given twice)
  let rewarded = false;
  return driver.show(() => {
    if (rewarded) return;
    rewarded = true;
    onReward();
  });
}

// ───────────────────────────── full-screen ads (no reward) ─────────────────────────────
//
// Now and then, at a natural break (a screen the player closes), never in the middle of
// something: not in the first minutes of a game, not twice in a row (any ad, rewarded or not,
// starts the pause), only a few a day, and never with the ad-free rewards purchase.

export const INTERSTITIAL = {
  /**
   * Lifetime seconds of play before the first one, and never before the first car is built (a new
   * company makes it at about 45 minutes): the first hour is for getting hooked, not for ads.
   */
  minPlayTime: 60 * 60,
  /** The app open for this long (ms) before the first one of a run. */
  minOpenMs: 3 * 60_000,
  /** The pause after any ad (ms). */
  gapMs: 8 * 60_000,
  perDay: 5,
  /** At an eligible break, the chance (0–1) that one shows: so it isn't a clock. */
  chance: 0.5,
  /** The pause between the break and the ad (ms): a tap on "close" never lands on it. */
  delayMs: 1_200,
};

const openedAt = Date.now();
let lastAdAt = 0;
const STORE = "ice.interstitial";

function shownOn(day: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as { day?: string; count?: number } | null;
    return v?.day === day && typeof v.count === "number" ? Math.max(0, Math.floor(v.count)) : 0;
  } catch {
    return 0;
  }
}

function countInterstitial(day: string) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ day, count: shownOn(day) + 1 }));
  } catch {
    // no storage: the pause between ads still limits them
  }
}

export interface InterstitialContext {
  now: number;
  /** The company's lifetime seconds of play. */
  playTime: number;
  /** The company has built its first car. */
  firstCar: boolean;
  /** Ads shown today. */
  today: number;
  lastAdAt: number;
  openedAt: number;
}

/** Why a full-screen ad can't show now (null: it may). */
export function interstitialBlock(a: AdStatus, c: InterstitialContext): "adFree" | "notReady" | "young" | "pause" | "limit" | null {
  if (a.adFree) return "adFree";
  if (!a.interstitialReady || a.showing) return "notReady";
  if (!c.firstCar || c.playTime < INTERSTITIAL.minPlayTime || c.now - c.openedAt < INTERSTITIAL.minOpenMs) return "young";
  if (c.now - c.lastAdAt < INTERSTITIAL.gapMs) return "pause";
  if (c.today >= INTERSTITIAL.perDay) return "limit";
  return null;
}

/**
 * At a natural break: maybe shows a full-screen ad (by chance, within the limits above).
 * `playTime` is the company's seconds of play, `firstCar` whether it has built its first car.
 * True if one was shown.
 */
export async function maybeShowInterstitial(playTime: number, firstCar: boolean, rand: number = Math.random()): Promise<boolean> {
  const now = Date.now();
  const day = dateKey(now);
  if (interstitialBlock(status, { now, playTime, firstCar, today: shownOn(day), lastAdAt, openedAt }) || rand >= INTERSTITIAL.chance || !driver) return false;
  lastAdAt = now;
  countInterstitial(day);
  const shown = await driver.showInterstitial().catch(() => false);
  lastAdAt = Date.now();
  return shown;
}

export async function showAdPrivacyForm() {
  await driver?.privacyForm();
}
