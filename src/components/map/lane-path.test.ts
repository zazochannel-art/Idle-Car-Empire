import { describe, expect, it } from "vitest";
import { DRIVE_LANE, LanePath } from "./lane-path";

// node centres sit at 7k + 0.5
const n = (i: number, j: number) => ({ x: i * 7 + 0.5, y: j * 7 + 0.5 });

/** Walks the curve in small steps: no jumps in position or heading. */
function smooth(lp: LanePath) {
  const step = 0.01;
  let prev = lp.at(0);
  let maxJump = 0;
  let maxTurn = 0;
  for (let s = step; s <= lp.length; s += step) {
    const q = lp.at(s);
    maxJump = Math.max(maxJump, Math.hypot(q.x - prev.x, q.y - prev.y));
    maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(q.yaw - prev.yaw), Math.cos(q.yaw - prev.yaw))));
    prev = q;
  }
  return { maxJump, maxTurn };
}

describe("lane paths", () => {
  it("rounds a right and a left turn without jumps", () => {
    for (const path of [
      [n(0, 0), n(1, 0), n(1, 1)], // right (toward +y while heading +x)
      [n(0, 1), n(1, 1), n(1, 0)], // left
      [n(0, 0), n(1, 0), n(1, 1), n(0, 1)], // two turns
    ]) {
      const lp = new LanePath(path);
      const { maxJump, maxTurn } = smooth(lp);
      expect(maxJump).toBeLessThan(0.0101);
      // at most ~0.01 / 0.28 rad per step on the tightest bend
      expect(maxTurn).toBeLessThan(0.05);
      expect(lp.knots).toHaveLength(path.length);
    }
  });

  it("keeps right: tight inside the right turn, wide on the left", () => {
    const right = new LanePath([n(0, 0), n(1, 0), n(1, 1)]);
    const left = new LanePath([n(0, 1), n(1, 1), n(1, 0)]);
    // both 14 tiles of road; the left turn crosses the junction so it is longer
    expect(left.length).toBeGreaterThan(right.length);
    // driving +x the lane is on the +y side of the centre line
    expect(right.at(1).y).toBeCloseTo(0.7, 5);
  });

  it("drives into a driveway in its own lane (in and out keep right) and turns smoothly", () => {
    const e = { x: 3.5 + 2, y: 7.5 };
    const lp = new LanePath([n(0, 1), e, { x: e.x, y: e.y + 1.25 }]);
    const end = lp.at(lp.length);
    // heading +y into the lot, keep right = toward −x
    expect(end.x).toBeCloseTo(e.x - DRIVE_LANE, 5);
    expect(smooth(lp).maxJump).toBeLessThan(0.0101);
  });

  it("handles a U-turn", () => {
    const lp = new LanePath([n(0, 0), n(1, 0), n(0, 0)]);
    const { maxJump } = smooth(lp);
    expect(maxJump).toBeLessThan(0.0101);
    expect(lp.at(lp.length).y).toBeCloseTo(0.3, 5);
  });

  it("swings the body through a bend (heading from axle to axle)", () => {
    const lp = new LanePath([n(0, 0), n(1, 0), n(1, 1)]);
    const mid = lp.knots[1];
    const pose = lp.pose(mid, 0.3);
    expect(pose.yaw).toBeGreaterThan(0.3);
    expect(pose.yaw).toBeLessThan(Math.PI / 2 - 0.3);
  });
});
