// Taking over the rivals (config/rivals.ts): once the company has overtaken a rival on the earnings
// table, it can buy that rival's shares, a tenth at a time. Every tenth the company holds, in any
// rival, adds to its income; holding a majority (TAKEOVER.control tenths) takes the rival over:
// more income, and its dealer network sells the company's cars too (more dealer room). Paid from
// the cash of the city being played. The shares are company-wide and kept for good.
import { RIVALS, type Rival } from "../config/rivals";
import type { GameState } from "../types";
import { rivalEarned } from "./retention";

export type RivalId = Rival["id"];
export type TakeoverState = Partial<Record<RivalId, number>>;

export const TAKEOVER = {
  /** A rival's value, as a share of what it has earned in all. */
  valuation: 0.02,
  /** Each tenth costs this much more than the one before (the price goes up as you buy). */
  premium: 0.15,
  /** Tenths for a majority. */
  control: 6,
  tenths: 10,
  /** Income per tenth held, in any rival. */
  incomePerTenth: 0.01,
  /** For each rival taken over: more income, and more dealer room (its dealer network). */
  takenIncome: 0.05,
  takenDealerCap: 0.1,
};

export const createTakeover = (): TakeoverState => ({});

/** Tenths of a rival the company holds (0–10). */
export const tenthsOf = (s: Pick<GameState, "takeover">, id: RivalId) => Math.max(0, Math.min(TAKEOVER.tenths, Math.floor(s.takeover?.[id] ?? 0)));

/** True once the company holds a majority of the rival. */
export const controls = (s: Pick<GameState, "takeover">, id: RivalId) => tenthsOf(s, id) >= TAKEOVER.control;

/** Shares are for sale once the company has overtaken the rival. */
export const canBuyShares = (s: Pick<GameState, "rivalsBeaten">, id: RivalId) => s.rivalsBeaten.includes(id);

/** The price of the next tenth (null: all of it is the company's). */
export function tenthPrice(s: GameState, r: Rival, now: number): number | null {
  const k = tenthsOf(s, r.id);
  if (k >= TAKEOVER.tenths) return null;
  return Math.round((rivalEarned(r, s, now) * TAKEOVER.valuation * (1 + TAKEOVER.premium * k)) / TAKEOVER.tenths);
}

/** Buys the next tenth of a rival. Returns "taken" when this tenth gives the company its majority. */
export function buyTenth(s: GameState, id: RivalId, now: number): "bought" | "taken" | false {
  const r = RIVALS.find((x) => x.id === id);
  if (!r || !canBuyShares(s, id)) return false;
  const price = tenthPrice(s, r, now);
  if (price === null || !(s.cash >= price)) return false;
  s.cash -= price;
  const before = tenthsOf(s, id);
  s.takeover = { ...s.takeover, [id]: before + 1 };
  return before + 1 === TAKEOVER.control ? "taken" : "bought";
}

/** What the shares do to the whole business: income, and dealer room from the rivals taken over. */
export function takeoverEffects(s: Pick<GameState, "takeover">): { income: number; dealerCap: number } {
  let tenths = 0;
  let taken = 0;
  for (const r of RIVALS) {
    tenths += tenthsOf(s, r.id);
    if (controls(s, r.id)) taken++;
  }
  return { income: 1 + TAKEOVER.incomePerTenth * tenths + TAKEOVER.takenIncome * taken, dealerCap: 1 + TAKEOVER.takenDealerCap * taken };
}

export function migrateTakeover(raw: unknown): TakeoverState {
  const out = createTakeover();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const r of RIVALS) {
    const v = (raw as Record<string, unknown>)[r.id];
    if (typeof v === "number" && Number.isFinite(v) && v >= 1) out[r.id] = Math.min(TAKEOVER.tenths, Math.floor(v));
  }
  return out;
}
