// Prototype development, export overseas, the truck & bus division and star
// engineers (config/expansion.ts). Real time (`now`, ms) drives the slow
// parts; the chain tick runs the export ships and the division's line.
import { CAR_BY_ID, type CarClass } from "../config/cars";
import { COMPONENT_BY_ID } from "../config/chain";
import { RIVAL_TEAMS } from "../config/racing";
import {
  ENGINEER,
  ENGINEERS,
  ENGINEER_BY_ID,
  EXPORT,
  EXPORT_BY_ID,
  FLEET,
  FLEET_BY_ID,
  FLEET_PRODUCTS,
  FOCUS_FIT,
  PAY,
  PROTO,
  PROTO_FOCUSES,
  type EngineerId,
  type ExportMarketId,
  type FleetClient,
  type FleetProduct,
  type PayLevel,
  type ProtoFocus,
} from "../config/expansion";
import type { CarId, ComponentId, GameState } from "../types";
import { componentPrice } from "./costs";
import { book, payOrOwe } from "./materials";

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
const steady = (s: GameState) => Math.max(0, s.chain.steady ?? s.chain.rate);
const credit = (s: GameState, amount: number, key: "carSales" | "partSales") => {
  s.cash += amount;
  s.run.moneyEarned += amount;
  s.lifetime.moneyEarned += amount;
  book(s, key, amount);
};

// ───────────────────────────── prototypes ─────────────────────────────

export type ProtoStage = "concept" | "tunnel" | "track";
export interface ProtoProject {
  car: CarId;
  focus: ProtoFocus;
  /** The stage under way (or just finished when `until` has passed). */
  stage: ProtoStage;
  until: number;
  score: number;
}
export interface ProtoState {
  active: ProtoProject | null;
  /** Launched models and their final score (0–100). */
  done: Partial<Record<CarId, number>>;
  /** The model being launched and when the hype fades (market time, s). */
  hype: { car: CarId; until: number } | null;
}
export const createProto = (): ProtoState => ({ active: null, done: {}, hype: null });

export const hasEngineer = (s: GameState, id: EngineerId) => s.engineers.hired.some((e) => e.id === id);

/** The model's permanent value from its launch. */
export function protoValueMult(s: GameState, car: CarId): number {
  return 1 + (PROTO.maxValue * (s.proto.done[car] ?? 0)) / 100;
}

/** Customers rush to a model while its launch hype lasts. */
export function hypeDemand(s: GameState, car: CarId | undefined): number {
  const h = s.proto.hype;
  return car && h && h.car === car && s.market.t < h.until ? PROTO.hypeDemand : 1;
}

export const protoReady = (s: GameState, now: number) => !!s.proto.active && now >= s.proto.active.until;
export const focusFits = (cls: CarClass, f: ProtoFocus) => FOCUS_FIT[cls] === f;

/** Stage 1: the concept. `base` is the model's base value (costs scale with it). */
export function startPrototype(s: GameState, car: CarId, focus: ProtoFocus, now: number, base: number): boolean {
  const cost = base * PROTO.concept.cost;
  if (s.proto.active || s.proto.done[car] !== undefined || !PROTO_FOCUSES.includes(focus) || !(cost > 0) || s.cash < cost) return false;
  s.cash -= cost;
  const fit = focusFits(CAR_BY_ID[car].class, focus);
  s.proto.active = { car, focus, stage: "concept", until: now + PROTO.concept.minutes * 60_000, score: fit ? PROTO.concept.fit : PROTO.concept.miss };
  return true;
}

/** Stage 2: the wind tunnel (effort 0–2). */
export function windTunnel(s: GameState, effort: number, now: number, base: number): boolean {
  const a = s.proto.active;
  const opt = PROTO.tunnel[effort];
  if (!a || !opt || a.stage !== "concept" || now < a.until || s.cash < base * opt.cost) return false;
  s.cash -= base * opt.cost;
  const r = rng(Math.floor(now / 1000) ^ 0x5eed);
  a.score += opt.score + Math.round((r() * 2 - 1) * PROTO.noise);
  a.stage = "tunnel";
  a.until = now + opt.minutes * 60_000;
  return true;
}

