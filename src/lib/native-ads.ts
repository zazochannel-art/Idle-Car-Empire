// The app's rewarded ads (AdMob, through @capacitor-community/admob), on Android
// and iOS. Loaded only inside the app (lib/native.ts).
//
// Consent first: Google's User Messaging Platform asks the player where the law
// requires it (the EEA, the UK, Switzerland) and no ad is requested before it
// allows, nor after the player withdraws it. Then one ad of each kind is kept
// loaded (and loaded again before Google lets it expire), so the game offers an
// ad only when there is one to watch.
import { AdMob, AdmobConsentDebugGeography, AdmobConsentStatus, AppOpenAdPluginEvents, InterstitialAdPluginEvents, MaxAdContentRating, RewardAdPluginEvents } from "@capacitor-community/admob";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { getAdStatus, registerAdDriver, setAdStatus, type AdResult } from "./ads";
import { platform } from "./platform";

/**
 * Google's sample rewarded ad units (one per platform): test ads, never paid. A build
 * for the stores takes the real units from the AdMob account, in
 * NEXT_PUBLIC_ADMOB_REWARDED_ID (Android) and NEXT_PUBLIC_ADMOB_REWARDED_ID_IOS
 * (docs/android/ads.md, docs/ios.md); they are never written in the code.
 */
const TEST_UNIT = platform() === "ios" ? "ca-app-pub-3940256099942544/1712485313" : "ca-app-pub-3940256099942544/5224354917";
const UNIT = (platform() === "ios" ? process.env.NEXT_PUBLIC_ADMOB_REWARDED_ID_IOS : process.env.NEXT_PUBLIC_ADMOB_REWARDED_ID) || TEST_UNIT;
/** The unit the ads load from: UNIT, or the test one in a test build (begin()). */
let unit = UNIT;

/** The same for the full-screen ads (NEXT_PUBLIC_ADMOB_INTERSTITIAL_ID / _IOS); Google's sample units until set. */
const TEST_INTERSTITIAL = platform() === "ios" ? "ca-app-pub-3940256099942544/4411468910" : "ca-app-pub-3940256099942544/1033173712";
const INTERSTITIAL_UNIT = (platform() === "ios" ? process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_ID_IOS : process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_ID) || TEST_INTERSTITIAL;
let interstitialUnit = INTERSTITIAL_UNIT;

/** And the App Open ads (NEXT_PUBLIC_ADMOB_APP_OPEN_ID / _IOS). */
const TEST_APP_OPEN = platform() === "ios" ? "ca-app-pub-3940256099942544/5575463023" : "ca-app-pub-3940256099942544/9257395921";
const APP_OPEN_UNIT = (platform() === "ios" ? process.env.NEXT_PUBLIC_ADMOB_APP_OPEN_ID_IOS : process.env.NEXT_PUBLIC_ADMOB_APP_OPEN_ID) || TEST_APP_OPEN;
let appOpenUnit = APP_OPEN_UNIT;

type Kind = "rewarded" | "interstitial" | "appOpen";

/**
 * How long a loaded ad stays good (ms). AdMob: rewarded and full-screen ads expire after 1 hour,
 * App Open ads after 4; an ad shown after that may not show or pay. A margin is kept.
 */
const FRESH_MS: Record<Kind, number> = { rewarded: 55 * 60_000, interstitial: 55 * 60_000, appOpen: 225 * 60_000 };
/** When each kind was last loaded (ms). */
const loadedAt: Record<Kind, number> = { rewarded: 0, interstitial: 0, appOpen: 0 };
const isStale = (k: Kind) => Date.now() - loadedAt[k] >= FRESH_MS[k];

/** How long the game waits for a shown ad to appear (ms), and then for it to run, before it stops waiting for its close. */
const SHOW_WAIT_MS = 20_000;
const SHOW_MAX_MS = 15 * 60_000;

/**
 * Watches an ad that was asked to show, in case its close never comes (a lost event, a recreated
 * activity): `give` ends the wait if the ad hasn't appeared in time, or has been up for too long.
 * Returns what stops the watch (the ad closed).
 */
function guardShow(appeared: () => boolean, give: () => void): () => void {
  const wait = setTimeout(() => {
    if (!appeared()) give();
  }, SHOW_WAIT_MS);
  const max = setTimeout(give, SHOW_MAX_MS);
  return () => {
    clearTimeout(wait);
    clearTimeout(max);
  };
}

