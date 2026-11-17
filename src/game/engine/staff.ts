// The staff's morale (company-wide): every few hours, once the company has made its first cars,
// the workforce brings the player a choice on a card (components/game/staff-dialog.tsx). Morale
// (0–100) speeds every plant up or slows it a little; a strike halves production for a while,
// a team party or overtime speeds it up for a while. Real time (`now`, ms) drives it.
import type { GameState } from "../types";

export type StaffCardId = "raise" | "party" | "overtime";
export const STAFF_CARDS: StaffCardId[] = ["raise", "party", "overtime"];

export interface StaffState {
  morale: number;
  /** The card waiting for an answer, and what saying yes costs (cash). */
  card: { id: StaffCardId; cost: number } | null;
  /** When the next card may come. */
  nextAt: number;
  /** A strike until then (production × STAFF.strikeSpeed). */
  strikeUntil: number;
  /** A burst of work until then (production × boost). */
  boostUntil: number;
  boost: number;
  /** Cards answered, in all. */
  answered: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const STAFF = {
  start: 70,
  /** Morale drifts back towards this, a point an hour. */
  rest: 70,
  driftPerHour: 1,
  /** A card every this long (the first once the company has made `firstAfterCars` cars). */
  everyMs: 4 * HOUR,
  firstAfterCars: 25,
  /** Production at morale 0 and at 100 (the starting morale is ×1). */
  speedAt0: 0.92,
  speedAt100: 1.08,
  strikeSpeed: 0.5,
  raise: { costSeconds: 600, yes: 15, no: -20, strikeChance: 0.4, strikeMs: 20 * MIN },
  party: { costSeconds: 180, yes: 10, no: -5, boost: 1.1, boostMs: 30 * MIN },
  overtime: { yes: -10, no: 0, boost: 1.25, boostMs: 30 * MIN },
};

export const createStaff = (): StaffState => ({ morale: STAFF.start, card: null, nextAt: 0, strikeUntil: 0, boostUntil: 0, boost: 1, answered: 0 });

const clampMorale = (v: number) => Math.max(0, Math.min(100, v));

/** What the staff do to production now (× every plant's speed). */
export function staffSpeed(s: Pick<GameState, "staff">, now: number): number {
  const st = s.staff;
  if (!st) return 1;
  // ×1 at the starting morale (the economy's balance is set there), up to speedAt100, down to speedAt0
  const mo = clampMorale(st.morale);
  let m = mo >= STAFF.start ? 1 + ((STAFF.speedAt100 - 1) * (mo - STAFF.start)) / (100 - STAFF.start) : 1 - ((1 - STAFF.speedAt0) * (STAFF.start - mo)) / STAFF.start;
  if (now < st.strikeUntil) m *= STAFF.strikeSpeed;
  if (now < st.boostUntil) m *= st.boost;
  return m;
}

/** What a card costs to say yes to, from the company's steady income ($/s). */
export function cardCost(id: StaffCardId, incomePerSec: number): number {
  const sec = id === "raise" ? STAFF.raise.costSeconds : id === "party" ? STAFF.party.costSeconds : 0;
  return Math.round(Math.max(0, incomePerSec) * sec);
}

/**
 * Morale drifts back to its rest; a new card comes when one is due. Returns the card that came
 * (null: none). `rand` picks the card (0–1).
 */
export function staffTick(s: GameState, now: number, dt: number, incomePerSec: number, rand: () => number = Math.random): StaffCardId | null {
  const st = (s.staff ??= createStaff());
  const drift = (STAFF.driftPerHour * dt) / 3600;
  st.morale = st.morale < STAFF.rest ? Math.min(STAFF.rest, st.morale + drift) : Math.max(STAFF.rest, st.morale - drift);
  if (st.card || s.lifetime.carsProduced < STAFF.firstAfterCars) return null;
  if (!st.nextAt) {
    st.nextAt = now + STAFF.everyMs / 2;
    return null;
  }
  if (now < st.nextAt) return null;
  const id = STAFF_CARDS[Math.min(STAFF_CARDS.length - 1, Math.floor(rand() * STAFF_CARDS.length))];
  st.card = { id, cost: cardCost(id, incomePerSec) };
  st.nextAt = now + STAFF.everyMs;
  return id;
}

export type StaffOutcome = "accepted" | "refused" | "strike";

/** Answers the card. Yes pays its cost (false: the cash is short). */
export function answerStaff(s: GameState, yes: boolean, now: number, rand: () => number = Math.random): StaffOutcome | false {
  const st = s.staff;
  const card = st?.card;
  if (!st || !card) return false;
  if (yes && s.cash < card.cost) return false;
  let out: StaffOutcome = yes ? "accepted" : "refused";
  if (yes) s.cash -= card.cost;
  switch (card.id) {
    case "raise":
      st.morale = clampMorale(st.morale + (yes ? STAFF.raise.yes : STAFF.raise.no));
      if (!yes && rand() < STAFF.raise.strikeChance) {
        st.strikeUntil = now + STAFF.raise.strikeMs;
        out = "strike";
      }
      break;
    case "party":
      st.morale = clampMorale(st.morale + (yes ? STAFF.party.yes : STAFF.party.no));
      if (yes) {
        st.boost = STAFF.party.boost;
        st.boostUntil = now + STAFF.party.boostMs;
      }
      break;
    case "overtime":
      st.morale = clampMorale(st.morale + (yes ? STAFF.overtime.yes : STAFF.overtime.no));
      if (yes) {
        st.boost = STAFF.overtime.boost;
        st.boostUntil = now + STAFF.overtime.boostMs;
      }
      break;
  }
  st.card = null;
  st.answered++;
  return out;
}

export function migrateStaff(raw: unknown): StaffState {
  const out = createStaff();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  out.morale = clampMorale(num(r.morale, STAFF.start));
  out.nextAt = Math.max(0, num(r.nextAt));
  out.strikeUntil = Math.max(0, num(r.strikeUntil));
  out.boostUntil = Math.max(0, num(r.boostUntil));
  out.boost = Math.max(1, Math.min(2, num(r.boost, 1)));
  out.answered = Math.max(0, Math.floor(num(r.answered)));
  const c = r.card as Record<string, unknown> | null | undefined;
  if (c && typeof c === "object" && STAFF_CARDS.includes(c.id as StaffCardId)) out.card = { id: c.id as StaffCardId, cost: Math.max(0, num(c.cost)) };
  return out;
}