/** Stage 3: testing on the track (better with a racing team). */
export function trackTest(s: GameState, now: number, base: number): boolean {
  const a = s.proto.active;
  if (!a || a.stage !== "tunnel" || now < a.until || s.cash < base * PROTO.track.cost) return false;
  s.cash -= base * PROTO.track.cost;
  a.score += s.racing.unlocked ? PROTO.track.racing : PROTO.track.plain;
  a.stage = "track";
  a.until = now + PROTO.track.minutes * 60_000;
  return true;
}

/** The launch with a marketing campaign (0–2): the model is worth more for good, and the hype sells it fast. */
export function launchProto(s: GameState, campaign: number, now: number, base: number): number | null {
  const a = s.proto.active;
  const opt = PROTO.campaign[campaign];
  if (!a || !opt || a.stage !== "track" || now < a.until || s.cash < base * opt.cost) return null;
  s.cash -= base * opt.cost;
  const score = Math.max(0, Math.min(100, a.score + opt.score + (hasEngineer(s, "otto") ? ENGINEER.protoBonus : 0)));
  s.proto.done[a.car] = score;
  s.proto.hype = { car: a.car, until: s.market.t + opt.hypeMin * 60 };
  s.proto.active = null;
  return score;
}

// ───────────────────────────── export ─────────────────────────────

export interface ExportShip {
  id: number;
  market: ExportMarketId;
  cars: CarId[];
  value: number;
  t: number;
  dur: number;
}
export interface ExportState {
  open: ExportMarketId[];
  /** Cars waiting at the port for the next ship to each market. */
  dock: Partial<Record<ExportMarketId, { cars: CarId[]; value: number; wait: number }>>;
  ships: ExportShip[];
  nextShip: number;
  sold: number;
}
export const createExport = (): ExportState => ({ open: [], dock: {}, ships: [], nextShip: 1, sold: 0 });

/** The plot that serves as the company's port (an Export Terminal or an Airport). */
export function portPlot(s: GameState): string | null {
  for (const [id, b] of Object.entries(s.city.buildings)) if (b.type === "exportTerminal" || b.type === "airport") return id;
  return null;
}

export function openMarket(s: GameState, id: ExportMarketId): boolean {
  const m = EXPORT_BY_ID[id];
  if (!m || s.export.open.includes(id) || !portPlot(s) || s.cash < m.cost) return false;
  s.cash -= m.cost;
  s.export.open.push(id);
  return true;
}

export const isExportRoute = (route: string | undefined): route is `export:${ExportMarketId}` => !!route && route.startsWith("export:") && route.slice(7) in EXPORT_BY_ID;

/** What a car fetches in a market (before duty), as a share of its home value. */
export const exportMult = (market: ExportMarketId, car: CarId) => 1 + (EXPORT_BY_ID[market].wants.includes(car) ? EXPORT.wanted : EXPORT.other);

/** Cars unloaded at the port wait for the next ship to their market. */
export function dockCars(s: GameState, market: ExportMarketId, cars: CarId[], value: number) {
  const d = (s.export.dock[market] ??= { cars: [], value: 0, wait: 0 });
  d.cars.push(...cars);
  d.value += value;
}

