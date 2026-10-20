import { describe, expect, it } from "vitest";
import { snapshot } from "./engine/economy";
import { INVITE, inviteRewards, inviteWelcome } from "./engine/invites";
import { createInitialState } from "./engine/state";

describe("invite rewards", () => {
  it("a new player's welcome gift: the head start and a little income, no Stars", () => {
    const s = createInitialState(0);
    const before = { cash: s.cash, stars: s.stars, earned: s.lifetime.moneyEarned };
    const money = inviteWelcome(s, snapshot(s));
    expect(money).toBeGreaterThanOrEqual(INVITE.welcome.cash);
    expect(s.cash).toBeCloseTo(before.cash + money);
    expect(s.stars).toBe(before.stars);
    // a reward, not earnings: it counts toward no reset
    expect(s.lifetime.moneyEarned).toBe(before.earned);
  });

  it("each friend's first car pays Stars and income, and never more friends than the limit", () => {
    const s = createInitialState(0);
    const stars = s.stars;
    const one = inviteRewards(s, 1, snapshot(s));
    expect(one.stars).toBe(INVITE.perFriend.stars);
    expect(s.stars).toBe(stars + INVITE.perFriend.stars);
    expect(one.money).toBeGreaterThan(0);
    const many = inviteRewards(s, 999, snapshot(s));
    expect(many.stars).toBe(INVITE.perFriend.stars * INVITE.maxFriends);
    expect(inviteRewards(s, 0, snapshot(s))).toEqual({ stars: 0, money: 0 });
    expect(inviteRewards(s, -3, snapshot(s))).toEqual({ stars: 0, money: 0 });
  });
});
