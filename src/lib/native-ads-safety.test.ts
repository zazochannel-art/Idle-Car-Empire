import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake AdMob plugin the test steers: the consent it answers, what fails, and the ad events it plays.
const h = vi.hoisted(() => ({
  listeners: new Map<string, (data?: unknown) => void>(),
  adds: 0,
  consent: { status: "NOT_REQUIRED", canRequestAds: true, isConsentFormAvailable: false, privacyOptionsRequirementStatus: "REQUIRED" } as Record<string, unknown>,
  consentError: false,
  initFailures: 0,
  prepareFails: false,
  rewardPrepares: 0,
  interstitialPrepares: 0,
  appOpenLoads: 0,
  rewardShows: 0,
  interstitialShows: 0,
  appOpenShows: 0,
  online: vi.fn(),
}));
vi.mock("@capacitor/app", () => ({ App: { getInfo: async () => ({ id: "com.zazochannel.idlecarempire" }) } }));
vi.mock("@capacitor-community/admob", () => ({
  AdmobConsentStatus: { REQUIRED: "REQUIRED" },
  AdmobConsentDebugGeography: { OTHER: 4 },
  MaxAdContentRating: { Teen: "Teen" },
  AppOpenAdPluginEvents: { Opened: "appOpenOpened", Closed: "appOpenClosed", FailedToShow: "appOpenFailedToShow" },
  InterstitialAdPluginEvents: { Showed: "interstitialShowed", Dismissed: "interstitialDismissed", FailedToShow: "interstitialFailedToShow" },
  RewardAdPluginEvents: { Showed: "showed", Rewarded: "rewarded", Dismissed: "dismissed", FailedToShow: "failedToShow" },
  AdMob: {
    requestConsentInfo: async () => {
      if (h.consentError) throw new Error("offline");
      return { ...h.consent };
    },
    showConsentForm: async () => ({ ...h.consent, status: "OBTAINED" }),
    showPrivacyOptionsForm: async () => {},
    initialize: async () => {
      if (h.initFailures > 0) {
        h.initFailures--;
        throw new Error("SDK not ready");
      }
    },
    addListener: async (event: string, fn: (data?: unknown) => void) => {
      h.adds++;
      h.listeners.set(event, fn);
      return { remove: async () => void h.listeners.delete(event) };
    },
    prepareRewardVideoAd: async () => {
      h.rewardPrepares++;
      if (h.prepareFails) throw new Error("no fill");
    },
    prepareInterstitial: async () => {
      h.interstitialPrepares++;
      if (h.prepareFails) throw new Error("no fill");
    },
    loadAppOpen: async () => {
      h.appOpenLoads++;
      if (h.prepareFails) throw new Error("no fill");
    },
    showRewardVideoAd: () => {
      h.rewardShows++;
      return new Promise(() => {});
    },
    showInterstitial: () => {
      h.interstitialShows++;
      return new Promise(() => {});
    },
    showAppOpen: () => {
      h.appOpenShows++;
      return new Promise(() => {});
    },
  },
}));

type NativeAds = typeof import("./native-ads");
type Ads = typeof import("./ads");
let native: NativeAds;
let ads: Ads;
const emit = (event: string) => h.listeners.get(event)?.({});
const minutes = (n: number) => vi.advanceTimersByTimeAsync(n * 60_000);
const seconds = (n: number) => vi.advanceTimersByTimeAsync(n * 1000);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { addEventListener: h.online });
  h.listeners.clear();
  Object.assign(h, { adds: 0, consentError: false, initFailures: 0, prepareFails: false, rewardPrepares: 0, interstitialPrepares: 0, appOpenLoads: 0, rewardShows: 0, interstitialShows: 0, appOpenShows: 0 });
  h.consent.canRequestAds = true;
  h.online.mockClear();
  // each test starts the ads from scratch
  vi.resetModules();
  native = await import("./native-ads");
  ads = await import("./ads");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the consent", () => {
  it("no consent: nothing is loaded, shown or offered", async () => {
    h.consent.canRequestAds = false;
    await native.startAds();
    await seconds(0);
    expect(h.rewardPrepares + h.interstitialPrepares + h.appOpenLoads).toBe(0);
    expect(ads.getAdStatus()).toMatchObject({ ready: false, interstitialReady: false, appOpenReady: false });
    expect(await ads.watchAd(vi.fn())).toBe("failed");
  });

  it("withdrawn in Settings: the loaded ads go, and none is requested again", async () => {
    // an ad that couldn't load is waiting for its retry when the player withdraws
    h.prepareFails = true;
    await native.startAds();
    await seconds(0);
    h.prepareFails = false;
    h.consent.canRequestAds = false;
    ads.setAdStatus({ ready: true, interstitialReady: true, appOpenReady: true });
    await ads.showAdPrivacyForm();
    expect(ads.getAdStatus()).toMatchObject({ ready: false, interstitialReady: false, appOpenReady: false });
    const before = h.rewardPrepares + h.interstitialPrepares + h.appOpenLoads;
    await minutes(30);
    expect(h.rewardPrepares + h.interstitialPrepares + h.appOpenLoads).toBe(before);
    expect(ads.getAdStatus()).toMatchObject({ ready: false, interstitialReady: false, appOpenReady: false });
    // and a full-screen ad that was ready a moment ago is not shown
    ads.setAdStatus({ interstitialReady: true });
    await minutes(10);
    expect(await ads.maybeShowInterstitial(ads.INTERSTITIAL.minPlayTime, true, 0)).toBe(false);
    expect(h.interstitialShows).toBe(0);
  });

  it("given later (a phone that had refused): the ads start, and come back after a withdrawal", async () => {
    h.consent.canRequestAds = false;
    await native.startAds();
    h.consent.canRequestAds = true;
    await ads.showAdPrivacyForm();
    await seconds(0);
    expect(ads.getAdStatus()).toMatchObject({ ready: true, interstitialReady: true, appOpenReady: true });
    // withdrawn, then given again
    h.consent.canRequestAds = false;
    await ads.showAdPrivacyForm();
    expect(ads.getAdStatus().ready).toBe(false);
    h.consent.canRequestAds = true;
    await ads.showAdPrivacyForm();
    await seconds(0);
    expect(ads.getAdStatus()).toMatchObject({ ready: true, interstitialReady: true, appOpenReady: true });
  });
});

