// The company showroom (phase 6 of the Automotive Empire plan): a car of the
// collection, driven to a dealer by its transporter, sells at the price the
// player sets. What buyers pay for depends on the car itself (its DNA value,
// development, condition and racing record) and the brand's reputation.
import { CAMPAIGN, SHOWROOM } from "../config/showroom";
import type { GameEvent, GameState, RaceCarState } from "../types";
import { book } from "./materials";
import { campaignOn, repPriceMult } from "./market";
import { carWorth, condition } from "./racing";

/** What the market thinks a car of the collection is worth today. */
export function fairPrice(s: GameState, rc: RaceCarState): number {
  const P = SHOWROOM.pedigree;
  const pedigree = Math.min(P.max, P.win * rc.wins + P.podium * (rc.podiums ?? 0));
  return carWorth(rc) * condition(rc) * repPriceMult(s) * (1 + pedigree);
}

export const clampPrice = (s: GameState, rc: RaceCarState, price: number) => {
  const fair = fairPrice(s, rc);
  return Math.max(fair * SHOWROOM.minPrice, Math.min(fair * SHOWROOM.maxPrice, price));
};

/** Buyers per second for a car at this price. */
export function buyerRate(s: GameState, rc: RaceCarState, price: number): number {
  const ratio = fairPrice(s, rc) / Math.max(1, price);
  return (Math.pow(ratio, SHOWROOM.elasticity) / SHOWROOM.buyerSec) * (campaignOn(s) ? CAMPAIGN.showroom : 1);
}

/** Expected seconds until it sells at this price. */
export const expectedSale = (s: GameState, rc: RaceCarState, price: number) => 1 / Math.max(1e-9, buyerRate(s, rc, price));

/** Changes the asking price of a car on display (or on its way to the showroom). */
export function setPrice(s: GameState, id: number, price: number): boolean {
  const rc = s.racing.cars.find((c) => c.id === id);
  if (!rc?.listing || !Number.isFinite(price)) return false;
  rc.listing.price = clampPrice(s, rc, price);
  return true;
}

/** Buyers walk in: a car on display sells with the chance its price gives it over `dt` seconds. */
export function showroomTick(s: GameState, dt: number, events?: GameEvent[], roll: () => number = Math.random): number {
  let sold = 0;
  for (const rc of [...s.racing.cars]) {
    if (rc.location !== "showroom" || !rc.listing) continue;
    rc.listing.since += dt;
    const p = 1 - Math.exp(-buyerRate(s, rc, rc.listing.price) * dt);
    if (roll() >= p) continue;
    const price = rc.listing.price;
    s.racing.cars.splice(s.racing.cars.indexOf(rc), 1);
    if (s.racing.selected === rc.id) s.racing.selected = s.racing.cars[0]?.id ?? null;
    s.cash += price;
    s.run.moneyEarned += price;
    s.lifetime.moneyEarned += price;
    book(s, "carSales", price);
    s.showroom.sold += 1;
    s.showroom.revenue += price;
    events?.push({ type: "sale", plot: `d:${rc.listing.dealer}`, item: "car", count: 1, amount: price });
    sold += 1;
  }
  return sold;
}

/** A marketing campaign's price: a few minutes of steady income. */
export const campaignCost = (s: GameState) => Math.max(CAMPAIGN.min, Math.max(0, s.chain.steady ?? s.chain.rate) * CAMPAIGN.costSec);

export function startCampaign(s: GameState): boolean {
  const cost = campaignCost(s);
  if (campaignOn(s) || s.cash < cost || !s.chain.firstCar) return false;
  s.cash -= cost;
  book(s, "dealerFees", cost);
  s.showroom.campaignUntil = s.market.t + CAMPAIGN.sec;
  s.showroom.campaigns += 1;
  return true;
}
