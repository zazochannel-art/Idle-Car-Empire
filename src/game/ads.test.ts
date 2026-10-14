import { describe, expect, it } from "vitest";
import { ADS } from "./config/ads";
import * as A from "./engine/ads";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import { computeOffline, settleOffline } from "./engine/offline";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { encodeSave, decodeSave } from "./save/serialize";

const T0 = Date.UTC(2026, 2, 1, 12);
const ENGINE = Co.plotsFor("engineFactory")[0];

/** A company with its Engine Factory under construction. */
function building() {
  const s = createInitialState(T0);
  s.lifetime.parts.body = 12;
  s.cash = 1e6;
  expect(Co.buyAndBuild(s, ENGINE)).toBe(true);
  return s;
}

describe("rewarded ads", () => {
  it("an ad doubles the offline money, once", () => {
    const s = createInitialState(T0);
    s.pendingOffline = { seconds: 3600, cappedSeconds: 3600, cars: 1, components: 0, deliveries: 0, money: 5_000, rp: 0, carsByType: {} };
    const cash = s.cash;
    expect(A.adBlock(s, "offline", T0)).toBeNull();
    expect(A.grantAd(s, "offline", T0)).toBe(true);
    expect(s.cash).toBeCloseTo(cash + 5_000 * ADS.offlineMult);
    expect(s.pendingOffline).toBeNull();
    // the report is gone: a second reward (a repeated callback) gives nothing
    expect(A.adBlock(s, "offline", T0)).toBe("nothing");
    expect(A.grantAd(s, "offline", T0)).toBe(false);
    expect(s.cash).toBeCloseTo(cash + 5_000 * ADS.offlineMult);
    expect(A.adsToday(s, T0)).toBe(1);
  });

  it("an ad finishes a construction, then waits before the next", () => {
    const s = building();
    expect(Co.remainingOf(s, ENGINE)).toBeGreaterThan(0);
    const cash = s.cash;
    expect(A.grantAd(s, "build", T0, ENGINE)).toBe(true);
    // free: the job is done and the next tick hands the plant over
    expect(s.cash).toBe(cash);
    expect(Co.remainingOf(s, ENGINE)).toBe(0);
    tick(s, 0.1);
    expect(Co.plotStatus(s, ENGINE)).toBe("operational");
    // a plot with nothing being built has nothing to finish
    expect(A.adBlock(s, "build", T0, ENGINE)).toBe("nothing");
    // the next build waits for the pause
    const s2 = building();
    s2.ads.buildAt = T0;
    expect(A.adBlock(s2, "build", T0 + 60_000, ENGINE)).toBe("wait");
    expect(A.buildWait(s2, T0 + 60_000)).toBe(ADS.buildCooldown - 60_000);
    expect(A.grantAd(s2, "build", T0 + 60_000, ENGINE)).toBe(false);
    expect(A.adBlock(s2, "build", T0 + ADS.buildCooldown, ENGINE)).toBeNull();
  });

  it("the sales boost doubles the margin for 30 minutes of play", () => {
    const s = createInitialState(T0);
    const before = snapshot(s).gm.income;
    expect(A.grantAd(s, "boost", T0)).toBe(true);
    expect(snapshot(s).gm.income).toBeCloseTo(before * ADS.boostMult);
    // one at a time
    expect(A.adBlock(s, "boost", T0)).toBe("active");
    tick(s, ADS.boostSeconds - 10);
    expect(s.ads.boostLeft).toBeCloseTo(10);
    tick(s, 20);
    expect(s.ads.boostLeft).toBe(0);
    expect(snapshot(s).gm.income).toBeCloseTo(before);
    expect(A.adBlock(s, "boost", T0)).toBeNull();
  });

  it("the boost waits while the game is closed and doesn't count for the time away", () => {
    const s = createInitialState(T0);
    const plain = computeOffline(structuredClone(s), T0 + 3 * 3600_000).money;
    expect(plain).toBeGreaterThan(0);
    s.ads.boostLeft = 600;
    const boosted = structuredClone(s);
    expect(computeOffline(boosted, T0 + 3 * 3600_000).money).toBeCloseTo(plain);
    // still all there when the player is back
    expect(boosted.ads.boostLeft).toBe(600);
    settleOffline(s, T0 + 3 * 3600_000);
    expect(s.ads.boostLeft).toBe(600);
  });

  it("at most a day's worth of ads, counted again the next day", () => {
    const s = createInitialState(T0);
    for (let i = 0; i < ADS.perDay; i++) {
      s.ads.boostLeft = 0;
      expect(A.grantAd(s, "boost", T0)).toBe(true);
    }
    s.ads.boostLeft = 0;
    expect(A.adBlock(s, "boost", T0)).toBe("limit");
    expect(A.grantAd(s, "boost", T0)).toBe(false);
    const tomorrow = T0 + 24 * 3600_000;
    expect(A.adsToday(s, tomorrow)).toBe(0);
    expect(A.grantAd(s, "boost", tomorrow)).toBe(true);
    expect(A.adsToday(s, tomorrow)).toBe(1);
  });

  it("a save keeps the ad state, within bounds", () => {
    const s = createInitialState(T0);
    s.ads = { day: "2026-03-01", count: 3, boostLeft: 900, buildAt: T0 - 1000 };
    expect(decodeSave(encodeSave(s), T0).ads).toEqual(s.ads);
    // tampered or from a clock set back: clamped
    s.ads = { day: "2026-03-01", count: 1e6, boostLeft: 1e9, buildAt: T0 + 1e9 };
    expect(decodeSave(encodeSave(s), T0).ads).toEqual({ day: "2026-03-01", count: ADS.perDay, boostLeft: ADS.boostSeconds, buildAt: T0 });
    // an old save without it starts empty
    const raw = JSON.parse(JSON.stringify(createInitialState(T0)));
    delete raw.ads;
    expect(decodeSave(JSON.stringify(raw), T0).ads).toEqual(A.createAds());
  });
});
