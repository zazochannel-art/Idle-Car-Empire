// The Android app's rewarded ads (AdMob, through @capacitor-community/admob).
// Loaded only inside the app (lib/native.ts); the web game never shows ads.
//
// Consent first: Google's User Messaging Platform asks the player where the law
// requires it (the EEA, the UK, Switzerland) and no ad is requested before it
// allows. Then one ad is kept loaded, so the game offers an ad only when there
// is one to watch.
import { AdMob, AdmobConsentStatus, MaxAdContentRating, RewardAdPluginEvents } from "@capacitor-community/admob";
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

/** The latest ad shown: its reward, given once, and the watch waiting for it to close. */
interface Shown {
  onReward: () => void;
  settle: (r: AdResult) => void;
  rewarded: boolean;
  closing: boolean;
}
let shown: Shown | null = null;
/** An ad is on screen (one at a time). */
let open = false;

/**
 * The ad network says the ad was watched to the end (its reward event, or the
 * show call's answer: whichever comes first): the reward, once. It counts even
 * if the ad was already reported closed, so an early or out-of-order close never
 * loses it; the ad shown stays the one rewarded until the next one plays.
 */
function rewarded() {
  const s = shown;
  if (!s || s.rewarded) return;
  s.rewarded = true;
  s.onReward();
}

/** The ad closed (or couldn't show): the watch settles a moment later (a reward may come just after), then the next ad loads. */
function closed(failed = false) {
  const s = shown;
  if (!s || s.closing) return;
  s.closing = true;
  setTimeout(() => {
    open = false;
    setAdStatus({ showing: false, ready: false });
    s.settle(s.rewarded ? "rewarded" : failed ? "failed" : "closed");
    void load();
  }, 1500);
}

/** Shows the loaded ad. The reward comes only from the ad network (the ad watched to the end); closing it early gives nothing. */
function show(onReward: () => void): Promise<AdResult> {
  if (open) return Promise.resolve("failed");
  open = true;
  setAdStatus({ showing: true });
  return new Promise<AdResult>((settle) => {
    shown = { onReward, settle, rewarded: false, closing: false };
    // (this call answers only once the reward is earned; a refusal means the ad couldn't show)
    AdMob.showRewardVideoAd().then(rewarded, () => closed(true));
  });
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
  // the ad events, listened to for good (never per ad: a listener removed early would lose a reward)
  await AdMob.addListener(RewardAdPluginEvents.Rewarded, rewarded);
  await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => closed());
  await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => closed(true));
  // the game is for 13 and over: no ads rated for adults
  await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.Teen });
  void load();
}
