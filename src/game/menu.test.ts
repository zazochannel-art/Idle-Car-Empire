import { describe, expect, it } from "vitest";
import { BUYABLE_TERRITORIES } from "./config/city";
import { IMPERIUM } from "./config/imperium";
import { IMPERIUM_MENU_SHARE, menuLock, menuOpen, type MenuTileId } from "./engine/menu";
import { createInitialState } from "./engine/state";
import { STOCK } from "./engine/stock";

const T0 = 1_700_000_000_000;
const ALWAYS: MenuTileId[] = ["profile", "story", "economy", "cars", "research", "achievements", "stats", "managers", "inbox", "settings"];
const AFTER_CAR: MenuTileId[] = ["racing", "dealers", "logistics", "leaderboard", "pass", "alliance"];

describe("the Empire menu opens as the company grows", () => {
  it("a new company sees the basics and nothing else", () => {
    const s = createInitialState(T0);
    for (const id of ALWAYS) expect(menuOpen(s, id), id).toBe(true);
    for (const id of [...AFTER_CAR, "landmarks", "stock", "imperium", "world"] as MenuTileId[]) expect(menuOpen(s, id), id).toBe(false);
    expect(menuLock(s, "racing")).toEqual({ kind: "firstCar" });
  });

  it("the first car opens racing, dealers, logistics and the social screens", () => {
    const s = createInitialState(T0);
    s.chain.firstCar = true;
    for (const id of AFTER_CAR) expect(menuOpen(s, id), id).toBe(true);
    expect(menuOpen(s, "stock")).toBe(false);
  });

  it("a territory opens the Works; all of them, the World", () => {
    const s = createInitialState(T0);
    s.city.territories = [BUYABLE_TERRITORIES[0].id];
    expect(menuOpen(s, "landmarks")).toBe(true);
    expect(menuLock(s, "world")).toEqual({ kind: "territories", n: BUYABLE_TERRITORIES.length, have: 1 });
    s.city.territories = BUYABLE_TERRITORIES.map((t) => t.id);
    expect(menuOpen(s, "world")).toBe(true);
  });

  it("the Racing District alone opens no Works", () => {
    const s = createInitialState(T0);
    s.city.territories = ["racing"];
    expect(menuOpen(s, "landmarks")).toBe(false);
  });

  it("the stock market at $1B, the Stars at half the first Stars' earnings", () => {
    const s = createInitialState(T0);
    s.lifetime.moneyEarned = STOCK.unlockEarned - 1;
    expect(menuOpen(s, "stock")).toBe(false);
    s.lifetime.moneyEarned = STOCK.unlockEarned;
    expect(menuOpen(s, "stock")).toBe(true);
    expect(menuOpen(s, "imperium")).toBe(false);
    s.lifetime.moneyEarned = IMPERIUM.minRunEarnings * IMPERIUM_MENU_SHARE;
    expect(menuOpen(s, "imperium")).toBe(true);
  });

  it("an old save keeps what it already uses", () => {
    const s = createInitialState(T0);
    s.stars = 3;
    s.racing.unlocked = true;
    expect(menuOpen(s, "imperium")).toBe(true);
    expect(menuOpen(s, "racing")).toBe(true);
  });
});
