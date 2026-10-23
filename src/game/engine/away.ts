// What will be waiting for the player while the game is closed: the app asks
// the phone to notify them at these times as it goes to the background
// (lib/notify.ts), and takes the notifications back when the player returns.
import type { GameState, StructureType } from "../types";
import { remainingOf } from "./construction";

export type AwayEvent =
  | { at: number; kind: "built"; plot: string; structure: StructureType; level: number; upgrade: boolean }
  /** The offline limit reached: the plants earn nothing more until the player is back. */
  | { at: number; kind: "offlineFull" };

/** Sooner than this, the player is likely still around: no notification. */
const MIN_AHEAD_MS = 60_000;
/** The phone is asked for a few at most (Android and iOS cap what an app may schedule). */
const MAX_EVENTS = 8;

/** The times something will be waiting, soonest first (construction keeps going while the game is closed). */
export function awayEvents(s: GameState, offlineCapHours: number, now: number): AwayEvent[] {
  const built: AwayEvent[] = [];
  for (const [plot, site] of Object.entries(s.city.sites)) built.push({ at: now + remainingOf(s, plot) * 1000, kind: "built", plot, structure: site.type, level: 1, upgrade: false });
  for (const [plot, b] of Object.entries(s.city.buildings)) if (b.works) built.push({ at: now + remainingOf(s, plot) * 1000, kind: "built", plot, structure: b.type, level: b.works.to, upgrade: true });
  const out: AwayEvent[] = built.filter((e) => e.at - now >= MIN_AHEAD_MS).sort((a, b) => a.at - b.at).slice(0, MAX_EVENTS - 1);
  // the offline limit always has its place: it is the one that brings every player back
  if (offlineCapHours > 0) out.push({ at: now + offlineCapHours * 3_600_000, kind: "offlineFull" });
  return out.sort((a, b) => a.at - b.at);
}
