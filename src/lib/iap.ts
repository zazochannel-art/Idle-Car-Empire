// In-app purchases, as the game's screens see them: whether the store sells
// anything in this build, the products with their store prices, and buying. Safe
// to load anywhere: the Google Play Billing code (lib/native-iap.ts) is loaded only
// inside the Android app, and only when the products are set up for the build
// (NEXT_PUBLIC_IAP_STARTER_ID, NEXT_PUBLIC_IAP_ADFREE_ID: docs/android/iap.md).
// Without them nothing is sold and the shop is as it was.
import { useSyncExternalStore } from "react";
import type { IapProduct } from "@/game/config/iap";

/** A Google Play product id: lowercase letters, digits, "_" and ".", starting with a letter or digit. */
const validId = (id: string | undefined) => (id && /^[a-z0-9][a-z0-9_.]{0,138}$/.test(id) ? id : "");

/** The store's product id of each product in this build ("": not sold). */
export const IAP_IDS: Record<IapProduct, string> = {
  starter: validId(process.env.NEXT_PUBLIC_IAP_STARTER_ID),
  adFree: validId(process.env.NEXT_PUBLIC_IAP_ADFREE_ID),
};

/** Some product is set up for this build. */
export const iapConfigured = () => Object.values(IAP_IDS).some(Boolean);

export interface IapStatus {
  /** The store answered: billing works on this phone and it knows the products below. */
  ready: boolean;
  /** The store's price of each product it sells, in the player's currency ("€1.99"). */
  prices: Partial<Record<IapProduct, string>>;
  /** A purchase or a restore is under way. */
  busy: boolean;
}

/** Bought (and given), waiting for the payment (some payment methods take a while), cancelled, already bought, or failed. */
export type BuyResult = "granted" | "pending" | "cancelled" | "owned" | "failed";

/** What the Android app's billing code does for the game. */
export interface IapDriver {
  buy(p: IapProduct): Promise<BuyResult>;
  /** Asks the store again for every purchase of this account; how many it gave. */
  restore(): Promise<number>;
}

const OFF: IapStatus = { ready: false, prices: {}, busy: false };
let status: IapStatus = OFF;
let driver: IapDriver | null = null;
const listeners = new Set<() => void>();

export function setIapStatus(patch: Partial<IapStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function registerIapDriver(d: IapDriver) {
  driver = d;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const current = () => status;

/** The store, for a screen that sells something. */
export function useIapStatus(): IapStatus {
  return useSyncExternalStore(subscribe, current, () => OFF);
}

export async function buyProduct(p: IapProduct): Promise<BuyResult> {
  if (!driver || !status.ready || status.busy || !status.prices[p]) return "failed";
  return driver.buy(p);
}

export async function restorePurchases(): Promise<number> {
  if (!driver || status.busy) return 0;
  return driver.restore();
}
