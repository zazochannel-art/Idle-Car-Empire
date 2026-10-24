import { describe, expect, it } from "vitest";
import { MARKET, STARTER_PLOT } from "./city/layout";
import { snapshot } from "./engine/economy";
import { flowLinks } from "./engine/flow";
import { createInitialState } from "./engine/state";

const T0 = Date.UTC(2026, 9, 24, 12);

describe("delivery flow", () => {
  it("a lone parts plant sends its loads to the market", () => {
    const s = createInitialState(T0);
    const links = flowLinks(s, snapshot(s).chain);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ from: STARTER_PLOT, to: MARKET });
  });

  it("follows the trucks on the road, once per destination", () => {
    const s = createInitialState(T0);
    const truck = { from: STARTER_PLOT, to: "d:local", item: "body" as const, qty: 1, value: 1, t: 0, dur: 10, back: false, vehicle: "van" as const };
    s.chain.shipments.push({ ...truck, id: 1 }, { ...truck, id: 2 }, { ...truck, id: 3, back: true, to: "x" });
    const links = flowLinks(s, snapshot(s).chain);
    expect(links.map((l) => l.to)).toEqual(["d:local"]);
  });

  it("says when a plant piles up or is stuck", () => {
    const s = createInitialState(T0);
    const p = s.city.buildings[STARTER_PLOT].plant!;
    p.status = "ok";
    expect(flowLinks(s, snapshot(s).chain)[0].state).toBe("ok");
    p.status = "full";
    expect(flowLinks(s, snapshot(s).chain)[0].state).toBe("slow");
    p.status = "noRaw";
    expect(flowLinks(s, snapshot(s).chain)[0].state).toBe("stuck");
    p.status = "ok";
    p.broken = 30;
    expect(flowLinks(s, snapshot(s).chain)[0].state).toBe("stuck");
  });
});
