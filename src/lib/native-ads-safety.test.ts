import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake AdMob plugin the test steers: the consent it answers, what fails, and the ad events it plays.
const h = vi.hoisted(() => ({
  listeners: new Map<string, (data?: unknown) => void>(),
  adds: 0,
  consent: { status: "NOT_REQUIRED", canRequestAds: true, isConsentFormAvailable: false, privacyOptionsRequirementStatus: "REQUIRED" } as Record<string, unknown>,
  consentError: false,
  initFailures: 0,
  prepareFails: false,
  /** The SDK's code for a failed request (2: no network, 3: no fill). */
  failCode: 3,
  /** The consent's answer comes when this is called (null: at once). */
  consentGate: null as null | Promise<void>,
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
  AppOpenAdPluginEvents: { Opened: "appOpenOpened", Closed: "appOpenClosed", FailedToShow: "appOpenFailedToShow", FailedToLoad: "appOpenFailedToLoad", AdImpression: "appOpenImpression" },
  InterstitialAdPluginEvents: { Showed: "interstitialShowed", Dismissed: "interstitialDismissed", FailedToShow: "interstitialFailedToShow", FailedToLoad: "interstitialFailedToLoad", AdImpression: "interstitialImpression" },
  RewardAdPluginEvents: { Showed: "showed", Rewarded: "rewarded", Dismissed: "dismissed", FailedToShow: "failedToShow", FailedToLoad: "failedToLoad", AdImpression: "impression", adClicked: "clicked" },
  AdMob: {
    requestConsentInfo: async () => {
      if (h.consentGate) await h.consentGate;
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
      if (h.prepareFails) {
        h.listeners.get("failedToLoad")?.({ code: h.failCode, message: "failed" });
        throw new Error("failed");
      }
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
/** The phone coming back online (the "online" listener the ads added to the window). */
const goOnline = () => (h.online.mock.calls.find((c) => c[0] === "online")?.[1] as (() => void) | undefined)?.();
const minutes = (n: number) => vi.advanceTimersByTimeAsync(n * 60_000);
const seconds = (n: number) => vi.advanceTimersByTimeAsync(n * 1000);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { addEventListener: h.online });
  h.listeners.clear();
  Object.assign(h, { adds: 0, consentError: false, consentGate: null, initFailures: 0, prepareFails: false, failCode: 3, rewardPrepares: 0, interstitialPrepares: 0, appOpenLoads: 0, rewardShows: 0, interstitialShows: 0, appOpenShows: 0 });
  h.consent.canRequestAds = true;
  h.online.mockClear();
  // each test starts the ads from scratch
  vi.resetModules();
  native = await import("./native-ads");
  ads = await import("./ads");
  // a company that may be shown every kind of ad (lib/ads.ts adNeeds)
  ads.setAdNeeds({ rewarded: true, fullScreen: true });
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
    // seventeen ad events (the shows and closes, plus each kind's load failure and paid event and the
    // rewarded ad's click, for the ad log), added once: a second set would report every close twice
    expect(h.adds).toBe(17);
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

describe("a build for players", () => {
  it("never takes the CI emulator's quicker full-screen limits, even if they are on the phone", async () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === ads.AD_TEST_TIMING_KEY ? JSON.stringify({ minOpenMs: 0, gapMs: 0, chance: 1, minAwayMs: 0 }) : null), setItem: () => {} });
    const before = { interstitial: { ...ads.INTERSTITIAL }, appOpen: { ...ads.APP_OPEN } };
    await native.startAds();
    await seconds(0);
    expect(ads.INTERSTITIAL).toEqual(before.interstitial);
    expect(ads.APP_OPEN).toEqual(before.appOpen);
  });
});

