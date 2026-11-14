import { describe, expect, it } from "vitest";
import { ADS } from "./config/ads";
import { SHOP } from "./config/shop";
import * as A from "./engine/ads";
import * as Co from "./engine/construction";
import * as R from "./engine/retention";
import { snapshot } from "./engine/economy";
import { computeOffline, settleOffline } from "./engine/offline";
import { dateKey } from "./engine/calendar";
import { qcBlock } from "./engine/quality-check";
import { updateLogin } from "./engine/retention";
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

  it("an ad doubles today's login money, once, but not a Star day", () => {
    const s = createInitialState(T0);
    updateLogin(s, T0);
    const snap = snapshot(s);
    const plain = structuredClone(s);
    expect(A.grantAd(plain, "login", T0)).toBe(false); // needs the economy snapshot
    // the plain claim, for what it pays
    const base = structuredClone(s);
    const c0 = base.cash;
    R.claimLogin(base, snap);
    const paid = base.cash - c0;
    expect(paid).toBeGreaterThan(0);
    const c1 = s.cash;
    expect(A.adBlock(s, "login", T0)).toBeNull();
    expect(A.grantAd(s, "login", T0, undefined, snap)).toBe(true);
    expect(s.cash - c1).toBeCloseTo(paid * ADS.loginMult);
    expect(s.login.claimed).toBe(true);
    expect(A.adsToday(s, T0)).toBe(1);
    // claimed: a repeated reward gives nothing
    expect(A.adBlock(s, "login", T0)).toBe("nothing");
    expect(A.grantAd(s, "login", T0, undefined, snap)).toBe(false);
    expect(s.cash - c1).toBeCloseTo(paid * ADS.loginMult);
    // a Star day is never doubled
    const star = createInitialState(T0);
    updateLogin(star, T0);
    star.login.streak = 4;
    expect(A.adBlock(star, "login", T0)).toBe("nothing");
    const stars = star.stars;
    expect(A.grantAd(star, "login", T0, undefined, snap)).toBe(false);
    expect(star.stars).toBe(stars);
    expect(star.login.claimed).toBe(false);
  });

  it("an ad skips the break between two inspections, not the day's limit", () => {
    const s = createInitialState(T0);
    // no break running: nothing to skip
    expect(A.adBlock(s, "qc", T0)).toBe("nothing");
    s.qc.nextAt = T0 + 3600_000;
    s.qc.today = 1;
    s.qc.day = dateKey(T0);
    expect(qcBlock(s, T0)).toBe("wait");
    expect(A.adBlock(s, "qc", T0)).toBeNull();
    expect(A.grantAd(s, "qc", T0)).toBe(true);
    expect(qcBlock(s, T0)).toBeNull();
    expect(s.qc.today).toBe(1);
    // the day's inspections used up: an ad can't give another
    s.qc.today = 99;
    s.qc.nextAt = T0 + 3600_000;
    expect(qcBlock(s, T0)).toBe("limit");
    expect(A.adBlock(s, "qc", T0)).toBe("nothing");
    expect(A.grantAd(s, "qc", T0)).toBe(false);
    expect(s.qc.nextAt).toBe(T0 + 3600_000);
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

  it("no limit on the ads a day: they are counted for the shop, and counted again the next day", () => {
    const s = createInitialState(T0);
    for (let i = 0; i < 60; i++) {
      s.ads.boostLeft = 0;
      expect(A.grantAd(s, "boost", T0)).toBe(true);
    }
    expect(A.adsToday(s, T0)).toBe(60);
    s.ads.boostLeft = 0;
    expect(A.adBlock(s, "boost", T0)).toBeNull();
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
    expect(decodeSave(encodeSave(s), T0).ads).toEqual({ day: "2026-03-01", count: 1_000_000, boostLeft: SHOP.boostCap, buildAt: T0 });
    // an old save without it starts empty
    const raw = JSON.parse(JSON.stringify(createInitialState(T0)));
    delete raw.ads;
    expect(decodeSave(JSON.stringify(raw), T0).ads).toEqual(A.createAds());
  });
});
