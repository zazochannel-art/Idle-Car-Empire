/**
 * Rewarded ads (the Android app only): the player chooses to watch one and gets
 * a reward. Nothing in the game needs one.
 */
export type AdReward = "offline" | "build" | "boost";

export const AD_REWARDS: AdReward[] = ["offline", "build", "boost"];

export const ADS = {
  /** The money waiting in the offline report, multiplied. */
  offlineMult: 2,
  /** The sales boost: income multiplier, and how long it lasts in seconds of play (it waits while the game is closed). */
  boostMult: 2,
  boostSeconds: 30 * 60,
  /** Instant build: an ad finishes a construction or an upgrade; then a pause before the next one (ms). */
  buildCooldown: 10 * 60_000,
  /** Most rewarded ads a day, all kinds together. */
  perDay: 20,
};
