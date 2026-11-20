// The app's rewarded ads (AdMob, through @capacitor-community/admob), on Android
// and iOS. Loaded only inside the app (lib/native.ts).
//
// Consent first: Google's User Messaging Platform asks the player where the law
// requires it (the EEA, the UK, Switzerland) and no ad is requested before it
// allows, nor after the player withdraws it. Then one ad of each kind is kept
// loaded (and loaded again before Google lets it expire), so the game offers an
// ad only when there is one to watch.
//
// Every load is a new ad request, App Open included: the plugin used to answer an App Open load
// with the ad it already held (however old), and is patched by scripts/patch-admob.mjs so that
// a load replaces it and an ad past Google's 4 hours is never shown.
import { AdMob, AdmobConsentDebugGeography, AdmobConsentStatus, AppOpenAdPluginEvents, InterstitialAdPluginEvents, MaxAdContentRating, RewardAdPluginEvents } from "@capacitor-community/admob";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { adLog, enableAdLog, type AdFormat } from "./ad-log";
import { AD_TEST_TIMING_KEY, getAdNeeds, getAdStatus, onAdNeeds, quickenAdsForTest, registerAdDriver, setAdStatus, type AdResult } from "./ads";
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

type Kind = AdFormat;

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
 * The SDK may report a rewarded ad as failed to show and then show it anyway (a slow phone): the game
 * waits this long (ms) for it to appear before telling the player it couldn't be shown.
 */
const SHOW_FAIL_GRACE_MS = 4_000;

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

/** The app is on screen: no ad is requested while it is in the background (it couldn't be shown). */
const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/** The last load error the SDK reported for each kind (its code), for the log line of the failed request. */
const loadError: Partial<Record<Kind, { code?: number; message?: string }>> = {};
/** The last show error the SDK reported for each kind, for the log line of the ad that couldn't show. */
const showError: Partial<Record<Kind, { code?: number; message?: string }>> = {};
/** The SDK's code of each kind's last failed request (the network's, 2, is retried as soon as the phone is online). */
const failCode: Partial<Record<Kind, number>> = {};
const NETWORK_ERROR = 2;

/** The unit each kind loads from now. */
const unitOf = (k: Kind) => (k === "rewarded" ? unit : k === "interstitial" ? interstitialUnit : appOpenUnit);

/**
 * Whether a request for `k` may go out now: the game could show it (lib/ads.ts adNeeds) and the app
 * is on screen. A request that can't become an impression only lowers the show rate.
 */
function mayRequest(k: Kind): boolean {
  const n = getAdNeeds();
  if (!(k === "rewarded" ? n.rewarded : n.fullScreen)) return false;
  if (!visible()) {
    adLog("AD_REQUEST_SKIPPED", k, { unit: unitOf(k), note: "background" });
    return false;
  }
  return true;
}

/** The request failed: the log line, with the SDK's code when it reported one. */
function logLoadFailed(k: Kind, e: unknown) {
  const reported = loadError[k];
  delete loadError[k];
  failCode[k] = reported?.code;
  adLog("AD_FAILED_TO_LOAD", k, { unit: unitOf(k), code: reported?.code, message: reported?.message ?? (e instanceof Error ? e.message : String(e)) });
}

/** The ad couldn't show: the log line, with the SDK's code when it reported one. */
function logShowFailed(k: Kind) {
  const reported = showError[k];
  delete showError[k];
  adLog("AD_FAILED_TO_SHOW", k, { unit: unitOf(k), place: placeOf[k], code: reported?.code, message: reported?.message });
}

/**
 * After a failed request, no new one for this kind before this time (ms): the retry waits longer
 * each time, and the minute's check below (refreshStale) doesn't go round that wait.
 */
const retryAt: Record<Kind, number> = { rewarded: 0, interstitial: 0, appOpen: 0 };
const waiting = (k: Kind) => Date.now() < retryAt[k];

/**
 * The phone is online again (or the game back on screen): a request that failed for want of the
 * network is tried now instead of after its wait (which grows to minutes). No fill keeps its wait.
 */
function retryNetworkFailures() {
  for (const k of ["rewarded", "interstitial", "appOpen"] as const) {
    if (waiting(k) && failCode[k] === NETWORK_ERROR) retryAt[k] = 0;
  }
}

/** Where the ad on screen of each kind was asked for (for the log). */
const placeOf: Partial<Record<Kind, string>> = {};

