import { describe, expect, it } from "vitest";
import * as CG from "./engine/custom-garage";
import { createInitialState } from "./engine/state";
import { migrate } from "./save/serialize";
import type { CustomGarageDesign } from "./types";

const NOW = Date.UTC(2026, 9, 17, 12);
const game = (cash = 100_000) => {
  const s = createInitialState(NOW);
  s.cash = cash;
  return s;
};
const design = (patch: Partial<CustomGarageDesign> = {}): CustomGarageDesign => ({ version: 1, name: "Blue", paint: "#1687ff", kit: "stock", wheels: "five-spoke", lowered: false, spoiler: false, prompt: "", updatedAt: NOW, ...patch });
const load = (raw: unknown) => migrate(JSON.parse(JSON.stringify(raw)), NOW);

describe("Custom Garage production line", () => {
  it("a job needs the worker, costs the parts that change, takes its time, then gives the build", () => {
    const s = game();
    expect(CG.startJob(s, design({ paint: "#d42c38" }), NOW)).toBe(false);
    expect(CG.hireWorker(s)).toBe(true);
    expect(s.cash).toBe(100_000 - CG.WORKER_COST);
    // new paint, widebody kit, lowered: 1,000 + 9,000 + 1,800
    expect(CG.startJob(s, design({ paint: "#d42c38", kit: "widebody", lowered: true }), NOW)).toBe(true);
    expect(s.cash).toBe(100_000 - CG.WORKER_COST - 11_800);
    const job = s.customGarageProduction!.activeJob!;
    expect(job.durationMs).toBe(CG.jobDuration(11_800, 1));
    // one job at a time, and not claimed before it is done
    expect(CG.startJob(s, design(), NOW)).toBe(false);
    expect(CG.claimJob(s, NOW + job.durationMs - 1)).toBe(false);
    expect(CG.claimJob(s, NOW + job.durationMs)).toBe(true);
    expect(s.customGarageDesign).toMatchObject({ paint: "#d42c38", kit: "widebody", lowered: true });
    expect(s.customGarageProduction!.completedJobs).toBe(1);
    // the same build again changes nothing: no cost
    const cash = s.cash;
    expect(CG.startJob(s, { ...s.customGarageDesign }, NOW)).toBe(true);
    expect(s.cash).toBe(cash);
  });

  it("no money, no job; the machine upgrades only between jobs, up to its top level", () => {
    const s = game(3_000);
    CG.hireWorker(s);
    expect(CG.startJob(s, design({ kit: "widebody" }), NOW)).toBe(false);
    expect(s.cash).toBe(500);
    s.cash = 1e9;
    for (let i = 0; i < 10; i++) CG.upgradeMachine(s);
    expect(s.customGarageProduction!.machineLevel).toBe(CG.MACHINE_MAX);
  });

  it("a design from anywhere is kept within bounds", () => {
    const d = CG.sanitizeDesign({ name: "x".repeat(200), paint: "red; background:url(x)", kit: "rocket", wheels: 5, lowered: "yes", prompt: "p".repeat(900), updatedAt: -5, extra: { huge: true } }, NOW)!;
    expect(d).toEqual({ version: 1, name: "x".repeat(48), paint: "#1687ff", kit: "street", wheels: "deep-dish", lowered: true, spoiler: true, prompt: "p".repeat(500), updatedAt: NOW });
    expect(CG.sanitizeDesign("nope", NOW)).toBeNull();
    expect(CG.sanitizeDesign(null, NOW)).toBeNull();
  });
});

describe("Custom Garage in saves", () => {
  it("a job in progress and the build come back as they were", () => {
    const s = game();
    CG.hireWorker(s);
    CG.upgradeMachine(s);
    CG.startJob(s, design({ wheels: "mesh" }), NOW - 1_000);
    const back = load(s);
    expect(back.customGarageProduction).toEqual(s.customGarageProduction);
    expect(back.customGarageDesign).toBeNull();
  });

  it("a broken production line from a save is made sound (a broken job is dropped, a job from the future starts now)", () => {
    const s = game();
    const raw = JSON.parse(JSON.stringify(s));
    raw.customGarageProduction = { workerHired: true, machineLevel: -3, completedJobs: "lots", activeJob: { design: 7, startedAt: "x" } };
    expect(load(raw).customGarageProduction).toEqual({ workerHired: true, machineLevel: 1, activeJob: null, completedJobs: 0 });
    raw.customGarageProduction = { workerHired: true, machineLevel: 99, completedJobs: 4.7, activeJob: { design: design({ paint: "#000000" }), startedAt: NOW + 86_400_000, durationMs: 1e12, cost: 1e15 } };
    const p = load(raw).customGarageProduction!;
    expect(p.machineLevel).toBe(CG.MACHINE_MAX);
    expect(p.completedJobs).toBe(4);
    expect(p.activeJob!.startedAt).toBe(NOW);
    expect(p.activeJob!.durationMs).toBeLessThanOrEqual(CG.jobDuration(1e9, 1));
    expect(p.activeJob!.cost).toBeLessThan(20_000);
    expect(p.activeJob!.design.paint).toBe("#000000");
    // and the job can be finished
    expect(CG.claimJob(load(raw), NOW + 60_000)).toBe(true);
  });

  it("a save from before the Custom Garage gets an empty factory", () => {
    const raw = JSON.parse(JSON.stringify(game()));
    delete raw.customGarageDesign;
    delete raw.customGarageProduction;
    const s = load(raw);
    expect(s.customGarageDesign).toBeNull();
    expect(s.customGarageProduction).toEqual(CG.createProduction());
  });
});
