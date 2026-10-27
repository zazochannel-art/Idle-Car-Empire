import { describe, expect, it } from "vitest";
import { TRACKS } from "../config/racing";
import { pitLane } from "@/components/racing/track-paint";
import { GRID_SPACING, TRACK_LAYOUTS, pointAt, trackOf } from "./tracks";

describe("the circuits", () => {
  for (const { id } of TRACKS) {
    const tr = trackOf(id);
    const L = TRACK_LAYOUTS[id];

    it(`${id}: the lap never comes close to itself`, () => {
      // parts of the lap far apart along it keep the asphalt, its verges and a gap between them
      const S = tr.samples;
      let min = Infinity;
      for (let i = 0; i < S.length; i += 2)
        for (let j = i + 2; j < S.length; j += 2) {
          const arc = Math.min(Math.abs(S[i].s - S[j].s), tr.length - Math.abs(S[i].s - S[j].s));
          if (arc >= 6) min = Math.min(min, Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y));
        }
      expect(min).toBeGreaterThanOrEqual(L.width + 1.5);
    });

    it(`${id}: the grid, the start and the pit lane are on the main straight`, () => {
      const pl = pitLane(tr);
      for (let s = pl.s0; s <= pl.s1; s += 0.1) expect(Math.abs(pointAt(tr, s).k), `pit lane at ${s.toFixed(1)}`).toBeLessThan(0.06);
      for (let s = tr.startS - 8 * GRID_SPACING; s <= tr.startS; s += 0.1) expect(Math.abs(pointAt(tr, s).k), `grid at ${s.toFixed(1)}`).toBeLessThan(0.12);
    });

    it(`${id}: the lap stays inside its frame`, () => {
      for (const s of tr.samples) {
        expect(s.x).toBeGreaterThan(1);
        expect(s.y).toBeGreaterThan(1);
        expect(s.x).toBeLessThan(L.w - 1);
        expect(s.y).toBeLessThan(L.d - 1);
      }
    });
  }
});
