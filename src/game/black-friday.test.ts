import { describe, expect, it } from "vitest";
import { SHOP_ITEM_BY_ID } from "./config/shop";
import { snapshot } from "./engine/economy";
import { FESTIVAL, FESTIVAL_GOALS, claimFestivalGoal, festivalNow, festivalTick } from "./engine/festival";
import { computeGlobalMods } from "./engine/modifiers";
import { BLACK_FRIDAY, blackFriday, seasonAt, seasonWindow } from "./engine/season";
import { buyShop, shopBlock, shopPrice } from "./engine/shop";
import { createInitialState } from "./engine/state";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

describe("Black Friday week", () => {
  it("is the day after the fourth Thursday of November", () => {
    expect(blackFriday(2026).getDate()).toBe(27);
    expect(blackFriday(2027).getDate()).toBe(26);
    expect(blackFriday(2028).getDate()).toBe(24);
    // November 2030 starts on a Friday: the latest Black Friday there is
    expect(blackFriday(2030).getDate()).toBe(29);
  });

  it("runs from the Monday before through Cyber Monday, and never into the winter festival", () => {
    expect(seasonAt(at(2026, 10, 22, 23))).toBeNull();
    expect(seasonAt(at(2026, 10, 23, 0))).toBe("blackfriday");
    expect(seasonAt(at(2026, 10, 30, 23))).toBe("blackfriday");
    expect(seasonAt(at(2026, 11, 1, 0))).toBe("winter");
    const w = seasonWindow(at(2026, 10, 27))!;
    expect(w.key).toBe("blackfriday-2026");
    expect(w.start).toBe(new Date(2026, 10, 23).getTime());
    expect(w.end).toBe(new Date(2026, 11, 1).getTime());
    // the latest one ends on 30 November too (December is winter's)
    expect(seasonWindow(at(2030, 10, 30))?.end).toBe(new Date(2030, 11, 1).getTime());
    expect(seasonAt(at(2030, 11, 2))).toBe("winter");
    // Halloween is over by then
    expect(seasonAt(at(2026, 10, 10))).toBeNull();
  });

  it("brings more customers to the dealers, at a small discount, on top of the season's income bonus", () => {
    const before = createInitialState(at(2026, 10, 20));
    const during = createInitialState(at(2026, 10, 25));
    const a = computeGlobalMods(before);
    const b = computeGlobalMods(during);
    expect(b.dealerCap).toBeCloseTo(a.dealerCap * BLACK_FRIDAY.dealerCap);
    expect(b.markup).toBeCloseTo(a.markup + BLACK_FRIDAY.markup);
    expect(b.income).toBeGreaterThan(a.income);
  });

  it("makes the Star items cheaper (at least one Star) and charges the lower price", () => {
    const off = at(2026, 10, 20);
    const on = at(2026, 10, 27);
    expect(shopPrice("warp24", off)).toBe(SHOP_ITEM_BY_ID.warp24.price);
    expect(shopPrice("warp24", on)).toBe(4);
    expect(shopPrice("warp8", on)).toBe(2);
    expect(shopPrice("warp2", on)).toBe(1);
    expect(shopPrice("crate", on)).toBe("free");
    const s = createInitialState(on);
    s.stars = 4;
    expect(shopBlock(s, "warp24", off)).toBe("stars");
    expect(shopBlock(s, "warp24", on)).toBeNull();
    expect(buyShop(s, "warp24", on, snapshot(s))).toBe(true);
    expect(s.stars).toBe(0);
  });

  it("has the festival's three goals and its own livery", () => {
    const now = at(2026, 10, 24);
    const s = createInitialState(now);
    const snap = snapshot(s);
    expect(festivalNow(now)?.season).toBe("blackfriday");
    expect(festivalTick(s, snap, now)).toBe("blackfriday");
    expect(festivalTick(s, snap, now)).toBeNull();
    s.lifetime.carsProduced += s.festival.target!.cars;
    s.lifetime.moneyEarned += s.festival.target!.earned;
    s.racing.stats.wins += s.festival.target!.wins;
    for (const g of FESTIVAL_GOALS) expect(claimFestivalGoal(s, g, snap, now)).not.toBeNull();
    expect(s.racing.skins).toContain(FESTIVAL.skin.blackfriday);
    // after Cyber Monday the goals can't be taken
    expect(festivalNow(at(2026, 11, 1, 1))?.season).toBeUndefined();
  });
});
