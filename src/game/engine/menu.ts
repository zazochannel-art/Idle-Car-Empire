// Which screens the Empire menu shows. A new company starts with a few; the rest join the menu
// as the systems behind them start to matter (racing after the first car, the stock market at
// $1B…), so the first minutes are not twenty buttons at once. A screen not open yet is listed
// under "Coming up" with what opens it. Screens are never hidden again once their condition holds,
// and an old save that meets a condition sees its screen at once.
import { IMPERIUM } from "../config/imperium";
import { BUYABLE_TERRITORIES } from "../config/city";
import type { GameState } from "../types";
import { STOCK } from "./stock";

export type MenuTileId =
  | "profile"
  | "story"
  | "economy"
  | "racing"
  | "imperium"
  | "landmarks"
  | "stock"
  | "world"
  | "pass"
  | "leaderboard"
  | "alliance"
  | "cars"
  | "research"
  | "achievements"
  | "stats"
  | "managers"
  | "inbox"
  | "dealers"
  | "logistics"
  | "settings";

/** What still keeps a screen out of the menu. */
export type MenuLock =
  | { kind: "firstCar" }
  | { kind: "territory" }
  | { kind: "earned"; money: number; have: number }
  | { kind: "territories"; n: number; have: number };

/** The Stars screen joins the menu at half the earnings that bring the first Stars. */
export const IMPERIUM_MENU_SHARE = 0.5;

/** Territories bought in the city being played (the Racing District and the campus don't count, as in engine/cities.ts). */
const territoriesOpen = (s: GameState) => BUYABLE_TERRITORIES.filter((t) => s.city.territories?.includes(t.id)).length;
const moreCities = (s: GameState) => Object.keys(s.cities).length > 0;

export function menuLock(s: GameState, id: MenuTileId): MenuLock | null {
  const firstCar = s.chain.firstCar || s.lifetime.carsProduced > 0;
  switch (id) {
    case "racing":
      if (s.racing.unlocked) return null;
      return firstCar ? null : { kind: "firstCar" };
    case "dealers":
    case "logistics":
    case "leaderboard":
    case "pass":
    case "alliance":
      return firstCar ? null : { kind: "firstCar" };
    case "landmarks":
      return territoriesOpen(s) > 0 || moreCities(s) ? null : { kind: "territory" };
    case "stock":
      return s.lifetime.moneyEarned >= STOCK.unlockEarned || s.stock.sold > 0 ? null : { kind: "earned", money: STOCK.unlockEarned, have: s.lifetime.moneyEarned };
    case "imperium": {
      const money = IMPERIUM.minRunEarnings * IMPERIUM_MENU_SHARE;
      return s.stars > 0 || s.lifetime.moneyEarned >= money ? null : { kind: "earned", money, have: s.lifetime.moneyEarned };
    }
    case "world": {
      const n = BUYABLE_TERRITORIES.length;
      const have = territoriesOpen(s);
      return moreCities(s) || have >= n ? null : { kind: "territories", n, have };
    }
    default:
      return null;
  }
}

export const menuOpen = (s: GameState, id: MenuTileId) => menuLock(s, id) === null;
