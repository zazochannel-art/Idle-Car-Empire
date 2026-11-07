import { OFFLINE } from "../config/offline";
import type { CityId, GameState, OfflineReport } from "../types";
import { simulateChain } from "./chain";
import { offlineRacing } from "./racing";
import { showroomTick } from "./showroom";
import { snapshot } from "./economy";
import { credit } from "./ledger";
import { constructionTick } from "./construction";
import { book, chainNet, LEDGER_KEYS, settleLedger } from "./ledger";
import { payDividends } from "./stock";
import { parkedEarnings, withCity, withWallet } from "./cities";
import { activeEvent, nextEvent } from "./events";
import { seasonWindow } from "./season";

const addTo = (report: OfflineReport, id: CityId, money: number) => {
  if (money > 0) (report.cities ??= {})[id] = (report.cities[id] ?? 0) + money;
};

/** Longest stretch of an absence played on one snapshot (the market and the stock move on). */
const SPAN_MS = 60 * 60 * 1000;
/** Steps the whole absence is played in (engine/chain.ts simulateChain), shared by its spans. */
const STEPS = 20_000;

/**
 * Where the stretch of the absence starting at `t` ends: at the next change of the calendar
 * (a market event starting or ending, a season ending) or after SPAN_MS, whichever is first.
 */
export function spanEnd(t: number, end: number): number {
  let to = Math.min(end, t + SPAN_MS);
  const ev = activeEvent(t);
  if (ev) to = Math.min(to, ev.end);
  else to = Math.min(to, nextEvent(t).start);
  const season = seasonWindow(t);
  if (season) to = Math.min(to, season.end);
  // a window already over (never at a real boundary) would stall the walk: move on regardless
  return to > t ? to : Math.min(end, t + SPAN_MS);
}

/**
 * Plays out the time between `lastActiveAt` and `now`: plants keep producing
 * (at their offline efficiency), trucks keep delivering, dealers keep selling,
 * up to the offline limit (12h base, raised by research and Empire perks).
 * The chain's state moves forward here; the money waits in the report until
 * the player collects it.
 */
export function computeOffline(s: GameState, now: number): OfflineReport {
  // an ad's sales boost counts play time only: it waits, unspent, while the game is closed
  const boostLeft = s.ads.boostLeft;
  s.ads.boostLeft = 0;
  try {
    return absence(s, now);
  } finally {
    s.ads.boostLeft = boostLeft;
  }
}

function absence(s: GameState, now: number): OfflineReport {
  const seconds = Math.max(0, (now - s.lastActiveAt) / 1000);
  const snap = snapshot(s);
  const capped = Math.min(seconds, snap.gm.offlineCapHours * 3600);
  const report: OfflineReport = { seconds, cappedSeconds: capped, cars: 0, components: 0, deliveries: 0, money: 0, rp: 0, carsByType: {} };
  if (capped <= 0) return report;

  const cash = s.cash;
  const owed = s.chain.owed;
  // the absence is booked into the run totals; the $/s rates keep describing the session
  const rates = { ...s.chain.ledger.rate };
  const byType = { ...s.lifetime.carsByType };
  const rp = s.rp;
  const before = { ...s.chain.ledger.run };
  // The absence is played stretch by stretch, each on the calendar of its own time: a market
  // event or a season counts only while it lasts, as it would have in play (one snapshot taken
  // when the player left kept a car show going for the whole twelve hours).
  const r = { cars: 0, components: 0, deliveries: 0, carsSold: 0, materials: 0 };
  let city = 0;
  let serviced = 0;
  const left = s.lastActiveAt;
  const end = left + capped * 1000;
  try {
    for (let t = left; t < end; ) {
      const to = spanEnd(t, end);
      const span = (to - t) / 1000;
      s.lastActiveAt = t;
      const at = t === left ? snap : snapshot(s);
      const got = simulateChain(s, span, at.chain, (amount) => credit(s, amount), Math.max(1, (STEPS * span) / capped));
      for (const k of ["cars", "components", "deliveries", "carsSold", "materials"] as const) r[k] += got[k];
      // garages and map buildings keep working too, at the offline efficiency
      city += at.city.incomePerSec * span * at.gm.offline;
      serviced += at.city.carsPerSec * span * at.gm.offline;
      t = to;
    }
  } finally {
    s.lastActiveAt = left;
  }
  // the racing team keeps racing (automatic racing only), in the first city: what it
  // wins there waits for COLLECT too, for that city's wallet
  const racing =
    s.activeCity === "home" || !s.cities.home
      ? offlineRacing(s, capped)
      : withCity(s, "home", () => {
          const before = s.cash;
          const out = offlineRacing(s, capped);
          if (s.cash > before) {
            addTo(report, "home", s.cash - before);
            s.cash = before;
          }
          return out;
        });
  // buyers kept walking into the showroom
  showroomTick(s, capped);
  // Hold the net earnings back for the COLLECT button (they already count as earned).
  const net = s.cash - cash;
  if (net > 0) s.cash = cash;
  report.money = Math.max(0, net);
  // the other cities kept bringing in their share (counted as earned now, like the rest)
  for (const [id, got] of Object.entries(parkedEarnings(s, capped, snap.gm.offline)) as [CityId, number][]) {
    s.run.moneyEarned += got;
    s.lifetime.moneyEarned += got;
    addTo(report, id, got);
  }
  report.cars = r.cars;
  report.components = r.components;
  report.deliveries = r.deliveries;
  report.rp = s.rp - rp;
  s.rp = rp;
  for (const [car, n] of Object.entries(s.lifetime.carsByType)) {
    const d = n - byType[car as keyof typeof byType];
    if (d > 0) report.carsByType[car as keyof typeof byType] = d;
  }

  // what the garages and map buildings earned
  credit(s, city);
  s.cash -= city;
  report.money += city;
  report.serviced = Math.floor(serviced);
  book(s, "services", city);
  settleLedger(s, capped);
  // construction never stops: sites and upgrades advance for the whole absence (what they
  // finish starts working when the player is back, so it is played after the chain)
  const before0 = new Set(Object.keys(s.city.sites));
  const built = constructionTick(s, seconds).filter((id) => before0.has(id));
  if (built.length) report.built = built;
  // where the money came from and where it went while away
  report.ledger = Object.fromEntries(LEDGER_KEYS.map((k) => [k, Math.max(0, s.chain.ledger.run[k] - before[k])])) as OfflineReport["ledger"];
  s.chain.ledger.rate = rates;
  s.chain.rate = chainNet(rates);
  report.carsSold = r.carsSold;
  if (Math.abs(s.chain.owed - owed) >= 0.5) report.owed = s.chain.owed - owed;
  if (racing) report.racing = racing;
  report.materialsUsed = r.materials;
  return report;
}

