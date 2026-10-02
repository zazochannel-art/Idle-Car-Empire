import { describe, expect, it } from "vitest";
import { FACILITY_BY_ID, ZONES } from "./config/city";
import { STARTER_PLOT, WORLD, WORLD_MAP, factoryPlot, segmentOpen } from "./city/layout";
import * as C from "./engine/city";
import { snapshot } from "./engine/economy";
import { computeOffline } from "./engine/offline";
import { prestige } from "./engine/prestige";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { decodeSave, encodeSave, migrate } from "./save/serialize";

const T0 = Date.UTC(2026, 0, 1, 12);

describe("world layout", () => {
  it("has one lot for every factory and a starter garage", () => {
    expect(WORLD).toBe(64);
    expect(factoryPlot("garage")?.zone).toBe("town");
    expect(factoryPlot("mega")?.zone).toBe("global");
    expect(WORLD_MAP.plots.filter((p) => p.kind === "factory")).toHaveLength(10);
    expect(WORLD_MAP.plots.filter((p) => p.kind === "dealer")).toHaveLength(6);
    expect(STARTER_PLOT.startsWith("town:")).toBe(true);
    for (const z of ZONES) expect(z.layout.join("")).toHaveLength(36);
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
    expect(segmentOpen("x", 0, 0, open)).toBe(true);
    expect(segmentOpen("x", 3, 0, open)).toBe(true); // border with Downtown
    expect(segmentOpen("x", 5, 5, open)).toBe(false);
  });
});

