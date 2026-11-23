// Rewarded ads, as the game's screens see them: whether one is ready to watch,
// and watching it. Safe to load anywhere: the AdMob code itself is only loaded
// inside the Android app (lib/native-ads.ts, started by lib/native.ts), and
// registers itself here. On the web nothing registers: no ad is ever offered.
// With the "ad-free rewards" purchase (lib/native.ts turns it on), an offer gives
// its reward at once, without an ad.
import { useSyncExternalStore } from "react";

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
  /**
   * A rewarded ad is on its way (the consent and the SDK starting, or a request out): a one-time offer
   * (the offline report, the daily login) says so instead of being missing until the ad arrives.
   */
  loading: boolean;
}

/** What the Android app's ad code does for the game. */
export interface AdDriver {
  /** Shows the loaded ad; `onReward` runs (at most once) when the ad network says it was watched. `place`: the offer (for the ad log). */
  show(onReward: () => void, place?: string): Promise<AdResult>;
  /** Google's form to change the ad consent. */
  privacyForm(): Promise<void>;
  /** Shows the loaded full-screen ad (true: it was shown and closed). */
  showInterstitial(): Promise<boolean>;
  /** Shows the loaded App Open ad (true: it was shown and closed). `place`: where (for the ad log). */
  showAppOpen(place?: string): Promise<boolean>;
}

/** Rewarded (the reward was given), closed early (none), or the ad couldn't be shown. */
export type AdResult = "rewarded" | "closed" | "failed";

let status: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: false, loading: false };
let driver: AdDriver | null = null;
const listeners = new Set<() => void>();

export function setAdStatus(patch: Partial<AdStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function registerAdDriver(d: AdDriver) {
  driver = d;
}

// ───────────────────────────── which ads to load ─────────────────────────────
//
// An ad is requested only when the game could show it (lib/native-ads.ts asks here before each
// request): every request that can't become an impression lowers the show rate AdMob reports.

export interface AdNeeds {
  /** Rewarded ads: offered to every company without ad-free rewards. */
  rewarded: boolean;
  /** Full-screen ads (interstitial, App Open): only once the company is near the age they may show at. */
  fullScreen: boolean;
}

/** Full-screen ads start loading this many seconds of play before they may show (INTERSTITIAL.minPlayTime). */
export const FULL_SCREEN_PRELOAD_SECONDS = 5 * 60;

/** Which ads the company being played could be shown. */
export function adNeeds(adFree: boolean, playTime: number, firstCar: boolean): AdNeeds {
  if (adFree) return { rewarded: false, fullScreen: false };
  return { rewarded: true, fullScreen: firstCar && playTime >= INTERSTITIAL.minPlayTime - FULL_SCREEN_PRELOAD_SECONDS };
}

/** Nothing until the game says what it plays (lib/native.ts). */
let needs: AdNeeds = { rewarded: false, fullScreen: false };
const needsListeners = new Set<() => void>();

export const getAdNeeds = () => needs;

export function setAdNeeds(n: AdNeeds) {
  if (n.rewarded === needs.rewarded && n.fullScreen === needs.fullScreen) return;
  needs = n;
  for (const l of needsListeners) l();
}

/** Called when what may be loaded changes (returns the unsubscribe). */
export function onAdNeeds(l: () => void): () => void {
  needsListeners.add(l);
  return () => needsListeners.delete(l);
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
const SERVER: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: false, loading: false };

/** The ad status, for a screen that offers an ad. */
export function useAdStatus(): AdStatus {
  return useSyncExternalStore(subscribe, current, () => SERVER);
}

/** Shows an ad; `onReward` runs once if it was watched to the end (at once, with ad-free rewards). */
export async function watchAd(onReward: () => void, place?: string): Promise<AdResult> {
  if (status.adFree) {
    onReward();
    return "rewarded";
  }
  if (!driver || !status.ready || status.showing) return "failed";
  // the pause after any ad starts now, kept on the phone too; an ad that couldn't be shown doesn't start it
  const before = lastAdAt;
  const storedBefore = readLast();
  const now = Date.now();
  lastAdAt = now;
  writeLast(now);
  // one ad, one reward, whatever the ad network reports (a shop pack would be given twice)
  let rewarded = false;
  const result = await driver
    .show(() => {
      if (rewarded) return;
      rewarded = true;
      onReward();
    }, place)
    .catch((): AdResult => "failed");
  if (result === "failed" && !rewarded) {
    lastAdAt = before;
    writeLast(storedBefore);
  }
  return result;
}

// ───────────────────────────── full-screen ads (no reward) ─────────────────────────────
//
// At a natural break (a screen the player closes), never in the middle of something: not in the
// first hour of a company, not twice within 5 minutes (any ad, rewarded or not, starts the pause),
// at most 12 a day (these and the App Open ads together), and never with the ad-free rewards purchase.
// (Not more often: AdMob and Google Play count ads that keep interrupting the game as disruptive,
// which can limit the account's ad serving.)

export const INTERSTITIAL = {
  /**
   * Lifetime seconds of play before the first one, and never before the first car is built (a new
   * company makes it at about 45 minutes): the first hour is for getting hooked, not for ads.
   */
  minPlayTime: 60 * 60,
  /** The app open for this long (ms) before the first one of a run. */
  minOpenMs: 3 * 60_000,
  /** The pause after any ad (ms). */
  gapMs: 5 * 60_000,
  /** Full-screen ads a day, the interstitial and the App Open together (a rewarded ad doesn't count). */
  perDay: 12,
  /** At an eligible break, the chance (0–1) that one shows: every break once the pause is over. */
  chance: 1,
  /** The pause between the break and the ad (ms): a tap on "close" never lands on it. */
  delayMs: 1_200,
};

const openedAt = Date.now();
let lastAdAt = 0;
const STORE = "ice.interstitial";

interface Stored {
  last: number;
  /** The day (local date) the count is for, and the full-screen ads shown that day. */
  day: string;
  n: number;
}

const dayKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function readStore(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Stored> | null;
    return {
      last: typeof v?.last === "number" && Number.isFinite(v.last) && v.last > 0 ? Math.floor(v.last) : 0,
      day: typeof v?.day === "string" ? v.day : "",
      n: typeof v?.n === "number" && Number.isFinite(v.n) && v.n > 0 ? Math.floor(v.n) : 0,
    };
  } catch {
    return { last: 0, day: "", n: 0 };
  }
}

