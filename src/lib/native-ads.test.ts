import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake AdMob plugin: the test plays the ad network's part (its events, the show call's answer).
const listeners = new Map<string, (data?: unknown) => void>();
let answerShow: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null;
const shows = vi.fn();
const prepares = vi.fn();
// a build with a real ad unit, installed as the test app (the test APK)
process.env.NEXT_PUBLIC_ADMOB_REWARDED_ID = "ca-app-pub-0000000000000000/0000000000";
vi.mock("@capacitor/app", () => ({ App: { getInfo: async () => ({ id: "com.zazochannel.idlecarempire.debug" }) } }));
vi.mock("@capacitor-community/admob", () => ({
  AdmobConsentStatus: { REQUIRED: "REQUIRED" },
  MaxAdContentRating: { Teen: "Teen" },
  RewardAdPluginEvents: { Showed: "showed", Rewarded: "rewarded", Dismissed: "dismissed", FailedToShow: "failedToShow" },
  AdMob: {
    requestConsentInfo: async () => ({ status: "NOT_REQUIRED", canRequestAds: true, privacyOptionsRequirementStatus: "NOT_REQUIRED" }),
    initialize: async () => {},
    addListener: async (event: string, fn: (data?: unknown) => void) => {
      listeners.set(event, fn);
      return { remove: async () => listeners.delete(event) };
    },
    prepareRewardVideoAd: async (options: unknown) => {
      prepares(options);
      return { adUnitId: "test" };
    },
    showRewardVideoAd: () => {
      shows();
      return new Promise((resolve, reject) => (answerShow = { resolve, reject }));
    },
  },
}));

const { startAds } = await import("./native-ads");
const { watchAd, setAdStatus } = await import("./ads");
const emit = (event: string) => listeners.get(event)?.({ type: "coins", amount: 10 });

beforeEach(async () => {
  vi.useFakeTimers();
  await startAds();
  // an ad is loaded
  await vi.advanceTimersByTimeAsync(0);
});
afterEach(async () => {
  // let the last ad settle
  await vi.advanceTimersByTimeAsync(5000);
  vi.useRealTimers();
});

describe("rewarded ads in the app", () => {
  it("the test app shows Google's test ads, whatever unit it was built with", () => {
    expect(prepares).toHaveBeenCalled();
    for (const [options] of prepares.mock.calls) expect(options).toEqual({ adId: "ca-app-pub-3940256099942544/5224354917", isTesting: true });
  });

  it("rewards once when the ad is watched to the end (event and show answer both say so)", async () => {
    const reward = vi.fn();
    const result = watchAd(reward);
    emit("rewarded");
    answerShow!.resolve({ type: "coins", amount: 10 });
    emit("dismissed");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
  });

  it("an ad closed early gives nothing", async () => {
    const reward = vi.fn();
    const result = watchAd(reward);
    emit("dismissed");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("closed");
    expect(reward).not.toHaveBeenCalled();
  });

  it("a reward that comes after the ad was reported closed still counts", async () => {
    const reward = vi.fn();
    const result = watchAd(reward);
    // the close is reported first (seen on the emulator: the reward came seconds later)
    emit("dismissed");
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    emit("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
  });

  it("a 'failed to show' for an ad already on screen (the SDK's show timeout) doesn't end it", async () => {
    const reward = vi.fn();
    shows.mockClear();
    const result = watchAd(reward);
    // seen on the emulator: showed, then "Timeout for show call succeed." 2 s later, the reward 9 s after that
    emit("showed");
    emit("failedToShow");
    await vi.advanceTimersByTimeAsync(5000);
    // still on screen: no second ad can start, nothing settled
    setAdStatus({ ready: true });
    expect(await watchAd(vi.fn())).toBe("failed");
    expect(shows).toHaveBeenCalledTimes(1);
    emit("rewarded");
    emit("dismissed");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("rewarded");
    expect(reward).toHaveBeenCalledTimes(1);
  });

  it("one ad at a time", async () => {
    shows.mockClear();
    const first = watchAd(vi.fn());
    setAdStatus({ showing: false, ready: true });
    expect(await watchAd(vi.fn())).toBe("failed");
    expect(shows).toHaveBeenCalledTimes(1);
    emit("dismissed");
    await vi.advanceTimersByTimeAsync(2000);
    await first;
  });

  it("an ad that can't show settles as failed", async () => {
    const reward = vi.fn();
    const result = watchAd(reward);
    answerShow!.reject(new Error("No Reward Video Ad can be shown"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("failed");
    expect(reward).not.toHaveBeenCalled();
  });
});
