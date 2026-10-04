// Reasons to come back (config/live.ts): VIP orders, the weekly racing
// season and the weekend Auto Show. Real time (`now`, ms) drives them.
import { CARS, CAR_BY_ID, DESIGN_COLORS, DESIGN_MAX, type CarConfig } from "../config/cars";
import { RACE_EVENTS } from "../config/racing";
import { SEASON_CONSOLATION, SEASON_POINTS, SEASON_REWARDS, SEASON_RIVALS, SHOW, SHOW_RIVALS, VIP, VIP_CLIENTS, type VipClient } from "../config/live";
import type { CarDesign, CarId, GameState, QualityMode } from "../types";
import { carValue, modelStats } from "./chain";
import { designStats } from "./design";
import { unlockedCarIds, type EconomySnapshot } from "./economy";
import { dateKey } from "./progress";

const DAY = 86_400_000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
const steady = (s: GameState) => Math.max(0, s.chain.steady ?? s.chain.rate);

// ───────────────────────────── VIP orders ─────────────────────────────

export interface VipOrder {
  id: string;
  client: VipClient;
  car: CarId;
  /** Paint the client wants (the model's Design studio colour). */
  color: string;
  /** Built on a line in Premium mode. */
  premium: boolean;
  n: number;
  minutes: number;
  /** Cash paid on delivery (fixed when offered). */
  pay: number;
  stars: number;
  /** Offer: when it is withdrawn. Accepted: cars built so far and the deadline. */
  expires?: number;
  made?: number;
  deadline?: number;
}

export interface VipState {
  offer: VipOrder | null;
  active: VipOrder | null;
  nextAt: number;
  done: number;
}

export const createVip = (): VipState => ({ offer: null, active: null, nextAt: 0, done: 0 });

/** Offers, withdraws and fails VIP orders as time passes. */
export function vipTick(s: GameState, now: number, snap: EconomySnapshot): "offer" | "failed" | "expired" | null {
  const v = s.vip;
  if (v.active?.deadline !== undefined && now > v.active.deadline && (v.active.made ?? 0) < v.active.n) {
    v.active = null;
    v.nextAt = now + VIP.failCooldownMs;
    return "failed";
  }
  if (v.offer?.expires !== undefined && now > v.offer.expires) {
    v.offer = null;
    v.nextAt = now + VIP.cooldownMs;
    return "expired";
  }
  if (v.offer || v.active || !s.chain.firstCar) return null;
  if (v.nextAt === 0) {
    v.nextAt = now + VIP.firstAfterMs;
    return null;
  }
  if (now < v.nextAt) return null;
  const cars = CARS.filter((c) => unlockedCarIds(s, snap.gm).has(c.id));
  if (!cars.length) return null;
  const r = rng(hash(`vip:${Math.floor(now / 60_000)}:${s.createdAt}`));
  // one of the two best models the company makes
  const top = cars.slice(-2);
  const car = top[Math.floor(r() * top.length)];
  const n = VIP.cars[Math.floor(r() * VIP.cars.length)];
  const premium = r() < 0.4;
  v.offer = {
    id: `v${now}`,
    client: VIP_CLIENTS[Math.floor(r() * VIP_CLIENTS.length)],
    car: car.id,
    color: DESIGN_COLORS[1 + Math.floor(r() * (DESIGN_COLORS.length - 1))],
    premium,
    n,
    minutes: VIP.minutes[Math.floor(r() * VIP.minutes.length)],
    pay: n * carValue(s, car, snap.gm) * VIP.valueMult,
    stars: premium ? VIP.premiumStars : VIP.stars,
    expires: now + VIP.offerMs,
  };
  return "offer";
}

export function acceptVip(s: GameState, now: number): boolean {
  const o = s.vip.offer;
  if (!o || s.vip.active) return false;
  s.vip.active = { ...o, expires: undefined, made: 0, deadline: now + o.minutes * 60_000 };
  s.vip.offer = null;
  return true;
}

export function declineVip(s: GameState, now: number): boolean {
  if (!s.vip.offer) return false;
  s.vip.offer = null;
  s.vip.nextAt = now + VIP.cooldownMs;
  return true;
}

/** Whether a car just built counts for the running VIP order. */
export function vipMatches(s: GameState, car: CarId, mode: QualityMode): boolean {
  const a = s.vip.active;
  return !!a && a.car === car && s.designs[car].color === a.color && (!a.premium || mode === "premium");
}

/** Called for every car built. */
export function vipBuilt(s: GameState, car: CarId, n: number, mode: QualityMode) {
  const a = s.vip.active;
  if (a && vipMatches(s, car, mode)) a.made = Math.min(a.n, (a.made ?? 0) + n);
}

