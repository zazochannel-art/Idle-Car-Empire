// The company on the stock exchange. Once it is big enough it can sell its
// shares, a tenth at a time and never control: the buyers pay what the
// company is worth now (the income of all its cities over STOCK.valueSeconds),
// and from then on take their part of every dollar of profit as dividends, in
// play and away, from each city's wallet.
// A tenth bought back costs what the company is worth then (and a premium):
// more if it has grown meanwhile, and never less than that tenth brought when
// it was sold (else a company could sell high, let its income sink a while
// and buy back for nothing). A new run (Imperium) is a new company, with
// all its shares.
import type { GameState } from "../types";
import { passiveIncome, type EconomySnapshot } from "./economy";

export interface StockState {
  /** The share of the company sold (0 … STOCK.maxSold, in tranches). */
  sold: number;
  /** What each tenth still sold brought (oldest first): a buyback costs at least the last one. */
  sales: number[];
  /** In this run: money raised selling shares, paid buying them back, paid as dividends. */
  raised: number;
  boughtBack: number;
  dividends: number;
  /** The share price now and then (newest last), and when it was last noted (ms). */
  history: number[];
  sampledAt: number;
}

export const STOCK = {
  /** Listed once the company has earned this much in all. */
  unlockEarned: 1e9,
  /** Shares change hands a tenth of the company at a time, and the founder keeps control. */
  tranche: 0.1,
  maxSold: 0.4,
  /** What the market pays for the company: its income over this many seconds. */
  valueSeconds: 24 * 3600,
  /** Buying back costs this much over the price. */
  buyPremium: 0.1,
  /** Shares in all (for a price per share). */
  shares: 1_000_000,
  /** The price is noted this often, and this many notes are kept (8 hours). */
  sampleEvery: 10 * 60_000,
  historyLen: 48,
} as const;

export const createStock = (): StockState => ({ sold: 0, sales: [], raised: 0, boughtBack: 0, dividends: 0, history: [], sampledAt: 0 });

export const stockUnlocked = (s: GameState) => s.lifetime.moneyEarned >= STOCK.unlockEarned;
/** What the whole company is worth now: the city being played (`snap`) and the parked ones, at the steady income they were left with. */
export const companyValue = (s: GameState, snap: EconomySnapshot) =>
  Object.values(s.cities).reduce((a, c) => a + Math.max(0, c?.steady ?? 0), Math.max(0, passiveIncome(snap))) * STOCK.valueSeconds;
export const sharePrice = (s: GameState, snap: EconomySnapshot) => companyValue(s, snap) / STOCK.shares;
/** What a tenth of the company brings when sold. */
export const trancheValue = (s: GameState, snap: EconomySnapshot) => companyValue(s, snap) * STOCK.tranche;
/** What buying a tenth back costs: its value now or what it brought, the higher, and the premium. */
export const buybackCost = (s: GameState, snap: EconomySnapshot) => Math.max(trancheValue(s, snap), s.stock.sales[s.stock.sales.length - 1] ?? 0) * (1 + STOCK.buyPremium);

const tranches = (x: number) => Math.round(x / STOCK.tranche);
const canSell = (s: GameState) => stockUnlocked(s) && tranches(s.stock.sold) + 1 <= tranches(STOCK.maxSold);

/** Sells a tenth of the company: the money it raised (0 when it can't). */
export function sellShares(s: GameState, snap: EconomySnapshot): number {
  const cash = trancheValue(s, snap);
  if (!canSell(s) || !(cash > 0) || !Number.isFinite(cash)) return 0;
  s.cash += cash;
  s.stock.sold = (tranches(s.stock.sold) + 1) * STOCK.tranche;
  s.stock.raised += cash;
  s.stock.sales = [...s.stock.sales, cash];
  return cash;
}

/** Buys a tenth back; false when none is sold or the money isn't there. */
export function buyBack(s: GameState, snap: EconomySnapshot): boolean {
  const cost = buybackCost(s, snap);
  if (tranches(s.stock.sold) < 1 || !Number.isFinite(cost) || s.cash < cost) return false;
  s.cash -= cost;
  s.stock.sold = (tranches(s.stock.sold) - 1) * STOCK.tranche;
  s.stock.boughtBack += cost;
  s.stock.sales = s.stock.sales.slice(0, -1);
  return true;
}

/** The shareholders' part of `earned` (a profit just made), taken from the cash: what was paid. */
export function payDividends(s: GameState, earned: number): number {
  const due = Math.min(Math.max(0, earned) * s.stock.sold, Math.max(0, s.cash));
  if (!(due > 0)) return 0;
  s.cash -= due;
  s.stock.dividends += due;
  return due;
}

/** Notes the share price now and then, for its chart. */
export function stockTick(s: GameState, snap: EconomySnapshot, now: number) {
  if (!stockUnlocked(s) || now - s.stock.sampledAt < STOCK.sampleEvery) return;
  s.stock.sampledAt = now;
  s.stock.history = [...s.stock.history, sharePrice(s, snap)].slice(-STOCK.historyLen);
}

export function migrateStock(raw: unknown): StockState {
  const out = createStock();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  out.sold = Math.min(tranches(STOCK.maxSold), tranches(num(r.sold))) * STOCK.tranche;
  // one price for each tenth still sold (a missing one: no floor for it)
  const sales = Array.isArray(r.sales) ? r.sales.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0) : [];
  const n = tranches(out.sold);
  out.sales = n ? sales.slice(-n) : [];
  out.raised = num(r.raised);
  out.boughtBack = num(r.boughtBack);
  out.dividends = num(r.dividends);
  out.sampledAt = num(r.sampledAt);
  out.history = Array.isArray(r.history) ? r.history.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0).slice(-STOCK.historyLen) : [];
  return out;
}