/** The consent allows ads to be requested. Nothing is loaded or shown while it doesn't. */
let consentOk = false;
let started = false;
let loading = false;
let failures = 0;
/** The start (consent, SDK) is under way. */
let startingNow = false;

/**
 * Whether a rewarded ad is on its way (the start under way or a request out, for a company that may be
 * shown one): a one-time offer (the offline report, the daily login) says "loading" instead of hiding.
 */
function syncLoading() {
  const on = (startingNow || loading) && getAdNeeds().rewarded && !getAdStatus().ready;
  if (getAdStatus().loading !== on) setAdStatus({ loading: on });
}

/** Loads the next ad; no fill or no network: tries again later, waiting longer each time (up to 5 minutes). */
async function load() {
  if (loading || !consentOk || getAdStatus().ready || waiting("rewarded") || !mayRequest("rewarded")) return;
  loading = true;
  syncLoading();
  adLog("AD_REQUEST_STARTED", "rewarded", { unit });
  try {
    await AdMob.prepareRewardVideoAd({ adId: unit, isTesting: unit === TEST_UNIT });
    loadedAt.rewarded = Date.now();
    failures = 0;
    adLog("AD_LOADED", "rewarded", { unit });
    setAdStatus({ ready: consentOk });
  } catch (e) {
    logLoadFailed("rewarded", e);
    setAdStatus({ ready: false });
    failures = Math.min(failures + 1, 5);
    const wait = Math.min(300, 15 * 2 ** failures) * 1000;
    retryAt.rewarded = Date.now() + wait;
    setTimeout(() => void load(), wait);
  } finally {
    loading = false;
    syncLoading();
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
  if (interstitialLoading || !consentOk || getAdStatus().interstitialReady || waiting("interstitial") || !mayRequest("interstitial")) return;
  interstitialLoading = true;
  adLog("AD_REQUEST_STARTED", "interstitial", { unit: interstitialUnit });
  try {
    await AdMob.prepareInterstitial({ adId: interstitialUnit, isTesting: interstitialUnit === TEST_INTERSTITIAL });
    loadedAt.interstitial = Date.now();
    interstitialFailures = 0;
    adLog("AD_LOADED", "interstitial", { unit: interstitialUnit });
    setAdStatus({ interstitialReady: consentOk });
  } catch (e) {
    logLoadFailed("interstitial", e);
    setAdStatus({ interstitialReady: false });
    interstitialFailures = Math.min(interstitialFailures + 1, 5);
    const wait = Math.min(600, 30 * 2 ** interstitialFailures) * 1000;
    retryAt.interstitial = Date.now() + wait;
    setTimeout(() => void loadInterstitial(), wait);
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
  if (shown) adLog("AD_DISMISSED", "interstitial", { unit: interstitialUnit, place: placeOf.interstitial });
  else logShowFailed("interstitial");
  setAdStatus({ showing: false, interstitialReady: false });
  settle(shown);
  void loadInterstitial();
}

/** Shows the loaded full-screen ad (never over another one). It gives nothing; true once it was shown and closed. */
function showInterstitial(): Promise<boolean> {
  if (!consentOk || open || interstitialSettle || appOpenSettle) return Promise.resolve(false);
  placeOf.interstitial = "map-break";
  adLog("AD_SHOW_REQUESTED", "interstitial", { unit: interstitialUnit, place: placeOf.interstitial });
  if (isStale("interstitial")) {
    adLog("AD_EXPIRED", "interstitial", { unit: interstitialUnit, place: placeOf.interstitial });
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

/**
 * Loads the next App Open ad (a new request each time: scripts/patch-admob.mjs); no fill or no
 * network: again later, waiting longer each time (up to 10 minutes).
 */
async function loadAppOpen() {
  if (appOpenLoading || !consentOk || getAdStatus().appOpenReady || waiting("appOpen") || !mayRequest("appOpen")) return;
  appOpenLoading = true;
  adLog("AD_REQUEST_STARTED", "appOpen", { unit: appOpenUnit });
  try {
    await AdMob.loadAppOpen({ adId: appOpenUnit });
    loadedAt.appOpen = Date.now();
    appOpenFailures = 0;
    adLog("AD_LOADED", "appOpen", { unit: appOpenUnit });
    setAdStatus({ appOpenReady: consentOk });
  } catch (e) {
    logLoadFailed("appOpen", e);
    setAdStatus({ appOpenReady: false });
    appOpenFailures = Math.min(appOpenFailures + 1, 5);
    const wait = Math.min(600, 30 * 2 ** appOpenFailures) * 1000;
    retryAt.appOpen = Date.now() + wait;
    setTimeout(() => void loadAppOpen(), wait);
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
  if (shown) adLog("AD_DISMISSED", "appOpen", { unit: appOpenUnit, place: placeOf.appOpen });
  else logShowFailed("appOpen");
  setAdStatus({ showing: false, appOpenReady: false });
  settle(shown);
  void loadAppOpen();
}

/** Shows the loaded App Open ad (never over another ad). It gives nothing; true once it was shown and closed. */
function showAppOpen(place = "resume"): Promise<boolean> {
  if (!consentOk || open || interstitialSettle || appOpenSettle) return Promise.resolve(false);
  placeOf.appOpen = place;
  adLog("AD_SHOW_REQUESTED", "appOpen", { unit: appOpenUnit, place });
  if (isStale("appOpen")) {
    adLog("AD_EXPIRED", "appOpen", { unit: appOpenUnit, place });
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
  /** The SDK reported a failure before the ad appeared: the wait for it to appear anyway (SHOW_FAIL_GRACE_MS). */
  graceTimer: ReturnType<typeof setTimeout> | null;
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
  adLog("AD_REWARDED", "rewarded", { unit, place: placeOf.rewarded });
  s.onReward();
}

/**
 * The ad closed (or couldn't show): the watch settles a moment later (a reward may come just after), then
 * the next ad loads. `grace`: a failure the SDK reported, which may still be followed by the ad itself.
 */
function closed(failed = false, grace = false) {
  const s = shown;
  if (!s || s.closing) return;
  // On a slow phone the SDK reports "Timeout for show call succeed." as a failure to show
  // while the ad is in fact on screen: only its real close ends it (a next ad loaded
  // meanwhile would be dropped by the plugin when this one closes).
  if (failed && s.visible) return;
  // ...and sometimes just before the ad appears: a moment's wait for it, so the player isn't told
  // "couldn't be shown" over an ad that is playing (the ad appearing ends the wait: Showed)
  if (failed && grace) {
    s.graceTimer ??= setTimeout(() => {
      s.graceTimer = null;
      closed(true);
    }, SHOW_FAIL_GRACE_MS);
    return;
  }
  if (s.graceTimer) clearTimeout(s.graceTimer);
  s.graceTimer = null;
  s.closing = true;
  s.stopGuard?.();
  s.stopGuard = null;
  if (failed) logShowFailed("rewarded");
  else adLog("AD_DISMISSED", "rewarded", { unit, place: placeOf.rewarded });
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
function show(onReward: () => void, place = "offer"): Promise<AdResult> {
  if (open || !consentOk) return Promise.resolve("failed");
  placeOf.rewarded = place;
  adLog("AD_SHOW_REQUESTED", "rewarded", { unit, place });
  if (isStale("rewarded")) {
    adLog("AD_EXPIRED", "rewarded", { unit, place });
    setAdStatus({ ready: false });
    void load();
    return Promise.resolve("failed");
  }
  open = true;
  setAdStatus({ showing: true });
  return new Promise<AdResult>((settle) => {
    const s: Shown = { onReward, settle, rewarded: false, closing: false, settled: false, visible: false, lateClose: false, stopGuard: null, graceTimer: null };
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
  logConsent("CONSENT_INFO", info, "privacy-form");
  setAdStatus({ privacyOptions: String(info.privacyOptionsRequirementStatus) === "REQUIRED" });
  consentOk = info.canRequestAds;
  if (!consentOk) {
    // the ads already loaded go too: none may be shown or requested without the consent
    setAdStatus({ ready: false, interstitialReady: false, appOpenReady: false, loading: false });
    return;
  }
  if (!started) {
    void startAds();
    return;
  }
  void load();
  void loadInterstitial();
  void loadAppOpen();
}

/** Ads loaded long ago are loaded again before Google lets them expire (never while one is on screen: each close loads the next). */
function refreshStale() {
  const a = getAdStatus();
  // nothing in the background: an ad loaded there couldn't be shown (coming back calls this again)
  if (a.showing || !consentOk || !visible()) return;
  if (a.ready && isStale("rewarded")) {
    adLog("AD_EXPIRED", "rewarded", { unit });
    setAdStatus({ ready: false });
  }
  if (a.interstitialReady && isStale("interstitial")) {
    adLog("AD_EXPIRED", "interstitial", { unit: interstitialUnit });
    setAdStatus({ interstitialReady: false });
  }
  if (a.appOpenReady && isStale("appOpen")) {
    adLog("AD_EXPIRED", "appOpen", { unit: appOpenUnit });
    setAdStatus({ appOpenReady: false });
  }
  // each one the game could show and hasn't got loads (the others wait: lib/ads.ts adNeeds)
  void load();
  void loadInterstitial();
  void loadAppOpen();
  syncLoading();
}

let freshTimer: ReturnType<typeof setInterval> | undefined;

let starting: Promise<void> | null = null;
let startFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let listeningOnline = false;

/**
 * The phone is online again: a start that failed is tried at once, and so are the requests that
 * failed for want of the network (they would otherwise wait their growing pause). Listened to once.
 */
function onOnline() {
  if (!started) {
    clearTimeout(retryTimer);
    void startAds();
    return;
  }
  retryNetworkFailures();
  refreshStale();
}

export function startAds(): Promise<void> {
  starting ??= begin().finally(() => {
    if (!started) starting = null;
  });
  return starting;
}

/** The start failed (consent not checkable, the SDK not up): again once the phone is online (onOnline), or a while later (waiting longer each time, up to 10 minutes). */
function retryStart() {
  startFailures = Math.min(startFailures + 1, 5);
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void startAds(), Math.min(600, 20 * 2 ** startFailures) * 1000);
}

/** The consent's answer, in the ad log (what decides whether any ad may be requested on this phone). */
function logConsent(event: "CONSENT_INFO" | "CONSENT_FORM", info: { status?: unknown; canRequestAds?: boolean; isConsentFormAvailable?: boolean; privacyOptionsRequirementStatus?: unknown }, place: string) {
  const note = [`status=${String(info.status)}`, `canRequestAds=${info.canRequestAds}`, info.isConsentFormAvailable === undefined ? "" : `formAvailable=${info.isConsentFormAvailable}`, `privacyOptions=${String(info.privacyOptionsRequirementStatus)}`]
    .filter(Boolean)
    .join(",");
  adLog(event, "consent", { place, note });
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
        if (shown) {
          shown.visible = true;
          // a failure reported just before: the ad did appear after all
          if (shown.graceTimer) clearTimeout(shown.graceTimer);
          shown.graceTimer = null;
        }
        adLog("AD_SHOWED", "rewarded", { unit, place: placeOf.rewarded });
      }));
      added.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, rewarded));
      added.push(
        await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          const s = shown;
          if (s?.settled && s.visible) lateClose(s);
          else closed();
        }),
      );
      const failedToShow = (k: Kind) => (err?: { code?: number; message?: string }) => (showError[k] = { code: err?.code, message: err?.message });
      added.push(
        await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
          failedToShow("rewarded")(err);
          closed(true, true);
        }),
      );
      added.push(await AdMob.addListener(RewardAdPluginEvents.adClicked, () => adLog("AD_CLICKED", "rewarded", { unit, place: placeOf.rewarded })));
      added.push(
        await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
          interstitialVisible = true;
          adLog("AD_SHOWED", "interstitial", { unit: interstitialUnit, place: placeOf.interstitial });
        }),
      );
      added.push(await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => interstitialClosed(true)));
      added.push(
        await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
          failedToShow("interstitial")(err);
          interstitialClosed(false);
        }),
      );
      added.push(
        await AdMob.addListener(AppOpenAdPluginEvents.Opened, () => {
          appOpenVisible = true;
          adLog("AD_SHOWED", "appOpen", { unit: appOpenUnit, place: placeOf.appOpen });
        }),
      );
      added.push(await AdMob.addListener(AppOpenAdPluginEvents.Closed, () => appOpenClosed(true)));
      added.push(
        await AdMob.addListener(AppOpenAdPluginEvents.FailedToShow, (err) => {
          failedToShow("appOpen")(err);
          appOpenClosed(false);
        }),
      );
      // the diagnostics: the SDK's code of a failed request, and the ad's paid event (the plugin calls it
      // "AdImpression", but it is the SDK's OnPaidEvent: its value, which can be missing while the AdMob
      // account's impression-level ad revenue is off; AD_SHOWED is the ad on screen)
      const failedToLoad = (k: Kind) => (err: { code?: number; message?: string }) => (loadError[k] = { code: err?.code, message: err?.message });
      added.push(await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, failedToLoad("rewarded")));
      added.push(await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, failedToLoad("interstitial")));
      added.push(await AdMob.addListener(AppOpenAdPluginEvents.FailedToLoad, failedToLoad("appOpen")));
      const impression = (k: Kind) => (v?: { valueMicros?: number; currencyCode?: string }) =>
        adLog("AD_PAID_EVENT", k, { unit: unitOf(k), place: placeOf[k], note: typeof v?.valueMicros === "number" ? `${(v.valueMicros / 1e6).toFixed(6)} ${v.currencyCode ?? ""}`.trim() : undefined });
      added.push(await AdMob.addListener(RewardAdPluginEvents.AdImpression, impression("rewarded")));
      added.push(await AdMob.addListener(InterstitialAdPluginEvents.AdImpression, impression("interstitial")));
      added.push(await AdMob.addListener(AppOpenAdPluginEvents.AdImpression, impression("appOpen")));
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
    adLog("SDK_INIT_OK", "sdk");
  }
  // a test build (its app id ends in ".debug", like the test APK anyone may download) shows
  // Google's test ads whatever unit it was built with: playing it is never real ad traffic
  if (testBuild) {
    unit = TEST_UNIT;
    interstitialUnit = TEST_INTERSTITIAL;
    appOpenUnit = TEST_APP_OPEN;
    // the CI emulator check's quicker full-screen limits, if it set them (never read in a build for players)
    try {
      quickenAdsForTest(localStorage.getItem(AD_TEST_TIMING_KEY));
    } catch {
      // no storage: the usual limits
    }
  }
}

