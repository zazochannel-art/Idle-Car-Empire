import { describe, expect, it, vi } from "vitest";
import { canWatch, INTERSTITIAL, interstitialBlock, registerAdDriver, setAdFree, setAdStatus, watchAd, type AdStatus, type InterstitialContext } from "./ads";

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
    registerAdDriver({ show, privacyForm: async () => {}, showInterstitial: async () => false });
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
    const off = { ready: false, showing: false, privacyOptions: false, adFree: false, interstitialReady: false };
    expect(canWatch(off)).toBe(false);
    expect(canWatch({ ...off, ready: true })).toBe(true);
    expect(canWatch({ ...off, ready: true, showing: true })).toBe(false);
    expect(canWatch({ ...off, adFree: true })).toBe(true);
  });
});

describe("full-screen ads (no reward)", () => {
  const status: AdStatus = { ready: true, showing: false, privacyOptions: false, adFree: false, interstitialReady: true };
  const ctx: InterstitialContext = { now: 10_000_000, playTime: INTERSTITIAL.minPlayTime, firstCar: true, today: 0, lastAdAt: 0, openedAt: 0 };

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

  it("a pause after any ad, and a few a day", () => {
    expect(interstitialBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs + 1 })).toBe("pause");
    expect(interstitialBlock(status, { ...ctx, lastAdAt: ctx.now - INTERSTITIAL.gapMs })).toBeNull();
    expect(interstitialBlock(status, { ...ctx, today: INTERSTITIAL.perDay })).toBe("limit");
  });
});
