// Which funnel steps a new company has reached (config/funnel.ts). The game
// state remembers the ones already sent (s.funnel), so a step is counted once
// per company, even across devices; companies from before the funnel are
// marked "legacy" and never counted.
import { FUNNEL_LEGACY, FUNNEL_STEPS, type FunnelStep } from "../config/funnel";
import type { GameState } from "../types";
import { hasPlant } from "./chain";

const dayNo = (t: number) => {
  const d = new Date(t);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};

/** Whether the company has reached a step (the welcome page, "gate", is tracked before there is a company). */
export function funnelReached(s: GameState, step: FunnelStep, now: number): boolean {
  switch (step) {
    case "gate":
      return false;
    case "start":
      return true;
    case "firstBody":
      return (s.lifetime.parts.body ?? 0) >= 1;
    case "engineFactory":
      return hasPlant(s, "engineFactory");
    case "assemblyPlant":
      return hasPlant(s, "assemblyPlant");
    case "firstCar":
      return s.chain.firstCar || s.lifetime.carsProduced >= 1;
    case "firstSale":
      return s.lifetime.carsSold >= 1;
    case "min30":
      return s.lifetime.playTime >= 30 * 60;
    case "zone2":
      return s.city.zones.length >= 2;
    case "research":
      return s.lifetime.researchDone >= 1;
    case "hour3":
      return s.lifetime.playTime >= 3 * 3600;
    case "racing":
      return s.racing.unlocked;
    case "day1":
      return dayNo(now) > dayNo(s.createdAt);
    case "day7":
      return dayNo(now) - dayNo(s.createdAt) >= 7;
    case "imperium":
      return s.imperiumCount >= 1;
  }
}

/** Steps reached and not sent yet, in order (none for a company from before the funnel). */
export function funnelDue(s: GameState, now: number): FunnelStep[] {
  if (s.funnel.includes(FUNNEL_LEGACY)) return [];
  return FUNNEL_STEPS.filter((step) => !s.funnel.includes(step) && funnelReached(s, step, now));
}

/** Minutes of play so far (what a step reports with its name). */
export const funnelMinutes = (s: GameState) => Math.max(0, Math.floor(s.lifetime.playTime / 60));

/** The steps of a save: a list of known names; a save from before the funnel is "legacy". */
export function migrateFunnel(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [FUNNEL_LEGACY];
  const known = new Set<string>([...FUNNEL_STEPS, FUNNEL_LEGACY]);
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && known.has(x)))];
}
