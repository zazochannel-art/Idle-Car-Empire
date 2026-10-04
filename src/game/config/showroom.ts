// The company showroom: cars of the collection sold at the player's price,
// and the marketing campaigns that bring customers to every dealer.

export const SHOWROOM = {
  /** Seconds until a buyer at the fair price, on average. */
  buyerSec: 150,
  /** How sharply buyers turn away from a price above fair (and rush to one below). */
  elasticity: 4,
  /** The asking price may range between these shares of the fair price. */
  minPrice: 0.5,
  maxPrice: 3,
  /** A racing pedigree: each win and podium adds to what collectors pay, up to `max`. */
  pedigree: { win: 0.03, podium: 0.01, max: 0.5 },
};

export const CAMPAIGN = {
  /** Market seconds a campaign runs. */
  sec: 600,
  /** Dealer customers come this much faster, showroom buyers this much more often. */
  demand: 1.5,
  showroom: 2,
  /** It costs this many seconds of steady income (at least `min`). */
  costSec: 240,
  min: 5_000,
};
