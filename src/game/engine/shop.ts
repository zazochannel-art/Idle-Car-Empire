// The shop: a free crate every few hours, a mystery box and packs for a rewarded
// ad, and ⭐ Star items. An ad item is granted here only once the ad network says
// the ad was watched to the end (the ad itself is shown by the app, lib/ads.ts).
import { ADS } from "../config/ads";
import { SHOP, SHOP_ITEM_BY_ID, type ShopItemId } from "../config/shop";
import type { GameState, Reward } from "../types";
import { adBlock, adsToday, countAd, grantAd } from "./ads";
import { remainingOf } from "./construction";
import type { EconomySnapshot } from "./economy";
import { dateKey, grantReward } from "./progress";

export interface ShopState {
  /** When the last free crate was opened (ms; 0: never, the first one is ready). */
  crateAt: number;
  /** The day (dateKey) the pack counts are for, and the cash and research packs taken that day. */
  day: string;
  cash: number;
  research: number;
  /** The day (dateKey) the last mystery box was opened ("": never). */
  boxDay: string;
}

export const createShop = (): ShopState => ({ crateAt: 0, day: "", cash: 0, research: 0, boxDay: "" });

/** Milliseconds until the next free crate (0: ready). */
export const crateWait = (s: GameState, now: number) => Math.max(0, s.shop.crateAt + SHOP.crateEvery - now);

/** Cash or research packs taken today. */
export const packsToday = (s: GameState, id: "cash" | "research", now: number) => (s.shop.day === dateKey(now) ? s.shop[id] : 0);

/** The construction or upgrade with the most time left: the one an instant build finishes. */
export function longestJob(s: GameState): string | undefined {
  let best: string | undefined;
  let most = 0;
  for (const plot of [...Object.keys(s.city.sites), ...Object.keys(s.city.buildings)]) {
    const left = remainingOf(s, plot);
    if (left > most) [best, most] = [plot, left];
  }
  return best;
}

const researchOutput = (snap: EconomySnapshot, seconds: number, min: number) => Math.max(min, Math.round(snap.rpPerSec * seconds));

/**
 * Which of the mystery box's prizes (an index in SHOP.box) the company's box holds
 * on this day: fixed for the day, so opening it can't be tried again for a better one.
 */
export function boxPrize(s: GameState, now: number): number {
  const key = `${s.createdAt}:${dateKey(now)}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let roll = (h >>> 0) % 100;
  for (let i = 0; i < SHOP.box.length; i++) {
    roll -= SHOP.box[i].weight;
    if (roll < 0) return i;
  }
  return 0;
}

/**
 * What a money or research item gives (the boosts and the instant build give time,
 * not a reward). The mystery box needs the company and the day; without them it's
 * a surprise (nothing to show).
 */
export function shopReward(id: ShopItemId, snap: EconomySnapshot, s?: GameState, now = 0): Reward {
  switch (id) {
    case "crate":
      return { incomeSeconds: SHOP.crateIncome, rp: researchOutput(snap, SHOP.crateRp, SHOP.crateRpMin) };
    case "cash":
      return { incomeSeconds: SHOP.packIncome };
    case "research":
      return { rp: researchOutput(snap, SHOP.packRp, SHOP.packRpMin) };
    case "warp2":
    case "warp8":
    case "warp24":
      return { incomeSeconds: SHOP.warp[id] };
    case "rp8":
      return { rp: researchOutput(snap, SHOP.rpWarp, SHOP.rpWarpMin) };
    case "bundle":
      return { incomeSeconds: SHOP.bundle, rp: researchOutput(snap, SHOP.bundle, SHOP.rpWarpMin) };
    case "box": {
      if (!s) return {};
      const prize = SHOP.box[boxPrize(s, now)];
      const r: Reward = {};
      if (prize.incomeSeconds) r.incomeSeconds = prize.incomeSeconds;
      if (prize.rpSeconds) r.rp = researchOutput(snap, prize.rpSeconds, SHOP.boxRpMin);
      if (prize.stars) r.stars = prize.stars;
      return r;
    }
    default:
      return {};
  }
}

/**
 * Why an item can't be had now: the crate not ready yet ("wait"), today's ad or
 * pack limit, nothing to build, a boost already running (or already as long as it
 * can be: "full"), not enough Stars. Null: it can be had.
 */
export type ShopBlock = "wait" | "limit" | "nothing" | "active" | "full" | "stars" | null;

export function shopBlock(s: GameState, id: ShopItemId, now: number): ShopBlock {
  const price = SHOP_ITEM_BY_ID[id].price;
  if (typeof price === "number" && s.stars < price) return "stars";
  switch (id) {
    case "crate":
      return crateWait(s, now) > 0 ? "wait" : null;
    case "cash":
    case "research":
      return adsToday(s, now) >= ADS.perDay || packsToday(s, id, now) >= SHOP.packsPerDay ? "limit" : null;
    case "box":
      return adsToday(s, now) >= ADS.perDay || s.shop.boxDay === dateKey(now) ? "limit" : null;
    case "boost":
      return adBlock(s, "boost", now);
    case "build":
      return adBlock(s, "build", now, longestJob(s));
    case "boostLong":
      return s.ads.boostLeft + SHOP.boostLong > SHOP.boostCap ? "full" : null;
    default:
      return null;
  }
}

/**
 * Gives an item: the crate (and starts its timer), what an ad pack or the mystery
 * box gives (call only after the ad was watched), or a Star item (the Stars paid).
 * False when it can't be had (then nothing changes).
 */
export function buyShop(s: GameState, id: ShopItemId, now: number, snap: EconomySnapshot): boolean {
  if (shopBlock(s, id, now)) return false;
  const price = SHOP_ITEM_BY_ID[id].price;
  if (id === "boost") return grantAd(s, "boost", now);
  if (id === "build") return grantAd(s, "build", now, longestJob(s));
  if (id === "boostLong") s.ads.boostLeft += SHOP.boostLong;
  else grantReward(s, shopReward(id, snap, s, now), snap);
  if (typeof price === "number") s.stars -= price;
  if (id === "crate") s.shop.crateAt = now;
  if (id === "box") {
    s.shop.boxDay = dateKey(now);
    countAd(s, now);
  }
  if (id === "cash" || id === "research") {
    const day = dateKey(now);
    if (s.shop.day !== day) [s.shop.day, s.shop.cash, s.shop.research] = [day, 0, 0];
    s.shop[id] += 1;
    countAd(s, now);
  }
  return true;
}

/** A save's shop, within bounds (the merge already gave every field its type). */
export function migrateShop(sh: ShopState, now: number): ShopState {
  const packs = (n: number) => Math.max(0, Math.min(SHOP.packsPerDay, Math.floor(n)));
  return {
    // a time from the future (a clock set back) would hold the crate for ever
    crateAt: Math.max(0, Math.min(now, sh.crateAt)),
    day: sh.day,
    cash: packs(sh.cash),
    research: packs(sh.research),
    boxDay: /^\d{4}-\d{2}-\d{2}$/.test(sh.boxDay) ? sh.boxDay : "",
  };
}
