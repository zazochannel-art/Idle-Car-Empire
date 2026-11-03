import { describe, expect, it } from "vitest";
import { worldOf } from "@/game/city/layout";
import { roundabouts } from "./junctions";
import { AMBER, ALL_RED, GREEN_MAX, GREEN_MIN, Signals, step, type Signal } from "./signals";

describe("traffic lights", () => {
  for (const id of ["home", "north"] as const) {
    const world = worldOf(id);
    const rings = roundabouts(world);
    const info = (i: number) => ({ urban: true, ring: false, decks: world.roads[i].bridges.map(([a, b]) => [a / world.roads[i].len, b / world.roads[i].len] as [number, number]) });
    const sig = new Signals(world, rings, info);
    const junctions = sig.list.filter((s) => s.node >= 0);

    it(`stand at ${id}'s plain junctions, never at a roundabout`, () => {
      expect(junctions.length).toBeGreaterThanOrEqual(1);
      for (const s of junctions) {
        expect(rings.has(s.node)).toBe(false);
        expect(s.arms.length).toBeGreaterThanOrEqual(3);
        expect(s.phases).toBeGreaterThanOrEqual(2);
        // two ways in a phase at most, and those two straight across from each other
        for (let p = 0; p < s.phases; p++) {
          const arms = s.arms.filter((a) => a.phase === p);
          expect(arms.length).toBeLessThanOrEqual(2);
          if (arms.length === 2) expect(arms[0].tx * arms[1].tx + arms[0].tz * arms[1].tz).toBeLessThan(-0.75);
        }
      }
    });

    it(`put crossings with lights along ${id}'s long streets, clear of the lots' drives and the junctions`, () => {
      expect(sig.crossings.length).toBeGreaterThan(10);
      for (const c of sig.crossings) {
        const r = world.roads[c.road];
        const s = c.f * r.len;
        expect(s).toBeGreaterThan(3);
        expect(s).toBeLessThan(r.len - 3);
        for (const p of world.plots) if (p.entry.edge === c.road) expect(Math.abs(p.entry.s - s)).toBeGreaterThan(1.2);
        for (const [a, b] of r.bridges) expect(s < a - 1.2 || s > b + 1.2).toBe(true);
      }
    });

    it(`never show ${id}'s crossing ways green together`, () => {
      for (const s of sig.list) {
        for (let k = 0; k < 400; k++) {
          s.demand.fill(true);
          step(s, 0.1);
          const green = s.arms.filter((a) => sig.show(s, a) !== "red");
          // walkers never cross a road while its cars have green or amber
          for (const a of s.arms) if (sig.walk(s, a.road)) expect(sig.show(s, a)).toBe("red");
          expect(new Set(green.map((a) => a.phase)).size).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  const make = (): Signal => ({ node: 0, x: 0, z: 0, arms: [], phases: 2, phase: 0, state: "green", t: 0, demand: [false, false], urgent: [false, false] });

  it("rests on green while nobody waits elsewhere", () => {
    const s = make();
    for (let k = 0; k < 300; k++) step(s, 0.1);
    expect(s.state).toBe("green");
    expect(s.phase).toBe(0);
  });

  it("changes after the longest green when both sides keep waiting, through amber and red", () => {
    const s = make();
    const seen: string[] = [];
    for (let t = 0; t < GREEN_MAX + AMBER + ALL_RED + 0.5; t += 0.05) {
      s.demand = [true, true];
      step(s, 0.05);
      if (seen[seen.length - 1] !== s.state) seen.push(s.state);
    }
    expect(seen).toEqual(["green", "amber", "red", "green"]);
    expect(s.phase).toBe(1);
  });

  it("lets a waiting truck through after the shortest green", () => {
    const s = make();
    let t = 0;
    while (s.state === "green" && t < 20) {
      s.demand = [true, true];
      s.urgent = [false, true];
      step(s, 0.05);
      t += 0.05;
    }
    expect(t).toBeLessThan(GREEN_MIN + 0.2);
  });
});
