import { describe, expect, it } from "vitest";
import { FACILITY_BY_ID, SERVICE_FEE, TERRITORIES, ZONES } from "./config/city";
import { DEPOT, DRIVEWAY, FAST_ROAD, MARKET, RACING, STARTER_PLOT, UNITS_PER_TILE, WORLD_MAP, along, roadOpen, roadRoute, routeLine } from "./city/layout";
import * as T from "./engine/territory";
import { computeGlobalMods } from "./engine/modifiers";
import type { GameState } from "./types";
import * as C from "./engine/city";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import { computeOffline } from "./engine/offline";
import { prestige } from "./engine/prestige";
import { PRESTIGE } from "./config/prestige";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { decodeSave, encodeSave, migrate } from "./save/serialize";

// outside every season (seasons add income) and outside market events
const T0 = Date.UTC(2026, 2, 1, 12);

/** Lets every construction and upgrade in progress finish. */
const finish = (s: GameState) => Co.constructionTick(s, 1e9);

/** Garages are a side business now: build one on the first town plot zoned for a garage. */
const GAR = Co.plotsFor("garage")[0];
function withGarage(cash = 0): GameState {
  const s = createInitialState(T0);
  s.cash = Co.landCost(s, GAR) + Co.constructionCost(s, GAR) + cash;
  expect(C.buildStructure(s, GAR, "garage")).toBe(true);
  finish(s);
  return s;
}

/** The four corners of a lot (map units). */
function corners(p: { x: number; y: number; w: number; d: number; rot: number }) {
  const c = Math.cos(p.rot);
  const n = Math.sin(p.rot);
  // local x runs along the road, local z toward it
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p.x + (u * p.w) / 2 * c + (v * p.d) / 2 * n, p.y - (u * p.w) / 2 * n + (v * p.d) / 2 * c]);
}

/** Do two convex polygons overlap (separating axis test)? */
function overlap(a: number[][], b: number[][]) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const nx = y2 - y1;
      const ny = x1 - x2;
      const pa = a.map(([x, y]) => x * nx + y * ny);
      const pb = b.map(([x, y]) => x * nx + y * ny);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  return true;
}

describe("world layout", () => {
  it("has the market, the depot, industrial lots and the starter works", () => {
    expect(WORLD_MAP.size[0]).toBeGreaterThan(300);
    expect(WORLD_MAP.plotById[MARKET].zone).toBe("town");
    expect(WORLD_MAP.plotById[DEPOT].zone).toBe("town");
    expect(WORLD_MAP.plots.filter((p) => p.big).length).toBeGreaterThanOrEqual(8);
    expect(WORLD_MAP.plots.filter((p) => p.kind === "dealer")).toHaveLength(6);
    expect(WORLD_MAP.plotById[STARTER_PLOT].zone).toBe("town");
    expect(WORLD_MAP.plotById[STARTER_PLOT].use).toBe("bodyWorks");
    for (const z of ZONES) expect(WORLD_MAP.plots.filter((p) => p.zone === z.id && p.kind === "plot").length).toBeGreaterThanOrEqual(6);
    // ranks run through the districts in stage order
    const ranked = WORLD_MAP.plots.filter((p) => p.kind === "plot").sort((a, b) => a.rank! - b.rank!);
    const stage = (z: string) => ZONES.find((x) => x.id === z)!.stage;
    for (let i = 1; i < ranked.length; i++) expect(stage(ranked[i].zone)).toBeGreaterThanOrEqual(stage(ranked[i - 1].zone));
  });

  it("lots never overlap and face their road, with the entry on it", () => {
    const polys = WORLD_MAP.plots.map(corners);
    for (let i = 0; i < polys.length; i++)
      for (let j = i + 1; j < polys.length; j++) expect(overlap(polys[i], polys[j]), `${WORLD_MAP.plots[i].id} / ${WORLD_MAP.plots[j].id}`).toBe(false);
    for (const p of WORLD_MAP.plots) {
      const road = WORLD_MAP.roads[p.entry.edge];
      const at = along(road.pts, road.acc, p.entry.s);
      expect(Math.hypot(at.x - p.entry.x, at.y - p.entry.y)).toBeLessThan(1e-6);
      // the middle of the lot's front edge is a driveway away from the road's centre line
      const fx = p.x + Math.sin(p.rot) * p.d / 2;
      const fy = p.y + Math.cos(p.rot) * p.d / 2;
      expect(Math.hypot(fx - p.entry.x, fy - p.entry.y), p.id).toBeLessThan(p.entry.drive + 0.6);
      expect(p.entry.drive, p.id).toBeLessThan(2.5);
    }
  });

  it("only roads through unlocked areas carry traffic", () => {
    const open = new Set(["town"]);
    const starter = WORLD_MAP.plotById[STARTER_PLOT];
    expect(roadOpen(starter.entry.edge, open)).toBe(true);
    const mega = WORLD_MAP.plots.find((p) => p.zone === "mega")!;
    expect(roadOpen(mega.entry.edge, open)).toBe(false);
    expect(roadOpen(mega.entry.edge, new Set(["mega"]))).toBe(true);
  });

  it("every district and territory is reachable by road from the starter works", () => {
    const start = WORLD_MAP.roads[WORLD_MAP.plotById[STARTER_PLOT].entry.edge];
    const seen = new Set<number>([start.a, start.b]);
    const queue = [start.a, start.b];
    while (queue.length) {
      const n = queue.shift()!;
      for (const r of WORLD_MAP.roads)
        for (const [x, y] of [[r.a, r.b], [r.b, r.a]])
          if (x === n && !seen.has(y)) (seen.add(y), queue.push(y));
    }
    const reached = WORLD_MAP.roads.filter((r) => seen.has(r.a) && seen.has(r.b));
    for (const id of [...ZONES.map((z) => z.id), ...TERRITORIES.map((t) => t.id)]) {
      expect(reached.some((r) => r.areas.includes(id)), id).toBe(true);
      expect(WORLD_MAP.areas[id], id).toBeTruthy();
    }
    // every junction is on the network (the roundabout's centre is not a junction)
    const used = new Set(WORLD_MAP.roads.flatMap((r) => [r.a, r.b]));
    expect([...used].every((n) => seen.has(n))).toBe(true);
    // the racing paddock stands on the circuit's own land
    expect(WORLD_MAP.plotById[RACING].kind).toBe("racing");
    expect(WORLD_MAP.circuit.length).toBeGreaterThan(20);
  });
});

