import { describe, expect, it } from "vitest";
import { PLANTS } from "@/game/config/chain";
import { HALL_LEVELS, interiorLayout, lineStops, RECIPES } from "./layout";

describe("factory interior layout", () => {
  it("grows with the plant: more halls, stations and a conveyor", () => {
    const l1 = interiorLayout({ level: 1, automation: 0, manager: false });
    expect(l1.lines).toHaveLength(1);
    expect(l1.locked).toHaveLength(HALL_LEVELS.length - 1);
    expect(l1.lines[0].conveyor).toBe(false);
    // a small plant: storage, a cutter, a welding bench and the finished store
    expect(lineStops(l1.lines[0]).map((s) => s.def.id)).toEqual(["rawStore", "cutting", "welding", "finished"]);

    const l5 = interiorLayout({ level: 5, automation: 0, manager: false });
    expect(l5.lines).toHaveLength(2);
    expect(l5.lines[0].conveyor).toBe(true);
    expect(lineStops(l5.lines[0])).toHaveLength(7);

    const l13 = interiorLayout({ level: 13, automation: 0, manager: false });
    expect(l13.lines).toHaveLength(4);
    expect(l13.locked).toHaveLength(0);
    expect(l13.crane).toBe(true);
  });

  it("automation swaps people for robots, station by station", () => {
    const people = (a: number) => interiorLayout({ level: 6, automation: a, manager: false }).people.filter((h) => h.station).length;
    const robots = (a: number) => interiorLayout({ level: 6, automation: a, manager: false }).robots.length;
    expect(robots(0)).toBe(0);
    expect(robots(1)).toBeGreaterThan(0);
    expect(robots(4)).toBeGreaterThan(robots(1));
    expect(people(4)).toBeLessThan(people(0));
    // robot carts replace the forklift drivers from automation 3
    expect(interiorLayout({ level: 6, automation: 3, manager: false }).aisle.agv).toBe(true);
    expect(interiorLayout({ level: 6, automation: 2, manager: false }).people.some((h) => h.role === "driver")).toBe(true);
  });

  it("shows the plant's manager", () => {
    expect(interiorLayout({ level: 3, automation: 0, manager: true }).people.some((h) => h.role === "manager")).toBe(true);
    expect(interiorLayout({ level: 3, automation: 0, manager: false }).people.some((h) => h.role === "manager")).toBe(false);
  });

  it("every plant has its own line of seven bays", () => {
    for (const p of PLANTS) {
      const r = RECIPES[p.id];
      expect(r, p.id).toBeDefined();
      expect(r).toHaveLength(7);
      expect(new Set(r.map((d) => d.id)).size).toBe(7);
      // a store at each end, quality control before the finished goods
      expect(r[0].upgrade).toBe("level");
      expect(r[6].upgrade).toBe("level");
      expect(r[5].id).toBe("qc");
      // bays line up left to right without overlapping
      for (let i = 1; i < 7; i++) expect(r[i].x).toBeGreaterThanOrEqual(r[i - 1].x + r[i - 1].w);
      const big = interiorLayout({ level: 13, automation: 4, manager: true }, r);
      expect(big.lines).toHaveLength(4);
      expect(big.robots.length).toBeGreaterThan(0);
      const small = interiorLayout({ level: 1, automation: 0, manager: false }, r);
      expect(lineStops(small.lines[0]).length).toBeGreaterThanOrEqual(4);
      expect(small.people.some((h) => h.station)).toBe(true);
    }
  });

  it("the assembly plant builds the car up stage by stage", () => {
    const stages = RECIPES.assemblyPlant.map((d) => d.stage ?? -1);
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1]);
    expect(stages[0]).toBe(0);
    expect(stages[6]).toBe(8);
  });
  it("the Body Works shop floor builds and staffs its machines in line order", () => {
    const at = (machines: number, workers: number) => interiorLayout({ level: 6, automation: 0, manager: false, floor: { machines, workers } }).lines[0];
    // one machine: only the cutter stands, every other bay is waiting to be built
    expect(lineStops(at(1, 1)).map((s) => s.def.id)).toEqual(["rawStore", "cutting", "finished"]);
    const l = at(3, 2);
    expect(lineStops(l).map((s) => s.def.id)).toEqual(["rawStore", "cutting", "press", "welding", "finished"]);
    expect(l.stations.filter((s) => s.slot !== undefined).map((s) => s.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(l.stations.map((s) => s.staffed)).toEqual([true, true, true, false, false, false, true]);
    // nobody stands at the unstaffed welder; the cutter and the press have their people
    const people = interiorLayout({ level: 6, automation: 0, manager: false, floor: { machines: 3, workers: 2 } }).people;
    expect(people.some((h) => h.station === "welding")).toBe(false);
    expect(people.some((h) => h.station === "cutting")).toBe(true);
    expect(people.some((h) => h.station === "press")).toBe(true);
    // robot cells keep their robots; only the staffed ones have an operator
    const auto = interiorLayout({ level: 6, automation: 2, manager: false, floor: { machines: 4, workers: 2 } });
    expect(auto.robots.some((r) => r.station === "welding")).toBe(true);
    expect(auto.people.some((h) => h.station === "welding")).toBe(false);
    expect(auto.people.some((h) => h.station === "press")).toBe(true);
  });
});