function writeStore(v: Stored) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    // no storage: the pause within this run still limits them
  }
}

/** When the last ad of any kind began: kept on the phone, so a restart doesn't end the pause. */
function readLast(): number {
  return readStore().last;
}

/** An ad begins at `now` (or is taken back: `now` is then the time of the ad before). */
function writeLast(now: number) {
  writeStore({ ...readStore(), last: now });
}

/** Full-screen ads shown today (kept on the phone, so a restart doesn't reset the day). */
export function shownToday(now: number = Date.now()): number {
  const v = readStore();
  return v.day === dayKey(now) ? v.n : 0;
}

/** A full-screen ad was shown. */
function countShown(now: number) {
  const v = readStore();
  writeStore({ ...v, day: dayKey(now), n: (v.day === dayKey(now) ? v.n : 0) + 1 });
}

/** The last ad of any kind began at this time (this run, or an earlier one). */
const lastAd = () => Math.max(lastAdAt, readLast());

export interface InterstitialContext {
  now: number;
  /** The company's lifetime seconds of play. */
  playTime: number;
  /** The company has built its first car. */
  firstCar: boolean;
  lastAdAt: number;
  openedAt: number;
  /** Full-screen ads shown today (none when left out). */
  shownToday?: number;
}

/** Why a full-screen ad can't show now (null: it may). */
export function interstitialBlock(a: AdStatus, c: InterstitialContext): "adFree" | "notReady" | "young" | "pause" | "limit" | null {
  if (a.adFree) return "adFree";
  if (!a.interstitialReady || a.showing) return "notReady";
  if (!c.firstCar || c.playTime < INTERSTITIAL.minPlayTime || c.now - c.openedAt < INTERSTITIAL.minOpenMs) return "young";
  if (c.now - c.lastAdAt < INTERSTITIAL.gapMs) return "pause";
  if ((c.shownToday ?? 0) >= INTERSTITIAL.perDay) return "limit";
  return null;
}

/**
 * At a natural break: maybe shows a full-screen ad (by chance, within the limits above).
 * `playTime` is the company's seconds of play, `firstCar` whether it has built its first car.
 * True if one was shown.
 */
export async function maybeShowInterstitial(playTime: number, firstCar: boolean, rand: number = Math.random()): Promise<boolean> {
  const now = Date.now();
  const last = lastAd();
  if (interstitialBlock(status, { now, playTime, firstCar, lastAdAt: last, openedAt, shownToday: shownToday(now) }) || rand >= INTERSTITIAL.chance || !driver) return false;
  const before = lastAdAt;
  const storedBefore = readLast();
  lastAdAt = now;
  writeLast(now);
  const shown = await driver.showInterstitial().catch(() => false);
  // one that never showed doesn't start the pause
  if (shown) {
    lastAdAt = Date.now();
    countShown(lastAdAt);
  } else {
    lastAdAt = before;
    writeLast(storedBefore);
  }
  return shown;
}

