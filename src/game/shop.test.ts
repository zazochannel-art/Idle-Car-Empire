import { describe, expect, it } from "vitest";
import { ADS } from "./config/ads";
import { SHOP, SHOP_ITEM_BY_ID } from "./config/shop";
import * as A from "./engine/ads";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import { dateKey, rewardCash } from "./engine/progress";
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
    s.shop = { crateAt: T0 - HOUR, day: "2026-03-01", cash: 2, research: 1, boxDay: "2026-03-01" };
    expect(decodeSave(encodeSave(s), T0).shop).toEqual(s.shop);
    // tampered or from a clock set back: clamped
    s.shop = { crateAt: T0 + 1e9, day: "2026-03-01", cash: 1e6, research: -4, boxDay: "<b>" };
    expect(decodeSave(encodeSave(s), T0).shop).toEqual({ crateAt: T0, day: "2026-03-01", cash: SHOP.packsPerDay, research: 0, boxDay: "" });
    // an old save without it: the first crate is ready
    const raw = JSON.parse(JSON.stringify(createInitialState(T0)));
    delete raw.shop;
    const loaded = decodeSave(JSON.stringify(raw), T0);
    expect(loaded.shop).toEqual(S.createShop());
    expect(S.shopBlock(loaded, "crate", T0)).toBeNull();
    // a save from before the mystery box: today's box is ready
    const old = JSON.parse(JSON.stringify(createInitialState(T0)));
    delete old.shop.boxDay;
    const before = decodeSave(JSON.stringify(old), T0);
    expect(before.shop.boxDay).toBe("");
    expect(S.shopBlock(before, "box", T0)).toBeNull();
  });

  it("the mystery box: one a day for an ad, its prize fixed for the day", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const prize = S.boxPrize(s, T0);
    // the same all day long: opening it later can't draw a better one
    expect(S.boxPrize(s, T0 + 5 * HOUR)).toBe(prize);
    const r = S.shopReward("box", snap, s, T0);
    const cash = s.cash;
    const [rp, stars] = [s.rp, s.stars];
    expect(S.buyShop(s, "box", T0, snap)).toBe(true);
    expect(s.cash).toBeCloseTo(cash + rewardCash(r, snap));
    expect(s.rp).toBe(rp + (r.rp ?? 0));
    expect(s.stars).toBe(stars + (r.stars ?? 0));
    expect(A.adsToday(s, T0)).toBe(1);
    expect(S.shopBlock(s, "box", T0 + HOUR)).toBe("limit");
    expect(S.buyShop(s, "box", T0 + HOUR, snap)).toBe(false);
    // tomorrow, a new box
    expect(S.shopBlock(s, "box", T0 + 24 * HOUR)).toBeNull();
    // the day's ad limit stops it too
    s.ads.day = dateKey(T0 + 24 * HOUR);
    s.ads.count = ADS.perDay;
    expect(S.shopBlock(s, "box", T0 + 24 * HOUR)).toBe("limit");
    // without the company and the day, the box is a surprise
    expect(S.shopReward("box", snap)).toEqual({});
  });

  it("the mystery box's prizes come about as often as their weights say", () => {
    const s = createInitialState(T0);
    const seen = SHOP.box.map(() => 0);
    const days = 2000;
    for (let d = 0; d < days; d++) seen[S.boxPrize(s, T0 + d * 24 * HOUR)] += 1;
    SHOP.box.forEach((p, i) => expect(Math.abs(seen[i] / days - p.weight / 100)).toBeLessThan(0.04));
    expect(SHOP.box.reduce((n, p) => n + p.weight, 0)).toBe(100);
    // two companies don't open the same box every day
    const other = { ...s, createdAt: s.createdAt + 1 };
    let same = 0;
    for (let d = 0; d < 100; d++) if (S.boxPrize(s, T0 + d * 24 * HOUR) === S.boxPrize(other, T0 + d * 24 * HOUR)) same += 1;
    expect(same).toBeLessThan(60);
  });

  it("the new Star items: a day's warp, a research warp and the tycoon pack", () => {
    const s = createInitialState(T0);
    const snap = { ...snapshot(s), rpPerSec: 0.5 };
    s.stars = 12;
    const cash = s.cash;
    expect(S.buyShop(s, "warp24", T0, snap)).toBe(true);
    expect(s.cash).toBeCloseTo(cash + rewardCash({ incomeSeconds: 24 * 3600 }, snap));
    expect(s.stars).toBe(6);
    const rp = s.rp;
    expect(S.buyShop(s, "rp8", T0, snap)).toBe(true);
    expect(s.rp).toBe(rp + Math.max(SHOP.rpWarpMin, Math.round(0.5 * SHOP.rpWarp)));
    expect(s.stars).toBe(4);
    // the pack: a warp and a research warp of 8 hours, for a Star less than the two
    const pack = S.shopReward("bundle", snap);
    expect(pack).toEqual({ incomeSeconds: SHOP.warp.warp8, rp: S.shopReward("rp8", snap).rp });
    expect(SHOP_ITEM_BY_ID.bundle.price).toBe((SHOP_ITEM_BY_ID.warp8.price as number) + (SHOP_ITEM_BY_ID.rp8.price as number) - 1);
    expect(S.buyShop(s, "bundle", T0, snap)).toBe(true);
    expect(s.stars).toBe(0);
    expect(S.shopBlock(s, "bundle", T0)).toBe("stars");
    // Stars don't count as ads
    expect(A.adsToday(s, T0)).toBe(0);
  });

  it("a longer warp is never worse value per Star", () => {
    const perStar = (id: "warp2" | "warp8" | "warp24") => SHOP.warp[id] / (SHOP_ITEM_BY_ID[id].price as number);
    expect(perStar("warp8")).toBeGreaterThanOrEqual(perStar("warp2"));
    expect(perStar("warp24")).toBeGreaterThanOrEqual(perStar("warp8"));
  });
});