describe("a start that fails", () => {
  it("the SDK not starting is tried again (once, with its listeners added once)", async () => {
    h.initFailures = 1;
    await native.startAds();
    await seconds(0);
    expect(ads.getAdStatus().ready).toBe(false);
    await minutes(2);
    await seconds(0);
    expect(ads.getAdStatus().ready).toBe(true);
    // ten ad events, added once: a second set would report every close twice
    expect(h.adds).toBe(10);
  });

  it("the consent not checkable: one wait for the network, however many times it fails", async () => {
    h.consentError = true;
    await native.startAds();
    await minutes(11);
    await minutes(11);
    expect(h.online).toHaveBeenCalledTimes(1);
    h.consentError = false;
    await minutes(11);
    await seconds(0);
    expect(ads.getAdStatus().ready).toBe(true);
  });
});

describe("ads that were loaded long ago", () => {
  beforeEach(async () => {
    await native.startAds();
    await seconds(0);
  });

  it("are loaded again before Google lets them expire, and stay offered", async () => {
    expect(h.rewardPrepares).toBe(1);
    await minutes(56);
    expect(h.rewardPrepares).toBe(2);
    expect(h.interstitialPrepares).toBe(2);
    // App Open ads last 4 hours
    expect(h.appOpenLoads).toBe(1);
    expect(ads.getAdStatus()).toMatchObject({ ready: true, interstitialReady: true, appOpenReady: true });
    await minutes(4 * 60);
    expect(h.appOpenLoads).toBe(2);
    expect(ads.getAdStatus().appOpenReady).toBe(true);
  });

  it("one that expired anyway (the app was frozen) isn't shown: a new one is loaded", async () => {
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect(await ads.watchAd(vi.fn())).toBe("failed");
    expect(h.rewardShows).toBe(0);
    await seconds(0);
    expect(h.rewardPrepares).toBe(2);
    expect(ads.getAdStatus().ready).toBe(true);
  });
});

describe("an ad whose close never comes", () => {
  beforeEach(async () => {
    await native.startAds();
    await seconds(0);
  });

  it("rewarded: not appearing in time ends the wait, and the next ad can be watched", async () => {
    const result = ads.watchAd(vi.fn());
    await seconds(0);
    expect(ads.getAdStatus().showing).toBe(true);
    await seconds(22);
    expect(await result).toBe("failed");
    expect(ads.getAdStatus().showing).toBe(false);
    await seconds(0);
    expect(ads.getAdStatus().ready).toBe(true);
    const again = ads.watchAd(vi.fn());
    expect(h.rewardShows).toBe(2);
    emit("dismissed");
    await seconds(2);
    expect(await again).toBe("closed");
  });

  it("rewarded: one that appeared and never closed ends after a long time, the reward still counting", async () => {
    const reward = vi.fn();
    const result = ads.watchAd(reward);
    emit("showed");
    await minutes(14);
    expect(ads.getAdStatus().showing).toBe(true);
    await minutes(2);
    expect(await result).toBe("closed");
    expect(ads.getAdStatus().showing).toBe(false);
    emit("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
  });

  it("full-screen: not appearing in time ends the wait", async () => {
    await minutes(10);
    const shown = ads.maybeShowInterstitial(ads.INTERSTITIAL.minPlayTime, true, 0);
    await seconds(0);
    expect(h.interstitialShows).toBe(1);
    expect(ads.getAdStatus().showing).toBe(true);
    await seconds(22);
    expect(await shown).toBe(false);
    expect(ads.getAdStatus().showing).toBe(false);
  });

  it("App Open: one that appeared and never closed ends after a long time", async () => {
    await minutes(10);
    const shown = ads.maybeShowAppOpen(ads.INTERSTITIAL.minPlayTime, true, ads.APP_OPEN.minAwayMs, () => false);
    await seconds(0);
    expect(h.appOpenShows).toBe(1);
    emit("appOpenOpened");
    await seconds(30);
    expect(ads.getAdStatus().showing).toBe(true);
    await minutes(16);
    expect(await shown).toBe(true);
    expect(ads.getAdStatus().showing).toBe(false);
  });
});

describe("the SDK's 'failed to show' that comes before the ad appears", () => {
  it("the ad that shows anyway still rewards once, and its late close loads the ad the plugin dropped", async () => {
    await native.startAds();
    await seconds(0);
    const reward = vi.fn();
    const result = ads.watchAd(reward);
    // "Timeout for show call succeed.", before the ad was on screen
    emit("failedToShow");
    await seconds(2);
    expect(await result).toBe("failed");
    await seconds(0);
    expect(h.rewardPrepares).toBe(2);
    // the ad then shows, is watched, and closes: the plugin drops the ad prepared meanwhile
    emit("showed");
    emit("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
    emit("dismissed");
    expect(ads.getAdStatus().ready).toBe(false);
    await seconds(0);
    expect(h.rewardPrepares).toBe(3);
    expect(ads.getAdStatus().ready).toBe(true);
  });
});
