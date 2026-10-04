// Reasons to come back: VIP orders, the weekly racing season and the
// weekend Auto Show.

/** ── VIP orders: a famous client wants a few cars in a colour (sometimes Premium-built) ── */
export const VIP_CLIENTS = ["sheikh", "movieStar", "collector", "royal", "ceo", "athlete"] as const;
export type VipClient = (typeof VIP_CLIENTS)[number];
export const VIP = {
  /** First offer this long after the first car, then this long after each order ends. */
  firstAfterMs: 15 * 60_000,
  cooldownMs: 40 * 60_000,
  failCooldownMs: 60 * 60_000,
  /** An offer not taken disappears after this long. */
  offerMs: 30 * 60_000,
  /** Deadline options (minutes) and how many cars. */
  minutes: [60, 90, 120],
  cars: [2, 3, 4, 5],
  /** Paid per car: this many times its value, plus Stars and reputation. */
  valueMult: 4,
  stars: 1,
  premiumStars: 2,
  rep: 4,
};

/** ── Weekly racing season ── */
/** Season points by finishing place (× the event's weight). */
export const SEASON_POINTS = [10, 7, 5, 3, 2, 1];
/** The other teams' points by the end of a week (× the player's event weight). */
export const SEASON_RIVALS = [
  { id: "rapid", target: 70 },
  { id: "nova", target: 140 },
  { id: "blackline", target: 230 },
  { id: "apex", target: 340 },
  { id: "vortex", target: 480 },
] as const;
/** Rewards by final place (0 = champion). Cash in seconds of steady income. */
export const SEASON_REWARDS = [
  { stars: 3, parts: 20, incomeSeconds: 1800 },
  { stars: 2, parts: 10, incomeSeconds: 900 },
  { stars: 1, parts: 5, incomeSeconds: 450 },
];
export const SEASON_CONSOLATION = { parts: 2 };

/** ── Weekend Auto Show ── */
export const SHOW = {
  /** Days the show is open (Date.getDay(): 6 = Saturday, 0 = Sunday). */
  days: [6, 0],
  rivals: 5,
  /** Rewards by place, in seconds of steady income, plus Stars and reputation. */
  rewards: [
    { incomeSeconds: 1200, stars: 2, rep: 5 },
    { incomeSeconds: 600, stars: 1, rep: 3 },
    { incomeSeconds: 300, stars: 0, rep: 1 },
  ],
  consolationSeconds: 120,
};
export const SHOW_RIVALS = ["Velocità", "Nordwind", "Kaiju Motors", "Sierra", "Bayline"];
