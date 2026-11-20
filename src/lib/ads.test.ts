import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_OPEN, appOpenBlock, appPaused, appResumed, canWatch, INTERSTITIAL, interstitialBlock, maybeShowAppOpen, maybeShowInterstitial, registerAdDriver, setAdFree, setAdStatus, watchAd, type AdStatus, type AppOpenContext, type InterstitialContext } from "./ads";

describe("watching an ad", () => {
  it("gives one reward per ad, even when the ad network reports it twice", async () => {
    registerAdDriver({
      show: async (onReward) => {
        onReward();
        onReward();
        return "rewarded";
      },
      privacyForm: async () => {},
      showInterstitial: async () => false,
      showAppOpen: async () => false,
    });
    setAdStatus({ ready: true });
    const reward = vi.fn();
    expect(await watchAd(reward)).toBe("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
    // the next ad has its own reward
    expect(await watchAd(reward)).toBe("rewarded");
    expect(reward).toHaveBeenCalledTimes(2);
  });

  it("no ad ready: nothing is shown", async () => {
    setAdStatus({ ready: false });
    const reward = vi.fn();
    expect(await watchAd(reward)).toBe("failed");
    expect(reward).not.toHaveBeenCalled();
  });

  it("ad-free rewards: the reward at once, no ad shown", async () => {
    const show = vi.fn(async () => "rewarded" as const);
    registerAdDriver({ show, privacyForm: async () => {}, showInterstitial: async () => false, showAppOpen: async () => false });
    setAdStatus({ ready: false, showing: false });
    setAdFree(true);
    const reward = vi.fn();
    expect(await watchAd(reward)).toBe("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
    setAdFree(false);
    expect(await watchAd(reward)).toBe("failed");
    expect(reward).toHaveBeenCalledTimes(1);
  });

  it("an offer can be taken with an ad loaded and none on screen, or with ad-free rewards", () => {
    const off = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: false, loading: false };
    expect(canWatch(off)).toBe(false);
    // one on its way is not one to watch yet
    expect(canWatch({ ...off, loading: true })).toBe(false);
    expect(canWatch({ ...off, ready: true })).toBe(true);
    expect(canWatch({ ...off, ready: true, showing: true })).toBe(false);
    expect(canWatch({ ...off, adFree: true })).toBe(true);
  });
});

describe("full-screen ads (no reward)", () => {
  const status: AdStatus = { ready: true, showing: false, privacyOptions: false, adFree: false, interstitialReady: true, appOpenReady: true, loading: false };
  const ctx: InterstitialContext = { now: 10_000_000, playTime: INTERSTITIAL.minPlayTime, firstCar: true, lastAdAt: 0, openedAt: 0 };

  it("may show when everything allows", () => {
    expect(interstitialBlock(status, ctx)).toBeNull();
  });

  it("never with the ad-free rewards purchase, with no ad loaded or one on screen", () => {
    expect(interstitialBlock({ ...status, adFree: true }, ctx)).toBe("adFree");
    expect(interstitialBlock({ ...status, interstitialReady: false }, ctx)).toBe("notReady");
    expect(interstitialBlock({ ...status, showing: true }, ctx)).toBe("notReady");
  });

  it("not in a young game or a just-opened app", () => {
    expect(interstitialBlock(status, { ...ctx, playTime: INTERSTITIAL.minPlayTime - 1 })).toBe("young");
    // an hour of play but no car built yet: still young
    expect(interstitialBlock(status, { ...ctx, firstCar: false })).toBe("young");
    expect(interstitialBlock(status, { ...ctx, openedAt: ctx.now - INTERSTITIAL.minOpenMs + 1 })).toBe("young");
  });

  it("a pause after any ad, and no limit a day", () => {
    expect(interstitialBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs + 1 })).toBe("pause");
    expect(interstitialBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs })).toBeNull();
  });
});