/** The consent allows ads to be requested. Nothing is loaded or shown while it doesn't. */
let consentOk = false;
let started = false;
let loading = false;
let failures = 0;

/** Loads the next ad; no fill or no network: tries again later, waiting longer each time (up to 5 minutes). */
async function load() {
  if (loading || !consentOk) return;
  loading = true;
  try {
    await AdMob.prepareRewardVideoAd({ adId: unit, isTesting: unit === TEST_UNIT });
    loadedAt.rewarded = Date.now();
    failures = 0;
    setAdStatus({ ready: consentOk });
  } catch {
    setAdStatus({ ready: false });
    failures = Math.min(failures + 1, 5);
    setTimeout(() => void load(), Math.min(300, 15 * 2 ** failures) * 1000);
  } finally {
    loading = false;
  }
}

let interstitialLoading = false;
let interstitialFailures = 0;
/** A full-screen ad is on screen, and the show waiting for it to close. */
let interstitialSettle: ((shown: boolean) => void) | null = null;
let interstitialVisible = false;
let stopInterstitialGuard: (() => void) | null = null;

/** Loads the next full-screen ad; no fill or no network: again later, waiting longer each time (up to 10 minutes). */
async function loadInterstitial() {
  if (interstitialLoading || !consentOk) return;
  interstitialLoading = true;
  try {
    await AdMob.prepareInterstitial({ adId: interstitialUnit, isTesting: interstitialUnit === TEST_INTERSTITIAL });
    loadedAt.interstitial = Date.now();
    interstitialFailures = 0;
    setAdStatus({ interstitialReady: consentOk });
  } catch {
    setAdStatus({ interstitialReady: false });
    interstitialFailures = Math.min(interstitialFailures + 1, 5);
    setTimeout(() => void loadInterstitial(), Math.min(600, 30 * 2 ** interstitialFailures) * 1000);
  } finally {
    interstitialLoading = false;
  }
}

/** The full-screen ad closed (or couldn't show): the screen is the game's again, the next ad loads. */
function interstitialClosed(shown: boolean) {
  const settle = interstitialSettle;
  if (!settle) return;
  interstitialSettle = null;
  stopInterstitialGuard?.();
  stopInterstitialGuard = null;
  setAdStatus({ showing: false, interstitialReady: false });
  settle(shown);
  void loadInterstitial();
}

/** Shows the loaded full-screen ad (never over another one). It gives nothing; true once it was shown and closed. */
function showInterstitial(): Promise<boolean> {
  if (!consentOk || open || interstitialSettle || appOpenSettle) return Promise.resolve(false);
  if (isStale("interstitial")) {
    setAdStatus({ interstitialReady: false });
    void loadInterstitial();
    return Promise.resolve(false);
  }
  interstitialVisible = false;
  setAdStatus({ showing: true });
  return new Promise<boolean>((settle) => {
    interstitialSettle = settle;
    stopInterstitialGuard = guardShow(
      () => interstitialVisible,
      () => interstitialClosed(interstitialVisible),
    );
    AdMob.showInterstitial().catch(() => interstitialClosed(false));
  });
}

let appOpenLoading = false;
let appOpenFailures = 0;
/** An App Open ad is on screen, and the show waiting for it to close. */
let appOpenSettle: ((shown: boolean) => void) | null = null;
let appOpenVisible = false;
let stopAppOpenGuard: (() => void) | null = null;

/** Loads the next App Open ad; no fill or no network: again later, waiting longer each time (up to 10 minutes). */
async function loadAppOpen() {
  if (appOpenLoading || !consentOk) return;
  appOpenLoading = true;
  try {
    await AdMob.loadAppOpen({ adId: appOpenUnit });
    loadedAt.appOpen = Date.now();
    appOpenFailures = 0;
    setAdStatus({ appOpenReady: consentOk });
  } catch {
    setAdStatus({ appOpenReady: false });
    appOpenFailures = Math.min(appOpenFailures + 1, 5);
    setTimeout(() => void loadAppOpen(), Math.min(600, 30 * 2 ** appOpenFailures) * 1000);
  } finally {
    appOpenLoading = false;
  }
}

/** The App Open ad closed (or couldn't show): the screen is the game's again, the next ad loads. */
function appOpenClosed(shown: boolean) {
  const settle = appOpenSettle;
  if (!settle) return;
  appOpenSettle = null;
  stopAppOpenGuard?.();
  stopAppOpenGuard = null;
  setAdStatus({ showing: false, appOpenReady: false });
  settle(shown);
  void loadAppOpen();
}

