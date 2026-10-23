import { describe, expect, it } from "vitest";
import { BUILD_TIME, PLOT_USES } from "./config/city";
import { PLANTS } from "./config/chain";
import { STARTER_PLOT, WORLD_MAP, plotOf } from "./city/layout";
import * as C from "./engine/city";
import * as Ch from "./engine/chain";
import * as Co from "./engine/construction";
import { snapshot } from "./engine/economy";
import { computeOffline } from "./engine/offline";
import { createInitialState } from "./engine/state";
import { tick } from "./engine/tick";
import { decodeSave, encodeSave, migrate } from "./save/serialize";
import type { GameEvent } from "./types";

const T0 = Date.UTC(2026, 2, 1, 12);
const ENGINE = Co.plotsFor("engineFactory")[0];

/** A new company that may build its Engine Factory (12 bodies made). */
function ready() {
  const s = createInitialState(T0);
  s.lifetime.parts.body = 12;
  s.cash = 1e6;
  return s;
}

describe("land plots", () => {
  it("every building plot is zoned for one kind of building and has a size", () => {
    for (const p of WORLD_MAP.plots.filter((pl) => pl.kind === "plot")) {
      expect(p.use, p.id).toBeDefined();
      expect(p.size, p.id).toBeDefined();
      expect([...PLOT_USES[p.zone].cells, ...PLOT_USES[p.zone].big, "bodyWorks"]).toContain(p.use);
    }
    expect(plotOf(STARTER_PLOT)!.use).toBe("bodyWorks");
    // every plant has somewhere to go, and the first ones are in the starting town
    for (const p of PLANTS) expect(Co.plotsFor(p.id).length, p.id).toBeGreaterThan(0);
    for (const t of ["engineFactory", "tireFactory", "assemblyPlant", "warehouse", "garage"] as const) expect(plotOf(Co.plotsFor(t)[0])!.zone).toBe("town");
    // whole blocks are large, and mega in the last districts
    expect(WORLD_MAP.plots.filter((p) => p.big).every((p) => p.size === "large" || p.size === "mega")).toBe(true);
    expect(WORLD_MAP.plots.some((p) => p.size === "mega")).toBe(true);
  });

  it("goes locked → available → owned → construction → operational", () => {
    const s = createInitialState(T0);
    s.cash = 1e6;
    expect(Co.plotStatus(s, STARTER_PLOT)).toBe("operational");
    expect(Co.plotStatus(s, ENGINE)).toBe("locked"); // 12 bodies first
    expect(Co.landLock(s, ENGINE)).toEqual({ kind: "chain", lock: { kind: "made", item: "body", n: 12, have: 0 } });
    const far = Co.plotsFor("glassFactory")[0];
    expect(Co.landLock(s, far)).toEqual({ kind: "zone", zone: plotOf(far)!.zone });
    s.lifetime.parts.body = 12;
    expect(Co.plotStatus(s, ENGINE)).toBe("available");
    const land = Co.landCost(s, ENGINE);
    const cash = s.cash;
    expect(Co.buyLand(s, ENGINE)).toBe(true);
    expect(s.cash).toBeCloseTo(cash - land);
    expect(Co.plotStatus(s, ENGINE)).toBe("owned");
    expect(Co.buyLand(s, ENGINE)).toBe(false);
    expect(Co.startConstruction(s, ENGINE)).toBe(true);
    expect(Co.plotStatus(s, ENGINE)).toBe("construction");
    Co.constructionTick(s, 1e9);
    expect(Co.plotStatus(s, ENGINE)).toBe("operational");
  });

  it("only the building a plot is zoned for goes up on it", () => {
    const s = ready();
    expect(C.buildStructure(s, ENGINE, "tireFactory")).toBe(false);
    expect(C.buildStructure(s, ENGINE, "garage")).toBe(false);
    expect(C.buildStructure(s, Co.plotsFor("garage")[0], "engineFactory")).toBe(false);
    expect(C.buildStructure(s, ENGINE, "engineFactory")).toBe(true);
    expect(Co.freePlotFor(s, "engineFactory")).not.toBe(ENGINE);
  });

  it("land and construction are paid separately and add up to the building's price", () => {
    const s = ready();
    const price = C.structureCost(s, ENGINE, "engineFactory");
    expect(Co.landCost(s, ENGINE)).toBeGreaterThan(0);
    expect(Co.constructionCost(s, ENGINE)).toBeGreaterThan(Co.landCost(s, ENGINE));
    expect(Co.landCost(s, ENGINE) + Co.constructionCost(s, ENGINE)).toBeLessThanOrEqual(price);
    // not enough for both: nothing is bought
    s.cash = Co.landCost(s, ENGINE) + 1;
    expect(Co.buyAndBuild(s, ENGINE)).toBe(false);
    expect(Co.ownsLand(s, ENGINE)).toBe(false);
  });
});