export function claimVip(s: GameState, now: number): boolean {
  const a = s.vip.active;
  if (!a || (a.made ?? 0) < a.n) return false;
  s.cash += a.pay;
  s.run.moneyEarned += a.pay;
  s.lifetime.moneyEarned += a.pay;
  s.stars += a.stars;
  s.quality.rep = Math.min(100, s.quality.rep + VIP.rep);
  s.vip.active = null;
  s.vip.done += 1;
  s.vip.nextAt = now + VIP.cooldownMs;
  return true;
}

// ───────────────────────────── racing season ─────────────────────────────

export interface SeasonResult {
  week: string;
  points: number;
  rank: number;
  claimed: boolean;
}

export interface SeasonState {
  week: string;
  points: number;
  races: number;
  last: SeasonResult | null;
}

export const createSeason = (): SeasonState => ({ week: "", points: 0, races: 0, last: null });

/** Weeks run Monday to Monday (UTC). */
export const weekIndex = (now: number) => Math.floor((now / DAY + 3) / 7);
export const weekKey = (now: number) => `w${weekIndex(now)}`;
export const weekStart = (now: number) => (weekIndex(now) * 7 - 3) * DAY;

/** How much an event's result is worth: harder events count more. */
export const eventWeight = (eventId: string) => 1 + Math.max(0, RACE_EVENTS.findIndex((e) => e.id === eventId)) * 0.25;

/** The weight of the hardest event the team may enter (the rivals scale with it). */
export function teamWeight(s: GameState): number {
  let w = 1;
  for (const e of RACE_EVENTS) if (s.racing.rep >= e.minRep) w = Math.max(w, eventWeight(e.id));
  return w;
}

/** Points for a finished race (called by the racing engine). */
export function addSeasonPoints(s: GameState, position: number, eventId: string) {
  s.season.points += (SEASON_POINTS[position] ?? 0) * eventWeight(eventId);
  s.season.races += 1;
}

export interface SeasonRow {
  id: string;
  points: number;
  you: boolean;
}

/** The week's table: the rivals score through the week, the team as it races. */
export function seasonTable(s: GameState, now: number, week = s.season.week || weekKey(now), points = s.season.points, final = false): SeasonRow[] {
  const idx = Number(week.slice(1)) || weekIndex(now);
  const f = final ? 1 : Math.max(0, Math.min(1, (now - (idx * 7 - 3) * DAY) / (7 * DAY)));
  const r = rng(hash(`${week}:${s.createdAt}`));
  const w = teamWeight(s);
  const rows: SeasonRow[] = SEASON_RIVALS.map((t) => ({ id: t.id, points: Math.round(t.target * w * f * (0.85 + 0.3 * r())), you: false }));
  rows.push({ id: "you", points: Math.round(points), you: true });
  // ties go to the team
  return rows.sort((a, b) => b.points - a.points || Number(b.you) - Number(a.you));
}

/** A new week: last week's result waits to be claimed. */
export function seasonTick(s: GameState, now: number): boolean {
  const key = weekKey(now);
  if (s.season.week === key) return false;
  if (s.season.week && s.season.races > 0) {
    const table = seasonTable(s, now, s.season.week, s.season.points, true);
    s.season.last = { week: s.season.week, points: Math.round(s.season.points), rank: table.findIndex((r) => r.you), claimed: false };
  }
  s.season.week = key;
  s.season.points = 0;
  s.season.races = 0;
  return true;
}

export function seasonReward(rank: number) {
  return SEASON_REWARDS[rank] ?? { stars: 0, parts: SEASON_CONSOLATION.parts, incomeSeconds: 0 };
}

export function claimSeason(s: GameState): boolean {
  const l = s.season.last;
  if (!l || l.claimed) return false;
  const rw = seasonReward(l.rank);
  const cash = steady(s) * rw.incomeSeconds;
  s.cash += cash;
  s.stars += rw.stars;
  s.racing.parts += rw.parts;
  l.claimed = true;
  return true;
}

// ───────────────────────────── weekend Auto Show ─────────────────────────────

export interface ShowEntry {
  name: string;
  car: CarId;
  score: number;
  you: boolean;
}

export interface ShowState {
  /** The weekend (its Saturday) the company last entered. */
  key: string;
  car: CarId | null;
  rank: number;
  board: ShowEntry[];
  claimed: boolean;
}

export const createShow = (): ShowState => ({ key: "", car: null, rank: -1, board: [], claimed: false });

export const showOpen = (now: number) => SHOW.days.includes(new Date(now).getDay());
/** The Saturday of the weekend `now` falls in (the show's key). */
export function showKey(now: number): string {
  const back = (new Date(now).getDay() + 1) % 7;
  return dateKey(now - back * DAY);
}

