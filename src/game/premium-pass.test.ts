import { describe, expect, it } from "vitest";
import { PASS, PREMIUM_TIERS } from "./config/pass";
import { snapshot } from "./engine/economy";
import { grantPurchase, iapTokenKey, migrateIap, owns, revokePurchase } from "./engine/iap";
import * as P from "./engine/pass";
import { createInitialState } from "./engine/state";
import type { GameState } from "./types";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const NOW = at(2026, 9, 12);

function fresh(now = NOW): GameState {
  const s = createInitialState(now);
  s.lastActiveAt = now;
  P.passTick(s, snapshot(s), now);
  return s;
}

describe("the premium pass", () => {
  it("pays more than the free track: Stars, the Gold Rush livery and a limited hypercar", () => {
    expect(PREMIUM_TIERS).toHaveLength(PASS.tiers);
    expect(PREMIUM_TIERS.reduce((n, t) => n + (t.reward.stars ?? 0), 0)).toBe(14);
    expect(PREMIUM_TIERS[14].livery).toBe("goldrush");
    expect(PREMIUM_TIERS[29].car).toEqual({ model: "hypercar", livery: "goldrush" });
  });

  it("is bought for the season running: its tiers open, a second purchase that season is a duplicate", () => {
    const s = fresh();
    const snap = snapshot(s);
    expect(owns(s, "pass")).toBe(false);
    s.pass.xp = 3 * PASS.xpPerTier;
    expect(P.claimPremiumTier(s, 1, snap, NOW)).toBeNull();
    expect(grantPurchase(s, "pass", iapTokenKey("p1"), snap, NOW)).toBe("granted");
    expect(owns(s, "pass")).toBe(true);
    expect(s.iap.owned).toEqual([]);
    expect(P.passWaiting(s)).toBe(6);
    expect(grantPurchase(s, "pass", iapTokenKey("p1"), snap, NOW)).toBe("known");
    expect(grantPurchase(s, "pass", iapTokenKey("p2"), snap, NOW)).toBe("duplicate");
    // not refundable in the game: what it paid stays paid
    expect(revokePurchase(s, "pass")).toBe(false);
  });

  it("pays each reached premium tier once, and claim-all takes both tracks", () => {
    const s = fresh();
    const snap = snapshot(s);
    grantPurchase(s, "pass", iapTokenKey("p1"), snap, NOW);
    s.pass.xp = 3 * PASS.xpPerTier;
    const stars = s.stars;
    expect(P.claimPremiumTier(s, 3, snap, NOW)).not.toBeNull();
    expect(s.stars).toBe(stars + 1);
    expect(P.claimPremiumTier(s, 3, snap, NOW)).toBeNull();
    expect(P.claimPremiumTier(s, 4, snap, NOW)).toBeNull();
    // tiers 1-3 free, 1-2 premium
    expect(P.claimAllTiers(s, snap, NOW).tiers).toBe(5);
    expect(P.passWaiting(s)).toBe(0);
  });

  it("ends with its season: untaken premium tiers are paid as the next one starts, and it must be bought again", () => {
    const s = fresh();
    const snap = snapshot(s);
    grantPurchase(s, "pass", iapTokenKey("p1"), snap, NOW);
    s.pass.xp = 2 * PASS.xpPerTier;
    const next = P.passEnd(s.pass.season) + 3_600_000;
    const out = P.passTick(s, snap, next);
    // two free tiers and two premium ones
    expect(out.leftover).toBe(4);
    expect(owns(s, "pass")).toBe(false);
    expect(s.pass.premiumClaimed).toEqual([]);
    expect(grantPurchase(s, "pass", iapTokenKey("p2"), snap, next)).toBe("granted");
    expect(s.pass.premium).toBe(s.pass.season);
  });

  it("the last premium tier brings the limited hypercar in Gold Rush", () => {
    const s = fresh();
    const snap = snapshot(s);
    grantPurchase(s, "pass", iapTokenKey("p1"), snap, NOW);
    s.pass.xp = PASS.tiers * PASS.xpPerTier;
    const cars = s.racing.cars.length;
    expect(P.claimPremiumTier(s, 30, snap, NOW)).not.toBeNull();
    expect(s.racing.skins).toContain("goldrush");
    expect(s.racing.cars.length).toBe(cars + 1);
    expect(s.racing.cars.at(-1)).toMatchObject({ skin: "goldrush", limited: s.pass.season });
  });

  it("a save keeps the premium season and the premium tiers taken; a stray pass among the owned products is dropped", () => {
    const p = P.migratePass({ season: 5, xp: 10, claimed: [1], premium: 5, premiumClaimed: [1, 2, 2, 99, "x"] });
    expect(p.premium).toBe(5);
    expect(p.premiumClaimed).toEqual([1, 2]);
    expect(P.migratePass({}).premium).toBe(0);
    expect(migrateIap({ owned: ["adFree", "pass"], tokens: [] }).owned).toEqual(["adFree"]);
  });
});
