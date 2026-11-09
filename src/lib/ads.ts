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
  /** An App Open ad is loaded. */
  appOpenReady: boolean;
}

/** What the Android app's ad code does for the game. */
export interface AdDriver {
  /** Shows the loaded ad; `onReward` runs (at most once) when the ad network says it was watched. */
  show(onReward: () => void): Promise<AdResult>;
  /** Google's form to change the ad consent. */
  privacyForm(): Promise<void>;
  /** Shows the loaded full-screen ad (true: it was shown and closed). */
  showInterstitial(): Promise<boolean>;
  /** Shows the loaded App Open ad (true: it was shown and closed). */
  showAppOpen(): Promise<boolean>;
}

/** Rewarded (the reward was given), closed early (none), or the ad couldn't be shown. */
export type AdResult = "rewarded" | "closed" | "failed";

let status: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: false };
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
const SERVER: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: false };

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
  /** Lifetime seconds of play before the first one. */
  minPlayTime: 15 * 60,
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

/** What was shown today (full-screen and App Open together), and when the last ad of any kind began: kept on the phone. */
interface Shown {
  /** Ads of both kinds shown today. */
  today: number;
  /** App Open ads shown today. */
  appOpenToday: number;
  last: number;
}

function readShown(day: string): Shown {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as { day?: string; count?: number; open?: number; last?: number } | null;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
    return { today: v?.day === day ? n(v.count) : 0, appOpenToday: v?.day === day ? n(v.open) : 0, last: n(v?.last) };
  } catch {
    return { today: 0, appOpenToday: 0, last: 0 };
  }
}

/** One more ad (an App Open one if `appOpen`) begins now. */
function countShown(day: string, now: number, appOpen: boolean) {
  const v = readShown(day);
  try {
    localStorage.setItem(STORE, JSON.stringify({ day, count: v.today + 1, open: v.appOpenToday + (appOpen ? 1 : 0), last: now }));
  } catch {
    // no storage: the pause between ads still limits them
  }
}

/** The last ad of any kind began at this time (this run, or an earlier one). */
const lastAd = (day: string) => Math.max(lastAdAt, readShown(day).last);

export interface InterstitialContext {
  now: number;
  /** The company's lifetime seconds of play. */
  playTime: number;
  /** Ads shown today. */
  today: number;
  lastAdAt: number;
  openedAt: number;
}

/** Why a full-screen ad can't show now (null: it may). */
export function interstitialBlock(a: AdStatus, c: InterstitialContext): "adFree" | "notReady" | "young" | "pause" | "limit" | null {
  if (a.adFree) return "adFree";
  if (!a.interstitialReady || a.showing) return "notReady";
  if (c.playTime < INTERSTITIAL.minPlayTime || c.now - c.openedAt < INTERSTITIAL.minOpenMs) return "young";
  if (c.now - c.lastAdAt < INTERSTITIAL.gapMs) return "pause";
  if (c.today >= INTERSTITIAL.perDay) return "limit";
  return null;
}

/**
 * At a natural break: maybe shows a full-screen ad (by chance, within the limits above).
 * `playTime` is the company's seconds of play. True if one was shown.
 */
export async function maybeShowInterstitial(playTime: number, rand: number = Math.random()): Promise<boolean> {
  const now = Date.now();
  const day = dateKey(now);
  const seen = readShown(day);
  if (interstitialBlock(status, { now, playTime, today: seen.today, lastAdAt: lastAd(day), openedAt }) || rand >= INTERSTITIAL.chance || !driver) return false;
  lastAdAt = now;
  countShown(day, now, false);
  const shown = await driver.showInterstitial().catch(() => false);
  lastAdAt = Date.now();
  return shown;
}

// ───────────────────────────── App Open ads ─────────────────────────────
//
// When the player comes back to the game: from another app or the Home screen after a while
// away, or as it opens if the ad is ready within a few seconds. Never in a young company
// (so never on the first opens, nor over the tour), never over a race, after the same pause
// as the other ads, inside the same daily total, and never with the ad-free rewards purchase.

export const APP_OPEN = {
  /** Away from the game for this long (ms) before coming back shows one: switching apps for a moment doesn't. */
  minAwayMs: 10 * 60_000,
  /** App Open ads a day (they count in the daily total of INTERSTITIAL.perDay too). */
  perDay: 2,
  /** As the game opens, how long (ms) to wait for the ad to be ready. */
  openWaitMs: 4_000,
};

export interface AppOpenContext extends InterstitialContext {
  /** App Open ads shown today. */
  appOpenToday: number;
  /** Ms the game was away (null: it is opening). */
  awayMs: number | null;
}

/** Why an App Open ad can't show now (null: it may). */
export function appOpenBlock(a: AdStatus, c: AppOpenContext): "adFree" | "notReady" | "young" | "short" | "pause" | "limit" | null {
  if (a.adFree) return "adFree";
  if (!a.appOpenReady || a.showing) return "notReady";
  if (c.playTime < INTERSTITIAL.minPlayTime) return "young";
  if (c.awayMs !== null && c.awayMs < APP_OPEN.minAwayMs) return "short";
  if (c.now - c.lastAdAt < INTERSTITIAL.gapMs) return "pause";
  if (c.today >= INTERSTITIAL.perDay || c.appOpenToday >= APP_OPEN.perDay) return "limit";
  return null;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The player is back in the game (`awayMs`: how long it was away; null: it is opening).
 * `busy` says whether a tour or a race is on screen. True if an App Open ad was shown.
 */
export async function maybeShowAppOpen(playTime: number, awayMs: number | null, busy: () => boolean): Promise<boolean> {
  // as the game opens, the ad may still be loading
  if (awayMs === null) for (let t = 0; t < APP_OPEN.openWaitMs && !status.appOpenReady; t += 250) await wait(250);
  const now = Date.now();
  const day = dateKey(now);
  const seen = readShown(day);
  const ctx: AppOpenContext = { now, playTime, today: seen.today, appOpenToday: seen.appOpenToday, lastAdAt: lastAd(day), openedAt, awayMs };
  if (appOpenBlock(status, ctx) || busy() || !driver) return false;
  lastAdAt = now;
  countShown(day, now, true);
  const shown = await driver.showAppOpen().catch(() => false);
  lastAdAt = Date.now();
  return shown;
}

export async function showAdPrivacyForm() {
  await driver?.privacyForm();
}
