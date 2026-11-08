// Partner deals for the racing team (beside the race sponsors of config/racing.ts SPONSORS, who pay
// per race): a brand offers a deal ("win N races in the next H hours with
// our name on the car") for money and Stars. Three offers to choose from, one deal at a time.
// Once the Racing District is open; a deal that runs out comes back as new offers an hour later.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./rewards";
import { dateKey } from "./calendar";

export const SPONSOR_BRANDS = ["voltex", "rapido", "kronos", "oceanic", "zenith", "nitro"] as const;
export type SponsorBrand = (typeof SPONSOR_BRANDS)[number];

export interface SponsorDeal {
  brand: SponsorBrand;
  /** Races to win, and the hours to win them in. */
  wins: number;
  hours: number;
  reward: Reward;
  /** Set when signed: race wins until then, and the deadline. */
  start?: number;
  deadline?: number;
}

export interface SponsorsState {
  offers: SponsorDeal[];
  active: SponsorDeal | null;
  /** No new offers before this time. */
  nextAt: number;
  /** Deals fulfilled. */
  done: number;
  /** The day (dateKey) a deal last paid a Star: at most one a day. */
  starDay: string;
}

export const createSponsors = (): SponsorsState => ({ offers: [], active: null, nextAt: 0, done: 0, starDay: "" });

/**
 * The three deals on offer: small, medium and big (seconds of income, Stars). A team wins about a
 * dozen races an hour when the player races, a few when it races on its own: the big deal is a
 * day's racing, not an hour's.
 */
export const SPONSOR_TIERS: { wins: number; hours: number; income: number; stars: number }[] = [
  { wins: 4, hours: 6, income: 900, stars: 0 },
  { wins: 8, hours: 12, income: 2_400, stars: 0 },
  { wins: 15, hours: 24, income: 5_400, stars: 1 },
];

export const SPONSOR = {
  /** After a deal is paid, new offers come this much later; after one runs out or the offers are turned down, an hour later. */
  afterDone: 2 * 60 * 60_000,
  afterFail: 60 * 60_000,
};

const H = 3_600_000;

export const sponsorProgress = (s: GameState, d: SponsorDeal) => (d.start === undefined ? 0 : Math.max(0, s.racing.stats.wins - d.start));

/** Offers new deals when none is open, and ends a deal whose time ran out. */
export function refreshSponsors(s: GameState, now: number): "offer" | "expired" | null {
  const k = s.sponsors;
  const a = k.active;
  if (a?.deadline !== undefined && now > a.deadline && sponsorProgress(s, a) < a.wins) {
    k.active = null;
    k.nextAt = now + SPONSOR.afterFail;
    return "expired";
  }
  if (!s.racing.unlocked || k.active || k.offers.length || now < k.nextAt) return null;
  // seeded by the time and the company, so a reload does not reroll the offers
  let seed = Math.floor(now / 60_000) ^ Math.floor(s.createdAt / 1000);
  const next = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const brands = [...SPONSOR_BRANDS];
  k.offers = SPONSOR_TIERS.map((t) => {
    const brand = brands.splice(Math.floor(next() * brands.length), 1)[0];
    return { brand, wins: t.wins, hours: t.hours, reward: { incomeSeconds: t.income, ...(t.stars ? { stars: t.stars } : {}) } };
  });
  return "offer";
}

/** Signs one of the offers (by its place in the list). */
export function signSponsor(s: GameState, i: number, now: number): boolean {
  const k = s.sponsors;
  const o = k.offers[i];
  if (!o || k.active) return false;
  k.active = { ...o, start: s.racing.stats.wins, deadline: now + o.hours * H };
  k.offers = [];
  return true;
}

/** Turns the offers down: new ones in an hour. */
export function declineSponsors(s: GameState, now: number): boolean {
  if (!s.sponsors.offers.length) return false;
  s.sponsors.offers = [];
  s.sponsors.nextAt = now + SPONSOR.afterFail;
  return true;
}

/** Takes the pay of a fulfilled deal (while it runs). Returns the money (null: not done). */
export function claimSponsor(s: GameState, snap: EconomySnapshot, now: number): number | null {
  const k = s.sponsors;
  const a = k.active;
  if (!a || sponsorProgress(s, a) < a.wins || (a.deadline !== undefined && now > a.deadline)) return null;
  // one Star a day from the deals at most
  const day = dateKey(now);
  const reward = { ...a.reward };
  if (reward.stars) {
    if (k.starDay === day) delete reward.stars;
    else k.starDay = day;
  }
  const money = rewardCash(reward, snap);
  grantReward(s, reward, snap);
  k.active = null;
  k.done += 1;
  k.nextAt = now + SPONSOR.afterDone;
  return money;
}

/** A fulfilled deal waiting to be paid: for the badge. */
export const sponsorWaiting = (s: GameState) => !!s.sponsors.active && sponsorProgress(s, s.sponsors.active) >= s.sponsors.active.wins;

/** The sponsors of a save, checked. */
export function migrateSponsors(raw: unknown): SponsorsState {
  const out = createSponsors();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const deal = (d: unknown): SponsorDeal | null => {
    if (!d || typeof d !== "object") return null;
    const x = d as Record<string, unknown>;
    // the brand once called Aurum (the race sponsors have an Aurum Bank) is Zenith now
    const brand = x.brand === "aurum" ? "zenith" : x.brand;
    if (!SPONSOR_BRANDS.includes(brand as SponsorBrand)) return null;
    // a deal from before the deals were rebalanced keeps its place (small, medium, big) and takes its new terms
    const tier = SPONSOR_TIERS.find((t) => t.hours === x.hours);
    if (!tier) return null;
    return { brand: brand as SponsorBrand, wins: tier.wins, hours: tier.hours, reward: { incomeSeconds: tier.income, ...(tier.stars ? { stars: tier.stars } : {}) }, start: fin(x.start), deadline: fin(x.deadline) };
  };
  out.offers = Array.isArray(r.offers) ? r.offers.map(deal).filter((d): d is SponsorDeal => !!d).slice(0, SPONSOR_TIERS.length) : [];
  out.active = deal(r.active);
  if (out.active && (out.active.start === undefined || out.active.deadline === undefined)) out.active = null;
  out.nextAt = fin(r.nextAt) ?? 0;
  out.done = Math.max(0, Math.floor(fin(r.done) ?? 0));
  out.starDay = typeof r.starDay === "string" ? r.starDay : "";
  return out;
}
