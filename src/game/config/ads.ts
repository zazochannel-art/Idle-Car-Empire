/**
 * Rewarded ads (the Android app only): the player chooses to watch one and gets
 * a reward. Nothing in the game needs one. There is no limit on how many a day:
 * each reward has its own (a boost runs one at a time, an instant build waits,
 * the offline report is collected once, the shop's packs and box have theirs).
 */
export type AdReward = "offline" | "build" | "boost" | "login" | "qc";

export const AD_REWARDS: AdReward[] = ["offline", "build", "boost", "login", "qc"];

export const ADS = {
  /** The money waiting in the offline report, multiplied. */
  offlineMult: 2,
  /** The sales boost: income multiplier, and how long it lasts in seconds of play (it waits while the game is closed). */
  boostMult: 2,
  boostSeconds: 30 * 60,
  /** Instant build: an ad finishes a construction or an upgrade; then a pause before the next one (ms). */
  buildCooldown: 10 * 60_000,
  /** The daily login reward, multiplied (money days only: the Star days are not doubled). */
  loginMult: 2,
  // (no daily limit on rewarded ads: each reward has its own limit, below and in the shop)
};
