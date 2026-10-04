import { describe, expect, it } from "vitest";
import { FACILITY_BY_ID, SERVICE_FEE, ZONES } from "./config/city";
import { DEPOT, DRIVEWAY, MARKET, STARTER_PLOT, WORLD, WORLD_MAP, roadRoute, segmentOpen } from "./city/layout";
import type { GameState } from "./types";
import * as C from "./engine/city";
import { snapshot } from "./engine/economy";
import { computeOffline } from "./engine/offline";
import { prestige } from "./engine/prestige";
import { PRESTIGE } from "./config/prestige";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { decodeSave, encodeSave, migrate } from "./save/serialize";

// outside every season (seasons add income) and outside market events
const T0 = Date.UTC(2026, 2, 1, 12);

/** Garages are a side business now: build one on the first free town plot. */
const GAR = WORLD_MAP.plots.find((p) => p.zone === "town" && p.kind === "plot" && !p.starter && !p.big)!.id;
function withGarage(cash = 0): GameState {
  const s = createInitialState(T0);
  s.cash = 500 + cash;
  expect(C.buildStructure(s, GAR, "garage")).toBe(true);
  return s;
}

describe("world layout", () => {
  it("has the market, the depot, industrial lots and the starter works", () => {
    expect(WORLD).toBe(71);
    expect(WORLD_MAP.plotById[MARKET].zone).toBe("town");
    expect(WORLD_MAP.plotById[DEPOT].zone).toBe("town");
    expect(WORLD_MAP.plots.filter((p) => p.big)).toHaveLength(9);
    expect(WORLD_MAP.plots.filter((p) => p.kind === "dealer")).toHaveLength(6);
    expect(WORLD_MAP.plotById[STARTER_PLOT].zone).toBe("town");
    for (const z of ZONES) expect(WORLD_MAP.plots.filter((p) => p.zone === z.id && p.kind === "plot").length).toBeGreaterThanOrEqual(4);
  });

  it("plots never overlap roads and every entry is on a road", () => {
    for (const p of WORLD_MAP.plots) {
      expect(p.x % 7).not.toBe(0);
      expect((p.x + p.w) % 7).not.toBe(1);
      expect(Math.floor(p.entry.y) % 7).toBe(0);
    }
  });

  it("only roads next to unlocked zones carry traffic", () => {
    const open = new Set(["town"] as const);
    expect(segmentOpen("x", 0, 2, open)).toBe(true);
    expect(segmentOpen("x", 2, 3, open)).toBe(true); // border with Downtown
    expect(segmentOpen("x", 6, 5, open)).toBe(false); // Supercar Valley
    expect(segmentOpen("x", 0, 0, open)).toBe(false); // hills: no road
    expect(segmentOpen("y", 5, 0, open)).toBe(false); // the river
  });
});

describe("garages", () => {
  it("the first garage of a district is cheap and starts empty", () => {
    const s = withGarage();
    expect(s.cash).toBe(0);
    const g = s.city.buildings[GAR];
    expect(g.garage?.no).toBe(1);
    expect(g.garage?.facilities).toHaveLength(0);
    expect(snapshot(s).city.incomePerSec).toBe(0);
  });

  it("a staffed service bay earns money over time", () => {
    const s = withGarage(50);
    expect(C.placeFacility(s, GAR, "serviceBay", 0, 0, 0)).toBe(true);
    expect(s.cash).toBe(0);
    const snap = snapshot(s);
    const st = snap.city.garages[GAR];
    expect(st.workstations).toBe(1);
    expect(st.staffed).toBe(1);
    expect(st.incomePerSec).toBeCloseTo((SERVICE_FEE * 2) / 16); // fee × repair bonus ×2 / 16s
    for (const [, b] of Object.entries(s.city.buildings)) if (b.plant) b.plant.stock = { steel: 1 }; // keep the body works quiet (too little for a body)
    tick(s, 32);
    expect(s.cash).toBeCloseTo(st.incomePerSec * 32);
    expect(s.city.buildings[GAR].garage!.serviced).toBe(2);
  });

  it("placement respects bounds, overlaps, rotation and level caps", () => {
    const s = withGarage(1e9);
    const g = s.city.buildings[GAR].garage!;
    expect(C.placementProblem(1, g, "serviceBay", 6, 0, 0)).toBe("bounds"); // 3 wide on an 8-wide grid
    expect(C.placementProblem(1, g, "serviceBay", 6, 0, 1)).toBe(null); // rotated: 2 wide
    expect(C.placeFacility(s, GAR, "serviceBay", 0, 0, 0)).toBe(true);
    expect(C.placementProblem(1, g, "carLift", 2, 1, 0)).toBe("overlap");
    expect(C.placementProblem(1, g, "serviceBay", 0, 4, 0)).toBe("cap"); // one bay at level 1
    expect(C.placeFacility(s, GAR, "paintBooth", 0, 4, 0)).toBe(false); // level 2+
    expect(C.upgradeBuilding(s, GAR)).toBe(true);
    expect(C.gridSize(2)).toEqual([10, 10]);
    expect(C.placeFacility(s, GAR, "serviceBay", 0, 4, 0)).toBe(true);
    expect(C.placeFacility(s, GAR, "paintBooth", 5, 4, 0)).toBe(true);
    expect(C.moveFacility(s, GAR, g.facilities[0].uid, 9, 0, 1)).toBe(false); // off the grid
    expect(C.moveFacility(s, GAR, g.facilities[0].uid, 8, 0, 1)).toBe(true);
  });

  it("workers, power and specialization shape income", () => {
    const s = withGarage(1e12);
    for (let i = 0; i < 4; i++) C.upgradeBuilding(s, GAR);
    const b = s.city.buildings[GAR];
    expect(b.level).toBe(5);
    C.placeFacility(s, GAR, "serviceBay", 0, 0, 0);
    C.placeFacility(s, GAR, "paintBooth", 0, 2, 0);
    let st = snapshot(s).city.garages[GAR];
    expect(st.workstations).toBe(2);
    expect(st.staffed).toBe(1);
    expect(st.stations.find((x) => x.staffed)?.type).toBe("paintBooth"); // best-paying first
    const one = st.incomePerSec;
    expect(C.hireWorker(s, GAR)).toBe(true);
    st = snapshot(s).city.garages[GAR];
    expect(st.incomePerSec).toBeGreaterThan(one);
    const before = st.incomePerSec;
    expect(C.setSpecialization(s, GAR, "painting")).toBe(true);
    expect(snapshot(s).city.garages[GAR].incomePerSec).toBeGreaterThan(before);
    expect(st.powerFactor).toBe(1);
    expect(FACILITY_BY_ID.dyno.power).toBeGreaterThan(0);
  });
});

