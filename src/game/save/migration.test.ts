// Phase 10 of the economy audit: saves from before the overhaul keep their
// progress; new fields get values derived from what the save has; broken
// values fall back to safe defaults.
import { describe, expect, it } from "vitest";
import { checkInvariants } from "../../../scripts/invariants";
import { STARTER_PLOT } from "../city/layout";
import * as M from "../engine/materials";
import { tick } from "../engine/tick";
import type { GameState } from "../types";
import { decodeSave, encodeSave, migrate } from "./serialize";
import before from "./fixtures/before-economy-overhaul.json";

const NOW = (before as { lastActiveAt: number }).lastActiveAt + 1_000;
const load = () => migrate(JSON.parse(JSON.stringify(before)), NOW);
type Raw = { city: { buildings: Record<string, { type: string; level: number; plant?: Record<string, unknown> }> }; chain: Record<string, unknown> } & Record<string, unknown>;
const raw = before as unknown as Raw;

describe("save migration across the economy overhaul", () => {
  it("a save from before keeps its company: cash, plants, levels, upgrades, stock, cars on the road", () => {
    const s = load();
    expect(s.cash).toBe(raw.cash);
    for (const [id, b] of Object.entries(raw.city.buildings)) {
      const now = s.city.buildings[id];
      expect(now.type).toBe(b.type);
      expect(now.level).toBe(b.level);
      expect(now.plant!.speed).toBe(b.plant!.speed);
      expect(now.plant!.stock).toEqual(b.plant!.stock);
      expect(now.plant!.made).toBe(b.plant!.made);
    }
    expect(s.city.buildings["c:town:3"].works?.to).toBe(5);
    expect(s.chain.shipments.length).toBe((raw.chain.shipments as unknown[]).length);
    expect(s.chain.dealers.local?.cars).toBe(9);
    expect(s.lifetime.carsProduced).toBe(204);
    expect(s.run.levelsBought).toBe(31);
    expect(s.market.bought).toBe(47_607);
    // the run's ledger keeps its totals; the new rewards line starts at zero
    expect(s.chain.ledger.run.carSales).toBeCloseTo(1_144_859.29, 1);
    expect(s.chain.ledger.run.rewards).toBe(0);
  });

  it("each warehouse's old total is shared out per material, by list price — nothing lost", () => {
    const s = load();
    for (const [id, b] of Object.entries(raw.city.buildings)) {
      const p = s.city.buildings[id].plant!;
      const total = (b.plant!.stockCost as number) ?? 0;
      expect(M.inventoryValue(p)).toBeCloseTo(total, 6);
      for (const [m, v] of Object.entries(p.stockCostBy ?? {})) {
        expect((p.stock as Record<string, number>)[m]).toBeGreaterThan(0);
        expect(v).toBeGreaterThan(0);
      }
    }
    // a material's unit cost is now its own, not the warehouse's average
    const engine = s.city.buildings["c:town:11"].plant!;
    expect(M.unitCostOf(engine, "copper")).toBeGreaterThan(M.unitCostOf(engine, "fluids")!);
  });

  it("the account and the Parts Market start clean, and the company keeps running", () => {
    const s = load();
    expect(s.chain.owed).toBe(0);
    expect(s.chain.suspended).toBeUndefined();
    expect(s.chain.demand).toBeUndefined();
    s.pendingOffline = null;
    s.lastActiveAt = NOW;
    const made = s.lifetime.carsProduced;
    for (let t = 0; t < 1_800; t += 0.5) tick(s, 0.5);
    expect(s.lifetime.carsProduced).toBeGreaterThan(made);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a new save round-trips everything the overhaul added", () => {
    const s = load();
    const p = s.city.buildings["c:town:3"].plant!;
    p.backup = true;
    s.chain.owed = 1_234;
    s.chain.suspended = true;
    s.chain.debtLimit = 20_000;
    s.chain.demand = { body: 12.5, chassis: 3 };
    s.chain.ledger.run.rewards = 999;
    const back = decodeSave(encodeSave(s), NOW);
    expect(back.city.buildings["c:town:3"].plant!.backup).toBe(true);
    expect(back.chain.owed).toBe(1_234);
    expect(back.chain.suspended).toBe(true);
    expect(back.chain.debtLimit).toBe(20_000);
    expect(back.chain.demand).toEqual({ body: 12.5, chassis: 3 });
    expect(back.chain.ledger.run.rewards).toBe(999);
    expect(back.city.buildings[STARTER_PLOT].plant!.stockCostBy).toEqual(s.city.buildings[STARTER_PLOT].plant!.stockCostBy);
  });

  it("missing or broken values fall back to safe defaults", () => {
    const bad = JSON.parse(JSON.stringify(before)) as Raw;
    const plant = bad.city.buildings[STARTER_PLOT].plant!;
    plant.stockCostBy = { steel: "lots", plastic: null };
    plant.backup = "yes";
    plant.status = "exploded";
    bad.chain.owed = "a lot";
    bad.chain.suspended = 1;
    bad.chain.debtLimit = -5;
    bad.chain.demand = { body: -3, nonsense: 4, engine: Number.NaN };
    (bad.chain.ledger as { run: Record<string, unknown> }).run.rewards = "x";
    const s: GameState = migrate(bad, NOW);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    expect(M.inventoryValue(p)).toBeCloseTo(plant.stockCost as number, 6);
    expect(p.backup).toBeUndefined();
    expect(p.status).toBe("ok");
    expect(s.chain.owed).toBe(0);
    expect(s.chain.suspended).toBeUndefined();
    expect(s.chain.debtLimit).toBeUndefined();
    expect(s.chain.demand).toBeUndefined();
    expect(s.chain.ledger.run.rewards).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });
});
