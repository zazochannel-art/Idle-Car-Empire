import { OFFLINE } from "../config/prestige";
import type { GameState, OfflineReport } from "../types";
import { simulateChain } from "./chain";
import { snapshot } from "./economy";
import { credit } from "./tick";
import { book, LEDGER_KEYS, settleLedger } from "./materials";

/**
 * Plays out the time between `lastActiveAt` and `now`: plants keep producing
 * (at their offline efficiency), trucks keep delivering, dealers keep selling,
 * up to the offline limit (12h base, raised by research and Empire perks).
 * The chain's state moves forward here; the money waits in the report until
 * the player collects it.
 */
export function computeOffline(s: GameState, now: number): OfflineReport {
  const seconds = Math.max(0, (now - s.lastActiveAt) / 1000);
  const snap = snapshot(s);
  const capped = Math.min(seconds, snap.gm.offlineCapHours * 3600);
  const report: OfflineReport = { seconds, cappedSeconds: capped, cars: 0, components: 0, deliveries: 0, money: 0, rp: 0, carsByType: {} };
  if (capped <= 0) return report;

  const cash = s.cash;
  const byType = { ...s.lifetime.carsByType };
  const rp = s.rp;
  const before = { ...s.chain.ledger.run };
  const r = simulateChain(s, capped, snap.chain, (amount) => credit(s, amount));
  // Hold the net earnings back for the COLLECT button (they already count as earned).
  const net = s.cash - cash;
  if (net > 0) s.cash = cash;
  report.money = Math.max(0, net);
  report.cars = r.cars;
  report.components = r.components;
  report.deliveries = r.deliveries;
  report.rp = s.rp - rp;
  s.rp = rp;
  for (const [car, n] of Object.entries(s.lifetime.carsByType)) {
    const d = n - byType[car as keyof typeof byType];
    if (d > 0) report.carsByType[car as keyof typeof byType] = d;
  }

  // Garages and map buildings keep working too, at the offline efficiency.
  const eff = snap.gm.offline;
  const city = snap.city.incomePerSec * capped * eff;
  credit(s, city);
  s.cash -= city;
  report.money += city;
  report.serviced = Math.floor(snap.city.carsPerSec * capped * eff);
  if (city > 0) {
    book(s, "services", city);
    settleLedger(s, capped);
  }
  // where the money came from and where it went while away
  report.ledger = Object.fromEntries(LEDGER_KEYS.map((k) => [k, Math.max(0, s.chain.ledger.run[k] - before[k])])) as OfflineReport["ledger"];
  report.carsSold = r.carsSold;
  report.materialsUsed = r.materials;
  return report;
}

/** Pays out a report computed by computeOffline (earnings were already counted). */
export function applyOffline(s: GameState, report: OfflineReport) {
  s.cash += report.money;
  s.run.offlineEarned += report.money;
  s.lifetime.offlineEarned += report.money;
  s.rp += report.rp;
  s.city.carsServiced += report.serviced ?? 0;
}

/**
 * Called on load. Short absences are credited silently; longer ones are kept
 * as `pendingOffline` (persisted) until the player presses COLLECT.
 */
export function settleOffline(s: GameState, now: number): OfflineReport | null {
  const report = computeOffline(s, now);
  s.lastActiveAt = now;
  if (report.money <= 0 && report.cars <= 0 && !report.components && !report.serviced) return null;
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
  applyOffline(s, { ...p, money: p.money * multiplier });
  s.pendingOffline = null;
  return p.money * multiplier;
}
