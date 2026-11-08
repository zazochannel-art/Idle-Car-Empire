// Economy knobs the game's owner can turn from the server (supabase/migrations/0030_balance.sql):
// a multiplier of a number the game has built in, asked for with the scheduled events
// (lib/live-events.ts) and kept in memory only. No answer, an unknown knob or a number outside
// its range: the game's own number (1). A leaf of the engine: anything may ask.

export type BalanceKey = "rewards" | "usedSell" | "qc";

/** Each knob's narrowest and widest multiplier (the server enforces the same: a test checks the list). */
export const BALANCE_RANGE: Record<BalanceKey, readonly [number, number]> = {
  /** Everything paid as a share of the income: missions, the pass, sponsors, the daily chest… */
  rewards: [0.5, 2],
  /** What the second-hand lot pays for a refurbished car. */
  usedSell: [0.8, 1.25],
  /** What the quality control pays. */
  qc: [0.5, 2],
};

let knobs: Partial<Record<BalanceKey, number>> = {};

/** The multiplier of a knob (1: as built). */
export function balance(key: BalanceKey): number {
  return knobs[key] ?? 1;
}

/** The server's answer, checked: only known knobs, finite numbers inside their range. */
export function parseBalance(raw: unknown): Partial<Record<BalanceKey, number>> {
  const out: Partial<Record<BalanceKey, number>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of Object.keys(BALANCE_RANGE) as BalanceKey[]) {
    const v = (raw as Record<string, unknown>)[key];
    const [lo, hi] = BALANCE_RANGE[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi) out[key] = v;
  }
  return out;
}

export function setBalance(next: Partial<Record<BalanceKey, number>>) {
  knobs = next;
}
