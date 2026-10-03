import { EVENTS, EVENT_BLOCK_MS, EVENT_LENGTH_MS, EVENT_OFFSET_MS, type MarketEvent } from "../config/events";

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
 * Events come in shuffled rounds of all six. A round never opens with the
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
