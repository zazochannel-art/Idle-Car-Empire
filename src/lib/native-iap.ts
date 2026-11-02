// The app's in-app purchases (Google Play Billing, through @capgo/native-purchases),
// on Android. Loaded only inside the app, and only when the build has product ids
// (lib/native.ts; lib/iap.ts says which).
//
// A purchase is given to the company first and saved, and only then acknowledged:
// Google Play refunds a purchase that is not acknowledged within three days, so a
// purchase the game could not give is never kept. Each purchase carries a one-way
// hash of the game account (no personal data), so a purchase belongs to the account
// that made it, also when another account plays on the same phone. At every start
// and every return to the app, the store is asked again for this account's
// purchases: one paid for later (a pending payment) or not given yet (the app
// closed in between) is given then, and a reinstalled game gets them back.
//
// With the server check on (NEXT_PUBLIC_IAP_VERIFY=1, docs/android/iap.md), a purchase is
// given only once the server has asked Google Play about it (supabase/functions/iap): a forged
// purchase, or one given to another account already, is never given (and never acknowledged).
// When the server can't answer, the purchase waits for the next try. And a purchase Google
// refunded since stops what it can (the ad-free rewards).
import { App } from "@capacitor/app";
import { NativePurchases, PURCHASE_TYPE, type Transaction } from "@capgo/native-purchases";
import { IAP_PRODUCTS, type IapProduct } from "@/game/config/iap";
import { iapTokenKey, type GrantResult } from "@/game/engine/iap";
import { useCloud } from "@/store/cloud-store";
import { useGame } from "@/store/game-store";
import { IAP_IDS, registerIapDriver, setIapStatus, type BuyResult } from "./iap";

const productOf = (id: string): IapProduct | undefined => IAP_PRODUCTS.find((p) => IAP_IDS[p] === id);

