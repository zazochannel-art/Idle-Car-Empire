// Sponsors for the racing team: a brand offers a deal ("win N races in the next H hours with
// our name on the car") for money and Stars. Three offers to choose from, one deal at a time.
// Once the Racing District is open; a deal that runs out comes back as new offers an hour later.
import type { GameState, Reward } from "../types";
import type { EconomySnapshot } from "./economy";
import { grantReward, rewardCash } from "./rewards";

export const SPONSOR_BRANDS = ["voltex", "rapido", "kronos", "oceanic", "aurum", "nitro"] as const;
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
}

export const createSponsors = (): SponsorsState => ({ offers: [], active: null, nextAt: 0, done: 0 });

/** The three deals on offer: small, medium and big (seconds of income, Stars). */
export const SPONSOR_TIERS: { wins: number; hours: number; income: number; stars: number }[] = [
  { wins: 3, hours: 6, income: 1_800, stars: 0 },
  { wins: 6, hours: 12, income: 4_500, stars: 1 },
  { wins: 10, hours: 24, income: 9_000, stars: 2 },
];

export const SPONSOR = {
  /** After a deal is paid, new offers come this soon; after one runs out or the offers are turned down, an hour later. */
  afterDone: 15 * 60_000,
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
  const money = rewardCash(a.reward, snap);
  grantReward(s, a.reward, snap);
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
    if (!SPONSOR_BRANDS.includes(x.brand as SponsorBrand)) return null;
    const tier = SPONSOR_TIERS.find((t) => t.wins === x.wins && t.hours === x.hours);
    if (!tier) return null;
    return { brand: x.brand as SponsorBrand, wins: tier.wins, hours: tier.hours, reward: { incomeSeconds: tier.income, ...(tier.stars ? { stars: tier.stars } : {}) }, start: fin(x.start), deadline: fin(x.deadline) };
  };
  out.offers = Array.isArray(r.offers) ? r.offers.map(deal).filter((d): d is SponsorDeal => !!d).slice(0, SPONSOR_TIERS.length) : [];
  out.active = deal(r.active);
  if (out.active && (out.active.start === undefined || out.active.deadline === undefined)) out.active = null;
  out.nextAt = fin(r.nextAt) ?? 0;
  out.done = Math.max(0, Math.floor(fin(r.done) ?? 0));
  return out;
}
