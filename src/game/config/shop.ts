/**
 * The shop (the HUD's top-left button): a free crate every few hours, packs for
 * a rewarded ad (the app only), and ⭐ Star items. Nothing in it costs real money.
 */
export type ShopItemId = "crate" | "box" | "cash" | "research" | "boost" | "build" | "warp2" | "warp8" | "warp24" | "rp8" | "boostLong" | "bundle";

/** What an item costs: nothing (on a timer), a rewarded ad, or ⭐ Stars. */
export type ShopPrice = "free" | "ad" | number;

/** The colour a card is drawn in. */
export type ShopTone = "gold" | "green" | "blue" | "orange" | "yellow" | "purple" | "cyan" | "pink";

export interface ShopItem {
  id: ShopItemId;
  icon: string;
  price: ShopPrice;
  tone: ShopTone;
  /** A ribbon on the card: once a day, the best value per Star, cheaper than its parts. */
  tag?: "daily" | "best" | "save";
  /** Shown across the whole row. */
  wide?: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "crate", icon: "🎁", price: "free", tone: "gold" },
  { id: "box", icon: "🎲", price: "ad", tone: "pink", tag: "daily", wide: true },
  { id: "cash", icon: "💵", price: "ad", tone: "green" },
  { id: "research", icon: "🔬", price: "ad", tone: "blue" },
  { id: "boost", icon: "📈", price: "ad", tone: "orange" },
  { id: "build", icon: "🏗️", price: "ad", tone: "yellow" },
  { id: "warp2", icon: "⏩", price: 1, tone: "cyan" },
  { id: "warp8", icon: "⏭️", price: 3, tone: "cyan" },
  { id: "warp24", icon: "🌙", price: 6, tone: "purple", tag: "best" },
  { id: "rp8", icon: "🧪", price: 2, tone: "blue" },
  { id: "boostLong", icon: "🚀", price: 1, tone: "orange" },
  { id: "bundle", icon: "💼", price: 4, tone: "gold", tag: "save" },
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
  warp: { warp2: 2 * 3600, warp8: 8 * 3600, warp24: 24 * 3600 },
  /** The research warp: seconds of research output at once (and the least it gives). */
  rpWarp: 8 * 3600,
  rpWarpMin: 200,
  /** The tycoon pack: a time warp and a research warp of this many seconds, for less than the two. */
  bundle: 8 * 3600,
  /**
   * The mystery box: one a day for an ad. What's inside is drawn from the day and the
   * company (so it can't be opened again for a better one); weights add up to 100.
   */
  box: [
    { weight: 40, incomeSeconds: 3600 },
    { weight: 30, rpSeconds: 3600 },
    { weight: 20, incomeSeconds: 3 * 3600 },
    { weight: 10, stars: 1 },
  ] as { weight: number; incomeSeconds?: number; rpSeconds?: number; stars?: number }[],
  boxRpMin: 25,
  /** The long ×2 profit boost: seconds added, and the longest the boost can run in all. */
  boostLong: 2 * 3600,
  boostCap: 4 * 3600,
};