/**
 * Pays out a report computed by computeOffline (earnings were already counted); the
 * shareholders take their part (engine/stock.ts). The other cities' money goes to
 * their own wallets. Returns what reached the wallet of the city being played.
 */
export function applyOffline(s: GameState, report: OfflineReport): number {
  const pay = (money: number) => {
    s.cash += money;
    s.run.offlineEarned += money;
    s.lifetime.offlineEarned += money;
    return money - payDividends(s, money);
  };
  let got = pay(report.money);
  for (const [id, money] of Object.entries(report.cities ?? {}) as [CityId, number][]) {
    if (!(money > 0)) continue;
    if (id === s.activeCity) got += pay(money);
    else withWallet(s, id, () => pay(money));
  }
  s.rp += report.rp;
  s.city.carsServiced += report.serviced ?? 0;
  return got;
}

/**
 * Called on load. Short absences are credited silently; longer ones are kept
 * as `pendingOffline` (persisted) until the player presses COLLECT.
 */
export function settleOffline(s: GameState, now: number): OfflineReport | null {
  const report = computeOffline(s, now);
  s.lastActiveAt = now;
  if (report.money <= 0 && report.cars <= 0 && !report.components && !report.serviced && !report.built?.length && !report.cities) return null;
  if (report.seconds < OFFLINE.minReportSeconds) {
    applyOffline(s, report);
    return null;
  }
  if (s.pendingOffline) {
    // Merge with an uncollected report from an earlier visit.
    const p = s.pendingOffline;
    p.seconds += report.seconds;
    p.cappedSeconds += report.cappedSeconds;
    p.cars += report.cars;
    p.components = (p.components ?? 0) + (report.components ?? 0);
    p.deliveries = (p.deliveries ?? 0) + (report.deliveries ?? 0);
    p.serviced = (p.serviced ?? 0) + (report.serviced ?? 0);
    p.money += report.money;
    p.rp += report.rp;
    p.carsSold = (p.carsSold ?? 0) + (report.carsSold ?? 0);
    p.materialsUsed = (p.materialsUsed ?? 0) + (report.materialsUsed ?? 0);
    if (report.owed) p.owed = (p.owed ?? 0) + report.owed;
    if (report.built?.length) p.built = [...(p.built ?? []), ...report.built];
    for (const [id, money] of Object.entries(report.cities ?? {}) as [CityId, number][]) addTo(p, id, money);
    if (report.racing) {
      const a = (p.racing ??= { races: 0, wins: 0, podiums: 0, prize: 0, rep: 0, repairs: 0 });
      for (const k of ["races", "wins", "podiums", "prize", "rep", "repairs"] as const) a[k] += report.racing[k];
    }
    if (report.ledger) {
      const L = (p.ledger ??= Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0])) as NonNullable<OfflineReport["ledger"]>);
      for (const k of LEDGER_KEYS) L[k] += report.ledger[k];
    }
    for (const [car, n] of Object.entries(report.carsByType)) {
      const k = car as keyof typeof p.carsByType;
      p.carsByType[k] = (p.carsByType[k] ?? 0) + (n ?? 0);
    }
  } else {
    s.pendingOffline = report;
  }
  return s.pendingOffline;
}

export function collectOffline(s: GameState, multiplier = 1): number {
  const p = s.pendingOffline;
  if (!p) return 0;
  const cities = p.cities && (Object.fromEntries(Object.entries(p.cities).map(([id, m]) => [id, (m ?? 0) * multiplier])) as OfflineReport["cities"]);
  const got = applyOffline(s, { ...p, money: p.money * multiplier, cities });
  s.pendingOffline = null;
  return got;
}
