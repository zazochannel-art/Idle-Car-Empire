import { describe, expect, it } from "vitest";
import { ADS } from "./config/ads";
import { SHOP } from "./config/shop";
import * as A from "./engine/ads";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import { rewardCash } from "./engine/progress";
import * as S from "./engine/shop";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { decodeSave, encodeSave } from "./save/serialize";

const T0 = Date.UTC(2026, 2, 1, 12);
const HOUR = 3600_000;

describe("the shop", () => {
  it("the free crate is ready at once, then every 4 hours", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const cash = s.cash;
    const rp = s.rp;
    expect(S.shopBlock(s, "crate", T0)).toBeNull();
    expect(S.buyShop(s, "crate", T0, snap)).toBe(true);
    expect(s.cash).toBeCloseTo(cash + rewardCash({ incomeSeconds: SHOP.crateIncome }, snap));
    expect(s.rp).toBe(rp + SHOP.crateRpMin);
    // not again until the timer runs out
    expect(S.shopBlock(s, "crate", T0 + HOUR)).toBe("wait");
    expect(S.crateWait(s, T0 + HOUR)).toBe(SHOP.crateEvery - HOUR);
    expect(S.buyShop(s, "crate", T0 + HOUR, snap)).toBe(false);
    expect(S.buyShop(s, "crate", T0 + SHOP.crateEvery, snap)).toBe(true);
    // the crate is free: no ad counted, no Stars spent
    expect(A.adsToday(s, T0)).toBe(0);
  });

  it("the research packs follow the company's research output", () => {
    const s = createInitialState(T0);
    const snap = { ...snapshot(s), rpPerSec: 2 };
    expect(S.shopReward("research", snap).rp).toBe(2 * SHOP.packRp);
    expect(S.shopReward("crate", snap).rp).toBe(2 * SHOP.crateRp);
    // a company that makes no research still gets something
    expect(S.shopReward("research", { ...snap, rpPerSec: 0 }).rp).toBe(SHOP.packRpMin);
  });

  it("ad packs: a few a day each, counted with every other ad", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    for (let i = 0; i < SHOP.packsPerDay; i++) expect(S.buyShop(s, "cash", T0, snap)).toBe(true);
    expect(S.shopBlock(s, "cash", T0)).toBe("limit");
    expect(S.buyShop(s, "cash", T0, snap)).toBe(false);
    // the research packs have their own count
    expect(S.buyShop(s, "research", T0, snap)).toBe(true);
    expect(S.packsToday(s, "research", T0)).toBe(1);
    expect(A.adsToday(s, T0)).toBe(SHOP.packsPerDay + 1);
    // a new day, new packs
    const tomorrow = T0 + 24 * HOUR;
    expect(S.packsToday(s, "cash", tomorrow)).toBe(0);
    expect(S.buyShop(s, "cash", tomorrow, snap)).toBe(true);
    expect(S.packsToday(s, "research", tomorrow)).toBe(0);
    // the day's ad limit stops the packs too
    s.ads.count = ADS.perDay;
    expect(S.shopBlock(s, "research", tomorrow)).toBe("limit");
  });

  it("the ad boost and the instant build are the rewarded ads' own", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    expect(S.buyShop(s, "boost", T0, snap)).toBe(true);
    expect(s.ads.boostLeft).toBe(ADS.boostSeconds);
    expect(S.shopBlock(s, "boost", T0)).toBe("active");
    // nothing being built: nothing to finish
    expect(S.shopBlock(s, "build", T0)).toBe("nothing");
    const plot = Co.plotsFor("engineFactory")[0];
    s.lifetime.parts.body = 12;
    s.cash = 1e6;
    expect(Co.buyAndBuild(s, plot)).toBe(true);
    expect(S.longestJob(s)).toBe(plot);
    expect(S.buyShop(s, "build", T0, snap)).toBe(true);
    expect(Co.remainingOf(s, plot)).toBe(0);
    expect(A.adsToday(s, T0)).toBe(2);
  });

  it("the Star items cost Stars, and only what the player has", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    expect(S.shopBlock(s, "warp2", T0)).toBe("stars");
    expect(S.buyShop(s, "warp2", T0, snap)).toBe(false);
    s.stars = 4;
    const cash = s.cash;
    expect(S.buyShop(s, "warp8", T0, snap)).toBe(true);
    expect(s.stars).toBe(1);
    expect(s.cash).toBeCloseTo(cash + rewardCash({ incomeSeconds: SHOP.warp.warp8 }, snap));
    // the money is a reward: it counts toward no reset
    expect(s.run.moneyEarned).toBe(0);
    expect(S.shopBlock(s, "warp8", T0)).toBe("stars");
    expect(S.buyShop(s, "warp2", T0, snap)).toBe(true);
    expect(s.stars).toBe(0);
  });

  it("the long boost adds to the ad boost, up to its cap", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    s.stars = 5;
    const before = snapshot(s).gm.income;
    expect(S.buyShop(s, "boostLong", T0, snap)).toBe(true);
    expect(s.ads.boostLeft).toBe(SHOP.boostLong);
    expect(snapshot(s).gm.income).toBeCloseTo(before * ADS.boostMult);
    expect(S.buyShop(s, "boostLong", T0, snap)).toBe(true);
    expect(s.ads.boostLeft).toBe(SHOP.boostCap);
    expect(S.shopBlock(s, "boostLong", T0)).toBe("full");
    expect(S.buyShop(s, "boostLong", T0, snap)).toBe(false);
    expect(s.stars).toBe(3);
    // it runs down with play like the ad's
    tick(s, SHOP.boostLong);
    expect(s.ads.boostLeft).toBeCloseTo(SHOP.boostCap - SHOP.boostLong);
    expect(S.shopBlock(s, "boostLong", T0)).toBeNull();
    // and a save keeps all of it
    expect(decodeSave(encodeSave(s), T0).ads.boostLeft).toBeCloseTo(s.ads.boostLeft);
  });

  it("a save keeps the shop, within bounds", () => {
    const s = createInitialState(T0);
    s.shop = { crateAt: T0 - HOUR, day: "2026-03-01", cash: 2, research: 1 };
    expect(decodeSave(encodeSave(s), T0).shop).toEqual(s.shop);
    // tampered or from a clock set back: clamped
    s.shop = { crateAt: T0 + 1e9, day: "2026-03-01", cash: 1e6, research: -4 };
    expect(decodeSave(encodeSave(s), T0).shop).toEqual({ crateAt: T0, day: "2026-03-01", cash: SHOP.packsPerDay, research: 0 });
    // an old save without it: the first crate is ready
    const raw = JSON.parse(JSON.stringify(createInitialState(T0)));
    delete raw.shop;
    const loaded = decodeSave(JSON.stringify(raw), T0);
    expect(loaded.shop).toEqual(S.createShop());
    expect(S.shopBlock(loaded, "crate", T0)).toBeNull();
  });
});
