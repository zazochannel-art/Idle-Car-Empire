import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { snapshot } from "@/game/engine/economy";
import { grantPurchase } from "@/game/engine/iap";
import { createInitialState } from "@/game/engine/state";
import type { GameState } from "@/game/types";

// A build with both products set up
process.env.NEXT_PUBLIC_IAP_STARTER_ID = "starter_pack";
process.env.NEXT_PUBLIC_IAP_ADFREE_ID = "ad_free_rewards";

const T0 = Date.UTC(2026, 2, 1, 12);
/** What happened, in order: the game giving a purchase, the store hearing it was acknowledged. */
const log: string[] = [];
let game: { ready: boolean; state: GameState };
const account = { id: "user-a" };
const mine = createHash("sha256").update("idle-car-empire:user-a").digest("hex");

interface Purchase {
  productIdentifier: string;
  purchaseToken?: string;
  purchaseState?: string;
  isAcknowledged?: boolean;
  appAccountToken?: string | null;
}
// the store's side: its purchases for this phone, and what a purchase answers
let purchases: Purchase[] = [];
let answer: () => Promise<Purchase> = async () => ({ productIdentifier: "starter_pack" });
const purchaseProduct = vi.fn((options: unknown) => {
  void options;
  return answer();
});

// the app coming back to the front (as Google Play's payment sheet closes, for one)
let onResume: (() => void) | null = null;
let queries = 0;
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (event: string, fn: () => void) => {
      if (event === "resume") onResume = fn;
      return { remove: async () => {} };
    },
  },
}));
vi.mock("@capgo/native-purchases", () => ({
  PURCHASE_TYPE: { INAPP: "inapp" },
  NativePurchases: {
    isBillingSupported: async () => ({ isBillingSupported: true }),
    getProducts: async ({ productIdentifiers }: { productIdentifiers: string[] }) => ({
      products: productIdentifiers.map((identifier) => ({ identifier, priceString: identifier === "starter_pack" ? "€1.99" : "€3.99" })),
    }),
    getPurchases: async () => {
      queries++;
      return { purchases };
    },
    purchaseProduct: (options: unknown) => purchaseProduct(options),
    acknowledgePurchase: async ({ purchaseToken }: { purchaseToken: string }) => {
      log.push(`ack ${purchaseToken}`);
    },
  },
}));
vi.mock("@/store/cloud-store", () => ({
  useCloud: { getState: () => ({ account, phase: "ready" }), subscribe: () => () => {} },
}));
vi.mock("@/store/game-store", () => ({
  useGame: {
    getState: () => ({
      ...game,
      // the store's action: the engine's grant, saved
      iapGrant: (p: "starter" | "adFree", token: string) => {
        const r = grantPurchase(game.state, p, token, snapshot(game.state));
        if (r === "granted") log.push(`grant ${p}`);
        return r;
      },
    }),
    subscribe: () => () => {},
  },
}));

const { startIap } = await import("./native-iap");
const iap = await import("./iap");

const paid = (productIdentifier: string, purchaseToken: string, more: Partial<Purchase> = {}): Purchase => ({ productIdentifier, purchaseToken, purchaseState: "1", isAcknowledged: false, appAccountToken: mine, ...more });

beforeEach(() => {
  log.length = 0;
  purchases = [];
  purchaseProduct.mockClear();
  game = { ready: true, state: createInitialState(T0) };
});