describe("territories", () => {
  it("cost money and need their district, reputation and Empire Points; then they pay off", () => {
    const s = createInitialState(T0);
    expect(T.isTerritoryOpen(s, "raw")).toBe(false);
    expect(T.territoryLock(s, "raw")).toEqual({ kind: "zone", zone: "industrial" });
    s.city.zones.push("industrial");
    expect(T.territoryLock(s, "raw")).toMatchObject({ kind: "cash" });
    s.cash = 1e6;
    const speed = computeGlobalMods(s).speed;
    expect(T.unlockTerritory(s, "raw")).toBe(true);
    expect(s.cash).toBe(1e6 - 250_000);
    expect(computeGlobalMods(s).speed).toBeCloseTo(speed * 1.05);
    expect(T.unlockTerritory(s, "raw")).toBe(false);
    expect(T.territoryLock(s, "port")).toEqual({ kind: "rep", need: 5_000 });
    s.racing.rep = 30_000;
    s.city.zones.push("global");
    s.cash = 1e12;
    expect(T.territoryLock(s, "airport")).toEqual({ kind: "ep", need: 25 });
    // the campus opens with its district, racing with the Racing District
    expect(T.isTerritoryOpen(s, "campus")).toBe(false);
    s.city.zones.push("automotive");
    expect(T.isTerritoryOpen(s, "campus")).toBe(true);
    expect(T.unlockTerritory(s, "campus")).toBe(false);
    const back = migrate(JSON.parse(JSON.stringify(s)), T0);
    expect(back.city.territories).toEqual(["raw"]);
  });

  it("a save from the old grid map starts a new company and keeps its settings", () => {
    const s = createInitialState(T0);
    const raw = JSON.parse(JSON.stringify(s));
    raw.mapVersion = 2;
    raw.cash = 123_456;
    raw.settings.lang = "ro";
    raw.city.buildings = { "c:20:16": raw.city.buildings[STARTER_PLOT], "b:13:7": { type: "engineFactory", level: 2 } };
    const back = migrate(raw, T0);
    expect(back.mapVersion).toBe(3);
    expect(back.cash).toBe(createInitialState(T0).cash);
    expect(back.settings.lang).toBe("ro");
    expect(Object.keys(back.city.buildings)).toEqual([STARTER_PLOT]);
    // a current save is read as it is
    expect(migrate(JSON.parse(JSON.stringify(back)), T0).city.buildings).toEqual(back.city.buildings);
  });
});

