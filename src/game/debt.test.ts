// Phase 6 of the economy audit: the company's account. Running costs the
// cash can't cover go on it — never materials — up to a limit; above it
// every plant is suspended until sales pay it down; half of every sale pays
// it back, so there is always cash for materials again.
import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { DEBT } from "./config/economy";
import * as Ch from "./engine/chain";
import { snapshot } from "./engine/economy";
import * as M from "./engine/materials";
import { createInitialState } from "./engine/state";
import { credit, tick } from "./engine/tick";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const run = (s: GameState, seconds: number, step = 0.5) => {
  for (let t = 0; t < seconds; t += step) tick(s, step);
};
const running = (s: GameState) => s.chain.ledger.run.labor + s.chain.ledger.run.energy + s.chain.ledger.run.maintenance;

/** A body works with material for many bodies and no cash. */
function broke() {
  const s = createInitialState(T0);
  const p = s.city.buildings[STARTER_PLOT].plant!;
  p.warehouse = 10;
  p.stock = Ch.starterStock("bodyWorks", 1, 40);
  s.cash = 0;
  s.chain.owed = 0;
  return { s, p };
}

describe("debt: the company's account", () => {
  it("with no cash, materials can't be bought — they are never on account", () => {
    const { s } = broke();
    expect(M.buyMaterial(s, STARTER_PLOT, "steel", 10)).toEqual({ ok: false, why: "cash" });
    expect(s.chain.owed).toBe(0);
  });

  it("with no cash, wages, energy and maintenance go on the account", () => {
    const { s, p } = broke();
    run(s, 20);
    expect(p.status).toBe("ok");
    expect(running(s)).toBeGreaterThan(0);
    // everything the plant cost was either paid (nothing: no cash) or owed
    expect(s.chain.owed).toBeCloseTo(running(s) + s.chain.ledger.run.logistics, 6);
  });

  it("the limit follows what the plants cost to run (at least DEBT.min)", () => {
    const { s } = broke();
    run(s, 1);
    const run1 = Object.values(snapshot(s).chain.plants).reduce((a, st) => a + st.opPerSec, 0);
    expect(M.debtLimit(s)).toBe(Math.max(DEBT.min, run1 * DEBT.seconds));
    expect(M.debtLimit(s)).toBeGreaterThanOrEqual(DEBT.min);
  });

  it("over the limit every plant is SUSPENDED: no production, no new costs", () => {
    const { s, p } = broke();
    run(s, 2);
    // cars still to sell at a dealer: the suspension holds until they pay the account down
    s.chain.dealers.local = { cars: 3, value: 15_000, models: ["city", "city", "city"], next: 1e9, sold: 0 };
    s.chain.owed = M.debtLimit(s) + 1;
    run(s, 1);
    expect(s.chain.suspended).toBe(true);
    const made = p.made;
    const costs = running(s);
    const owed = s.chain.owed;
    run(s, 60);
    expect(p.status).toBe("suspended");
    expect(p.made).toBe(made);
    expect(running(s)).toBe(costs);
    expect(s.chain.owed).toBe(owed);
    // nothing may be put on the account while suspended
    expect(M.canOwe(s, 1)).toBe(false);
  });

  it("the account is paid out of profit, never out of the cash the next materials need", () => {
    const { s } = broke();
    s.chain.owed = 1_000;
    s.cash = 600;
    // a sale is cash: it doesn't go to the account by itself
    credit(s, 600);
    expect(s.chain.owed).toBe(1_000);
    expect(s.cash).toBe(1_200);
    // the account takes DEBT.repay of the average net income, every second
    s.chain.steady = 10;
    s.city.buildings[STARTER_PLOT].plant!.stock = {};
    s.chain.rescueT = s.market.t;
    run(s, 10);
    expect(s.chain.owed).toBeCloseTo(1_000 - 10 * DEBT.repay * 10, 0);
    // cash that covers the account twice over settles it
    s.cash = 5_000;
    run(s, 0.5);
    expect(s.chain.owed).toBe(0);
  });

  it("production resumes once the account is paid down (or cash covers it)", () => {
    const { s, p } = broke();
    run(s, 2);
    const limit = M.debtLimit(s);
    s.chain.owed = limit + 1;
    s.chain.dealers.local = { cars: 3, value: 15_000, models: ["city", "city", "city"], next: 1e9, sold: 0 };
    run(s, 1);
    expect(s.chain.suspended).toBe(true);
    // paid down, but not yet to the resume line: the plants still wait
    s.chain.owed = limit * DEBT.resume + 100;
    run(s, 1);
    expect(s.chain.suspended).toBe(true);
    // at the line they start again
    s.chain.owed = limit * DEBT.resume - 1;
    run(s, 1);
    expect(s.chain.suspended).toBeUndefined();
    const made = p.made;
    run(s, 120);
    expect(p.made).toBeGreaterThan(made);
    // or: while suspended, cash that covers the account settles it at once
    s.chain.owed = limit + 500;
    s.cash = 0;
    run(s, 1);
    expect(s.chain.suspended).toBe(true);
    s.cash = limit + 600;
    run(s, 1);
    expect(s.chain.owed).toBe(0);
    expect(s.chain.suspended).toBeUndefined();
  });

  it("a suspended company with nothing left to sell may produce again (it is the only way to pay)", () => {
    const { s, p } = broke();
    run(s, 2);
    s.chain.shipments = [];
    p.out = 0;
    s.chain.owed = M.debtLimit(s) + 1;
    run(s, 1);
    expect(s.chain.suspended).toBeUndefined();
    expect(p.status).toBe("ok");
  });

  it("bought-in parts on credit stay within the limit", () => {
    const { s } = broke();
    run(s, 1);
    s.chain.owed = M.debtLimit(s) - 10;
    expect(M.canOwe(s, 100)).toBe(false);
    expect(M.canOwe(s, 5)).toBe(true);
    s.cash = 200;
    expect(M.canOwe(s, 100)).toBe(true); // the cash covers it
  });

  it("while suspended, What's next says so first and suggests nothing that spends money", async () => {
    const { nextGoals } = await import("./engine/insights");
    const { s } = broke();
    run(s, 2);
    s.chain.dealers.local = { cars: 3, value: 15_000, models: ["city", "city", "city"], next: 1e9, sold: 0 };
    s.chain.owed = M.debtLimit(s) + 500;
    s.cash = 1e6; // even with cash on hand (it settles the account next tick anyway)
    s.chain.suspended = true;
    const goals = nextGoals(s, snapshot(s), 5);
    expect(goals[0].kind).toBe("debt");
    for (const g of goals) expect(["plant", "upgrade", "warehouse", "dealer", "zone", "manager"]).not.toContain(g.kind);
  });
});
