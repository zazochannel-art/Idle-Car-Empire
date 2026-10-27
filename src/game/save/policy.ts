// Which save to play when the game starts, decided from facts only: the cloud
// revision this device's copy started from, whether it changed since, and
// whether two copies are the same game at all (the company's founding time).
// Nothing is replaced silently when both copies moved on: the player chooses.
import type { GameState } from "../types";
import type { CloudCopy, LocalCopy } from "./types";

export type StartDecision =
  /** No save anywhere: a new company. */
  | { use: "new" }
  /** This device's copy; `upload` sends it to the cloud on top of revision `base`. */
  | { use: "local"; copy: LocalCopy; upload: boolean; base: number }
  /** The cloud's copy. */
  | { use: "cloud" }
  /** Both copies hold progress the other has not: the player picks one (the other is kept as a backup). */
  | { use: "ask"; copy: LocalCopy; reason: "both-changed" | "different-games" }
  /** The cloud's save comes from a newer version of the game: reload before playing. */
  | { use: "outdated" };

type Stamped = { createdAt?: unknown; lastActiveAt?: unknown };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Two saves of the same company (founded at the same moment), not two different games. */
export function sameGame(a: unknown, b: unknown): boolean {
  const x = num((a as Stamped | null)?.createdAt);
  const y = num((b as Stamped | null)?.createdAt);
  return x !== null && x === y;
}

const lastPlayed = (s: unknown) => num((s as Stamped | null)?.lastActiveAt) ?? 0;

/** How close two copies of one company must be for the game to keep the one ahead without asking. */
export const NEARLY_SAME = {
  /** Total earnings differ by at most this share of the larger. */
  earned: 0.005,
  /** Both were played within this long of each other (ms). */
  played: 10 * 60_000,
};

/**
 * Two copies of the same company, played at about the same time and about as far along (the
 * same game open on two devices, a few seconds apart): which one is ahead, or null when the
 * player should choose. Nothing of note is lost either way, and the other is kept as a backup.
 */
export function nearlySame(local: unknown, cloud: unknown): "local" | "cloud" | null {
  if (!sameGame(local, cloud)) return null;
  const a = summarize(local);
  const b = summarize(cloud);
  if (a.plants !== b.plants) return null;
  if (Math.abs(a.lastPlayed - b.lastPlayed) > NEARLY_SAME.played) return null;
  const top = Math.max(a.earned, b.earned);
  if (Math.abs(a.earned - b.earned) > top * NEARLY_SAME.earned) return null;
  if (a.earned !== b.earned) return a.earned > b.earned ? "local" : "cloud";
  return a.lastPlayed > b.lastPlayed ? "local" : "cloud";
}

/**
 * @param own this account's copy on this device
 * @param legacy the save from before accounts (or from playing without the cloud)
 * @param cloud the cloud's copy, or null when it could not be reached
 * @param supportedVersion the newest save format this game reads
 */
export function decideStart(own: LocalCopy | null, legacy: LocalCopy | null, cloud: CloudCopy | null, supportedVersion: number): StartDecision {
  // offline: play this device's copy; it is checked against the cloud at the first save
  if (!cloud) {
    const copy = own ?? legacy;
    return copy ? { use: "local", copy, upload: true, base: copy.base ?? 0 } : { use: "new" };
  }
  if (cloud.revision > 0 && cloud.version > supportedVersion) return { use: "outdated" };

  if (cloud.revision === 0) {
    const copy = own ?? legacy;
    return copy ? { use: "local", copy, upload: true, base: 0 } : { use: "new" };
  }

  if (own) {
    // the cloud is where this copy left it: this copy is the newer (or the same)
    if (own.base === cloud.revision) return { use: "local", copy: own, upload: !!own.dirty, base: cloud.revision };
    // the cloud moved on (another device): take it, unless this device has unsaved progress too
    if (!own.dirty) return { use: "cloud" };
    // both moved on, but only just (the same game open on two devices): the one ahead continues
    const ahead = nearlySame(own.state, cloud.state);
    if (ahead === "local") return { use: "local", copy: own, upload: true, base: cloud.revision };
    if (ahead === "cloud") return { use: "cloud" };
    return { use: "ask", copy: own, reason: "both-changed" };
  }

  if (legacy) {
    if (!sameGame(legacy.state, cloud.state)) return { use: "ask", copy: legacy, reason: "different-games" };
    // the same company: the copy played last continues
    return lastPlayed(legacy.state) > lastPlayed(cloud.state) ? { use: "local", copy: legacy, upload: true, base: cloud.revision } : { use: "cloud" };
  }

  return { use: "cloud" };
}

/**
 * Time away is measured by the server: a save can't claim more offline time
 * than passed on the server's clock since its last cloud save (setting the
 * device's clock forward earns nothing). Returns the lastActiveAt to use.
 */
export function trustedLastActive(lastActiveAt: number, cloud: CloudCopy | null, clientNow: number): number {
  const last = Math.min(lastActiveAt, clientNow);
  if (!cloud || cloud.revision === 0 || !(cloud.serverNow > 0) || !(cloud.updatedAt > 0)) return last;
  const away = Math.max(0, cloud.serverNow - cloud.updatedAt);
  return Math.max(last, clientNow - away);
}

/** What the player sees of a save when choosing between two. */
export interface SaveSummary {
  company: string;
  cash: number;
  earned: number;
  cars: number;
  plants: number;
  lastPlayed: number;
}

export function summarize(state: unknown): SaveSummary {
  const s = (state ?? {}) as Partial<GameState>;
  const buildings = (s.city?.buildings ?? {}) as Record<string, { plant?: unknown }>;
  return {
    company: s.brand?.name ?? "",
    cash: num(s.cash) ?? 0,
    earned: num(s.lifetime?.moneyEarned) ?? 0,
    cars: num(s.lifetime?.carsProduced) ?? 0,
    plants: Object.values(buildings).filter((b) => b && b.plant).length,
    lastPlayed: lastPlayed(s),
  };
}
