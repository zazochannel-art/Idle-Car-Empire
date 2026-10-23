// The in-app purchases, as the game keeps them: what the company owns and which
// purchases it already received. Google Play hands a purchase to the app (when it
// is bought, and again at every start until it is acknowledged); the game gives
// it here once, and only then is it acknowledged (lib/native-iap.ts).
import { IAP, IAP_PRODUCTS, type IapProduct } from "../config/iap";
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward } from "./progress";

export interface IapState {
  /** The products bought (each one once). */
  owned: IapProduct[];
  /** The purchases already given, by a short hash of their Play token (iapTokenKey). */
  tokens: string[];
}

export const createIap = (): IapState => ({ owned: [], tokens: [] });

export const owns = (s: GameState, p: IapProduct) => s.iap.owned.includes(p);

/** What the starter pack gives now (its research scales with the company, like the shop's). */
export function starterReward(snap: EconomySnapshot): Reward {
  return { stars: IAP.starterStars, incomeSeconds: IAP.starterIncome, rp: Math.max(IAP.starterRpMin, Math.round(snap.rpPerSec * IAP.starterRp)) };
}

/**
 * A purchase from the store, for this company:
 * - "granted": new, given now (the starter pack paid out, or the product owned);
 * - "known": given before (acknowledge it, if it isn't yet);
 * - "duplicate": the product is owned through another purchase. Nothing is given,
 *   and it is left unacknowledged, so Google Play refunds it after three days.
 */
export type GrantResult = "granted" | "known" | "duplicate";

export function grantPurchase(s: GameState, p: IapProduct, token: string, snap: EconomySnapshot): GrantResult {
  if (s.iap.tokens.includes(token)) return "known";
  if (owns(s, p)) return "duplicate";
  if (p === "starter") grantReward(s, starterReward(snap), snap);
  s.iap.owned.push(p);
  s.iap.tokens = [...s.iap.tokens, token].slice(-IAP.maxTokens);
  return "granted";
}

/**
 * A short key for a Play purchase token (FNV-1a, 64 bits as hex): enough to know a
 * purchase again, without keeping the token itself in the save.
 */
export function iapTokenKey(token: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ token.length;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c ^ (a >>> 7), 2246822519);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** A save's purchases: known products once each, and well-formed token keys. */
export function migrateIap(raw: unknown): IapState {
  const r = (raw && typeof raw === "object" ? raw : {}) as { owned?: unknown; tokens?: unknown };
  const owned = Array.isArray(r.owned) ? IAP_PRODUCTS.filter((p) => (r.owned as unknown[]).includes(p)) : [];
  const tokens = Array.isArray(r.tokens) ? [...new Set(r.tokens.filter((t): t is string => typeof t === "string" && /^[0-9a-f]{16}$/.test(t)))].slice(-IAP.maxTokens) : [];
  return { owned, tokens };
}