describe("a rewarded ad on its way", () => {
  it("the start and the request say so (a one-time offer shows 'loading'), the ad loaded ends it", async () => {
    let answer = () => {};
    h.consentGate = new Promise<void>((r) => (answer = r));
    const start = native.startAds();
    await seconds(0);
    expect(ads.getAdStatus()).toMatchObject({ loading: true, ready: false });
    answer();
    await start;
    await seconds(0);
    expect(ads.getAdStatus()).toMatchObject({ loading: false, ready: true });
  });

  it("not when the consent refuses ads, a request fails, or the company has ad-free rewards", async () => {
    h.consent.canRequestAds = false;
    await native.startAds();
    await seconds(0);
    expect(ads.getAdStatus().loading).toBe(false);
    vi.resetModules();
    native = await import("./native-ads");
    ads = await import("./ads");
    ads.setAdNeeds({ rewarded: true, fullScreen: false });
    h.consent.canRequestAds = true;
    h.prepareFails = true;
    await native.startAds();
    await seconds(0);
    expect(ads.getAdStatus()).toMatchObject({ loading: false, ready: false });
    vi.resetModules();
    native = await import("./native-ads");
    ads = await import("./ads");
    ads.setAdNeeds({ rewarded: false, fullScreen: false });
    h.prepareFails = false;
    let answer = () => {};
    h.consentGate = new Promise<void>((r) => (answer = r));
    const start = native.startAds();
    await seconds(0);
    expect(ads.getAdStatus().loading).toBe(false);
    answer();
    await start;
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

describe("the SDK's 'failed to show' that comes after the ad is on screen", () => {
  it("App Open: the ad stays up (and the game keeps waiting) until its real close", async () => {
    await native.startAds();
    await minutes(10);
    const shown = ads.maybeShowAppOpen(ads.INTERSTITIAL.minPlayTime, true, ads.APP_OPEN.minAwayMs, () => false);
    await seconds(0);
    emit("appOpenOpened");
    // "Timeout for show call succeed.", seen on the CI emulator 0.5 s after the ad appeared
    emit("appOpenFailedToShow");
    await seconds(1);
    expect(ads.getAdStatus().showing).toBe(true);
    const loads = h.appOpenLoads;
    emit("appOpenClosed");
    expect(await shown).toBe(true);
    expect(ads.getAdStatus().showing).toBe(false);
    await seconds(1);
    expect(h.appOpenLoads).toBeGreaterThanOrEqual(loads);
  });

  it("full-screen: the same", async () => {
    await native.startAds();
    await minutes(10);
    const shown = ads.maybeShowInterstitial(ads.INTERSTITIAL.minPlayTime, true, 0);
    await seconds(0);
    emit("interstitialShowed");
    emit("interstitialFailedToShow");
    await seconds(1);
    expect(ads.getAdStatus().showing).toBe(true);
    emit("interstitialDismissed");
    expect(await shown).toBe(true);
    expect(ads.getAdStatus().showing).toBe(false);
  });

  it("one that fails before it appears still ends the wait", async () => {
    await native.startAds();
    await minutes(10);
    const shown = ads.maybeShowAppOpen(ads.INTERSTITIAL.minPlayTime, true, ads.APP_OPEN.minAwayMs, () => false);
    await seconds(0);
    emit("appOpenFailedToShow");
    expect(await shown).toBe(false);
    expect(ads.getAdStatus().showing).toBe(false);
  });
});

describe("the SDK's 'failed to show' that comes before the ad appears", () => {
  it("an ad that appears a moment later is watched like any other: no 'couldn't be shown' over it", async () => {
    await native.startAds();
    await seconds(0);
    const reward = vi.fn();
    let settled: string | undefined;
    const result = ads.watchAd(reward).then((r) => (settled = r));
    // "Timeout for show call succeed.", before the ad was on screen
    emit("failedToShow");
    await seconds(2);
    expect(settled).toBeUndefined();
    expect(ads.getAdStatus().showing).toBe(true);
    // the ad appears, is watched to the end and closed
    emit("showed");
    await seconds(10);
    expect(settled).toBeUndefined();
    emit("rewarded");
    emit("dismissed");
    await seconds(2);
    expect(await result).toBe("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
  });

  it("one that doesn't appear within the grace is failed", async () => {
    await native.startAds();
    await seconds(0);
    const result = ads.watchAd(vi.fn());
    emit("failedToShow");
    await seconds(6);
    expect(await result).toBe("failed");
    expect(ads.getAdStatus().showing).toBe(false);
  });

  it("the ad that shows anyway after that still rewards once, and its late close loads the ad the plugin dropped", async () => {
    await native.startAds();
    await seconds(0);
    const reward = vi.fn();
    const result = ads.watchAd(reward);
    // "Timeout for show call succeed.", before the ad was on screen, and the ad not there for a while
    emit("failedToShow");
    await seconds(6);
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

describe("what is requested (only ads the game could show)", () => {
  const loads = () => ({ rewarded: h.rewardPrepares, interstitial: h.interstitialPrepares, appOpen: h.appOpenLoads });

  it("a young company: only the rewarded ad; the full-screen ones once it nears the hour", async () => {
    ads.setAdNeeds(ads.adNeeds(false, 10 * 60, false));
    await native.startAds();
    await seconds(0);
    expect(loads()).toEqual({ rewarded: 1, interstitial: 0, appOpen: 0 });
    // 40 minutes of the minute's checks: still nothing more (the rewarded ad loaded is kept until it nears expiry)
    await minutes(40);
    expect(loads()).toEqual({ rewarded: 1, interstitial: 0, appOpen: 0 });
    // its first car built and 55 minutes played: the full-screen ads load, once
    ads.setAdNeeds(ads.adNeeds(false, ads.INTERSTITIAL.minPlayTime - ads.FULL_SCREEN_PRELOAD_SECONDS, true));
    await seconds(0);
    expect(loads()).toEqual({ rewarded: 1, interstitial: 1, appOpen: 1 });
    await minutes(5);
    expect(loads()).toEqual({ rewarded: 1, interstitial: 1, appOpen: 1 });
  });

  it("ad-free rewards: nothing is ever requested", async () => {
    ads.setAdNeeds(ads.adNeeds(true, 10 * 3600, true));
    await native.startAds();
    await minutes(120);
    expect(loads()).toEqual({ rewarded: 0, interstitial: 0, appOpen: 0 });
  });

  it("no network: back online, the failed request is tried at once (no fill keeps its wait)", async () => {
    h.prepareFails = true;
    h.failCode = 2;
    await native.startAds();
    await seconds(0);
    await minutes(4);
    // tries at 0, 30 s, 1 min 30, 3 min 30: the next one would wait 4 minutes more
    expect(h.rewardPrepares).toBe(4);
    h.prepareFails = false;
    goOnline();
    await seconds(0);
    expect(h.rewardPrepares).toBe(5);
    expect(ads.getAdStatus().ready).toBe(true);
  });

  it("no fill: coming online doesn't go round the wait", async () => {
    h.prepareFails = true;
    h.failCode = 3;
    await native.startAds();
    await seconds(0);
    expect(h.rewardPrepares).toBe(1);
    goOnline();
    await seconds(0);
    expect(h.rewardPrepares).toBe(1);
  });

  it("no fill: the minute's check doesn't go round the wait before the next try", async () => {
    h.prepareFails = true;
    await native.startAds();
    await seconds(0);
    // tries at 0, 30 s, 1 min 30, 3 min 30 and 7 min 30 (each wait twice the one before)
    await minutes(10);
    expect(h.rewardPrepares).toBe(5);
  });

  it("in the background nothing is requested; back on screen, what is missing loads", async () => {
    let onVisible: (() => void) | undefined;
    const doc = { visibilityState: "hidden", addEventListener: (_: string, fn: () => void) => (onVisible = fn) };
    vi.stubGlobal("document", doc);
    await native.startAds();
    await minutes(10);
    expect(loads()).toEqual({ rewarded: 0, interstitial: 0, appOpen: 0 });
    doc.visibilityState = "visible";
    onVisible?.();
    await seconds(0);
    expect(loads()).toEqual({ rewarded: 1, interstitial: 1, appOpen: 1 });
  });
});
