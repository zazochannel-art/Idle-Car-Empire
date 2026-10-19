/**
 * The in-app purchases (the Android app only, and only once the products are set
 * up in Google Play: docs/android/iap.md). Both are bought once and kept for good.
 *
 * - starter: a pack to start with, given once (⭐ Stars, hours of income and of research);
 * - adFree: every ad reward without watching the ad (the same rewards, the same
 *   daily limits: it only skips the video).
 */
export type IapProduct = "starter" | "adFree";

export const IAP_PRODUCTS: IapProduct[] = ["starter", "adFree"];

export const IAP_ICON: Record<IapProduct, string> = { starter: "🧰", adFree: "🎟️" };

export const IAP = {
  /** The starter pack: Stars, seconds of income, and seconds of research output (with the least it gives). */
  starterStars: 10,
  starterIncome: 8 * 3600,
  starterRp: 8 * 3600,
  starterRpMin: 200,
  /** The most purchases a save remembers (two products, each bought once: plenty). */
  maxTokens: 20,
};
