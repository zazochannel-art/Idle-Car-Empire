import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/engine/state";
import { shareCardData, STORE_URL } from "./share-card";

describe("share card", () => {
  it("takes the company's numbers and cleans the invite code", () => {
    const s = createInitialState(Date.UTC(2026, 10, 8));
    s.lifetime.carsProduced = 1234.9;
    s.lifetime.moneyEarned = 5e9;
    s.stars = 7;
    const d = shareCardData(s, "ab-12cd-extra");
    expect(d.cars).toBe(1234);
    expect(d.earned).toBe(5e9);
    expect(d.stars).toBe(7);
    expect(d.code).toBe("AB12CD");
    expect(d.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("works before the code is known", () => {
    expect(shareCardData(createInitialState(Date.UTC(2026, 10, 8)), "").code).toBe("");
  });

  it("points to the game's Google Play page", () => {
    expect(STORE_URL).toContain("id=com.zazochannel.idlecarempire");
  });
});
