// New Year's Eve (the phone's own clock): the maps light up with fireworks from a quarter to
// midnight until one in the morning, the sky full of them for the first minutes of the year
// (components/map/world/engine.ts), and a player in the game round midnight gets a "Happy New
// Year" gift once a year. Paid as a reward: it counts toward no reset.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./rewards";

export const NEW_YEAR = {
  /** The show starts this many minutes before midnight and ends this many after it. */
  showFrom: 15,
  showTo: 60,
  /** The big show: the first minutes of the year. */
  bigTo: 10,
  /** The gift can be taken from a quarter to midnight until 3 in the morning. */
  giftTo: 180,
  gift: { stars: 3, incomeSeconds: 3_600 } satisfies Reward,
};

/** Minutes from the nearest New Year's midnight (local time): negative before it, positive after; and that year. */
export function fromMidnight(now: number): { minutes: number; year: number } {
  const d = new Date(now);
  const y = d.getFullYear();
  // late December belongs to the coming year's midnight, the rest of the year to the one just past
  const year = d.getMonth() === 11 ? y + 1 : y;
  const midnight = new Date(year, 0, 1, 0, 0, 0).getTime();
  return { minutes: (now - midnight) / 60_000, year };
}

/** The fireworks on the map now: 0 none, 1 the show round midnight, 2 the big show just after it. */
export function newYearShow(now: number): 0 | 1 | 2 {
  const { minutes } = fromMidnight(now);
  if (minutes >= 0 && minutes < NEW_YEAR.bigTo) return 2;
  return minutes >= -NEW_YEAR.showFrom && minutes < NEW_YEAR.showTo ? 1 : 0;
}

/** The year whose gift can be taken now (null: not New Year's night, or taken already). */
export function newYearGiftDue(s: Pick<GameState, "newYear">, now: number): number | null {
  const { minutes, year } = fromMidnight(now);
  if (minutes < -NEW_YEAR.showFrom || minutes >= NEW_YEAR.giftTo) return null;
  return (s.newYear ?? 0) >= year ? null : year;
}

/** Pays the gift if it is due; returns the money and Stars (null: nothing paid). */
export function claimNewYear(s: GameState, now: number, snap: EconomySnapshot): { year: number; money: number; stars: number } | null {
  const year = newYearGiftDue(s, now);
  if (year === null) return null;
  const money = rewardCash(NEW_YEAR.gift, snap);
  grantReward(s, NEW_YEAR.gift, snap);
  s.newYear = year;
  return { year, money, stars: NEW_YEAR.gift.stars };
}
