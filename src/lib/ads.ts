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
}

/** What the Android app's ad code does for the game. */
export interface AdDriver {
  /** Shows the loaded ad; `onReward` runs (at most once) when the ad network says it was watched. */
  show(onReward: () => void): Promise<AdResult>;
  /** Google's form to change the ad consent. */
  privacyForm(): Promise<void>;
}

/** Rewarded (the reward was given), closed early (none), or the ad couldn't be shown. */
export type AdResult = "rewarded" | "closed" | "failed";

let status: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false };
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
const SERVER: AdStatus = { ready: false, showing: false, privacyOptions: false, adFree: false };

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
  // one ad, one reward, whatever the ad network reports (a shop pack would be given twice)
  let rewarded = false;
  return driver.show(() => {
    if (rewarded) return;
    rewarded = true;
    onReward();
  });
}

export async function showAdPrivacyForm() {
  await driver?.privacyForm();
}
