// The Custom Garage factory: the player's own build, made on the factory's one
// production line (a worker, a machine, one job at a time). Its parts are looks
// only: a job costs money and time, and when it is claimed the build takes them.
import type { CustomGarageDesign, CustomGarageProduction, GameState } from "../types";

export const KITS = ["stock", "street", "widebody", "track"] as const;
export const WHEELS = ["five-spoke", "mesh", "deep-dish"] as const;
const KIT_COST: Record<CustomGarageDesign["kit"], number> = { stock: 0, street: 3_500, widebody: 9_000, track: 6_000 };
const PAINT_COST = 1_000;
const WHEELS_COST = 2_500;
const LOWERED_COST = 1_800;
const SPOILER_COST = 1_200;
export const WORKER_COST = 2_500;
export const MACHINE_MAX = 5;
/** The most a job can cost (every part changed, the dearest kit). */
const MAX_JOB_COST = PAINT_COST + Math.max(...Object.values(KIT_COST)) + WHEELS_COST + LOWERED_COST + SPOILER_COST;
/** A build before the first job: the factory's stock car. */
const STOCK = { paint: "#1687ff", kit: "stock", wheels: "five-spoke", lowered: false, spoiler: false } as const;

export const machineCost = (level: number) => 5_000 * level;

export const createProduction = (): CustomGarageProduction => ({ workerHired: false, machineLevel: 1, activeJob: null, completedJobs: 0 });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** A design within bounds, whoever wrote it (the screen, an imported file, a save); null if it isn't one. */
export function sanitizeDesign(raw: unknown, now: number): CustomGarageDesign | null {
  if (!isObj(raw)) return null;
  return {
    version: 1,
    name: typeof raw.name === "string" ? raw.name.slice(0, 48) : "My Custom Build",
    paint: typeof raw.paint === "string" && /^#[0-9a-f]{6}$/i.test(raw.paint) ? raw.paint : "#1687ff",
    kit: KITS.includes(raw.kit as CustomGarageDesign["kit"]) ? (raw.kit as CustomGarageDesign["kit"]) : "street",
    wheels: WHEELS.includes(raw.wheels as CustomGarageDesign["wheels"]) ? (raw.wheels as CustomGarageDesign["wheels"]) : "deep-dish",
    lowered: typeof raw.lowered === "boolean" ? raw.lowered : true,
    spoiler: typeof raw.spoiler === "boolean" ? raw.spoiler : true,
    prompt: typeof raw.prompt === "string" ? raw.prompt.slice(0, 500) : "",
    updatedAt: finite(raw.updatedAt, -1) >= 0 ? (raw.updatedAt as number) : now,
  };
}

/** What a job costs: each part that changes from the current build (lowering and a spoiler only cost when added). */
export function jobCost(s: GameState, next: CustomGarageDesign): number {
  const prev = s.customGarageDesign ?? STOCK;
  let cost = 0;
  if (next.paint !== prev.paint) cost += PAINT_COST;
  if (next.kit !== prev.kit) cost += KIT_COST[next.kit];
  if (next.wheels !== prev.wheels) cost += WHEELS_COST;
  if (next.lowered && !prev.lowered) cost += LOWERED_COST;
  if (next.spoiler && !prev.spoiler) cost += SPOILER_COST;
  return cost;
}

/** How long a job takes: 12 s, plus 2 s per $1,000 of parts; a better machine (up to level 3) works faster. */
export const jobDuration = (cost: number, machineLevel: number) => Math.round(((12 + (cost / 1_000) * 2) * 1_000) / Math.min(3, Math.max(1, machineLevel)));

const production = (s: GameState) => (s.customGarageProduction ??= createProduction());

export function hireWorker(s: GameState): boolean {
  const p = production(s);
  if (p.workerHired || s.cash < WORKER_COST) return false;
  s.cash -= WORKER_COST;
  p.workerHired = true;
  return true;
}

export function upgradeMachine(s: GameState): boolean {
  const p = production(s);
  const cost = machineCost(p.machineLevel);
  if (!p.workerHired || p.activeJob || s.cash < cost || p.machineLevel >= MACHINE_MAX) return false;
  s.cash -= cost;
  p.machineLevel += 1;
  return true;
}

/** Pays for the parts and puts the build on the line; it takes them when the job is claimed. */
export function startJob(s: GameState, design: unknown, now: number): boolean {
  const p = production(s);
  const next = sanitizeDesign(design, now);
  if (!next || !p.workerHired || p.activeJob) return false;
  next.updatedAt = now;
  const cost = jobCost(s, next);
  if (s.cash < cost) return false;
  s.cash -= cost;
  p.activeJob = { design: next, startedAt: now, durationMs: jobDuration(cost, p.machineLevel), cost };
  return true;
}

export const jobDone = (p: CustomGarageProduction | undefined, now: number) => !!p?.activeJob && now >= p.activeJob.startedAt + p.activeJob.durationMs;

export function claimJob(s: GameState, now: number): boolean {
  const p = s.customGarageProduction;
  if (!p?.activeJob || !jobDone(p, now)) return false;
  s.customGarageDesign = p.activeJob.design;
  p.activeJob = null;
  p.completedJobs += 1;
  return true;
}

/** A save's production line, within bounds (a job from a broken save is dropped, one from the future starts now). */
export function migrateProduction(raw: unknown, now: number): CustomGarageProduction {
  const p = createProduction();
  if (!isObj(raw)) return p;
  p.workerHired = raw.workerHired === true;
  p.machineLevel = Math.min(MACHINE_MAX, Math.max(1, Math.floor(finite(raw.machineLevel, 1))));
  p.completedJobs = Math.max(0, Math.floor(finite(raw.completedJobs, 0)));
  const job = raw.activeJob;
  const design = isObj(job) ? sanitizeDesign(job.design, now) : null;
  if (isObj(job) && design) {
    const cost = Math.min(MAX_JOB_COST, Math.max(0, finite(job.cost, 0)));
    const durationMs = finite(job.durationMs, 0);
    // (a start in the future, from a clock set back, would hold the line for ever)
    if (durationMs > 0) p.activeJob = { design, startedAt: Math.min(now, Math.max(0, finite(job.startedAt, now))), durationMs: Math.min(durationMs, jobDuration(MAX_JOB_COST, 1)), cost };
  }
  return p;
}
