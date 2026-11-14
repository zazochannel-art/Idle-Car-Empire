import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_OPEN, appOpenBlock, canWatch, INTERSTITIAL, interstitialBlock, maybeShowAppOpen, maybeShowInterstitial, registerAdDriver, setAdFree, setAdStatus, watchAd, type AdStatus, type AppOpenContext, type InterstitialContext } from "./ads";

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
    const off = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: false };
    expect(canWatch(off)).toBe(false);
    expect(canWatch({ ...off, ready: true })).toBe(true);
    expect(canWatch({ ...off, ready: true, showing: true })).toBe(false);
    expect(canWatch({ ...off, adFree: true })).toBe(true);
  });
});

describe("full-screen ads (no reward)", () => {
  const status: AdStatus = { ready: true, showing: false, privacyOptions: false, adFree: false, interstitialReady: true, appOpenReady: true };
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
  const status: AdStatus = { ready: true, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: true };
  const ctx: AppOpenContext = { now: 10_000_000, playTime: INTERSTITIAL.minPlayTime, firstCar: true, lastAdAt: 0, openedAt: 0, awayMs: APP_OPEN.minAwayMs };

  it("may show when the player is back after a while", () => {
    expect(appOpenBlock(status, ctx)).toBeNull();
    // and as the game opens (no time away to speak of)
    expect(appOpenBlock(status, { ...ctx, awayMs: null })).toBeNull();
  });

  it("never with the ad-free rewards purchase, with no ad loaded or one on screen", () => {
    expect(appOpenBlock({ ...status, adFree: true }, ctx)).toBe("adFree");
    expect(appOpenBlock({ ...status, appOpenReady: false }, ctx)).toBe("notReady");
    expect(appOpenBlock({ ...status, showing: true }, ctx)).toBe("notReady");
  });

  it("not in a young company (so not on the first opens), nor after a short absence", () => {
    expect(appOpenBlock(status, { ...ctx, playTime: INTERSTITIAL.minPlayTime - 1 })).toBe("young");
    expect(appOpenBlock(status, { ...ctx, playTime: 0, awayMs: null })).toBe("young");
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