describe("zones and plots", () => {
  it("zones unlock in order and gate their factories", () => {
    const s = createInitialState(T0);
    s.cash = 1e12;
    expect(C.unlockZone(s, "downtown")).toBe(false); // needs Industrial first
    expect(C.unlockZone(s, "industrial")).toBe(true);
    expect(C.unlockZone(s, "downtown")).toBe(true);
    expect(s.city.zones).toEqual(["town", "industrial", "downtown"]);
  });

  it("builds structures on plots and applies their bonuses", () => {
    const s = createInitialState(T0);
    s.cash = 1e12;
    const plot = WORLD_MAP.plots.find((p) => p.zone === "town" && p.kind === "plot" && !p.starter && !p.big)!;
    expect(C.buildStructure(s, plot.id, "partsFactory")).toBe(false); // not offered in town
    expect(C.buildStructure(s, plot.id, "carWash")).toBe(true);
    expect(C.buildStructure(s, plot.id, "parking")).toBe(false); // occupied
    const other = WORLD_MAP.plots.filter((p) => p.zone === "town" && p.kind === "plot" && !p.starter)[3];
    expect(C.buildStructure(s, other.id, "carWash")).toBe(false); // one car wash per district
    expect(snapshot(s).city.structureIncome[plot.id]).toBeGreaterThan(0);
    const second = WORLD_MAP.plots.find((p) => p.zone === "town" && p.kind === "plot" && !p.starter && p.id !== plot.id)!;
    expect(C.structureCost(s, second.id, "garage")).toBe(500); // first garage in the zone
    expect(C.buildStructure(s, second.id, "garage")).toBe(true);
    expect(s.city.buildings[second.id].garage?.no).toBe(1);
  });

  it("garages work offline and Global Expansion resets the city", () => {
    const s = withGarage(1000);
    C.placeFacility(s, GAR, "serviceBay", 0, 0, 0);
    const report = computeOffline(s, T0 + 3600 * 1000);
    expect(report.money).toBeGreaterThan(0);
    expect(report.serviced).toBeGreaterThan(0);

    // just enough for a first expansion (more would unlock start-of-run perks that build plants)
    s.run.moneyEarned = PRESTIGE.minRunEarnings;
    s.lifetime.moneyEarned = PRESTIGE.minRunEarnings;
    s.cash += 1e6;
    C.unlockZone(s, "industrial");
    expect(prestige(s, T0)).toBeGreaterThan(0);
    expect(s.city.zones).toEqual(["town"]);
    expect(s.city.buildings[GAR]).toBeUndefined();
    expect(s.city.buildings[STARTER_PLOT].type).toBe("bodyWorks");
  });

  it("saves round-trip the city and drop what is invalid", () => {
    const s = withGarage(1e9);
    C.placeFacility(s, GAR, "carLift", 3, 3, 0);
    C.unlockZone(s, "industrial");
    const back = decodeSave(encodeSave(s), T0);
    expect(back.city).toEqual(s.city);

    const raw = JSON.parse(JSON.stringify(s));
    raw.city = { zones: ["nowhere"], buildings: { "nope:1:1": { type: "garage" }, [GAR]: { type: "garage", level: 99, garage: { facilities: [{ type: "dyno", x: 50, y: 0 }] } } } };
    const junk = migrate(raw, T0);
    expect(junk.city.zones).toEqual(["town"]);
    expect(junk.city.buildings[GAR].level).toBe(10);
    expect(junk.city.buildings[GAR].garage?.facilities).toHaveLength(0);
    expect(Object.keys(junk.city.buildings)).toEqual([GAR]);
  });
});

describe("road routes", () => {
  it("leave toward the destination and agree both ways", () => {
    const plots = WORLD_MAP.plots.filter((p) => p.kind === "plot").slice(0, 40);
    for (const a of plots.slice(0, 8))
      for (const b of plots.slice(8)) {
        const r = roadRoute(a.entry, b.entry);
        const back = roadRoute(b.entry, a.entry);
        expect(r.length).toBeCloseTo(back.length, 6);
        // never shorter than the straight grid distance plus both driveways
        expect(r.length).toBeGreaterThanOrEqual(Math.abs(a.entry.x - b.entry.x) + Math.abs(a.entry.y - b.entry.y) + 2 * DRIVEWAY - 1e-9);
      }
  });

  it("drives straight along a shared road segment", () => {
    const a = { x: 2.5, y: 7.5, line: 1, i0: 0, i1: 1, inward: 1 as const };
    const b = { x: 5.5, y: 7.5, line: 1, i0: 0, i1: 1, inward: -1 as const };
    const r = roadRoute(a, b);
    expect(r.from).toBeNull();
    expect(r.length).toBeCloseTo(3 + 2 * DRIVEWAY, 6);
  });
});