/** The game account, hashed one way (Google Play keeps it with the purchase); null: no account yet. */
async function accountToken(): Promise<string | null> {
  const id = useCloud.getState().account?.id;
  if (!id) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`idle-car-empire:${id}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The server checks every purchase before the game gives it (the build's choice). */
const verifyOn = () => process.env.NEXT_PUBLIC_IAP_VERIFY === "1";

/** The game is loaded (its save, for its account): a purchase given now is given to the right company. */
const gameReady = () => useGame.getState().ready && useCloud.getState().phase === "ready";

/**
 * A purchase from the store: given to the company (once) and saved, then acknowledged.
 * Null: not one to give (a payment still pending, another account's, not a product of this build, or
 * one the server refused); "wait": paid, but the server's check hasn't answered yet.
 */
async function take(t: Transaction, mine: string): Promise<GrantResult | "wait" | null> {
  const p = productOf(t.productIdentifier);
  // "1": paid ("2": the payment is still pending; it comes back once paid)
  if (!p || t.purchaseState !== "1" || !t.purchaseToken) return null;
  // a purchase with no account was redeemed in the Play Store (a promo code): it is this player's
  if (t.appAccountToken && t.appAccountToken !== mine) return null;
  const key = iapTokenKey(t.purchaseToken);
  // a purchase not given yet: the server's word first (one the game gave already only needs its acknowledgement)
  if (verifyOn() && !useGame.getState().state.iap.tokens.includes(key)) {
    const social = useGame.getState().saves?.social;
    const verdict = social ? await social.verifyPurchase(t.productIdentifier, t.purchaseToken) : "error";
    // not paid yet, or no answer from the server now: it comes back at the next start or return to the app
    if (verdict === "pending" || verdict === "error") return "wait";
    if (verdict !== "valid") return null;
  }
  const result = useGame.getState().iapGrant(p, key);
  // a second purchase of a product the company already owns is left alone: Google Play refunds it
  if (result !== "duplicate" && !t.isAcknowledged) await NativePurchases.acknowledgePurchase({ purchaseToken: t.purchaseToken }).catch(() => {});
  return result;
}

/** The products the server says were refunded (and not bought again) stop: the ad-free rewards. */
async function takeBackRefunds() {
  const social = useGame.getState().saves?.social;
  if (!social) return;
  const rows = await social.myPurchases().catch(() => []);
  for (const r of rows) {
    const p = IAP_PRODUCTS.find((x) => x === r.product);
    if (p && r.state === "refunded" && useGame.getState().state.iap.owned.includes(p)) useGame.getState().iapRevoke(p);
  }
}

let syncing: Promise<number> | null = null;
/**
 * A purchase is open (Google Play's payment sheet). The plugin reconnects to Google Play
 * for every call and drops the connection before it: a sync now (the app "resumes" as
 * the payment sheet closes) would lose the purchase's answer. So none runs meanwhile.
 */
let buying = false;

/** Asks the store for its prices and this account's purchases, and gives any not given yet; how many it gave. */
function sync(): Promise<number> {
  if (buying) return Promise.resolve(0);
  syncing ??= (async () => {
    try {
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) return 0;
      const ids = IAP_PRODUCTS.map((p) => IAP_IDS[p]).filter(Boolean);
      const { products } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: PURCHASE_TYPE.INAPP });
      const prices: Partial<Record<IapProduct, string>> = {};
      for (const pr of products) {
        const p = productOf(pr.identifier);
        if (p && pr.priceString) prices[p] = pr.priceString;
      }
      setIapStatus({ ready: Object.keys(prices).length > 0, prices });
      const mine = await accountToken();
      if (!mine || !gameReady()) return 0;
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
      let given = 0;
      for (const t of purchases) if ((await take(t, mine)) === "granted") given++;
      if (verifyOn()) await takeBackRefunds();
      return given;
    } catch {
      // no Play Store, no network: the store stays closed until the next try
      return 0;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** The error code of a refused purchase (USER_CANCELED, ITEM_ALREADY_OWNED…), or its message. */
const reason = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown } | null;
  return `${typeof err?.code === "string" ? err.code : ""} ${typeof err?.message === "string" ? err.message : ""}`;
};

async function buy(p: IapProduct): Promise<BuyResult> {
  const mine = await accountToken();
  if (!mine || !gameReady() || buying) return "failed";
  if (useGame.getState().state.iap.owned.includes(p)) return "owned";
  setIapStatus({ busy: true });
  // a sync under way finishes first (its call would drop the purchase's connection)
  if (syncing) await syncing;
  buying = true;
  let result: BuyResult = "failed";
  try {
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: IAP_IDS[p],
      productType: PURCHASE_TYPE.INAPP,
      appAccountToken: mine,
      isConsumable: false,
      // acknowledged by take(), once the game has given it
      autoAcknowledgePurchases: false,
    });
    const given = await take(t, mine);
    if (given === "granted" || given === "known") result = "granted";
    // paid: given once the server has checked it (the next start, or the next return to the app)
    else if (given === "wait") result = "pending";
  } catch (e) {
    const r = reason(e);
    if (/USER_CANCELED/i.test(r)) result = "cancelled";
    else if (/pending/i.test(r)) result = "pending";
    // bought before (another phone, a reinstall): the sync below gives it back
    else if (/ITEM_ALREADY_OWNED/i.test(r)) result = "owned";
  } finally {
    buying = false;
  }
  if (result === "owned") await sync();
  setIapStatus({ busy: false });
  return result;
}

async function restore(): Promise<number> {
  setIapStatus({ busy: true });
  try {
    return await sync();
  } finally {
    setIapStatus({ busy: false });
  }
}

let started = false;

export function startIap() {
  if (started) return;
  started = true;
  registerIapDriver({ buy, restore });
  // once the game (and its account) is loaded, and again whenever the account changes
  let account: string | null = null;
  const check = () => {
    const id = useCloud.getState().account?.id ?? null;
    if (!gameReady() || id === account) return;
    account = id;
    void sync();
  };
  useGame.subscribe(check);
  useCloud.subscribe(check);
  check();
  // a payment that went through while the app was away
  void App.addListener("resume", () => {
    if (gameReady()) void sync();
  });
}