describe("App Open ads", () => {
  const status: AdStatus = { ready: true, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: true, loading: false };
  const ctx: AppOpenContext = { now: 10_000_000, playTime: INTERSTITIAL.minPlayTime, firstCar: true, lastAdAt: 0, openedAt: 0, awayMs: APP_OPEN.minAwayMs };

  it("may show when the player is back after a while", () => {
    expect(appOpenBlock(status, ctx)).toBeNull();
  });

  it("never with the ad-free rewards purchase, with no ad loaded or one on screen", () => {
    expect(appOpenBlock({ ...status, adFree: true }, ctx)).toBe("adFree");
    expect(appOpenBlock({ ...status, appOpenReady: false }, ctx)).toBe("notReady");
    expect(appOpenBlock({ ...status, showing: true }, ctx)).toBe("notReady");
  });

  it("not in a young company (so not on the first opens), nor after a short absence", () => {
    expect(appOpenBlock(status, { ...ctx, playTime: INTERSTITIAL.minPlayTime - 1 })).toBe("young");
    expect(appOpenBlock(status, { ...ctx, playTime: 0 })).toBe("young");
    expect(appOpenBlock(status, { ...ctx, firstCar: false })).toBe("young");
    expect(appOpenBlock(status, { ...ctx, awayMs: APP_OPEN.minAwayMs - 1 })).toBe("short");
  });

  it("the pause after any ad, and no limit a day", () => {
    expect(appOpenBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs + 1 })).toBe("pause");
  });
});

describe("an ad that wasn't shown after all", () => {
  const store = new Map<string, string>();
  // (the module keeps the time of the last ad: each test starts on a later day)
  let day = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    setAdFree(false);
    setAdStatus({ ready: true, showing: false, interstitialReady: true, appOpenReady: true });
    // the app has been open a while
    vi.setSystemTime(Date.now() + ++day * 24 * 3600_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a full-screen one that didn't show starts no pause", async () => {
    const showInterstitial = vi.fn(async () => false);
    registerAdDriver({ show: async () => "failed", privacyForm: async () => {}, showInterstitial, showAppOpen: async () => false });
    for (let i = 0; i < 4; i++) expect(await maybeShowInterstitial(INTERSTITIAL.minPlayTime, true, 0)).toBe(false);
    // every try reached the driver: none was held back by a pause
    expect(showInterstitial).toHaveBeenCalledTimes(4);
    // and the next one that does show is not refused
    registerAdDriver({ show: async () => "failed", privacyForm: async () => {}, showInterstitial: async () => true, showAppOpen: async () => false });
    expect(await maybeShowInterstitial(INTERSTITIAL.minPlayTime, true, 0)).toBe(true);
    // ...and it does start the pause
    expect(await maybeShowInterstitial(INTERSTITIAL.minPlayTime, true, 0)).toBe(false);
  });

  it("an App Open one that didn't show starts no pause either", async () => {
    const showAppOpen = vi.fn(async () => false);
    registerAdDriver({ show: async () => "failed", privacyForm: async () => {}, showInterstitial: async () => false, showAppOpen });
    for (let i = 0; i < 4; i++) expect(await maybeShowAppOpen(INTERSTITIAL.minPlayTime, true, APP_OPEN.minAwayMs, () => false)).toBe(false);
    expect(showAppOpen).toHaveBeenCalledTimes(4);
    registerAdDriver({ show: async () => "failed", privacyForm: async () => {}, showInterstitial: async () => false, showAppOpen: async () => true });
    expect(await maybeShowAppOpen(INTERSTITIAL.minPlayTime, true, APP_OPEN.minAwayMs, () => false)).toBe(true);
  });
});

