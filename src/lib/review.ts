// The store's own rating card (Google Play's in-app review, the App Store's rating prompt) at a
// good moment: a player who has played for a few days and built a fair number of cars, just
// after collecting the offline earnings. At most once in REVIEW.gapDays on a device; the stores
// add their own limits (they may show nothing), and the game never learns what the player did.
import type { GameState } from "@/game/types";
import { isNativeApp } from "./platform";

const ASKED_KEY = "idle-car-empire:review-asked";
const DAY = 86_400_000;

export const REVIEW = {
  /** Days since the company was founded. */
  minDays: 2,
  /** Cars built in all (an engaged player, not one still in the tutorial). */
  minCars: 100,
  /** Days between two asks on this device. */
  gapDays: 45,
};

/** True when it is a good time to ask this player (lastAsked: when this device last asked, 0 never). */
export function reviewDue(state: Pick<GameState, "createdAt" | "lifetime">, now: number, lastAsked: number): boolean {
  if (now - state.createdAt < REVIEW.minDays * DAY) return false;
  if (state.lifetime.carsProduced < REVIEW.minCars) return false;
  return now - lastAsked >= REVIEW.gapDays * DAY;
}

/** Shows the store's rating card if it is due (the app only). */
export async function maybeAskForReview(state: GameState, now = Date.now()) {
  if (!isNativeApp()) return;
  let last = 0;
  try {
    last = Number(window.localStorage.getItem(ASKED_KEY)) || 0;
  } catch {
    return;
  }
  if (!reviewDue(state, now, last)) return;
  try {
    window.localStorage.setItem(ASKED_KEY, String(now));
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
  } catch {
    // no store on this device (or the card failed): nothing to do, the game goes on
  }
}
