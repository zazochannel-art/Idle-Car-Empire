import { describe, expect, it } from "vitest";
import { ALLIANCE_REWARDS, allianceReward } from "./engine/alliance";
import { snapshot } from "./engine/economy";
import { createInitialState } from "./engine/state";

const T0 = Date.UTC(2026, 9, 12);

describe("alliance rewards", () => {
  it("pays each tier more than the one before, the last with a Star", () => {
    const snap = snapshot(createInitialState(T0));
    const paid = [1, 2, 3].map((tier) => {
      const s = createInitialState(T0);
      const cash = s.cash;
      const stars = s.stars;
      const money = allianceReward(s, tier, snap);
      expect(s.cash).toBeCloseTo(cash + money);
      expect(s.stars - stars).toBe(ALLIANCE_REWARDS[tier - 1].stars ?? 0);
      // a reward: it counts toward no reset
      expect(s.run.moneyEarned).toBe(0);
      return money;
    });
    expect(paid[1]).toBeGreaterThan(paid[0]);
    expect(paid[2]).toBeGreaterThan(paid[1]);
    expect(ALLIANCE_REWARDS[2].stars).toBe(1);
  });

  it("pays nothing for a tier that doesn't exist", () => {
    const s = createInitialState(T0);
    const cash = s.cash;
    expect(allianceReward(s, 0, snapshot(s))).toBe(0);
    expect(allianceReward(s, 4, snapshot(s))).toBe(0);
    expect(s.cash).toBe(cash);
  });
});
