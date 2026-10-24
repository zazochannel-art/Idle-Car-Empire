import { describe, expect, it } from "vitest";
import { IAP } from "./config/iap";
import { IMPERIUM } from "./config/imperium";
import { snapshot } from "./engine/economy";
import * as P from "./engine/iap";
import { imperium } from "./engine/imperium";
import { rewardCash } from "./engine/progress";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave, migrate } from "./save/serialize";

const T0 = Date.UTC(2026, 2, 1, 12);
const TOKEN = P.iapTokenKey("play-purchase-token-1");

describe("in-app purchases", () => {
  it("a new company owns nothing", () => {
    const s = createInitialState(T0);
    expect(s.iap).toEqual({ owned: [], tokens: [] });
    expect(P.owns(s, "starter")).toBe(false);
    expect(P.owns(s, "adFree")).toBe(false);
  });

  it("the starter pack gives its Stars, income and research once", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const [cash, rp, stars] = [s.cash, s.rp, s.stars];
    const r = P.starterReward(snap);
    expect(P.grantPurchase(s, "starter", TOKEN, snap)).toBe("granted");
    expect(s.stars).toBe(stars + IAP.starterStars);
    expect(s.cash).toBeCloseTo(cash + rewardCash(r, snap));
    expect(s.rp).toBe(rp + Math.max(IAP.starterRpMin, Math.round(snap.rpPerSec * IAP.starterRp)));
    expect(P.owns(s, "starter")).toBe(true);
    // the store hands the same purchase again (every start until acknowledged): nothing more
    expect(P.grantPurchase(s, "starter", TOKEN, snap)).toBe("known");
    expect(s.stars).toBe(stars + IAP.starterStars);
    // another purchase of a product already owned: nothing given, and it is not acknowledged (refunded)
    expect(P.grantPurchase(s, "starter", P.iapTokenKey("play-purchase-token-2"), snap)).toBe("duplicate");
    expect(s.stars).toBe(stars + IAP.starterStars);
    expect(s.iap.tokens).toEqual([TOKEN]);
  });

  it("ad-free rewards are owned, and give nothing else", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    const [cash, stars] = [s.cash, s.stars];
    expect(P.grantPurchase(s, "adFree", TOKEN, snap)).toBe("granted");
    expect(P.owns(s, "adFree")).toBe(true);
    expect([s.cash, s.stars]).toEqual([cash, stars]);
  });

  it("purchases are kept by the save and through Reset Imperium", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    P.grantPurchase(s, "starter", TOKEN, snap);
    P.grantPurchase(s, "adFree", P.iapTokenKey("other"), snap);
    const back = decodeSave(encodeSave(s), T0);
    expect(back.iap).toEqual(s.iap);
    back.run.moneyEarned = IMPERIUM.minRunEarnings;
    back.lifetime.moneyEarned = IMPERIUM.minRunEarnings;
    expect(imperium(back)).toBeGreaterThan(0);
    expect(back.iap).toEqual(s.iap);
  });

  it("a save from before purchases, or a malformed one, owns nothing it shouldn't", () => {
    const s = createInitialState(T0);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.iap;
    expect(migrate(raw, T0).iap).toEqual({ owned: [], tokens: [] });
    expect(migrate({ ...raw, iap: { owned: ["starter", "free-money"], tokens: "x" } }, T0).iap).toEqual({ owned: ["starter"], tokens: [] });
    expect(P.migrateIap({ owned: ["adFree", "adFree", "vip", 3], tokens: [TOKEN, TOKEN, "nope", 7] })).toEqual({ owned: ["adFree"], tokens: [TOKEN] });
    expect(P.migrateIap("x")).toEqual({ owned: [], tokens: [] });
    const many = Array.from({ length: 40 }, (_, i) => P.iapTokenKey(`t${i}`));
    expect(P.migrateIap({ owned: [], tokens: many }).tokens).toHaveLength(IAP.maxTokens);
  });

  it("a purchase is known again by a short key, not by its Play token", () => {
    expect(TOKEN).toMatch(/^[0-9a-f]{16}$/);
    expect(P.iapTokenKey("play-purchase-token-1")).toBe(TOKEN);
    const keys = new Set(Array.from({ length: 2000 }, (_, i) => P.iapTokenKey(`token-${i}`)));
    expect(keys.size).toBe(2000);
  });
});