describe("no limit a day", () => {
  it("as many as the pauses allow: an ad every 8 minutes, all day", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    setAdFree(false);
    setAdStatus({ ready: true, showing: false, interstitialReady: true, appOpenReady: true });
    registerAdDriver({ show: async () => "failed", privacyForm: async () => {}, showInterstitial: async () => true, showAppOpen: async () => true });
    vi.setSystemTime(Date.now() + 100 * 24 * 3600_000);
    let shown = 0;
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(INTERSTITIAL.gapMs + 1);
      if (await maybeShowInterstitial(INTERSTITIAL.minPlayTime, true, 0)) shown++;
    }
    expect(shown).toBe(30);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe("the pause after a rewarded ad", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    setAdFree(false);
    setAdStatus({ ready: true, showing: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  const driver = (result: "rewarded" | "failed") => ({
    show: async (onReward: () => void) => {
      if (result === "rewarded") onReward();
      return result;
    },
    privacyForm: async () => {},
    showInterstitial: async () => false,
    showAppOpen: async () => false,
  });

  it("is kept on the phone, so a restart doesn't end it", async () => {
    registerAdDriver(driver("rewarded"));
    expect(await watchAd(() => {})).toBe("rewarded");
    expect(JSON.parse(store.get("ice.interstitial") ?? "null").last).toBeGreaterThan(0);
  });

  it("is not started by an ad that couldn't be shown", async () => {
    registerAdDriver(driver("failed"));
    store.set("ice.interstitial", JSON.stringify({ last: 1234 }));
    expect(await watchAd(() => {})).toBe("failed");
    expect(JSON.parse(store.get("ice.interstitial")!).last).toBe(1234);
  });

  it("an ad network that throws counts as a failed ad", async () => {
    registerAdDriver({ ...driver("failed"), show: async () => Promise.reject(new Error("boom")) });
    expect(await watchAd(() => {})).toBe("failed");
  });
});

describe("which ads to load", () => {
  it("rewarded for every company without ad-free; full-screen only near the age they may show at", async () => {
    const { adNeeds, INTERSTITIAL, FULL_SCREEN_PRELOAD_SECONDS } = await import("./ads");
    expect(adNeeds(false, 0, false)).toEqual({ rewarded: true, fullScreen: false });
    // the hour of play but no first car: never shown, so never loaded
    expect(adNeeds(false, 2 * 3600, false)).toEqual({ rewarded: true, fullScreen: false });
    expect(adNeeds(false, INTERSTITIAL.minPlayTime - FULL_SCREEN_PRELOAD_SECONDS - 1, true).fullScreen).toBe(false);
    expect(adNeeds(false, INTERSTITIAL.minPlayTime - FULL_SCREEN_PRELOAD_SECONDS, true).fullScreen).toBe(true);
    expect(adNeeds(true, 10 * 3600, true)).toEqual({ rewarded: false, fullScreen: false });
  });
});

describe("a test build's quicker full-screen limits (the CI emulator check)", () => {
  it("takes only the numbers it knows, and nothing that isn't one", async () => {
    vi.resetModules();
    const ads = await import("./ads");
    const before = { ...ads.INTERSTITIAL };
    ads.quickenAdsForTest(null);
    ads.quickenAdsForTest("not json");
    ads.quickenAdsForTest(JSON.stringify({ minPlayTime: 0, chance: "1", gapMs: -5 }));
    expect(ads.INTERSTITIAL).toEqual(before);
    ads.quickenAdsForTest(JSON.stringify({ minOpenMs: 0, gapMs: 0, chance: 1, minAwayMs: 20_000 }));
    expect(ads.INTERSTITIAL).toMatchObject({ minOpenMs: 0, gapMs: 0, chance: 1, minPlayTime: before.minPlayTime, delayMs: before.delayMs });
    expect(ads.APP_OPEN.minAwayMs).toBe(20_000);
    vi.resetModules();
  });
});

describe("the time away, for the App Open ad as the game comes back", () => {
  afterEach(() => setAdStatus({ showing: false }));

  it("leaving the game counts, once", () => {
    setAdStatus({ showing: false });
    appPaused(1_000);
    expect(appResumed(1_000 + APP_OPEN.minAwayMs)).toBe(APP_OPEN.minAwayMs);
    // a resume with no pause before it (the app opening) is no time away
    expect(appResumed(2_000_000)).toBeNull();
  });

  it("going under one of its own full-screen ads is no time away: no App Open ad straight after an ad (seen on the CI emulator)", () => {
    // the interstitial (or rewarded, or App Open) ad is on screen: Android pauses the game under it
    setAdStatus({ showing: true });
    appPaused(1_000);
    setAdStatus({ showing: false });
    // the ad closed half an hour later (the player had tapped it and stayed in the store)
    expect(appResumed(1_000 + 30 * 60_000)).toBeNull();
  });
});
