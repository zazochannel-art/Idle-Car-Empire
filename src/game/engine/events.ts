import { CAR_BY_ID } from "../config/cars";
import { EVENTS, EVENT_BLOCK_MS, EVENT_LENGTH_MS, EVENT_OFFSET_MS, type EventMetric, type MarketEvent } from "../config/events";
import type { CarId, GameState } from "../types";

export interface EventWindow {
  event: MarketEvent;
  start: number;
  end: number;
}

/** Small seeded generator (mulberry32), so the schedule needs no server. */
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

function shuffled(r: number): number[] {
  const order = EVENTS.map((_, i) => i);
  const rand = rng(r * 7919 + 17);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Events come in shuffled rounds of all of them. A round never opens with the
 * event that closed the previous one (the swap only touches the first two
 * slots, so a round's last event never depends on the round before it).
 */
function round(r: number): number[] {
  const order = shuffled(r);
  const prevLast = shuffled(r - 1)[EVENTS.length - 1];
  if (order[0] === prevLast) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

function pick(block: number): MarketEvent {
  const n = EVENTS.length;
  return EVENTS[round(Math.floor(block / n))[((block % n) + n) % n]];
}

function windowOf(block: number): EventWindow {
  const start = block * EVENT_BLOCK_MS + EVENT_OFFSET_MS;
  return { event: pick(block), start, end: start + EVENT_LENGTH_MS };
}

/** The event running at `now`, if any. */
export function activeEvent(now: number): EventWindow | null {
  const w = windowOf(Math.floor(now / EVENT_BLOCK_MS));
  return now >= w.start && now < w.end ? w : null;
}

/** The next event to start after `now`. */
export function nextEvent(now: number): EventWindow {
  const block = Math.floor(now / EVENT_BLOCK_MS);
  const w = windowOf(block);
  return now < w.start ? w : windowOf(block + 1);
}

// ───────────────────────────── objectives ─────────────────────────────

const builtWhere = (s: GameState, ok: (car: CarId) => boolean) =>
  (Object.entries(s.lifetime.carsByType) as [CarId, number][]).reduce((a, [c, n]) => a + (CAR_BY_ID[c] && ok(c) ? n || 0 : 0), 0);

/** Lifetime counters the objectives are measured on. */
export function eventMetric(s: GameState, m: EventMetric): number {
  switch (m) {
    case "carsBuilt":
      return builtWhere(s, () => true);
    case "carsSold":
      return s.lifetime.carsSold;
    case "upgrades":
      return s.lifetime.upgradesBought + s.lifetime.levelsBought;
    case "premiumBuilt":
      return builtWhere(s, (c) => CAR_BY_ID[c].tier >= 3);
    case "research":
      return s.research.length;
    case "exported":
      return s.export?.sold ?? 0;
    case "raceWins":
      return s.racing.stats.wins;
    case "topBuilt":
      return builtWhere(s, (c) => CAR_BY_ID[c].tier >= 8);
  }
}

/** Can the company take part in this objective at all? (No racing objective without a racing team...) */
export function eventGoalOpen(s: GameState, m: EventMetric): boolean {
  switch (m) {
    case "raceWins":
      return s.racing.unlocked && s.racing.cars.length > 0;
    case "exported":
      return (s.export?.open.length ?? 0) > 0;
    case "premiumBuilt":
      return builtWhere(s, (c) => CAR_BY_ID[c].tier >= 3) > 0;
    case "topBuilt":
      return builtWhere(s, (c) => CAR_BY_ID[c].tier >= 8) > 0;
    default:
      return s.chain.firstCar;
  }
}

/** Starts counting when a new event begins (call every tick with the clock). */
export function eventGoalTick(s: GameState, now: number) {
  const w = activeEvent(now);
  if (!w || s.eventGoal.start === w.start) return;
  s.eventGoal = { start: w.start, base: eventMetric(s, w.event.goal.metric), claimed: false };
}

export interface EventGoalStatus {
  window: EventWindow;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
  open: boolean;
}

export function eventGoal(s: GameState, now: number): EventGoalStatus | null {
  const w = activeEvent(now);
  if (!w) return null;
  const g = w.event.goal;
  const counting = s.eventGoal.start === w.start;
  const progress = counting ? Math.max(0, eventMetric(s, g.metric) - s.eventGoal.base) : 0;
  return { window: w, progress: Math.min(progress, g.target), target: g.target, done: progress >= g.target, claimed: counting && s.eventGoal.claimed, open: eventGoalOpen(s, g.metric) };
}

/** Collects the objective's reward: steady income for a few minutes, and racing parts. */
export function claimEventGoal(s: GameState, now: number): number | null {
  const st = eventGoal(s, now);
  if (!st || !st.done || st.claimed) return null;
  const g = st.window.event.goal;
  const cash = Math.max(1_000, Math.max(0, s.chain.steady ?? s.chain.rate) * g.incomeSeconds);
  s.cash += cash;
  s.run.moneyEarned += cash;
  s.lifetime.moneyEarned += cash;
  if (g.parts) s.racing.parts += g.parts;
  s.eventGoal.claimed = true;
  return cash;
}