// ───────────────────────────── App Open ads ─────────────────────────────
//
// When the player comes back to the game from another app or the Home screen after a while away,
// as the game returns (before the player can touch anything). Not as the game opens: the game is on
// screen at once from its own files, and an ad that arrived a few seconds later would land on a
// screen in use (Google: App Open ads go over a loading screen, never over content in use). Never
// in a young company (so never over the tour), never over a race, after the same pause as the
// other ads, and never with the ad-free rewards purchase.

export const APP_OPEN = {
  /** Away from the game for this long (ms) before coming back shows one: switching apps for a moment doesn't. */
  minAwayMs: 5 * 60_000,
};

export interface AppOpenContext extends InterstitialContext {
  /** Ms the game was away. */
  awayMs: number;
}

/** Why an App Open ad can't show now (null: it may). */
export function appOpenBlock(a: AdStatus, c: AppOpenContext): "adFree" | "notReady" | "young" | "short" | "pause" | "limit" | null {
  if (a.adFree) return "adFree";
  if (!a.appOpenReady || a.showing) return "notReady";
  if (!c.firstCar || c.playTime < INTERSTITIAL.minPlayTime) return "young";
  if (c.awayMs < APP_OPEN.minAwayMs) return "short";
  if (c.now - c.lastAdAt < INTERSTITIAL.gapMs) return "pause";
  if ((c.shownToday ?? 0) >= INTERSTITIAL.perDay) return "limit";
  return null;
}

/**
 * The time away from the game, for the App Open ad as it comes back. A full-screen ad of the game's own
 * also takes the screen from it (Android pauses the game under the ad), but that is no time away: its
 * close must never bring an App Open ad straight after it (two full-screen ads in a row).
 */
let pausedAt = 0;

/** The app left the screen: to the background, or under one of its own ads (then it counts as no time away). */
export function appPaused(now: number = Date.now()) {
  pausedAt = status.showing ? 0 : now;
}

/** The app is back on screen: how long it was away (ms), or null if it wasn't (never paused, or only under its own ad). */
export function appResumed(now: number = Date.now()): number | null {
  const at = pausedAt;
  pausedAt = 0;
  return at ? Math.max(0, now - at) : null;
}

/**
 * The player is back in the game (`awayMs`: how long it was away). `busy` says whether a tour or a
 * race is on screen. True if an App Open ad was shown.
 */
export async function maybeShowAppOpen(playTime: number, firstCar: boolean, awayMs: number, busy: () => boolean): Promise<boolean> {
  const now = Date.now();
  const last = lastAd();
  const ctx: AppOpenContext = { now, playTime, firstCar, lastAdAt: last, openedAt, awayMs, shownToday: shownToday(now) };
  if (appOpenBlock(status, ctx) || busy() || !driver) return false;
  const before = lastAdAt;
  const storedBefore = readLast();
  lastAdAt = now;
  writeLast(now);
  const shown = await driver.showAppOpen("resume").catch(() => false);
  if (shown) {
    lastAdAt = Date.now();
    countShown(lastAdAt);
  } else {
    lastAdAt = before;
    writeLast(storedBefore);
  }
  return shown;
}

/**
 * The localStorage key of a test build's quicker full-screen limits ({ minOpenMs, gapMs, chance, delayMs,
 * minAwayMs }): the CI emulator check (scripts/android-device-check.mjs) plays an interstitial and an App
 * Open ad without waiting the minutes players wait. Read only in a test build (lib/native-ads.ts: an app
 * id ending in ".debug", which shows Google's test ads): a build for players never reads it.
 */
export const AD_TEST_TIMING_KEY = "ice.adTestTiming";

/** A test build's quicker limits (AD_TEST_TIMING_KEY's value): only the numbers named, anything else ignored. */
export function quickenAdsForTest(raw: string | null) {
  if (!raw) return;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  for (const k of ["minOpenMs", "gapMs", "perDay", "chance", "delayMs"] as const) {
    const v = num(o[k]);
    if (v !== null) INTERSTITIAL[k] = v;
  }
  const away = num(o.minAwayMs);
  if (away !== null) APP_OPEN.minAwayMs = away;
}

export async function showAdPrivacyForm() {
  await driver?.privacyForm();
}
