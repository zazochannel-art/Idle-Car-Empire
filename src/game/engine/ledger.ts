// The company's ledger (where every dollar goes) and its account: what most of the engine books
// to. A leaf of the engine (it imports none of it), so any module may book without an import cycle.
import { DEBT, WAGE_RESERVE_SECONDS } from "../config/economy";
import type { GameState, Ledger, LedgerKey, LedgerValues } from "../types";

// ───────────────────────────── ledger ─────────────────────────────

// Every dollar is booked once, under one key, and every key belongs to exactly
// one group. Each figure the game shows (HUD profit, dashboard, stats, the
// Welcome Back report) is a sum over these groups — never a formula that adds
// a category and takes it out again.

/** The manufacturing business: plants, trucks, dealers, the Parts Market, export and the truck & bus line. */
export const CHAIN_REVENUE_KEYS: LedgerKey[] = ["carSales", "partSales"];
export const CHAIN_COST_KEYS: LedgerKey[] = ["materials", "labor", "energy", "maintenance", "logistics", "dealerFees", "tax"];
/** The side businesses: garages (services) earn, the racing team earns prizes and pays entry fees and repairs. */
export const SIDE_REVENUE_KEYS: LedgerKey[] = ["services", "racing"];
export const SIDE_COST_KEYS: LedgerKey[] = ["repairs"];
/** Not earned by running the business: mission, achievement, event and contract rewards. Below the line. */
export const OTHER_KEYS: LedgerKey[] = ["rewards"];

export const REVENUE_KEYS: LedgerKey[] = [...CHAIN_REVENUE_KEYS, ...SIDE_REVENUE_KEYS];
export const COST_KEYS: LedgerKey[] = [...CHAIN_COST_KEYS, ...SIDE_COST_KEYS];
export const LEDGER_KEYS: LedgerKey[] = [...REVENUE_KEYS, ...COST_KEYS, ...OTHER_KEYS];
export const emptyLedgerValues = (): LedgerValues => Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0])) as LedgerValues;
export const createLedger = (): Ledger => ({ rate: emptyLedgerValues(), run: emptyLedgerValues(), pending: emptyLedgerValues() });

const sumOf = (v: LedgerValues, keys: LedgerKey[]) => keys.reduce((a, k) => a + (v[k] ?? 0), 0);

/** Operating revenue: car and part sales, services, racing. */
export const ledgerRevenue = (v: LedgerValues) => sumOf(v, REVENUE_KEYS);
/** Operating costs: everything the plants, trucks, dealers and the racing team cost. */
export const ledgerCosts = (v: LedgerValues) => sumOf(v, COST_KEYS);

/** Operating net profit: revenue minus costs (the manufacturing chain plus the side businesses). */
export function ledgerNet(v: LedgerValues): number {
  return ledgerRevenue(v) - ledgerCosts(v);
}

/** Net of the manufacturing chain alone. */
export function chainNet(v: LedgerValues): number {
  return sumOf(v, CHAIN_REVENUE_KEYS) - sumOf(v, CHAIN_COST_KEYS);
}

/** Net of the side businesses (garages and racing). ledgerNet = chainNet + sideNet. */
export function sideNet(v: LedgerValues): number {
  return sumOf(v, SIDE_REVENUE_KEYS) - sumOf(v, SIDE_COST_KEYS);
}

/** Books revenue or a cost; the next tick folds it into the rates and run totals. */
export function book(s: GameState, key: LedgerKey, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.chain.ledger.pending[key] += amount;
}

/** Folds everything booked since the last call into the smoothed $/s rates and the run totals. */
export function settleLedger(s: GameState, dt: number, window = 60) {
  const L = s.chain.ledger;
  const k = Math.min(1, dt / window);
  for (const key of LEDGER_KEYS) {
    const v = L.pending[key];
    L.run[key] += v;
    L.rate[key] += (v / dt - L.rate[key]) * k;
    L.pending[key] = 0;
  }
}

/**
 * Pays a running cost now, or puts what the cash can't cover on the
 * company's account (paid first from the next revenue). Every cost that may
 * run on account goes through here, so a cost is never booked without being
 * either paid or owed.
 */
export function payOrOwe(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const now = Math.min(amount, Math.max(0, s.cash));
  s.cash -= now;
  s.chain.owed += amount - now;
}

/** The company account's limit (set each tick from what the plants cost to run). */
export const debtLimit = (s: GameState) => Math.max(DEBT.min, s.chain.debtLimit ?? 0);

/** Whether a cost of `amount` may go (partly) on the company's account now: not while suspended, never past the limit. */
export function canOwe(s: GameState, amount: number): boolean {
  if (!(amount > 0) || !Number.isFinite(amount) || s.chain.suspended) return false;
  return s.chain.owed + Math.max(0, amount - Math.max(0, s.cash)) <= debtLimit(s);
}

/** What a SUSPENDED status line says: what is owed, the limit, and where production resumes (formatted by the caller). */
export function debtVars(s: GameState, fmt: (n: number) => string) {
  const limit = debtLimit(s);
  return { owed: fmt(s.chain.owed), limit: fmt(limit), resume: fmt(limit * DEBT.halt * DEBT.resume) };
}

/** Cash suggested and automatic material orders leave alone: a couple of minutes of wages, energy and maintenance. */
export const wageReserve = (s: GameState) => Math.max(0, s.chain.runCost ?? 0) * WAGE_RESERVE_SECONDS;

/** What suggested and automatic material orders may spend: the cash above the wage reserve. */
export const spendable = (s: GameState) => Math.max(0, s.cash - wageReserve(s));

/** Pays `amount` of the account from the cash (as far as both go). */
export function repay(s: GameState, amount: number) {
  const pay = Math.min(s.chain.owed, Math.max(0, amount), Math.max(0, s.cash));
  if (!(pay > 0)) return;
  s.cash -= pay;
  s.chain.owed -= pay;
  if (s.chain.owed < 1e-6) s.chain.owed = 0;
}

/** A cash reward (missions, achievements, events, contracts…): paid in and booked below the line. */
export function payReward(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.cash += amount;
  book(s, "rewards", amount);
}

/** Adds money to the wallet and to the earnings stats. */
export function credit(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.cash += amount;
  s.run.moneyEarned += amount;
  s.lifetime.moneyEarned += amount;
}
