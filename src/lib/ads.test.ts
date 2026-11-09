import { describe, expect, it, vi } from "vitest";
import { APP_OPEN, appOpenBlock, canWatch, INTERSTITIAL, interstitialBlock, registerAdDriver, setAdFree, setAdStatus, watchAd, type AdStatus, type AppOpenContext, type InterstitialContext } from "./ads";

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
  const ctx: InterstitialContext = { now: 10_000_000, playTime: INTERSTITIAL.minPlayTime, today: 0, lastAdAt: 0, openedAt: 0 };

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
    expect(interstitialBlock(status, { ...ctx, openedAt: ctx.now - INTERSTITIAL.minOpenMs + 1 })).toBe("young");
  });

  it("a pause after any ad, and a few a day", () => {
    expect(interstitialBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs + 1 })).toBe("pause");
    expect(interstitialBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs })).toBeNull();
    expect(interstitialBlock(status, { ...ctx, today: INTERSTITIAL.perDay })).toBe("limit");
  });
});

describe("App Open ads", () => {
  const status: AdStatus = { ready: true, showing: false, privacyOptions: false, adFree: false, interstitialReady: false, appOpenReady: true };
  const ctx: AppOpenContext = { now: 10_000_000, playTime: INTERSTITIAL.minPlayTime, today: 0, appOpenToday: 0, lastAdAt: 0, openedAt: 0, awayMs: APP_OPEN.minAwayMs };

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
    expect(appOpenBlock(status, { ...ctx, awayMs: APP_OPEN.minAwayMs - 1 })).toBe("short");
  });

  it("the pause after any ad, the daily total and its own daily limit", () => {
    expect(appOpenBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs + 1 })).toBe("pause");
    expect(appOpenBlock(status, { ...ctx, today: INTERSTITIAL.perDay })).toBe("limit");
    expect(appOpenBlock(status, { ...ctx, today: 2, appOpenToday: APP_OPEN.perDay })).toBe("limit");
  });
});
