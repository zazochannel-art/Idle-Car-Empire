/**
 * Rewarded ads (the Android app only): the player chooses to watch one and gets
 * a reward. Nothing in the game needs one. There is no limit on the offers that
 * finish a job or boost (a boost adds up to its cap, any job can be finished); the
 * shop's money and research packs and its mystery box have a limit a day (config/shop.ts),
 * and what has nothing to give is not offered (the offline report collected, the day's
 * login taken, no job to finish).
 */
export type AdReward = "offline" | "build" | "boost" | "login" | "qc";

export const AD_REWARDS: AdReward[] = ["offline", "build", "boost", "login", "qc"];

export const ADS = {
  /** The money waiting in the offline report, multiplied. */
  offlineMult: 2,
  /**
   * The sales boost: income multiplier, and the seconds of play an ad adds (it waits while the game is
   * closed), up to SHOP.boostCap in all.
   */
  boostMult: 2,
  boostSeconds: 30 * 60,
  /** Instant build: an ad finishes a construction or an upgrade; the pause before the next one (ms): none. */
  buildCooldown: 0,
  /** The daily login reward, multiplied (money days only: the Star days are not doubled). */
  loginMult: 2,
  /**
   * An instant build or a quality-control skip is offered only with at least this much (seconds)
   * left: an ad can last a minute, and one that ended with nothing left to skip was watched for nothing.
   */
  minOfferSeconds: 90,
  // (no daily limit on rewarded ads: each reward has its own limit, below and in the shop)
};