describe("garages", () => {
  it("a new game has Garage #01, empty, in the Small Town", () => {
    const s = createInitialState(T0);
    expect(s.city.zones).toEqual(["town"]);
    const g = s.city.buildings[STARTER_PLOT];
    expect(g.type).toBe("garage");
    expect(g.garage?.facilities).toHaveLength(0);
    expect(snapshot(s).city.incomePerSec).toBe(0);
  });

  it("a staffed service bay earns money over time", () => {
    const s = createInitialState(T0);
    s.cash = 50;
    expect(C.placeFacility(s, STARTER_PLOT, "serviceBay", 0, 0, 0)).toBe(true);
    expect(s.cash).toBe(0);
    const snap = snapshot(s);
    const st = snap.city.garages[STARTER_PLOT];
    expect(st.workstations).toBe(1);
    expect(st.staffed).toBe(1);
    expect(st.incomePerSec).toBeCloseTo((20 * 2) / 16); // fee 20 × repair bonus ×2 / 16s
    tick(s, 32);
    expect(s.cash).toBeCloseTo(st.incomePerSec * 32);
    expect(s.city.buildings[STARTER_PLOT].garage!.serviced).toBe(2);
  });

  it("placement respects bounds, overlaps, rotation and level caps", () => {
    const s = createInitialState(T0);
    s.cash = 1e9;
    const g = s.city.buildings[STARTER_PLOT].garage!;
    expect(C.placementProblem(1, g, "serviceBay", 6, 0, 0)).toBe("bounds"); // 3 wide on an 8-wide grid
    expect(C.placementProblem(1, g, "serviceBay", 6, 0, 1)).toBe(null); // rotated: 2 wide
    expect(C.placeFacility(s, STARTER_PLOT, "serviceBay", 0, 0, 0)).toBe(true);
    expect(C.placementProblem(1, g, "carLift", 2, 1, 0)).toBe("overlap");
    expect(C.placementProblem(1, g, "serviceBay", 0, 4, 0)).toBe("cap"); // one bay at level 1
    expect(C.placeFacility(s, STARTER_PLOT, "paintBooth", 0, 4, 0)).toBe(false); // level 2+
    expect(C.upgradeBuilding(s, STARTER_PLOT)).toBe(true);
    expect(C.gridSize(2)).toEqual([10, 10]);
    expect(C.placeFacility(s, STARTER_PLOT, "serviceBay", 0, 4, 0)).toBe(true);
    expect(C.placeFacility(s, STARTER_PLOT, "paintBooth", 5, 4, 0)).toBe(true);
    expect(C.moveFacility(s, STARTER_PLOT, g.facilities[0].uid, 9, 0, 1)).toBe(false); // off the grid
    expect(C.moveFacility(s, STARTER_PLOT, g.facilities[0].uid, 8, 0, 1)).toBe(true);
  });

  it("workers, power and specialization shape income", () => {
    const s = createInitialState(T0);
    s.cash = 1e12;
    for (let i = 0; i < 4; i++) C.upgradeBuilding(s, STARTER_PLOT);
    const b = s.city.buildings[STARTER_PLOT];
    expect(b.level).toBe(5);
    C.placeFacility(s, STARTER_PLOT, "serviceBay", 0, 0, 0);
    C.placeFacility(s, STARTER_PLOT, "paintBooth", 0, 2, 0);
    let st = snapshot(s).city.garages[STARTER_PLOT];
    expect(st.workstations).toBe(2);
    expect(st.staffed).toBe(1);
    expect(st.stations.find((x) => x.staffed)?.type).toBe("paintBooth"); // best-paying first
    const one = st.incomePerSec;
    expect(C.hireWorker(s, STARTER_PLOT)).toBe(true);
    st = snapshot(s).city.garages[STARTER_PLOT];
    expect(st.incomePerSec).toBeGreaterThan(one);
    const before = st.incomePerSec;
    expect(C.setSpecialization(s, STARTER_PLOT, "painting")).toBe(true);
    expect(snapshot(s).city.garages[STARTER_PLOT].incomePerSec).toBeGreaterThan(before);
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
    const plot = WORLD_MAP.plots.find((p) => p.zone === "town" && p.kind === "plot" && !p.starter)!;
    expect(C.buildStructure(s, plot.id, "partsFactory")).toBe(false); // not offered in town
    expect(C.buildStructure(s, plot.id, "carWash")).toBe(true);
    expect(C.buildStructure(s, plot.id, "parking")).toBe(false); // occupied
    const other = WORLD_MAP.plots.filter((p) => p.zone === "town" && p.kind === "plot" && !p.starter)[3];
    expect(C.buildStructure(s, other.id, "carWash")).toBe(false); // one car wash per district
    expect(snapshot(s).city.structureIncome[plot.id]).toBeGreaterThan(0);
    const second = WORLD_MAP.plots.find((p) => p.zone === "town" && p.kind === "plot" && !p.starter && p.id !== plot.id)!;
    const cost = C.structureCost(s, second.id, "garage");
    expect(cost).toBe(25_000); // second garage in the zone
    expect(C.buildStructure(s, second.id, "garage")).toBe(true);
    expect(s.city.buildings[second.id].garage?.no).toBe(2);
  });

  it("garages work offline and Global Expansion resets the city", () => {
    const s = createInitialState(T0);
    s.cash = 1000;
    C.placeFacility(s, STARTER_PLOT, "serviceBay", 0, 0, 0);
    const report = computeOffline(s, T0 + 3600 * 1000);
    expect(report.money).toBeGreaterThan(0);
    expect(report.serviced).toBeGreaterThan(0);

    s.run.moneyEarned = 1e10;
    s.lifetime.moneyEarned = 1e10;
    C.unlockZone(s, "industrial");
    expect(prestige(s, T0)).toBeGreaterThan(0);
    expect(s.city.zones).toEqual(["town"]);
    expect(s.city.buildings[STARTER_PLOT].garage?.facilities).toHaveLength(0);
  });

  it("saves round-trip the city and old saves get their zones", () => {
    const s = createInitialState(T0);
    s.cash = 1e9;
    C.placeFacility(s, STARTER_PLOT, "carLift", 3, 3, 0);
    C.unlockZone(s, "industrial");
    const back = decodeSave(encodeSave(s), T0);
    expect(back.city).toEqual(s.city);

    const old = JSON.parse(JSON.stringify(createInitialState(T0)));
    delete old.city;
    old.factories.european.owned = true;
    const migrated = migrate(old, T0);
    expect(migrated.city.zones).toEqual(["town", "industrial"]);
    expect(migrated.city.buildings[STARTER_PLOT].type).toBe("garage");

    const junk = migrate({ ...old, city: { zones: ["nowhere"], buildings: { "nope:1:1": { type: "garage" }, [STARTER_PLOT]: { type: "garage", level: 99, garage: { facilities: [{ type: "dyno", x: 50, y: 0 }] } } } } }, T0);
    expect(junk.city.buildings[STARTER_PLOT].level).toBe(10);
    expect(junk.city.buildings[STARTER_PLOT].garage?.facilities).toHaveLength(0);
    expect(Object.keys(junk.city.buildings)).toEqual([STARTER_PLOT]);
  });
});