/** What the judges see: looks, comfort, build quality and power. */
export function scoreOf(d: { design: number; comfort: number; quality: number; hp: number }): number {
  return Math.round(d.design * 1.2 + d.comfort * 0.6 + d.quality * 0.6 + d.hp / 8);
}
export const showScore = (car: CarConfig, design: CarDesign, grade = car.grade) => scoreOf(designStats(car, design, grade));

/** Enters a model in this weekend's show; the judges decide at once. */
export function enterShow(s: GameState, car: CarId, now: number, unlocked: Set<CarId>): boolean {
  const key = showKey(now);
  if (!showOpen(now) || s.show.key === key || !unlocked.has(car)) return false;
  const cfg = CAR_BY_ID[car];
  const mine = scoreOf(modelStats(s, cfg));
  const r = rng(hash(`show:${key}:${s.createdAt}`));
  const board: ShowEntry[] = SHOW_RIVALS.slice(0, SHOW.rivals).map((name) => {
    const tier = Math.max(1, Math.min(CARS.length, cfg.tier + Math.floor(r() * 3) - 1));
    const rc = CARS[tier - 1];
    const lv = () => Math.floor(r() * (DESIGN_MAX + 1));
    const design: CarDesign = { name: "", engine: lv(), interior: lv(), rims: lv(), paint: lv(), color: "" };
    return { name, car: rc.id, score: showScore(rc, design), you: false };
  });
  board.push({ name: s.designs[car].name, car, score: mine, you: true });
  board.sort((a, b) => b.score - a.score || Number(b.you) - Number(a.you));
  s.show = { key, car, rank: board.findIndex((e) => e.you), board, claimed: false };
  return true;
}

export function showReward(rank: number) {
  return SHOW.rewards[rank] ?? { incomeSeconds: SHOW.consolationSeconds, stars: 0, rep: 0 };
}

export function claimShow(s: GameState): boolean {
  const sh = s.show;
  if (!sh.car || sh.claimed || sh.rank < 0) return false;
  const rw = showReward(sh.rank);
  s.cash += steady(s) * rw.incomeSeconds;
  s.stars += rw.stars;
  s.quality.rep = Math.min(100, s.quality.rep + rw.rep);
  sh.claimed = true;
  return true;
}

// ───────────────────────────── saves ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

function migrateVipOrder(raw: unknown): VipOrder | null {
  if (!isObj(raw) || typeof raw.car !== "string" || !(raw.car in CAR_BY_ID)) return null;
  const client = VIP_CLIENTS.includes(raw.client as VipClient) ? (raw.client as VipClient) : "collector";
  const o: VipOrder = {
    id: str(raw.id, "v0"),
    client,
    car: raw.car as CarId,
    color: DESIGN_COLORS.includes(str(raw.color)) ? str(raw.color) : DESIGN_COLORS[1],
    premium: raw.premium === true,
    n: Math.max(1, Math.floor(num(raw.n, 1))),
    minutes: Math.max(1, num(raw.minutes, 60)),
    pay: Math.max(0, num(raw.pay)),
    stars: Math.max(0, Math.floor(num(raw.stars))),
  };
  if (raw.expires !== undefined) o.expires = num(raw.expires);
  if (raw.made !== undefined) o.made = Math.max(0, num(raw.made));
  if (raw.deadline !== undefined) o.deadline = num(raw.deadline);
  return o;
}

export function migrateLive(raw: Json, s: GameState) {
  const v = isObj(raw.vip) ? raw.vip : {};
  s.vip = { offer: migrateVipOrder(v.offer), active: migrateVipOrder(v.active), nextAt: Math.max(0, num(v.nextAt)), done: Math.max(0, Math.floor(num(v.done))) };
  const se = isObj(raw.season) ? raw.season : {};
  const last = isObj(se.last) ? se.last : null;
  s.season = {
    week: str(se.week),
    points: Math.max(0, num(se.points)),
    races: Math.max(0, Math.floor(num(se.races))),
    last: last ? { week: str(last.week), points: Math.max(0, num(last.points)), rank: Math.max(0, Math.floor(num(last.rank))), claimed: last.claimed === true } : null,
  };
  const sh = isObj(raw.show) ? raw.show : {};
  const car = typeof sh.car === "string" && sh.car in CAR_BY_ID ? (sh.car as CarId) : null;
  const board = Array.isArray(sh.board)
    ? sh.board.filter(isObj).filter((e) => typeof e.car === "string" && e.car in CAR_BY_ID).map((e) => ({ name: str(e.name), car: e.car as CarId, score: num(e.score), you: e.you === true }))
    : [];
  s.show = { key: str(sh.key), car, rank: car ? Math.floor(num(sh.rank, -1)) : -1, board, claimed: sh.claimed === true };
}
