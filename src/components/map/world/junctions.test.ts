import { describe, expect, it } from "vitest";
import { worldOf } from "@/game/city/layout";
import { aroundRings, rectDistance, ringPath, roundabouts } from "./junctions";
import { clearance } from "./traffic";

describe("roundabouts", () => {
  for (const id of ["home", "north"] as const) {
    const world = worldOf(id);
    const rings = roundabouts(world);

    it(`turns many of ${id}'s junctions into roundabouts, with room round each`, () => {
      expect(rings.size).toBeGreaterThan(10);
      const list = [...rings.values()];
      for (const rb of list) {
        // only where three roads meet or more, off the old roundabout's ring
        const roads = world.roads.filter((r) => r.a === rb.node || r.b === rb.node);
        expect(roads.length).toBeGreaterThanOrEqual(3);
        expect(roads.some((r) => r.oneway)).toBe(false);
        // no lot on the ring's asphalt
        for (const p of world.plots) expect(rectDistance(rb.x, rb.z, { x: p.x, z: p.y, w: p.w, d: p.d, rot: p.rot })).toBeGreaterThan(rb.outer);
        // and never two rings run together
        for (const o of list) if (o !== rb) expect(Math.hypot(o.x - rb.x, o.z - rb.z)).toBeGreaterThan(2 * rb.outer + 1);
      }
    });
  }

  const rb = { node: 0, x: 0, z: 0, lane: 1, outer: 1.36, island: 0.64 };

  it("drives round anticlockwise on screen, keeping the island on the left", () => {
    // in from the south (z grows southward, the right-hand lane is east of the centre), left turn out to the west:
    // the long way round, anticlockwise
    const pts = ringPath(rb, [0.25, 1.6], [-1.6, -0.25]);
    const ring = pts.slice(1, -1);
    for (const [x, z] of ring) expect(Math.hypot(x, z)).toBeCloseTo(1, 5);
    for (let i = 1; i < ring.length; i++) {
      const [ax, az] = ring[i - 1];
      const [bx, bz] = ring[i];
      // (position × heading) < 0: anticlockwise as seen from above with z pointing down the screen
      expect(ax * (bz - az) - az * (bx - ax)).toBeLessThan(0);
    }
    // a right turn is the short way: under half the ring
    const right = ringPath(rb, [0.25, 1.6], [1.6, 0.25]);
    expect(right.length).toBeLessThan(pts.length);
  });

  it("sends a route through a ring round its island", () => {
    const line: [number, number, number][] = [];
    for (let x = -4; x <= 4; x += 0.5) line.push([x, 0, 0.25]);
    const out = aroundRings(line, [rb], () => 0);
    expect(out[0]).toEqual(line[0]);
    expect(out[out.length - 1]).toEqual(line[line.length - 1]);
    for (const p of out) expect(Math.hypot(p[0], p[2])).toBeGreaterThan(rb.island);
  });
});

describe("keeping distance", () => {
  const car = (x: number, z: number, yaw: number) => ({ x, z, yaw, half: 0.28 });
  /** Straight on along +x from the origin. */
  const straight = (d: number): [number, number] => [d, 0];

  it("stops behind the car in front and keeps its pace on a free road", () => {
    const me = car(0, 0, 0);
    expect(clearance(me, [me], straight)).toBe(1);
    expect(clearance(me, [me, car(0.6, 0, 0)], straight)).toBe(0);
    const k = clearance(me, [me, car(1.3, 0, 0)], straight);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
    // behind it: no matter
    expect(clearance(me, [car(-0.7, 0, 0)], straight)).toBe(1);
  });

  it("passes oncoming cars and cars waiting beside its way, but waits for one crossing it", () => {
    const me = car(0, 0, 0);
    // the other lane is about half a unit off
    expect(clearance(me, [car(0.7, -0.52, Math.PI)], straight)).toBe(1);
    expect(clearance(me, [car(0.7, 0.55, Math.PI / 2)], straight)).toBe(1);
    expect(clearance(me, [car(0.5, 0, Math.PI / 2)], straight)).toBe(0);
    // after standing a while it edges through the junction
    expect(clearance(me, [car(0.5, 0, Math.PI / 2)], straight, 3)).toBe(1);
  });

  it("looks round the bend it is taking, not straight on", () => {
    const me = car(0, 0, 0);
    // a right turn (south, +z): a car straight ahead of its nose but off its curve is no obstacle
    const bend = (d: number): [number, number] => (d < 0.4 ? [d, 0] : [0.4, d - 0.4]);
    expect(clearance(me, [car(1.0, 0, Math.PI)], bend)).toBe(1);
    expect(clearance(me, [car(0.4, 0.5, Math.PI / 2)], bend)).toBeLessThan(0.3);
  });
});
