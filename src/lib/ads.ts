// Rewarded ads, as the game's screens see them: whether one is ready to watch,
// and watching it. Safe to load anywhere: the AdMob code itself is only loaded
// inside the Android app (lib/native-ads.ts, started by lib/native.ts), and
// registers itself here. On the web nothing registers: no ad is ever offered.
import { useSyncExternalStore } from "react";

export interface AdStatus {
  /** An ad is loaded and may be shown (consent given or not needed). */
  ready: boolean;
  /** An ad is on screen. */
  showing: boolean;
  /** The player's region asks for a way to change the ad consent (Settings shows it). */
  privacyOptions: boolean;
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

let status: AdStatus = { ready: false, showing: false, privacyOptions: false };
let driver: AdDriver | null = null;
const listeners = new Set<() => void>();

export function setAdStatus(patch: Partial<AdStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function registerAdDriver(d: AdDriver) {
  driver = d;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const current = () => status;
const SERVER: AdStatus = { ready: false, showing: false, privacyOptions: false };

/** The ad status, for a screen that offers an ad. */
export function useAdStatus(): AdStatus {
  return useSyncExternalStore(subscribe, current, () => SERVER);
}

/** Shows an ad; `onReward` runs once if it was watched to the end. */
export async function watchAd(onReward: () => void): Promise<AdResult> {
  if (!driver || !status.ready || status.showing) return "failed";
  return driver.show(onReward);
}

export async function showAdPrivacyForm() {
  await driver?.privacyForm();
}
