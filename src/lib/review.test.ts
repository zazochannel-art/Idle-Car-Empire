import { describe, expect, it } from "vitest";
import { REVIEW, reviewDue } from "./review";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 19);
const player = (days: number, cars: number) => ({ createdAt: NOW - days * DAY, lifetime: { carsProduced: cars } as never });

describe("asking for a store rating", () => {
  it("waits for a player who has played a few days and built enough cars", () => {
    expect(reviewDue(player(1, 500), NOW, 0)).toBe(false);
    expect(reviewDue(player(5, REVIEW.minCars - 1), NOW, 0)).toBe(false);
    expect(reviewDue(player(REVIEW.minDays, REVIEW.minCars), NOW, 0)).toBe(true);
  });

  it("asks again only after the gap", () => {
    expect(reviewDue(player(90, 5000), NOW, NOW - 10 * DAY)).toBe(false);
    expect(reviewDue(player(90, 5000), NOW, NOW - REVIEW.gapDays * DAY)).toBe(true);
  });
});
