import { describe, expect, it } from "vitest";
import { STARTER_PLOT, WORLD_MAP } from "./city/layout";
import { parseVisitMap, visitState } from "./engine/visit";

const T0 = Date.UTC(2026, 9, 24, 12);
const PLOTS = WORLD_MAP.plots.filter((p) => p.kind === "plot").map((p) => p.id);

describe("visits in 3D", () => {
  it("reads the card's map, and nothing from a card without one", () => {
    expect(parseVisitMap(undefined)).toBeNull();
    expect(parseVisitMap({ plants: [] })).toBeNull();
    const m = parseVisitMap({ b: [[STARTER_PLOT, "bodyWorks", 99, ""], ["x"], "junk"], z: ["town", 3, "industrial"], t: [], d: ["local"], r: true });
    expect(m).toEqual({ buildings: [{ plot: STARTER_PLOT, type: "bodyWorks", level: 15, spec: "" }], zones: ["town", "industrial"], territories: [], dealers: ["local"], racing: true });
  });

  it("builds the visited island: their plants, garages, districts and dealerships", () => {
    const garage = PLOTS.find((p) => p !== STARTER_PLOT)!;
    const s = visitState(
      {
        buildings: [
          { plot: STARTER_PLOT, type: "bodyWorks", level: 7, spec: "" },
          { plot: garage, type: "garage", level: 3, spec: "painting" },
          { plot: "nowhere", type: "bodyWorks", level: 1, spec: "" },
          { plot: PLOTS[5], type: "spaceship", level: 1, spec: "" },
        ],
        zones: ["industrial", "atlantis"],
        territories: ["port"],
        dealers: ["local", "nobody"],
        racing: true,
      },
      T0,
    );
    expect(Object.keys(s.city.buildings).sort()).toEqual([STARTER_PLOT, garage].sort());
    expect(s.city.buildings[STARTER_PLOT]).toMatchObject({ type: "bodyWorks", level: 7 });
    expect(s.city.buildings[STARTER_PLOT].plant).toBeDefined();
    expect(s.city.buildings[garage].garage).toMatchObject({ no: 1, spec: "painting" });
    expect(s.city.zones).toEqual(["town", "industrial"]);
    expect(s.city.territories).toEqual(["port"]);
    expect(s.dealers.local.owned).toBe(true);
    expect(s.racing.unlocked).toBe(true);
  });
});
