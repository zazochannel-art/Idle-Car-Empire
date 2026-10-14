// The Android app's rewarded ads (AdMob, through @capacitor-community/admob).
// Loaded only inside the app (lib/native.ts); the web game never shows ads.
//
// Consent first: Google's User Messaging Platform asks the player where the law
// requires it (the EEA, the UK, Switzerland) and no ad is requested before it
// allows. Then one ad is kept loaded, so the game offers an ad only when there
// is one to watch.
import { AdMob, AdmobConsentStatus, MaxAdContentRating, RewardAdPluginEvents } from "@capacitor-community/admob";
import type { PluginListenerHandle } from "@capacitor/core";
import { registerAdDriver, setAdStatus, type AdResult } from "./ads";

/**
 * Google's sample rewarded ad unit: test ads, never paid. A build for Google Play
 * takes the real unit from the AdMob account in NEXT_PUBLIC_ADMOB_REWARDED_ID
 * (docs/android/ads.md); it is never written in the code.
 */
const TEST_UNIT = "ca-app-pub-3940256099942544/5224354917";
const UNIT = process.env.NEXT_PUBLIC_ADMOB_REWARDED_ID || TEST_UNIT;

let started = false;
let loading = false;
let failures = 0;

/** Loads the next ad; no fill or no network: tries again later, waiting longer each time (up to 5 minutes). */
async function load() {
  if (loading) return;
  loading = true;
  try {
    await AdMob.prepareRewardVideoAd({ adId: UNIT, isTesting: UNIT === TEST_UNIT });
    failures = 0;
    setAdStatus({ ready: true });
  } catch {
    setAdStatus({ ready: false });
    failures = Math.min(failures + 1, 5);
    setTimeout(() => void load(), Math.min(300, 15 * 2 ** failures) * 1000);
  } finally {
    loading = false;
  }
}

/**
 * Shows the loaded ad. The reward comes only from the ad network's reward event
 * (the ad watched to the end), at most once; closing the ad early gives nothing.
 */
async function show(onReward: () => void): Promise<AdResult> {
  let rewarded = false;
  let settle: (r: AdResult) => void = () => {};
  const result = new Promise<AdResult>((resolve) => (settle = resolve));
  const handles: PluginListenerHandle[] = [];
  let over = false;
  const finish = (r: AdResult) => {
    if (over) return;
    over = true;
    for (const h of handles) void h.remove();
    setAdStatus({ showing: false, ready: false });
    settle(r);
    void load();
  };
  handles.push(
    await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      if (rewarded || over) return;
      rewarded = true;
      onReward();
    }),
    // a reward that comes a moment after the close still counts
    await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => setTimeout(() => finish(rewarded ? "rewarded" : "closed"), 600)),
    await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish("failed")),
  );
  setAdStatus({ showing: true });
  // (this call settles only when the reward is earned: the events above decide)
  AdMob.showRewardVideoAd().catch(() => finish("failed"));
  return result;
}

/** Google's form to change the ad consent; ads stop if it no longer allows them. */
async function privacyForm() {
  await AdMob.showPrivacyOptionsForm();
  const info = await AdMob.requestConsentInfo();
  if (!info.canRequestAds) setAdStatus({ ready: false });
  else if (!started) void startAds();
}

let starting: Promise<void> | null = null;
let consentFailures = 0;

export function startAds(): Promise<void> {
  starting ??= begin().finally(() => {
    if (!started) starting = null;
  });
  return starting;
}

async function begin() {
  registerAdDriver({ show, privacyForm });
  try {
    let info = await AdMob.requestConsentInfo();
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
    // (the plugin declares this enum but doesn't export it: compared by its value)
    setAdStatus({ privacyOptions: String(info.privacyOptionsRequirementStatus) === "REQUIRED" });
    if (!info.canRequestAds) return;
  } catch {
    // the consent couldn't be checked (no network, Google unreachable): again once the phone
    // is online, or a while later (waiting longer each time, up to 10 minutes)
    consentFailures = Math.min(consentFailures + 1, 5);
    window.addEventListener("online", () => void startAds(), { once: true });
    setTimeout(() => void startAds(), Math.min(600, 20 * 2 ** consentFailures) * 1000);
    return;
  }
  started = true;
  // the game is for 13 and over: no ads rated for adults
  await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.Teen });
  void load();
}
