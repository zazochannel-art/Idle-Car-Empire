import { FACTORIES } from "../config/factories";
import { OFFLINE } from "../config/prestige";
import type { GameState, OfflineReport } from "../types";
import { snapshot } from "./economy";
import { credit, recordCars } from "./tick";

/**
 * What the factories produced between `lastActiveAt` and `now`. Only automated
 * factories work while you are away, at their offline efficiency, up to the
 * offline limit (12h base, raised by research and Empire perks).
 */
export function computeOffline(s: GameState, now: number): OfflineReport {
  const seconds = Math.max(0, (now - s.lastActiveAt) / 1000);
  const snap = snapshot(s);
  const capped = Math.min(seconds, snap.gm.offlineCapHours * 3600);
  const report: OfflineReport = { seconds, cappedSeconds: capped, cars: 0, money: 0, rp: 0, carsByType: {} };
  if (capped <= 0) return report;

  for (const cfg of FACTORIES) {
    const st = snap.factories[cfg.id];
    if (!st || !st.automated) continue;
    const eff = st.offlineEfficiency;
    const cars = st.carsPerSec * capped * eff;
    report.cars += cars;
    report.carsByType[st.car.id] = (report.carsByType[st.car.id] ?? 0) + cars;
    report.money += st.incomeBeforeDealers * snap.dealers.multiplier * capped * eff;
    report.rp += cars * st.car.rp * snap.gm.rp;
  }
  report.cars = Math.floor(report.cars);
  return report;
}

export function applyOffline(s: GameState, report: OfflineReport) {
  credit(s, report.money);
  s.run.offlineEarned += report.money;
  s.lifetime.offlineEarned += report.money;
  s.rp += report.rp;
  for (const [car, n] of Object.entries(report.carsByType)) {
    recordCars(s, car as keyof typeof s.run.carsByType, Math.floor(n ?? 0));
  }
}

/**
 * Called on load. Short absences are credited silently; longer ones are kept
 * as `pendingOffline` (persisted) until the player presses COLLECT.
 */
export function settleOffline(s: GameState, now: number): OfflineReport | null {
  const report = computeOffline(s, now);
  s.lastActiveAt = now;
  if (report.money <= 0 && report.cars <= 0) return null;
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
    p.money += report.money;
    p.rp += report.rp;
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