async function begin() {
  startingNow = true;
  syncLoading();
  try {
    await beginSteps();
  } finally {
    startingNow = false;
    syncLoading();
  }
}

async function beginSteps() {
  enableAdLog();
  registerAdDriver({ show, privacyForm, showInterstitial, showAppOpen });
  if (!listeningOnline && typeof window !== "undefined") {
    listeningOnline = true;
    window.addEventListener("online", onOnline);
  }
  // a test build (its app id ends in ".debug", like the test APK the CI emulator plays) is never real
  // ad traffic: its consent check pretends to be outside the regulated regions. Google treats only
  // emulators and registered test devices that way, so a phone running a test build is unaffected.
  // Without this the emulator, run from a data centre in the EEA, waited for a consent form its
  // browser can't show and never got to the ad (the Android workflow's "rewarded ad" check).
  const testBuild = !!(await App.getInfo().catch(() => null))?.id.endsWith(".debug");
  try {
    let info = await AdMob.requestConsentInfo(testBuild ? { debugGeography: AdmobConsentDebugGeography.OTHER } : undefined);
    logConsent("CONSENT_INFO", info, "start");
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
      info = await AdMob.showConsentForm();
      logConsent("CONSENT_FORM", info, "start");
    }
    // (the plugin declares this enum but doesn't export it: compared by its value)
    setAdStatus({ privacyOptions: String(info.privacyOptionsRequirementStatus) === "REQUIRED" });
    consentOk = info.canRequestAds;
    // no ad may be requested on this phone (the log says why: CONSENT_INFO / CONSENT_FORM)
    if (!consentOk) return;
  } catch (e) {
    adLog("CONSENT_ERROR", "consent", { message: e instanceof Error ? e.message : String(e) });
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
  } catch (e) {
    // the SDK didn't start: again later, not a session without ads
    adLog("SDK_INIT_FAILED", "sdk", { message: e instanceof Error ? e.message : String(e) });
    retryStart();
    return;
  }
  started = true;
  startFailures = 0;
  // only what the game could show is requested (lib/ads.ts adNeeds); when that changes (the game
  // loaded, the company old enough for full-screen ads), what is now needed loads
  refreshStale();
  onAdNeeds(refreshStale);
  freshTimer ??= setInterval(refreshStale, 60_000);
  // back on screen: what is missing loads (a request that failed for want of the network, at once)
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      retryNetworkFailures();
      refreshStale();
    });
}
