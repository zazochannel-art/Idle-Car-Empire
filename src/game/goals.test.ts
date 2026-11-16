import { describe, expect, it } from "vitest";
import { RESEARCH } from "./config/research";
import { snapshot } from "./engine/economy";
import { SHOWROOM_BACKLOG, nextGoals, showroomBacklog } from "./engine/insights";
import { createInitialState } from "./engine/state";
import type { GameState } from "./types";

const T0 = 1_700_000_000_000;

/** A company past its first car, with the Local Dealer open. */
function selling(): GameState {
  const s = createInitialState(T0);
  s.chain.firstCar = true;
  s.lifetime.carsProduced = 1;
  s.dealers.local.owned = true;
  return s;
}

describe("what's-next goals: research and slow dealers", () => {
  it("suggests the cheapest open research once the points pay for it", () => {
    const s = selling();
    const cheapest = RESEARCH.filter((r) => r.requires.length === 0).sort((a, b) => a.cost - b.cost)[0];
    s.rp = cheapest.cost - 1;
    expect(nextGoals(s, snapshot(s), 10).some((g) => g.kind === "research")).toBe(false);
    s.rp = cheapest.cost;
    const g = nextGoals(s, snapshot(s), 10).find((x) => x.kind === "research");
    expect(g && g.kind === "research" && g.research).toBe(cheapest.id);
  });

  it("no research goal before the first car (the start stays on the chain)", () => {
    const s = createInitialState(T0);
    s.rp = 1e9;
    expect(nextGoals(s, snapshot(s), 10).some((g) => g.kind === "research")).toBe(false);
  });

  it("a showroom that is mostly full asks for a dealer upgrade or a new dealer", () => {
    const s = selling();
    const cap = snapshot(s).chain.dealers.local!.stockCap;
    s.chain.dealers.local = { cars: Math.floor(cap * SHOWROOM_BACKLOG) - 1, value: 0, models: [], next: 10, sold: 0 };
    expect(showroomBacklog(s, snapshot(s))).toBe(0);
    expect(nextGoals(s, snapshot(s), 10).some((g) => g.kind === "dealerSlow")).toBe(false);
    s.chain.dealers.local.cars = Math.ceil(cap * SHOWROOM_BACKLOG);
    expect(showroomBacklog(s, snapshot(s))).toBe(s.chain.dealers.local.cars);
    const g = nextGoals(s, snapshot(s), 10).find((x) => x.kind === "dealerSlow");
    expect(g).toBeDefined();
    expect(g && g.kind === "dealerSlow" && g.cost).toBeGreaterThan(0);
  });
});
