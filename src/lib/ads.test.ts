import { describe, expect, it, vi } from "vitest";
import { canWatch, registerAdDriver, setAdFree, setAdStatus, watchAd } from "./ads";

describe("watching an ad", () => {
  it("gives one reward per ad, even when the ad network reports it twice", async () => {
    registerAdDriver({
      show: async (onReward) => {
        onReward();
        onReward();
        return "rewarded";
      },
      privacyForm: async () => {},
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
    registerAdDriver({ show, privacyForm: async () => {} });
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
    const off = { ready: false, showing: false, privacyOptions: false, adFree: false };
    expect(canWatch(off)).toBe(false);
    expect(canWatch({ ...off, ready: true })).toBe(true);
    expect(canWatch({ ...off, ready: true, showing: true })).toBe(false);
    expect(canWatch({ ...off, adFree: true })).toBe(true);
  });
});