describe("construction", () => {
  it("takes time; the building appears only when it is finished, with a notice", () => {
    const s = ready();
    expect(C.buildStructure(s, ENGINE, "engineFactory")).toBe(true);
    const site = s.city.sites[ENGINE];
    expect(site.dur).toBeGreaterThanOrEqual(BUILD_TIME.min);
    expect(s.city.buildings[ENGINE]).toBeUndefined();
    expect(Ch.hasPlant(s, "engineFactory")).toBe(false);
    const events: GameEvent[] = [];
    for (let t = 0; t < site.dur / 2; t += 1) events.push(...tick(s, 1));
    expect(Co.progressOf(s, ENGINE)).toBeCloseTo(0.5, 1);
    expect(Co.phaseOf(0.5)).toBe("walls");
    expect(s.city.buildings[ENGINE]).toBeUndefined();
    for (let t = 0; t < site.dur; t += 1) events.push(...tick(s, 1));
    expect(s.city.buildings[ENGINE].type).toBe("engineFactory");
    expect(s.city.sites[ENGINE]).toBeUndefined();
    expect(events.filter((e) => e.type === "built")).toEqual([{ type: "built", plot: ENGINE, structure: "engineFactory", level: 1, upgrade: false }]);
  });

  it("bigger and dearer buildings take longer, up to the cap", () => {
    expect(Co.buildTime(6_000, "small")).toBe(BUILD_TIME.min);
    expect(Co.buildTime(1e6, "medium")).toBeGreaterThan(Co.buildTime(1e5, "medium"));
    expect(Co.buildTime(1e6, "mega")).toBeGreaterThan(Co.buildTime(1e6, "large"));
    expect(Co.buildTime(1e15, "mega")).toBe(BUILD_TIME.max);
  });

  it("carries on offline and reports what was finished", () => {
    const s = ready();
    expect(C.buildStructure(s, ENGINE, "engineFactory")).toBe(true);
    const dur = s.city.sites[ENGINE].dur;
    const report = computeOffline(s, T0 + (dur + 60) * 1000);
    expect(report.built).toEqual([ENGINE]);
    expect(s.city.buildings[ENGINE].type).toBe("engineFactory");
  });

  it("can be finished early for money, never for free", () => {
    const s = ready();
    expect(C.buildStructure(s, ENGINE, "engineFactory")).toBe(true);
    const cost = Co.speedUpCost(s, ENGINE)!;
    expect(cost).toBeGreaterThan(0);
    tick(s, s.city.sites[ENGINE].dur / 2);
    expect(Co.speedUpCost(s, ENGINE)!).toBeLessThan(cost);
    s.cash = 0;
    expect(Co.speedUp(s, ENGINE)).toBe(false);
    s.cash = 1e6;
    expect(Co.speedUp(s, ENGINE)).toBe(true);
    tick(s, 0.1);
    expect(s.city.buildings[ENGINE]).toBeDefined();
  });
});

describe("upgrades are built too", () => {
  it("a new level goes up while the plant keeps working at its level", () => {
    const s = ready();
    const gm = snapshot(s).gm;
    expect(Ch.upgradePlantLevel(s, STARTER_PLOT, gm)).toBe(true);
    const b = s.city.buildings[STARTER_PLOT];
    expect(b.level).toBe(1);
    expect(b.works?.to).toBe(2);
    // one job at a time
    expect(Ch.levelCost(b, gm)).toBeNull();
    expect(Ch.upgradePlantLevel(s, STARTER_PLOT, gm)).toBe(false);
    expect(snapshot(s).chain.plants[STARTER_PLOT].lines).toBe(1);
    const events = tick(s, b.works!.dur + 1);
    expect(b.level).toBe(2);
    expect(b.works).toBeUndefined();
    expect(events).toContainEqual({ type: "built", plot: STARTER_PLOT, structure: "bodyWorks", level: 2, upgrade: true });
  });
});

describe("saves", () => {
  it("keep land, sites and works; old saves own the land they built on", () => {
    const s = ready();
    expect(C.buildStructure(s, ENGINE, "engineFactory")).toBe(true);
    Ch.upgradePlantLevel(s, STARTER_PLOT, snapshot(s).gm);
    tick(s, 10);
    const back = decodeSave(encodeSave(s), T0);
    expect(back.city.sites).toEqual(s.city.sites);
    expect(back.city.land.sort()).toEqual(s.city.land.sort());
    expect(back.city.buildings[STARTER_PLOT].works).toEqual(s.city.buildings[STARTER_PLOT].works);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.city.land;
    delete raw.city.sites;
    const old = migrate(raw, T0);
    expect(old.city.land).toEqual([STARTER_PLOT]);
    expect(old.city.sites).toEqual({});
  });
});
