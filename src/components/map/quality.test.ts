import { describe, expect, it } from "vitest";
import { GOVERNOR, GRAPHICS_PROFILES, Governor, ResolutionWatch, TIERS, dprSteps, ladder, profileLadder } from "./quality";

/** Feeds frames of `ms` each from `t0` for `seconds`; returns the levels it moved to, with the time. */
function run(g: Governor, ms: number, seconds: number, t0: number): { moves: [number, number][]; end: number } {
  const moves: [number, number][] = [];
  let t = t0;
  while (t < t0 + seconds * 1000) {
    t += ms;
    const r = g.frame(ms, t);
    if (r !== null) moves.push([r, t]);
  }
  return { moves, end: t };
}

describe("ladder", () => {
  it("goes from the device's resolution down to 1x, then through the tiers", () => {
    const l = ladder(3);
    expect(l.map((s) => s.dpr)).toEqual([2, 1.75, 1.5, 1.25, 1, 1, 1, 0.75, 0.5]);
    expect(l.map((s) => s.tier)).toEqual([0, 0, 0, 0, 0, 1, 2, 3, 4]);
  });
  it("has no resolution steps on a 1x screen", () => {
    expect(ladder(1).map((s) => s.tier)).toEqual([0, 1, 2, 3, 4]);
    expect(ladder(1.5).map((s) => s.dpr)).toEqual([1.5, 1.25, 1, 1, 1, 0.75, 0.5]);
  });
  it("never lets a tier ask for more than the one before", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].traffic).toBeLessThanOrEqual(TIERS[i - 1].traffic);
      expect(TIERS[i].crowd).toBeLessThanOrEqual(TIERS[i - 1].crowd);
      expect(TIERS[i].farShare).toBeLessThanOrEqual(TIERS[i - 1].farShare);
      expect(TIERS[i].detailRange).toBeLessThanOrEqual(TIERS[i - 1].detailRange);
      expect(TIERS[i].minDpr).toBeLessThanOrEqual(TIERS[i - 1].minDpr);
      expect(TIERS[i].shadowEvery === 0 || TIERS[i - 1].shadowEvery !== 0).toBe(true);
    }
  });
});

describe("Governor", () => {
  it("stays put at 60 FPS and at 57 FPS (between the thresholds)", () => {
    const g = new Governor(8);
    expect(run(g, 16.7, 60, 0).moves).toEqual([]);
    expect(run(g, 17.5, 60, 100_000).moves).toEqual([]);
    expect(g.level).toBe(0);
  });

  it("steps down after two slow windows, not one", () => {
    const g = new Governor(8);
    const { moves } = run(g, 33, 20, 0);
    expect(moves.length).toBeGreaterThan(0);
    // two windows of 2 s each after the settling frames: not before about 4 s
    expect(moves[0][1]).toBeGreaterThan(4000);
    expect(moves[0][0]).toBe(1);
  });

  it("a short hitch among fast frames changes nothing", () => {
    const g = new Governor(8);
    let t = 0;
    for (let i = 0; i < 4; i++) {
      t = run(g, 16.7, 6, t).end;
      t = run(g, 100, 0.3, t).end; // a hitch
    }
    expect(g.level).toBe(0);
  });

  it("keeps stepping down while frames stay slow, and stops at the last step", () => {
    const g = new Governor(4);
    run(g, 40, 120, 0);
    expect(g.level).toBe(3);
  });

  it("climbs back only after a long steady stretch", () => {
    const g = new Governor(8, 3);
    const first = run(g, 16.7, 10, 0);
    expect(first.moves).toEqual([]); // not before the wait
    const next = run(g, 16.7, 60, first.end);
    expect(next.moves[0][0]).toBe(2);
    expect(next.moves[0][1] - 0).toBeGreaterThanOrEqual(GOVERNOR.wait);
  });

  it("waits twice as long after a climb that was undone at once", () => {
    const g = new Governor(8, 3);
    let t = run(g, 16.7, 20, 0).end; // climbs to 2
    expect(g.level).toBe(2);
    const climbed = t;
    // slow again right away: back to 3
    const down = run(g, 40, 5, t);
    expect(down.moves.map((m) => m[0])).toEqual([3]);
    t = down.end;
    // fast again: it must wait the doubled time since the step down
    const back = run(g, 16.7, 120, t);
    const up = back.moves.filter((m) => m[0] < 3);
    expect(up.length).toBeGreaterThan(0);
    const since = up[0][1] - down.moves[0][1];
    expect(since).toBeGreaterThanOrEqual(GOVERNOR.wait * 2);
    expect(climbed).toBeGreaterThan(0);
  });

  it("ignores the frames right after a change (shaders being built)", () => {
    const g = new Governor(8);
    // 20 slow frames of a stall (a second), then fast frames: no move
    let t = 0;
    for (let i = 0; i < GOVERNOR.settle; i++) g.frame(50, (t += 50));
    expect(run(g, 16.7, 30, t).moves).toEqual([]);
  });

  it("reacts within seconds on a device that draws 2 frames a second", () => {
    const g = new Governor(8);
    const { moves } = run(g, 500, 30, 0);
    expect(moves[0][1]).toBeLessThan(10_000);
  });

  it("clamps the starting level", () => {
    expect(new Governor(4, 9).level).toBe(3);
    expect(new Governor(4, -2).level).toBe(0);
  });
});