/** Ships leave when full (or after a wait) and sell their cars on arrival. Returns the money made. */
export function exportTick(s: GameState, dt: number): number {
  const E = s.export;
  let made = 0;
  for (const [market, d] of Object.entries(E.dock) as [ExportMarketId, { cars: CarId[]; value: number; wait: number }][]) {
    if (!d.cars.length) {
      d.wait = 0;
      continue;
    }
    d.wait += dt;
    if (d.cars.length >= EXPORT.shipCars || d.wait >= EXPORT.shipWait) {
      const n = Math.min(d.cars.length, EXPORT.shipCars);
      const cars = d.cars.splice(0, n);
      const value = (d.value * n) / (n + d.cars.length);
      d.value -= value;
      d.wait = 0;
      E.ships.push({ id: E.nextShip++, market, cars, value, t: 0, dur: EXPORT_BY_ID[market].voyage });
      // paid, or on the company's account: never booked without being paid
      payOrOwe(s, EXPORT.shipFee);
      book(s, "logistics", EXPORT.shipFee);
    }
  }
  const keep: ExportShip[] = [];
  for (const sh of E.ships) {
    sh.t += dt;
    if (sh.t < sh.dur) {
      keep.push(sh);
      continue;
    }
    const each = sh.value / Math.max(1, sh.cars.length);
    const price = sh.cars.reduce((a, c) => a + each * exportMult(sh.market, c), 0);
    const duty = price * EXPORT_BY_ID[sh.market].duty;
    credit(s, price, "carSales");
    s.cash -= duty;
    book(s, "tax", duty);
    s.run.carsSold += sh.cars.length;
    s.lifetime.carsSold += sh.cars.length;
    E.sold += sh.cars.length;
    made += price - duty;
  }
  E.ships = keep;
  return made;
}

// ───────────────────────────── truck & bus division ─────────────────────────────

export interface FleetOrder {
  client: FleetClient;
  product: FleetProduct;
  n: number;
  minutes: number;
  made: number;
  /** Offer: withdrawn at `expires`; accepted: due at `deadline`. */
  expires?: number;
  deadline?: number;
}
export interface FleetState {
  product: FleetProduct;
  carry: number;
  built: number;
  earned: number;
  order: FleetOrder | null;
  nextOrderAt: number;
  done: number;
}
export const createFleet = (): FleetState => ({ product: "van", carry: 0, built: 0, earned: 0, order: null, nextOrderAt: 0, done: 0 });

export const fleetPlants = (s: GameState) => Object.values(s.city.buildings).filter((b) => b.type === "fleetPlant");

/** Vehicles the division builds per second. */
export function fleetRate(s: GameState, speed = 1): number {
  const p = FLEET_BY_ID[s.fleet.product];
  return fleetPlants(s).reduce((a, b) => a + (1 + FLEET.perLevel * (b.level - 1)) / p.time, 0) * speed;
}

/** Parts bought for one vehicle, and what it sells for. */
export function fleetUnit(product: FleetProduct): { cost: number; price: number } {
  const p = FLEET_BY_ID[product];
  const cost = (Object.entries(p.parts) as [ComponentId, number][]).reduce((a, [c, n]) => a + componentPrice(c, 1) * n, 0);
  return { cost, price: cost * p.markup };
}

/** The division's line: buys parts, sells vehicles (fleet orders pay a bonus). */
export function fleetTick(s: GameState, dt: number, speed = 1): number {
  if (!fleetPlants(s).length) return 0;
  const F = s.fleet;
  F.carry += fleetRate(s, speed) * dt;
  let made = 0;
  while (F.carry >= 1) {
    F.carry -= 1;
    const { cost, price } = fleetUnit(F.product);
    const o = F.order;
    const forOrder = !!o && o.deadline !== undefined && o.product === F.product && o.made < o.n;
    const sale = price * (forOrder ? 1 + FLEET.orderBonus : 1);
    payOrOwe(s, cost);
    book(s, "materials", cost);
    credit(s, sale, "carSales");
    if (forOrder) o!.made += 1;
    F.built += 1;
    F.earned += sale - cost;
    made += sale - cost;
  }
  return made;
}

