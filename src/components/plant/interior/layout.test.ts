import { describe, expect, it } from "vitest";
import { HALL_LEVELS, interiorLayout, lineStops } from "./layout";

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
});
