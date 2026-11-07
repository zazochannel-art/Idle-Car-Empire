/**
 * The in-app purchases (the Android app only, and only once the products are set
 * up in Google Play: docs/android/iap.md). The first two are bought once and kept for good;
 * the premium pass is bought again for every season (a consumable product on Google Play).
 *
 * - starter: a pack to start with, given once (⭐ Stars, hours of income and of research);
 * - adFree: every ad reward without watching the ad (the same rewards, the same
 *   daily limits: it only skips the video);
 * - pass: the season pass's premium track for the season running (config/pass.ts PREMIUM_TIERS).
 */
export type IapProduct = "starter" | "adFree" | "pass";

export const IAP_PRODUCTS: IapProduct[] = ["starter", "adFree", "pass"];

/** Products bought again and again (consumed on Google Play once given): one premium pass a season. */
export const IAP_CONSUMABLE: IapProduct[] = ["pass"];

export const IAP_ICON: Record<IapProduct, string> = { starter: "🧰", adFree: "🎟️", pass: "👑" };

export const IAP = {
  /** The starter pack: Stars, seconds of income, and seconds of research output (with the least it gives). */
  starterStars: 10,
  starterIncome: 8 * 3600,
  starterRp: 8 * 3600,
  starterRpMin: 200,
  /** The least cash the starter pack gives (8 hours of a first hour's income is under $1,000). */
  starterCashMin: 50_000,
  /** The most purchases a save remembers (two products bought once, and a pass a season: years of them). */
  maxTokens: 40,
};