/** Offers, withdraws and fails fleet orders. */
export function fleetOrderTick(s: GameState, now: number): "offer" | "failed" | "expired" | null {
  const F = s.fleet;
  if (!fleetPlants(s).length) return null;
  const o = F.order;
  if (o?.deadline !== undefined && now > o.deadline && o.made < o.n) {
    F.order = null;
    F.nextOrderAt = now + FLEET.orderEveryMs;
    return "failed";
  }
  if (o?.expires !== undefined && now > o.expires) {
    F.order = null;
    F.nextOrderAt = now + FLEET.orderEveryMs;
    return "expired";
  }
  if (o) return null;
  if (F.nextOrderAt === 0) {
    F.nextOrderAt = now + 5 * 60_000;
    return null;
  }
  if (now < F.nextOrderAt) return null;
  const r = rng(Math.floor(now / 60_000) ^ 0xf1ee7);
  const product = FLEET_PRODUCTS[Math.floor(r() * FLEET_PRODUCTS.length)].id;
  const minutes = FLEET.orderMinutes[Math.floor(r() * FLEET.orderMinutes.length)];
  const rate = fleetPlants(s).reduce((a, b) => a + (1 + FLEET.perLevel * (b.level - 1)) / FLEET_BY_ID[product].time, 0);
  F.order = { client: FLEET.clients[Math.floor(r() * FLEET.clients.length)], product, n: Math.max(3, Math.round(rate * 60 * FLEET.orderSizeMin)), minutes, made: 0, expires: now + 20 * 60_000 };
  return "offer";
}

export function acceptFleetOrder(s: GameState, now: number): boolean {
  const o = s.fleet.order;
  if (!o || o.deadline !== undefined) return false;
  o.deadline = now + o.minutes * 60_000;
  delete o.expires;
  s.fleet.product = o.product;
  return true;
}

export function declineFleetOrder(s: GameState, now: number): boolean {
  const o = s.fleet.order;
  if (!o || o.deadline !== undefined) return false;
  s.fleet.order = null;
  s.fleet.nextOrderAt = now + FLEET.orderEveryMs;
  return true;
}

export function finishFleetOrder(s: GameState, now: number): boolean {
  const o = s.fleet.order;
  if (!o || o.deadline === undefined || o.made < o.n) return false;
  s.fleet.order = null;
  s.fleet.done += 1;
  s.fleet.nextOrderAt = now + FLEET.orderEveryMs;
  s.quality.rep = Math.min(100, s.quality.rep + 2);
  return true;
}

export function setFleetProduct(s: GameState, p: FleetProduct): boolean {
  if (!FLEET_BY_ID[p] || s.fleet.product === p) return false;
  s.fleet.product = p;
  return true;
}

// ───────────────────────────── star engineers ─────────────────────────────

export interface EngineersState {
  hired: { id: EngineerId; pay: PayLevel }[];
  candidate: { id: EngineerId; until: number } | null;
  /** A rival's offer to one of them: match it before `until`, or they leave. */
  poach: { id: EngineerId; team: string; cost: number; until: number } | null;
  nextCandidate: number;
  nextPoach: number;
  lost: number;
}
export const createEngineers = (): EngineersState => ({ hired: [], candidate: null, poach: null, nextCandidate: 0, nextPoach: 0, lost: 0 });

export const signingFee = (s: GameState) => Math.max(ENGINEER.signMin, steady(s) * ENGINEER.signSeconds);
/** What the team costs per second. */
export const salaries = (s: GameState) => s.engineers.hired.reduce((a, e) => a + ENGINEER_BY_ID[e.id].salary * PAY[e.pay].mult * steady(s), 0);

export type EngineerEvent = "candidate" | "poach" | "lost" | null;