describe("garages", () => {
  it("the first garage of a district is cheap and starts empty", () => {
    const s = withGarage();
    expect(s.cash).toBeCloseTo(0);
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
    s.chain.rescueT = s.market.t; // no emergency supplier: this is about the garage
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
    finish(s);
    expect(C.gridSize(2)).toEqual([10, 10]);
    expect(C.placeFacility(s, GAR, "serviceBay", 0, 4, 0)).toBe(true);
    expect(C.placeFacility(s, GAR, "paintBooth", 5, 4, 0)).toBe(true);
    expect(C.moveFacility(s, GAR, g.facilities[0].uid, 9, 0, 1)).toBe(false); // off the grid
    expect(C.moveFacility(s, GAR, g.facilities[0].uid, 8, 0, 1)).toBe(true);
  });

  it("workers, power and specialization shape income", () => {
    const s = withGarage(1e12);
    for (let i = 0; i < 4; i++) {
      C.upgradeBuilding(s, GAR);
      finish(s);
    }
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
    const plot = WORLD_MAP.plotById[Co.plotsFor("carWash")[0]];
    expect(C.buildStructure(s, plot.id, "partsFactory")).toBe(false); // not offered in town
    expect(C.buildStructure(s, plot.id, "parking")).toBe(false); // the plot is zoned for a car wash
    expect(C.buildStructure(s, plot.id, "carWash")).toBe(true);
    expect(C.buildStructure(s, plot.id, "carWash")).toBe(false); // already being built
    finish(s);
    expect(snapshot(s).city.structureIncome[plot.id]).toBeGreaterThan(0);
    const second = Co.plotsFor("garage")[0];
    expect(C.structureCost(s, second, "garage")).toBe(500); // first garage in the zone
    expect(C.buildStructure(s, second, "garage")).toBe(true);
    finish(s);
    expect(s.city.buildings[second].garage?.no).toBe(1);
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
  it("are never shorter than the straight line, and follow the roads from entry to entry", () => {
    const plots = WORLD_MAP.plots.filter((p) => p.kind === "plot");
    for (const a of plots.slice(0, 10))
      for (const b of plots.slice(10, 60)) {
        const r = roadRoute(a.entry, b.entry);
        const straight = Math.hypot(a.entry.x - b.entry.x, a.entry.y - b.entry.y);
        expect(r.length).toBeGreaterThanOrEqual((straight * FAST_ROAD) / UNITS_PER_TILE + 2 * DRIVEWAY - 1e-9);
        const line = routeLine(a.entry, b.entry);
        expect(Math.hypot(line[0][0] - a.entry.x, line[0][1] - a.entry.y)).toBeLessThan(1e-6);
        expect(Math.hypot(line[line.length - 1][0] - b.entry.x, line[line.length - 1][1] - b.entry.y)).toBeLessThan(1e-6);
        for (let i = 1; i < line.length; i++) expect(Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])).toBeLessThan(2.5);
      }
  });

  it("drives straight along a shared road section", () => {
    const byEdge = new Map<number, typeof WORLD_MAP.plots>();
    for (const p of WORLD_MAP.plots) byEdge.set(p.entry.edge, [...(byEdge.get(p.entry.edge) ?? []), p]);
    const [a, b] = [...byEdge.values()].find((l) => l.length >= 2 && !WORLD_MAP.roads[l[0].entry.edge].oneway && !WORLD_MAP.roads[l[0].entry.edge].fast)!;
    const r = roadRoute(a.entry, b.entry);
    expect(r.from).toBeNull();
    expect(r.length).toBeCloseTo(Math.abs(a.entry.s - b.entry.s) / UNITS_PER_TILE + 2 * DRIVEWAY, 6);
  });

  it("keeps the first map's pace in town and takes longer to the regions over the bridges", () => {
    const start = WORLD_MAP.plotById[STARTER_PLOT].entry;
    expect(roadRoute(WORLD_MAP.plotById[DEPOT].entry, start).length).toBeLessThan(15);
    expect(roadRoute(WORLD_MAP.plotById[MARKET].entry, start).length).toBeLessThan(20);
    const far = WORLD_MAP.plots.filter((p) => p.zone === "supercar").map((p) => roadRoute(start, p.entry).length);
    expect(Math.min(...far)).toBeGreaterThan(40);
    expect(Math.max(...far)).toBeLessThan(120);
  });
});
