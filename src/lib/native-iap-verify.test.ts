// The app's purchases with the server check on (NEXT_PUBLIC_IAP_VERIFY=1, docs/android/iap.md):
// a purchase is given only on the server's "valid", waits when the server can't answer, and a
// refund the server reports takes the ad-free rewards back. (native-iap.test.ts: the check off.)
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { snapshot } from "@/game/engine/economy";
import { grantPurchase, revokePurchase } from "@/game/engine/iap";
import { createInitialState } from "@/game/engine/state";
import type { PurchaseVerdict } from "@/game/save";
import type { GameState } from "@/game/types";

process.env.NEXT_PUBLIC_IAP_STARTER_ID = "starter_pack";
process.env.NEXT_PUBLIC_IAP_ADFREE_ID = "ad_free_rewards";
process.env.NEXT_PUBLIC_IAP_VERIFY = "1";

const T0 = Date.UTC(2026, 2, 1, 12);
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
let purchases: Purchase[] = [];
let answer: () => Promise<Purchase> = async () => ({ productIdentifier: "starter_pack" });

// the server: its word on each purchase token, and what the account owns as it checked
let verdicts: Record<string, PurchaseVerdict> = {};
let owned: { product: string; state: "owned" | "refunded" }[] = [];
const verifyPurchase = vi.fn(async (productId: string, token: string) => {
  log.push(`check ${productId} ${token}`);
  return verdicts[token] ?? "error";
});
let social: { verifyPurchase: typeof verifyPurchase; myPurchases: () => Promise<typeof owned> } | null = null;

vi.mock("@capacitor/app", () => ({ App: { addListener: async () => ({ remove: async () => {} }) } }));
vi.mock("@capgo/native-purchases", () => ({
  PURCHASE_TYPE: { INAPP: "inapp" },
  NativePurchases: {
    isBillingSupported: async () => ({ isBillingSupported: true }),
    getProducts: async ({ productIdentifiers }: { productIdentifiers: string[] }) => ({
      products: productIdentifiers.map((identifier) => ({ identifier, priceString: "€1.99" })),
    }),
    getPurchases: async () => ({ purchases }),
    purchaseProduct: () => answer(),
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
      saves: social ? { social } : null,
      iapGrant: (p: "starter" | "adFree", token: string) => {
        const r = grantPurchase(game.state, p, token, snapshot(game.state));
        if (r === "granted") log.push(`grant ${p}`);
        return r;
      },
      iapRevoke: (p: "starter" | "adFree") => {
        const r = revokePurchase(game.state, p);
        if (r) log.push(`revoke ${p}`);
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
  verdicts = {};
  owned = [];
  verifyPurchase.mockClear();
  social = { verifyPurchase, myPurchases: async () => owned };
  game = { ready: true, state: createInitialState(T0) };
});

describe("in-app purchases checked by the server", () => {
  it("a purchase the server confirms is given, then acknowledged", async () => {
    startIap();
    await iap.restorePurchases();
    verdicts["tok-1"] = "valid";
    answer = async () => paid("starter_pack", "tok-1");
    expect(await iap.buyProduct("starter")).toBe("granted");
    expect(log).toEqual(["check starter_pack tok-1", "grant starter", "ack tok-1"]);
  });

  it("a forged purchase, or another account's, is never given nor acknowledged", async () => {
    for (const v of ["invalid", "taken", "other_account", "refunded"] as const) {
      log.length = 0;
      verdicts = { [`tok-${v}`]: v };
      purchases = [paid("ad_free_rewards", `tok-${v}`)];
      expect(await iap.restorePurchases()).toBe(0);
      expect(log).toEqual([`check ad_free_rewards tok-${v}`]);
    }
    expect(game.state.iap.owned).toEqual([]);
  });

  it("no answer from the server: the paid purchase waits for the next try, then is given", async () => {
    await iap.restorePurchases();
    answer = async () => paid("ad_free_rewards", "tok-2");
    // the player hears it's on its way, not that it failed
    expect(await iap.buyProduct("adFree")).toBe("pending");
    expect(log).toEqual(["check ad_free_rewards tok-2"]);
    // no session either: still waiting
    social = null;
    purchases = [paid("ad_free_rewards", "tok-2")];
    expect(await iap.restorePurchases()).toBe(0);
    social = { verifyPurchase, myPurchases: async () => owned };
    verdicts["tok-2"] = "valid";
    expect(await iap.restorePurchases()).toBe(1);
    expect(game.state.iap.owned).toEqual(["adFree"]);
  });

  it("a purchase the game gave already is only acknowledged, without asking the server again", async () => {
    verdicts["tok-3"] = "valid";
    purchases = [paid("starter_pack", "tok-3")];
    await iap.restorePurchases();
    log.length = 0;
    expect(await iap.restorePurchases()).toBe(0);
    expect(log).toEqual(["ack tok-3"]);
    expect(verifyPurchase).toHaveBeenCalledTimes(1);
  });

  it("a refund the server reports takes the ad-free rewards back (and only those)", async () => {
    verdicts = { "tok-4": "valid", "tok-5": "valid" };
    purchases = [paid("ad_free_rewards", "tok-4"), paid("starter_pack", "tok-5")];
    await iap.restorePurchases();
    expect(game.state.iap.owned.sort()).toEqual(["adFree", "starter"]);
    log.length = 0;
    // Google refunded both: it lists neither any more
    purchases = [];
    owned = [
      { product: "adFree", state: "refunded" },
      { product: "starter", state: "refunded" },
    ];
    await iap.restorePurchases();
    expect(log).toEqual(["revoke adFree"]);
    expect(game.state.iap.owned).toEqual(["starter"]);
    // bought again later: owned again on the server, nothing taken
    log.length = 0;
    owned = [{ product: "adFree", state: "owned" }];
    await iap.restorePurchases();
    expect(log).toEqual([]);
  });
});