/** Pays salaries, brings candidates, and lets rivals try to poach. */
export function engineersTick(s: GameState, now: number, dt: number): EngineerEvent {
  const E = s.engineers;
  const pay = salaries(s) * dt;
  if (pay > 0) {
    payOrOwe(s, pay);
    book(s, "labor", pay);
  }
  if (E.poach && now > E.poach.until) {
    E.hired = E.hired.filter((e) => e.id !== E.poach!.id);
    E.poach = null;
    E.lost += 1;
    return "lost";
  }
  if (E.candidate && now > E.candidate.until) {
    E.candidate = null;
    E.nextCandidate = now + ENGINEER.candidateEveryMs;
  }
  if (!s.chain.firstCar) return null;
  const r = rng(Math.floor(now / 60_000) ^ 0xe9);
  if (!E.candidate && now >= E.nextCandidate) {
    const free = ENGINEERS.filter((e) => !E.hired.some((h) => h.id === e.id));
    if (free.length && E.hired.length < ENGINEER.slots) {
      E.candidate = { id: free[Math.floor(r() * free.length)].id, until: now + ENGINEER.candidateStayMs };
      E.nextCandidate = now + ENGINEER.candidateEveryMs;
      return "candidate";
    }
    E.nextCandidate = now + ENGINEER.candidateEveryMs;
  }
  if (!E.poach && E.hired.length && now >= E.nextPoach) {
    const first = E.nextPoach === 0;
    E.nextPoach = now + ENGINEER.poachEveryMs;
    if (first) return null;
    const target = E.hired[Math.floor(r() * E.hired.length)];
    if (r() < PAY[target.pay].poach) {
      E.poach = { id: target.id, team: RIVAL_TEAMS[Math.floor(r() * RIVAL_TEAMS.length)].name, cost: Math.max(ENGINEER.signMin, steady(s) * ENGINEER.counterSeconds), until: now + ENGINEER.counterMs };
      return "poach";
    }
  }
  return null;
}

export function hireEngineer(s: GameState): boolean {
  const E = s.engineers;
  const fee = signingFee(s);
  if (!E.candidate || E.hired.length >= ENGINEER.slots || s.cash < fee) return false;
  s.cash -= fee;
  E.hired.push({ id: E.candidate.id, pay: "fair" });
  E.candidate = null;
  return true;
}

export function setEngineerPay(s: GameState, id: EngineerId, pay: PayLevel): boolean {
  const e = s.engineers.hired.find((h) => h.id === id);
  if (!e || !(pay in PAY) || e.pay === pay) return false;
  e.pay = pay;
  return true;
}

/** Match the rival's offer: they stay, and won't take less than fair pay. */
export function counterOffer(s: GameState): boolean {
  const p = s.engineers.poach;
  if (!p || s.cash < p.cost) return false;
  s.cash -= p.cost;
  const e = s.engineers.hired.find((h) => h.id === p.id);
  if (e && e.pay === "low") e.pay = "fair";
  s.engineers.poach = null;
  return true;
}

export function letGo(s: GameState, id: EngineerId): boolean {
  const E = s.engineers;
  if (!E.hired.some((h) => h.id === id)) return false;
  E.hired = E.hired.filter((h) => h.id !== id);
  if (E.poach?.id === id) E.poach = null;
  return true;
}

/** Mei Chen: fewer defects. */
export const defectMult = (s: GameState) => (hasEngineer(s, "mei") ? ENGINEER.defectMult : 1);

// ───────────────────────────── saves ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const isCar = (v: unknown): v is CarId => typeof v === "string" && v in CAR_BY_ID;
const isMarket = (v: unknown): v is ExportMarketId => typeof v === "string" && v in EXPORT_BY_ID;
const isEng = (v: unknown): v is EngineerId => typeof v === "string" && v in ENGINEER_BY_ID;

