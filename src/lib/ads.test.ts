import { describe, expect, it, vi } from "vitest";
import { registerAdDriver, setAdStatus, watchAd } from "./ads";

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
});
