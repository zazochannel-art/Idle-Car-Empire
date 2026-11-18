// The auction house (supabase/migrations/0035): players put up a car in a limited-edition finish
// they have found, and others buy it for their collector garage. Each different car and finish
// in the garage adds a little income for good.
//
// Nothing of value crosses between two saves. A price is an "ask" of 1–20 units, and each side
// turns units into money in their own game: a unit is 10 minutes of that player's own income. The
// buyer pays from the wallet when the server says the car is theirs; the seller is paid when the
// server says it sold, less a fee. The server keeps the listings and their limits.
import { EDITION_BY_ID, type EditionConfig } from "../config/collection";
import { CAR_BY_ID } from "../config/cars";
import type { CarId, GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { payReward } from "./ledger";

export type EditionId = EditionConfig["id"];

export interface CollectorCar {
  car: CarId;
  edition: EditionId;
  /** When it was bought (ms). */
  at: number;
}

export interface AuctionState {
  /** The collector garage: cars bought, each car and finish once. */
  got: CollectorCar[];
  bought: number;
  sold: number;
  /** Money paid for cars, and made on sales (after the fee). */
  spent: number;
  earned: number;
}

export const createAuction = (): AuctionState => ({ got: [], bought: 0, sold: 0, spent: 0, earned: 0 });

export const AUCTION = {
  /** The auction house opens at this much earned in total. */
  unlockEarned: 1e6,
  /** A unit of price: this many seconds of the player's own income (at least `minUnit`). */
  unitSeconds: 10 * 60,
  minUnit: 2_000,
  askMin: 1,
  askMax: 20,
  /** The house keeps this share of a sale. */
  fee: 0.1,
  /** Each different car in the collector garage: this much more income, up to `maxBonus`. */
  perCar: 0.005,
  maxBonus: 0.1,
};

export const auctionOpen = (s: Pick<GameState, "lifetime">) => s.lifetime.moneyEarned >= AUCTION.unlockEarned;

/** What one unit of price is worth in this game now. */
export const auctionUnit = (snap: EconomySnapshot) => Math.max(AUCTION.minUnit, (snap.rewardIncomePerSec || 0) * AUCTION.unitSeconds);

/** An ask, whole and within range. */
export const clampAsk = (ask: number) => Math.max(AUCTION.askMin, Math.min(AUCTION.askMax, Math.round(Number.isFinite(ask) ? ask : AUCTION.askMin)));

/** The price of an ask in this game. */
export const askPrice = (ask: number, snap: EconomySnapshot) => clampAsk(ask) * auctionUnit(snap);

/** What the seller gets for a sale, after the fee. */
export const saleMoney = (ask: number, snap: EconomySnapshot) => askPrice(ask, snap) * (1 - AUCTION.fee);

const known = (car: string, edition: string) => Object.hasOwn(CAR_BY_ID, car) && Object.hasOwn(EDITION_BY_ID, edition);

export const inGarage = (s: Pick<GameState, "auction">, car: string, edition: string) => (s.auction?.got ?? []).some((g) => g.car === car && g.edition === edition);

/** The finishes the player can put up: the limited editions they found. */
export const sellableEditions = (s: GameState): EditionId[] => [...new Set((s.editions?.got ?? []).map((g) => g.id))].filter((id) => Object.hasOwn(EDITION_BY_ID, id));

/** The models the player can put up: the ones they have built. */
export const sellableCars = (s: GameState): CarId[] => (Object.keys(s.lifetime.carsByType ?? {}) as CarId[]).filter((id) => Object.hasOwn(CAR_BY_ID, id) && (s.lifetime.carsByType[id] ?? 0) > 0);

export type ListBlock = "locked" | "edition" | "car" | null;

/** Why the player can't put this car up (null: they can). */
export function listBlock(s: GameState, car: CarId, edition: EditionId): ListBlock {
  if (!auctionOpen(s)) return "locked";
  if (!sellableEditions(s).includes(edition)) return "edition";
  if (!sellableCars(s).includes(car)) return "car";
  return null;
}

export type BuyBlock = "locked" | "owned" | "cash" | null;

/** Why the player can't buy this listing (null: they can). */
export function buyBlock(s: GameState, car: string, edition: string, ask: number, snap: EconomySnapshot): BuyBlock {
  if (!auctionOpen(s)) return "locked";
  if (inGarage(s, car, edition)) return "owned";
  return s.cash >= askPrice(ask, snap) ? null : "cash";
}

/** Pays for a car the server gave the player and parks it in the collector garage: the price paid. */
export function payPurchase(s: GameState, car: string, edition: string, ask: number, snap: EconomySnapshot, now: number): number {
  if (!known(car, edition)) return 0;
  // the server said yes: take the price, or what is left of it if the wallet moved meanwhile
  const price = Math.min(Math.max(0, s.cash), askPrice(ask, snap));
  s.cash -= price;
  const a = s.auction;
  if (!inGarage(s, car, edition)) a.got.push({ car: car as CarId, edition: edition as EditionId, at: now });
  a.bought += 1;
  a.spent += price;
  return price;
}

/** Pays a sale the server reported: the money paid (into the wallet, as a reward). */
export function paySale(s: GameState, ask: number, snap: EconomySnapshot): number {
  const money = saleMoney(ask, snap);
  payReward(s, money);
  s.auction.sold += 1;
  s.auction.earned += money;
  return money;
}

/** What the collector garage adds to income (0.03 = +3%). */
export const auctionBonus = (s: Pick<GameState, "auction">) => Math.min(AUCTION.maxBonus, (s.auction?.got.length ?? 0) * AUCTION.perCar);

/** A saved auction record, checked. */
export function migrateAuction(raw: unknown): AuctionState {
  const out = createAuction();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  if (Array.isArray(r.got)) {
    for (const x of r.got) {
      if (!x || typeof x !== "object") continue;
      const g = x as Record<string, unknown>;
      if (typeof g.car !== "string" || typeof g.edition !== "string" || !known(g.car, g.edition) || out.got.some((o) => o.car === g.car && o.edition === g.edition)) continue;
      out.got.push({ car: g.car as CarId, edition: g.edition as EditionId, at: pos(g.at) });
    }
  }
  out.bought = Math.floor(pos(r.bought));
  out.sold = Math.floor(pos(r.sold));
  out.spent = pos(r.spent);
  out.earned = pos(r.earned);
  return out;
}