/** Shows the loaded App Open ad (never over another ad). It gives nothing; true once it was shown and closed. */
function showAppOpen(): Promise<boolean> {
  if (!consentOk || open || interstitialSettle || appOpenSettle) return Promise.resolve(false);
  if (isStale("appOpen")) {
    setAdStatus({ appOpenReady: false });
    void loadAppOpen();
    return Promise.resolve(false);
  }
  appOpenVisible = false;
  setAdStatus({ showing: true });
  return new Promise<boolean>((settle) => {
    appOpenSettle = settle;
    stopAppOpenGuard = guardShow(
      () => appOpenVisible,
      () => appOpenClosed(appOpenVisible),
    );
    AdMob.showAppOpen().catch(() => appOpenClosed(false));
  });
}

/** The latest ad shown: its reward, given once, and the watch waiting for it to close. */
interface Shown {
  onReward: () => void;
  settle: (r: AdResult) => void;
  rewarded: boolean;
  closing: boolean;
  /** The watch was settled (the game went on); a reward may still come after. */
  settled: boolean;
  /** The ad is on screen (its "showed" event came). */
  visible: boolean;
  /** Its close came after the watch was settled (the SDK reported a failure, then showed it anyway). */
  lateClose: boolean;
  stopGuard: (() => void) | null;
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
  // On a slow phone the SDK reports "Timeout for show call succeed." as a failure to show
  // while the ad is in fact on screen: only its real close ends it (a next ad loaded
  // meanwhile would be dropped by the plugin when this one closes).
  if (failed && s.visible) return;
  s.closing = true;
  s.stopGuard?.();
  s.stopGuard = null;
  setTimeout(() => {
    open = false;
    s.settled = true;
    setAdStatus({ showing: false, ready: false });
    s.settle(s.rewarded ? "rewarded" : failed ? "failed" : "closed");
    void load();
  }, 1500);
}

/**
 * The real close of an ad the game had already given up on (the failure came before the ad
 * appeared, it showed anyway): the plugin keeps its prepared ads by unit, so closing this one
 * dropped the next one loaded meanwhile. That one is loaded again.
 */
function lateClose(s: Shown) {
  if (s.lateClose) return;
  s.lateClose = true;
  setAdStatus({ ready: false });
  void load();
}

/** Shows the loaded ad. The reward comes only from the ad network (the ad watched to the end); closing it early gives nothing. */
function show(onReward: () => void): Promise<AdResult> {
  if (open || !consentOk) return Promise.resolve("failed");
  if (isStale("rewarded")) {
    setAdStatus({ ready: false });
    void load();
    return Promise.resolve("failed");
  }
  open = true;
  setAdStatus({ showing: true });
  return new Promise<AdResult>((settle) => {
    const s: Shown = { onReward, settle, rewarded: false, closing: false, settled: false, visible: false, lateClose: false, stopGuard: null };
    shown = s;
    s.stopGuard = guardShow(
      () => s.visible,
      () => closed(!s.visible),
    );
    // (this call answers only once the reward is earned; a refusal means the ad couldn't show)
    AdMob.showRewardVideoAd().then(rewarded, () => closed(true));
  });
}

/** Google's form to change the ad consent; ads stop if it no longer allows them, and come back if it does. */
async function privacyForm() {
  await AdMob.showPrivacyOptionsForm();
  const info = await AdMob.requestConsentInfo();
  setAdStatus({ privacyOptions: String(info.privacyOptionsRequirementStatus) === "REQUIRED" });
  consentOk = info.canRequestAds;
  if (!consentOk) {
    // the ads already loaded go too: none may be shown or requested without the consent
    setAdStatus({ ready: false, interstitialReady: false, appOpenReady: false });
    return;
  }
  if (!started) {
    void startAds();
    return;
  }
  const a = getAdStatus();
  if (!a.ready) void load();
  if (!a.interstitialReady) void loadInterstitial();
  if (!a.appOpenReady) void loadAppOpen();
}

/** Ads loaded long ago are loaded again before Google lets them expire (never while one is on screen: each close loads the next). */
function refreshStale() {
  const a = getAdStatus();
  if (a.showing || !consentOk) return;
  if (a.ready && isStale("rewarded")) {
    setAdStatus({ ready: false });
    void load();
  }
  if (a.interstitialReady && isStale("interstitial")) {
    setAdStatus({ interstitialReady: false });
    void loadInterstitial();
  }
  if (a.appOpenReady && isStale("appOpen")) {
    setAdStatus({ appOpenReady: false });
    void loadAppOpen();
  }
}

