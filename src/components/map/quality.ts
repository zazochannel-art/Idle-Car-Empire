// The 3D map's adaptive quality: when frames stay slow the map gives up detail step by step, and
// wins it back only after a long steady stretch. Plain numbers in and out (no three.js, no DOM),
// so the rules can be tested; `world/engine.ts` applies what they say.
//
// The ladder, lightest step last:
//   · the resolution, from the device's down to 1× in quarter steps (this was all there was);
//   · tier 1: the shadows are redrawn every fourth frame, not every other, and the cars far from
//     the middle of the view are drawn as the simple shape (one draw for all of them);
//   · tier 2: the scenery (trees, rocks, lots) casts no shadows, less traffic, a thinner crowd,
//     fewer particles;
//   · tier 3: no shadows at all, a resolution below 1× and the crowd thinned further;
//   · tier 4, the floor: half the resolution, a quarter of the traffic, models only at the middle.
// The target is 60 FPS: below about 55 on average the map steps down, and it climbs back only
// after a long spell above 59 (a screen that refreshes at 60 Hz never shows more than that).
// Nothing here touches the game: the traffic and the shadows are only what is drawn.

/** What one step of the ladder asks the map for. */
export interface Tier {
  /** Redraw the shadow map every this many frames (0: never, no shadows). */
  shadowEvery: 0 | 2 | 4;
  /** The scenery's cells cast shadows. */
  sceneryShadows: boolean;
  /** Cars and trucks farther than this many times the camera distance from the middle of the view draw as the simple shape (Infinity: all as models). */
  detailRange: number;
  /** Share of the usual town traffic and crowd. */
  traffic: number;
  crowd: number;
  /** Fewer particles, no pools of light under the street lamps. */
  lean: boolean;
  /** Lowest resolution (device pixels per CSS pixel) this tier may draw at. */
  minDpr: number;
}

export const TIERS: readonly Tier[] = [
  { shadowEvery: 2, sceneryShadows: true, detailRange: Infinity, traffic: 1, crowd: 1, lean: false, minDpr: 1 },
  { shadowEvery: 4, sceneryShadows: true, detailRange: 1, traffic: 1, crowd: 1, lean: false, minDpr: 1 },
  { shadowEvery: 4, sceneryShadows: false, detailRange: 0.65, traffic: 0.7, crowd: 0.6, lean: true, minDpr: 1 },
  { shadowEvery: 0, sceneryShadows: false, detailRange: 0.4, traffic: 0.5, crowd: 0.4, lean: true, minDpr: 0.75 },
  // the floor: the lightest the map can be drawn (a vehicle keeps its model only right at the middle of the view)
  { shadowEvery: 0, sceneryShadows: false, detailRange: 0.2, traffic: 0.25, crowd: 0.2, lean: true, minDpr: 0.5 },
];

/** One rung of the ladder: the highest resolution allowed, and the tier. */
export interface Step {
  dpr: number;
  tier: number;
}

/** The ladder for a screen with this many device pixels per CSS pixel: resolution first, then the tiers. */
export function ladder(deviceDpr: number, maxDpr = 2): Step[] {
  const top = Math.max(1, Math.min(maxDpr, deviceDpr));
  const steps: Step[] = [];
  for (let d = top; d >= 1 - 1e-9; d -= 0.25) steps.push({ dpr: Math.max(1, +d.toFixed(2)), tier: 0 });
  for (let t = 1; t < TIERS.length; t++) steps.push({ dpr: TIERS[t].minDpr, tier: t });
  return steps;
}

/** How the governor judges frames. Times in ms; `slow` and `fast` are frame times. */
export const GOVERNOR = {
  /** A window of frames is judged once it spans this long. */
  window: 2000,
  /** Frames to ignore after a change (the shaders, textures and targets it needs are built then), or this long (ms) if frames are rare. */
  settle: 20,
  settleMs: 1500,
  /** Average frame time above this is slow (under about 55 FPS), below `fast` is fast (over about 59 FPS): the gap is the hysteresis. */
  slow: 1000 / 55,
  fast: 1000 / 59,
  /** Consecutive slow windows before a step down, consecutive fast ones before a step up. */
  slowWindows: 2,
  fastWindows: 7,
  /** The first wait before climbing back after a step down; it doubles each time a climb fails, up to `waitMax`. */
  wait: 15_000,
  waitMax: 480_000,
  /** A climb counts as failed when it is undone within this long. */
  failWithin: 30_000,
};

/**
 * Watches frame times and says when to go down a step of the ladder or back up. Down: two slow
 * windows in a row. Up: five fast ones in a row, a quiet spell since the last change, and no
 * recent failed climb (a climb that is undone within 30 s doubles the wait before the next one,
 * so a device that cannot hold a step is not tried on it again and again).
 */
export class Governor {
  level: number;
  private readonly top: number;
  private frames = 0;
  private time = 0;
  private skip = 0;
  private slowRun = 0;
  private fastRun = 0;
  private changedAt = -Infinity;
  private climbedAt = -Infinity;
  private wait = GOVERNOR.wait;

  constructor(steps: number, level = 0, now = 0) {
    this.top = Math.max(0, steps - 1);
    this.level = Math.max(0, Math.min(this.top, level));
    this.changedAt = now;
    this.skip = GOVERNOR.settle;
  }

  /** One drawn frame that took `dt` ms, at time `now` (ms). Returns the new level when it changed, else null. */
  frame(dt: number, now: number): number | null {
    if (this.skip > 0 && now - this.changedAt < GOVERNOR.settleMs) {
      this.skip--;
      return null;
    }
    this.skip = 0;
    this.frames++;
    this.time += dt;
    if (this.time < GOVERNOR.window) return null;
    const avg = this.time / this.frames;
    this.frames = 0;
    this.time = 0;
    if (avg > GOVERNOR.slow) {
      this.fastRun = 0;
      if (++this.slowRun >= GOVERNOR.slowWindows && this.level < this.top) return this.move(1, now);
    } else if (avg < GOVERNOR.fast) {
      this.slowRun = 0;
      if (++this.fastRun >= GOVERNOR.fastWindows && this.level > 0 && now - this.changedAt >= this.wait) return this.move(-1, now);
    } else {
      // in between: neither slow enough to give up detail nor fast enough to win it back
      this.slowRun = 0;
      this.fastRun = 0;
    }
    return null;
  }

  private move(by: 1 | -1, now: number): number {
    if (by > 0) {
      // undoing a climb that was just made: the device cannot hold the step above
      if (now - this.climbedAt < GOVERNOR.failWithin) this.wait = Math.min(GOVERNOR.waitMax, this.wait * 2);
      this.climbedAt = -Infinity; // one failed climb counts once
    } else this.climbedAt = now;
    this.level += by;
    this.changedAt = now;
    this.slowRun = 0;
    this.fastRun = 0;
    this.frames = 0;
    this.time = 0;
    this.skip = GOVERNOR.settle;
    return this.level;
  }
}
