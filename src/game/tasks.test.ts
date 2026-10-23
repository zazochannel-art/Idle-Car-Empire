// Phase 12 of the economy audit: tasks point at car manufacturing — produce,
// ship, sell, make a real profit, run the whole chain — not "buy upgrades".
import { describe, expect, it } from "vitest";
import { EVENTS } from "./config/events";
import { DAILY_TEMPLATES, MILESTONES, isMoneyMetric } from "./config/missions";
import * as C from "./engine/city";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import { eventMetric } from "./engine/events";
import { generateDaily, metric } from "./engine/progress";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import type { GameState, PlantType } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);

function build(s: GameState, type: PlantType) {
  s.lifetime.parts.body = Math.max(s.lifetime.parts.body, 12);
  s.cash += Ch.plantBuildCost(s, type);
  const plot = Co.plotsFor(type)[0];
  expect(C.buildStructure(s, plot, type)).toBe(true);
  Co.constructionTick(s, 1e9);
  return s.city.buildings[plot].plant!;
}

describe("manufacturing tasks", () => {
  it("the first milestones walk the production chain", () => {
    const first = MILESTONES.slice(0, 14).map((m) => m.id);
    for (const id of ["m_parts_30", "m_engine_plant", "m_car_1", "m_cars_5", "m_ship_5", "m_sold_10", "m_profit_10k", "m_full_chain"]) expect(first).toContain(id);
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
  });

  it("no daily task asks to buy upgrades; one asks for net profit", () => {
    expect(DAILY_TEMPLATES.some((t) => t.metric === "levelsBought" || t.metric === "upgradesBought")).toBe(false);
    expect(DAILY_TEMPLATES.some((t) => t.metric === "netProfit")).toBe(true);
    expect(isMoneyMetric("netProfit")).toBe(true);
    const s = createInitialState(T0);
    for (const m of generateDaily(s, T0)) expect(m.metric).not.toBe("levelsBought");
  });

  it("the Steel Price Crash event asks for components, not upgrades", () => {
    const steel = EVENTS.find((e) => e.id === "steelSale")!;
    expect(steel.goal.metric).toBe("componentsBuilt");
    const s = createInitialState(T0);
    const before = eventMetric(s, "componentsBuilt");
    s.lifetime.parts.body += 3;
    s.lifetime.parts.engine += 2;
    expect(eventMetric(s, "componentsBuilt")).toBe(before + 5);
  });

  it("net profit, cars shipped and the full chain are measured from the game", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    expect(metric(s, "fullChain", snap)).toBe(0);
    s.chain.ledger.run.carSales = 15_000;
    s.chain.ledger.run.materials = 4_000;
    expect(metric(s, "netProfit", snap)).toBe(11_000);
    build(s, "engineFactory");
    build(s, "tireFactory");
    const asm = build(s, "assemblyPlant");
    expect(metric(s, "fullChain", snapshot(s))).toBe(0);
    s.lifetime.carsProduced = 1;
    expect(metric(s, "fullChain", snapshot(s))).toBe(1);
    // a car delivered to a dealer counts as shipped
    s.dealers.local.owned = true;
    asm.out = 1;
    asm.outValue = 6_000;
    asm.car = "city";
    const shipped = metric(s, "carsShipped", snapshot(s));
    for (let t = 0; t < 120; t += 0.5) tick(s, 0.5);
    expect(metric(s, "carsShipped", snapshot(s))).toBeGreaterThan(shipped);
  });
});
