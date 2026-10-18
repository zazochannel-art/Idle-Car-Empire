/**
 * The shop (the HUD's top-left button): a free crate every few hours, packs for
 * a rewarded ad (the app only), and ⭐ Star items. Nothing in it costs real money.
 */
export type ShopItemId = "crate" | "cash" | "research" | "boost" | "build" | "warp2" | "warp8" | "boostLong";

/** What an item costs: nothing (on a timer), a rewarded ad, or ⭐ Stars. */
export type ShopPrice = "free" | "ad" | number;

export interface ShopItem {
  id: ShopItemId;
  icon: string;
  price: ShopPrice;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "crate", icon: "🎁", price: "free" },
  { id: "cash", icon: "💵", price: "ad" },
  { id: "research", icon: "🔬", price: "ad" },
  { id: "boost", icon: "📈", price: "ad" },
  { id: "build", icon: "🏗️", price: "ad" },
  { id: "warp2", icon: "⏩", price: 1 },
  { id: "warp8", icon: "⏭️", price: 3 },
  { id: "boostLong", icon: "🚀", price: 1 },
];

export const SHOP_ITEM_BY_ID = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i])) as Record<ShopItemId, ShopItem>;

export const SHOP = {
  /** The free crate: one every 4 hours (ms), with this many seconds of income and of research output. */
  crateEvery: 4 * 3600_000,
  crateIncome: 15 * 60,
  crateRp: 10 * 60,
  crateRpMin: 10,
  /** The ad packs: seconds of income or of research output, and how many of each a day. */
  packIncome: 30 * 60,
  packRp: 30 * 60,
  packRpMin: 25,
  packsPerDay: 5,
  /** Time warps: seconds of income at once. */
  warp: { warp2: 2 * 3600, warp8: 8 * 3600 },
  /** The long ×2 profit boost: seconds added, and the longest the boost can run in all. */
  boostLong: 2 * 3600,
  boostCap: 4 * 3600,
};
