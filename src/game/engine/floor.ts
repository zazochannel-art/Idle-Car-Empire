// Life on the shop floor, beyond the numbers: machines that break down now
// and then (a tap fixes them, or the mechanic does in a while), a boost that
// pushes a line to double speed for half a minute (overtime the crew feels),
// and the crew's morale, which nudges how fast they work.
//
// Everything here is deterministic (no dice): a machine wears out after a
// run time drawn from the plant's id and how often it already broke, so the
// same game plays the same way, tests included.
import type { GameState, PlantData } from "../types";

export const BOOST = {
  /** How much faster a boosted line works, for how long (s), and the wait before the next boost (s). */
  mult: 2,
  dur: 30,
  cooldown: 240,
  /** Morale it costs the crew (overtime). */
  morale: 8,
} as const;

export const BREAKDOWN = {
  /** Running time between breakdowns (s): somewhere in this range. */
  min: 30 * 60,
  max: 60 * 60,
  /** A broken machine slows the line to this pace… */
  slow: 0.5,
  /** …until the mechanic fixes it (s); a plant with a manager has one on site. */
  repair: 90,
  repairManaged: 30,
  /** Morale a breakdown costs. */
  morale: 3,
  /** A new plant runs in before anything breaks (units made). */
  runIn: 50,
} as const;

export const MORALE = {
  /** Where morale settles, with a manager on top, and how fast it gets there (points per second). */
  base: 75,
  managed: 10,
  drift: 2 / 60,
  /** Pace: 1 at the base, ±10% per 25 points. */
  per: 1 / 250,
} as const;

/**
 * The maintenance crew (engine/maintenance.ts buys its levels): every level the machines
 * wear slower and a broken one runs again sooner; from `calmFrom` up a breakdown leaves the
 * crew's morale alone.
 */
export const CREW = {
  maxLevel: 5,
  /** Level 5: half as many breakdowns. */
  wearPerLevel: 0.1,
  /** Level 5: a tenth of the repair time. */
  repairPerLevel: 0.18,
  calmFrom: 3,
} as const;

const crewLevel = (level: number) => Math.max(0, Math.min(CREW.maxLevel, Math.floor(level) || 0));
/** How fast machines wear with this crew (1: no crew). */
export const crewWear = (level: number) => 1 - CREW.wearPerLevel * crewLevel(level);
/** The share of the repair time left with this crew (1: no crew). */
export const crewRepair = (level: number) => 1 - CREW.repairPerLevel * crewLevel(level);

/** The crew's morale, 0..100 (older saves: the base). */
export const moraleOf = (p: PlantData) => p.morale ?? MORALE.base;

/** How fast the floor works on top of the plant's stats: boost, a broken machine, the crew's mood. */
export function floorPace(p: PlantData): number {
  const boost = (p.boost ?? 0) > 0 ? BOOST.mult : 1;
  const broken = (p.broken ?? 0) > 0 ? BREAKDOWN.slow : 1;
  const mood = 1 + (moraleOf(p) - MORALE.base) * MORALE.per;
  return boost * broken * mood;
}

/** A fixed pseudo-random number in [0, 1) for a string. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Running time until this plant's next breakdown (s). */
export function wearLimit(id: string, breaks: number): number {
  return BREAKDOWN.min + hash01(`${id}:${breaks}`) * (BREAKDOWN.max - BREAKDOWN.min);
}

/** Which of the line's machines broke (0…4, the line's machines in order), for the interior. */
export const brokenSlot = (id: string, p: PlantData) => Math.floor(hash01(`${id}#${p.breaks ?? 0}`) * 5);

/**
 * Advances one plant's floor by `dt` seconds: timers run down, morale drifts
 * home, and a running machine wears (online only: nothing breaks while the
 * player is away). Returns true when a machine just broke.
 */
export function floorTick(id: string, p: PlantData, dt: number, opts: { running: boolean; offline: boolean; managed: boolean; crew?: number }): boolean {
  if (p.boost) p.boost = Math.max(0, p.boost - dt);
  if (p.boostCd) p.boostCd = Math.max(0, p.boostCd - dt);
  // the mechanic gets there in the end (always, away from the game)
  if (p.broken) p.broken = opts.offline ? 0 : Math.max(0, p.broken - dt);
  const target = MORALE.base + (opts.managed ? MORALE.managed : 0);
  const m = moraleOf(p);
  const step = MORALE.drift * dt;
  p.morale = m < target ? Math.min(target, m + step) : Math.max(target, m - step);
  if (!opts.running || opts.offline || p.broken || p.made < BREAKDOWN.runIn) return false;
  const crew = opts.crew ?? 0;
  p.wear = (p.wear ?? 0) + dt * crewWear(crew);
  if (p.wear < wearLimit(id, p.breaks ?? 0)) return false;
  p.wear = 0;
  p.breaks = (p.breaks ?? 0) + 1;
  p.broken = (opts.managed ? BREAKDOWN.repairManaged : BREAKDOWN.repair) * crewRepair(crew);
  if (crewLevel(crew) < CREW.calmFrom) p.morale = Math.max(0, moraleOf(p) - BREAKDOWN.morale);
  return true;
}

/** Fixes a broken machine on the spot (a tap). */
export function repairPlant(s: GameState, id: string): boolean {
  const p = s.city.buildings[id]?.plant;
  if (!p || !p.broken) return false;
  p.broken = 0;
  return true;
}

/** Overtime: the line runs at double speed for a while; the crew pays for it in morale. */
export function boostPlant(s: GameState, id: string): boolean {
  const p = s.city.buildings[id]?.plant;
  if (!p || (p.boostCd ?? 0) > 0 || p.status !== "ok") return false;
  p.boost = BOOST.dur;
  p.boostCd = BOOST.cooldown;
  p.morale = Math.max(0, moraleOf(p) - BOOST.morale);
  return true;
}