let freshTimer: ReturnType<typeof setInterval> | undefined;

let starting: Promise<void> | null = null;
let startFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let waitingOnline = false;

export function startAds(): Promise<void> {
  starting ??= begin().finally(() => {
    if (!started) starting = null;
  });
  return starting;
}

/** The start failed (consent not checkable, the SDK not up): again once the phone is online, or a while later (waiting longer each time, up to 10 minutes). */
function retryStart() {
  startFailures = Math.min(startFailures + 1, 5);
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void startAds(), Math.min(600, 20 * 2 ** startFailures) * 1000);
  if (!waitingOnline && typeof window !== "undefined") {
    waitingOnline = true;
    window.addEventListener(
      "online",
      () => {
        waitingOnline = false;
        clearTimeout(retryTimer);
        void startAds();
      },
      { once: true },
    );
  }
}

/** The ad events' listeners, added once (a retried start must not add them again). */
let listeners: PluginListenerHandle[] = [];
let initialized = false;

/** The listeners and the SDK; safe to run again after a failure. */
async function setup(testBuild: boolean) {
  if (!listeners.length) {
    const added: PluginListenerHandle[] = [];
    try {
      // the ad events, listened to for good (never per ad: a listener removed early would lose a reward)
      added.push(await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
        if (shown) shown.visible = true;
      }));
      added.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, rewarded));
      added.push(
        await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          const s = shown;
          if (s?.settled && s.visible) lateClose(s);
          else closed();
        }),
      );
      added.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => closed(true)));
      added.push(await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => (interstitialVisible = true)));
      added.push(await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => interstitialClosed(true)));
      added.push(await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => interstitialClosed(false)));
      added.push(await AdMob.addListener(AppOpenAdPluginEvents.Opened, () => (appOpenVisible = true)));
      added.push(await AdMob.addListener(AppOpenAdPluginEvents.Closed, () => appOpenClosed(true)));
      added.push(await AdMob.addListener(AppOpenAdPluginEvents.FailedToShow, () => appOpenClosed(false)));
    } catch (e) {
      await Promise.all(added.map((h) => h.remove().catch(() => {})));
      throw e;
    }
    listeners = added;
  }
  if (!initialized) {
    // the game is for 13 and over: no ads rated for adults
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.Teen });
    initialized = true;
  }
  // a test build (its app id ends in ".debug", like the test APK anyone may download) shows
  // Google's test ads whatever unit it was built with: playing it is never real ad traffic
  if (testBuild) {
    unit = TEST_UNIT;
    interstitialUnit = TEST_INTERSTITIAL;
    appOpenUnit = TEST_APP_OPEN;
  }
}

async function begin() {
  registerAdDriver({ show, privacyForm, showInterstitial, showAppOpen });
  // a test build (its app id ends in ".debug", like the test APK the CI emulator plays) is never real
  // ad traffic: its consent check pretends to be outside the regulated regions. Google treats only
  // emulators and registered test devices that way, so a phone running a test build is unaffected.
  // Without this the emulator, run from a data centre in the EEA, waited for a consent form its
  // browser can't show and never got to the ad (the Android workflow's "rewarded ad" check).
  const testBuild = !!(await App.getInfo().catch(() => null))?.id.endsWith(".debug");
  try {
    let info = await AdMob.requestConsentInfo(testBuild ? { debugGeography: AdmobConsentDebugGeography.OTHER } : undefined);
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
    // (the plugin declares this enum but doesn't export it: compared by its value)
    setAdStatus({ privacyOptions: String(info.privacyOptionsRequirementStatus) === "REQUIRED" });
    consentOk = info.canRequestAds;
    if (!consentOk) return;
  } catch {
    retryStart();
    return;
  }
  // iOS: Apple's own question before the advertising identifier may be used (once; "no" still gets ads, not personalised)
  if (platform() === "ios") {
    try {
      if ((await AdMob.trackingAuthorizationStatus()).status === "notDetermined") await AdMob.requestTrackingAuthorization();
    } catch {
      // older iOS, or the prompt unavailable: ads go on without the identifier
    }
  }
  try {
    await setup(testBuild);
  } catch {
    // the SDK didn't start: again later, not a session without ads
    retryStart();
    return;
  }
  started = true;
  startFailures = 0;
  void load();
  void loadInterstitial();
  void loadAppOpen();
  freshTimer ??= setInterval(refreshStale, 60_000);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refreshStale());
}
