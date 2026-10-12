// Gifts between players (the server counts them: save/social.ts): each is a
// little of the receiver's own income, and sending one pays the sender a
// smaller thank-you. Paid as rewards: they count toward no reset.
import type { GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./progress";

export const GIFT = {
  /** A gift received: this many seconds of the receiver's income. */
  receiveSeconds: 120,
  /** A gift sent: this many seconds of the sender's income. */
  sendSeconds: 30,
  /** Gifts paid at once at most (the server never holds more than a few a day per sender). */
  maxAtOnce: 50,
};

/** Pays the gifts other players sent (n), returns the money. */
export function receiveGifts(s: GameState, n: number, snap: EconomySnapshot): number {
  const count = Math.max(0, Math.min(GIFT.maxAtOnce, Math.floor(n)));
  if (!count) return 0;
  const reward = { incomeSeconds: GIFT.receiveSeconds * count };
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  return money;
}

/** Thanks the sender of a gift, returns the money. */
export function giftSent(s: GameState, snap: EconomySnapshot): number {
  const reward = { incomeSeconds: GIFT.sendSeconds };
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  return money;
}
