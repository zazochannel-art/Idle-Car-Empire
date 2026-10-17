import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { awayEvents } from "./engine/away";
import { createInitialState } from "./engine/state";

const NOW = Date.UTC(2026, 9, 17, 12);

describe("notifications for the time away", () => {
  it("each building still going up, then the offline limit, soonest first", () => {
    const s = createInitialState(NOW);
    s.city.sites["c:town:3"] = { type: "assemblyPlant", t: 100, dur: 700, cost: 1 };
    s.city.buildings[STARTER_PLOT].works = { to: 2, t: 0, dur: 300, cost: 1 };
    const ev = awayEvents(s, 12, NOW);
    expect(ev.map((e) => e.kind)).toEqual(["built", "built", "offlineFull"]);
    expect(ev[0]).toMatchObject({ at: NOW + 300_000, plot: STARTER_PLOT, upgrade: true, level: 2 });
    expect(ev[1]).toMatchObject({ at: NOW + 600_000, plot: "c:town:3", structure: "assemblyPlant", upgrade: false });
    expect(ev[2].at).toBe(NOW + 12 * 3_600_000);
  });

  it("nothing for what finishes within a minute; at most a few, the offline limit always among them", () => {
    const s = createInitialState(NOW);
    s.city.sites["c:town:3"] = { type: "assemblyPlant", t: 590, dur: 600, cost: 1 };
    expect(awayEvents(s, 12, NOW).map((e) => e.kind)).toEqual(["offlineFull"]);
    for (let i = 0; i < 20; i++) s.city.sites[`c:town:${i}`] = { type: "garage", t: 0, dur: 1_000 + i, cost: 1 };
    const ev = awayEvents(s, 12, NOW);
    expect(ev).toHaveLength(8);
    expect(ev.at(-1)!.kind).toBe("offlineFull");
  });
});