export function migrateExpansion(raw: Json, s: GameState) {
  const p = isObj(raw.proto) ? raw.proto : {};
  s.proto = createProto();
  const a = isObj(p.active) ? p.active : null;
  if (a && isCar(a.car) && PROTO_FOCUSES.includes(a.focus as ProtoFocus) && (a.stage === "concept" || a.stage === "tunnel" || a.stage === "track"))
    s.proto.active = { car: a.car, focus: a.focus as ProtoFocus, stage: a.stage, until: num(a.until), score: Math.max(0, num(a.score)) };
  if (isObj(p.done)) for (const [k, v] of Object.entries(p.done)) if (isCar(k)) s.proto.done[k] = Math.max(0, Math.min(100, num(v)));
  const h = isObj(p.hype) ? p.hype : null;
  if (h && isCar(h.car)) s.proto.hype = { car: h.car, until: num(h.until) };

  const e = isObj(raw.export) ? raw.export : {};
  s.export = createExport();
  if (Array.isArray(e.open)) s.export.open = [...new Set(e.open.filter(isMarket))];
  if (isObj(e.dock))
    for (const [k, v] of Object.entries(e.dock)) if (isMarket(k) && isObj(v) && Array.isArray(v.cars)) s.export.dock[k] = { cars: v.cars.filter(isCar), value: Math.max(0, num(v.value)), wait: Math.max(0, num(v.wait)) };
  if (Array.isArray(e.ships))
    s.export.ships = e.ships
      .filter(isObj)
      .filter((x) => isMarket(x.market) && Array.isArray(x.cars))
      .map((x) => ({ id: num(x.id), market: x.market as ExportMarketId, cars: (x.cars as unknown[]).filter(isCar), value: Math.max(0, num(x.value)), t: Math.max(0, num(x.t)), dur: Math.max(1, num(x.dur, 300)) }));
  s.export.nextShip = Math.max(1, Math.floor(num(e.nextShip, 1)));
  s.export.sold = Math.max(0, Math.floor(num(e.sold)));

  const f = isObj(raw.fleet) ? raw.fleet : {};
  s.fleet = createFleet();
  if (typeof f.product === "string" && f.product in FLEET_BY_ID) s.fleet.product = f.product as FleetProduct;
  s.fleet.carry = Math.max(0, Math.min(1, num(f.carry)));
  s.fleet.built = Math.max(0, num(f.built));
  s.fleet.earned = num(f.earned);
  s.fleet.nextOrderAt = Math.max(0, num(f.nextOrderAt));
  s.fleet.done = Math.max(0, Math.floor(num(f.done)));
  const o = isObj(f.order) ? f.order : null;
  if (o && typeof o.product === "string" && o.product in FLEET_BY_ID && FLEET.clients.includes(o.client as FleetClient)) {
    s.fleet.order = { client: o.client as FleetClient, product: o.product as FleetProduct, n: Math.max(1, Math.floor(num(o.n, 1))), minutes: Math.max(1, num(o.minutes, 30)), made: Math.max(0, Math.floor(num(o.made))) };
    if (o.expires !== undefined) s.fleet.order.expires = num(o.expires);
    if (o.deadline !== undefined) s.fleet.order.deadline = num(o.deadline);
  }

  const g = isObj(raw.engineers) ? raw.engineers : {};
  s.engineers = createEngineers();
  if (Array.isArray(g.hired))
    for (const h of g.hired.filter(isObj)) if (isEng(h.id) && !s.engineers.hired.some((x) => x.id === h.id)) s.engineers.hired.push({ id: h.id, pay: h.pay === "low" || h.pay === "generous" ? h.pay : "fair" });
  s.engineers.hired = s.engineers.hired.slice(0, ENGINEER.slots);
  const c = isObj(g.candidate) ? g.candidate : null;
  if (c && isEng(c.id)) s.engineers.candidate = { id: c.id, until: num(c.until) };
  const pc = isObj(g.poach) ? g.poach : null;
  if (pc && isEng(pc.id) && s.engineers.hired.some((x) => x.id === pc.id)) s.engineers.poach = { id: pc.id, team: typeof pc.team === "string" ? pc.team : "", cost: Math.max(0, num(pc.cost)), until: num(pc.until) };
  s.engineers.nextCandidate = Math.max(0, num(g.nextCandidate));
  s.engineers.nextPoach = Math.max(0, num(g.nextPoach));
  s.engineers.lost = Math.max(0, Math.floor(num(g.lost)));
}

/** Components a fleet vehicle needs, for the UI. */
export const fleetParts = (p: FleetProduct) => Object.entries(FLEET_BY_ID[p].parts).map(([c, n]) => ({ c: c as ComponentId, n: n as number, emoji: COMPONENT_BY_ID[c as ComponentId].emoji }));
