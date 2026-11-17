import { describe, expect, it } from "vitest";
import { WORLD_MAP } from "@/game/city/layout";
import { CLIP, clipMime, clipSize, empireCenter } from "./world/engine-clip";

describe("empire clip", () => {
  it("records mp4 when the phone can, else webm, else nothing", () => {
    expect(clipMime((t) => t.startsWith("video/"))).toBe("video/mp4;codecs=avc1");
    expect(clipMime((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp9");
    expect(clipMime(() => false)).toBeNull();
  });

  it("is vertical on a phone held upright (16:9 at most) and 16:9 on a wide screen", () => {
    expect(clipSize(1080, 2400)).toEqual({ w: 720, h: CLIP.long });
    expect(clipSize(1080, 1350).h).toBe(CLIP.long);
    expect(clipSize(1080, 1350).w % 2).toBe(0);
    expect(clipSize(1920, 1080)).toEqual({ w: CLIP.long, h: 720 });
  });

  it("centres on the company's lots", () => {
    const ids = Object.keys(WORLD_MAP.plotById).slice(0, 3);
    const c = empireCenter(ids)!;
    const ps = ids.map((id) => WORLD_MAP.plotById[id]);
    expect(c.x).toBeCloseTo(ps.reduce((a, p) => a + p.x, 0) / 3);
    expect(c.spread).toBeGreaterThanOrEqual(40);
    expect(empireCenter([])).toBeNull();
    expect(empireCenter(["no-such-lot"])).toBeNull();
  });
});