describe("dprSteps and ResolutionWatch", () => {
  it("goes from the device's resolution (at most 2x) down to the floor", () => {
    expect(dprSteps(3)).toEqual([2, 1.75, 1.5, 1.25, 1, 0.75, 0.6]);
    expect(dprSteps(1)).toEqual([1, 0.75, 0.6]);
    expect(dprSteps(1.5, 2, 0.5)).toEqual([1.5, 1.25, 1, 0.75, 0.5]);
  });
  it("gives a lower resolution when frames stay slow, and none when they are fine", () => {
    const w = new ResolutionWatch(2, 0);
    let t = 0;
    let changed: number | null = null;
    for (let i = 0; i < 400 && changed === null; i++) changed = w.frame(16.7, (t += 16.7));
    expect(changed).toBeNull();
    for (let i = 0; i < 400 && changed === null; i++) changed = w.frame(40, (t += 40));
    expect(changed).toBe(1.75);
    expect(w.dpr).toBe(1.75);
  });
});

describe("profileLadder", () => {
  it("high is what the game always did", () => {
    expect(profileLadder("high", 3)).toEqual(ladder(3));
    expect(profileLadder("high", 3, true)).toEqual(ladder(3, 1.5));
  });
  it("low is the 1x ladder, and the saver doesn't change it", () => {
    expect(profileLadder("low", 3)).toEqual(ladder(3, 1));
    expect(profileLadder("low", 3, true)).toEqual(ladder(3, 1));
  });
  it("medium never goes above 1.5x and starts at tier 1", () => {
    const l = profileLadder("medium", 3);
    expect(Math.max(...l.map((s) => s.dpr))).toBe(1.5);
    expect(l[0]).toEqual({ dpr: 1.5, tier: 1 });
    expect(l.every((s) => s.tier >= 1)).toBe(true);
    // resolution first, then the tiers below, for a slow phone to walk down
    expect(l.map((s) => [s.dpr, s.tier])).toEqual([[1.5, 1], [1.25, 1], [1, 1], [1, 2], [0.75, 3], [0.5, 4]]);
  });
  it("ultra reaches 3x where the screen has it, and no more than the screen has", () => {
    expect(profileLadder("ultra", 3)[0]).toEqual({ dpr: 3, tier: 0 });
    expect(profileLadder("ultra", 2)[0]).toEqual({ dpr: 2, tier: 0 });
    expect(profileLadder("ultra", 1)[0]).toEqual({ dpr: 1, tier: 0 });
  });
  it("every profile on every screen has a first rung and ends at the floor", () => {
    for (const p of GRAPHICS_PROFILES) for (const dpr of [1, 1.5, 2, 2.625, 3, 3.5]) for (const saving of [false, true]) {
      const l = profileLadder(p, dpr, saving);
      expect(l.length).toBeGreaterThan(0);
      expect(l.at(-1)!.tier).toBe(4);
    }
  });
});