describe("in-app purchases in the app", () => {
  it("starts with the build's product ids, and nothing bought yet", async () => {
    expect(iap.IAP_IDS).toEqual({ starter: "starter_pack", adFree: "ad_free_rewards" });
    expect(iap.iapConfigured()).toBe(true);
    // nothing sold until the store has answered with its prices
    expect(await iap.buyProduct("starter")).toBe("failed");
    startIap();
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual([]);
  });

  it("a purchase is given and saved first, then acknowledged", async () => {
    await iap.restorePurchases();
    answer = async () => paid("starter_pack", "tok-1");
    expect(await iap.buyProduct("starter")).toBe("granted");
    expect(log).toEqual(["grant starter", "ack tok-1"]);
    expect(game.state.iap.owned).toEqual(["starter"]);
    // bought for this game account, and acknowledged by the game (not by the plugin)
    expect(purchaseProduct).toHaveBeenCalledWith(expect.objectContaining({ productIdentifier: "starter_pack", appAccountToken: mine, isConsumable: false, autoAcknowledgePurchases: false }));
  });

  it("restoring gives what wasn't given yet, once, and acknowledges it", async () => {
    purchases = [paid("ad_free_rewards", "tok-2")];
    expect(await iap.restorePurchases()).toBe(1);
    expect(log).toEqual(["grant adFree", "ack tok-2"]);
    // the store still lists it (acknowledged now): nothing more
    purchases = [paid("ad_free_rewards", "tok-2", { isAcknowledged: true })];
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual(["grant adFree", "ack tok-2"]);
  });

  it("a purchase given before but not acknowledged (the app closed in between) is acknowledged, not given again", async () => {
    purchases = [paid("starter_pack", "tok-3")];
    await iap.restorePurchases();
    log.length = 0;
    const stars = game.state.stars;
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual(["ack tok-3"]);
    expect(game.state.stars).toBe(stars);
  });

  it("another game account's purchase on this phone is left to that account", async () => {
    purchases = [paid("starter_pack", "tok-4", { appAccountToken: "someone-else" })];
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual([]);
    expect(game.state.iap.owned).toEqual([]);
  });

  it("a promo code redeemed in the Play Store (no account on it) is this player's", async () => {
    purchases = [paid("starter_pack", "tok-5", { appAccountToken: null })];
    expect(await iap.restorePurchases()).toBe(1);
    expect(game.state.iap.owned).toEqual(["starter"]);
  });

  it("a second purchase of a product already owned is not acknowledged (Google Play refunds it)", async () => {
    purchases = [paid("starter_pack", "tok-6")];
    await iap.restorePurchases();
    log.length = 0;
    purchases = [paid("starter_pack", "tok-6", { isAcknowledged: true }), paid("starter_pack", "tok-7")];
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual([]);
  });

  it("a payment still pending gives nothing until it is paid", async () => {
    purchases = [paid("starter_pack", "tok-8", { purchaseState: "2" })];
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual([]);
    purchases = [paid("starter_pack", "tok-8")];
    expect(await iap.restorePurchases()).toBe(1);
    expect(log).toEqual(["grant starter", "ack tok-8"]);
  });

  it("before the game is loaded, nothing is given (the save it would go to isn't there yet)", async () => {
    game.ready = false;
    purchases = [paid("starter_pack", "tok-9")];
    expect(await iap.restorePurchases()).toBe(0);
    answer = async () => paid("starter_pack", "tok-9");
    expect(await iap.buyProduct("starter")).toBe("failed");
    expect(log).toEqual([]);
  });

  it("the store's answers: cancelled, pending, already owned, failed", async () => {
    await iap.restorePurchases();
    const refuse = (code: string, message = "Purchase is not purchased") => async () => Promise.reject(Object.assign(new Error(message), { code }));
    answer = refuse("USER_CANCELED");
    expect(await iap.buyProduct("adFree")).toBe("cancelled");
    answer = refuse("", "Purchase is pending");
    expect(await iap.buyProduct("adFree")).toBe("pending");
    answer = refuse("ITEM_ALREADY_OWNED");
    purchases = [paid("ad_free_rewards", "tok-10")];
    expect(await iap.buyProduct("adFree")).toBe("owned");
    expect(game.state.iap.owned).toEqual(["adFree"]);
    answer = refuse("ERROR");
    expect(await iap.buyProduct("starter")).toBe("failed");
    // and a product the company owns isn't sold again
    expect(await iap.buyProduct("adFree")).toBe("owned");
  });

  it("no sync while a purchase is open: the app resuming as the payment sheet closes doesn't drop its answer", async () => {
    await iap.restorePurchases();
    let pay: (t: Purchase) => void = () => {};
    answer = () => new Promise((resolve) => (pay = resolve));
    const bought = iap.buyProduct("starter");
    await vi.waitFor(() => expect(purchaseProduct).toHaveBeenCalled());
    const before = queries;
    onResume?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(queries).toBe(before);
    pay(paid("starter_pack", "tok-11"));
    expect(await bought).toBe("granted");
    expect(log).toEqual(["grant starter", "ack tok-11"]);
  });
});
