import { describe, expect, it } from "vitest";
import { minFrameMs, minTickMs, POWER, saverActive } from "./power";
import { createInitialState } from "@/game/engine/state";
import { migrate } from "@/game/save/serialize";

describe("battery saver", () => {
  it("auto turns on only when the battery is low and not charging", () => {
    expect(saverActive("auto", null)).toBe(false);
    expect(saverActive("auto", { level: 0.8, charging: false })).toBe(false);
    expect(saverActive("auto", { level: POWER.lowBattery, charging: false })).toBe(true);
    expect(saverActive("auto", { level: 0.05, charging: true })).toBe(false);
  });

  it("on and off ignore the battery", () => {
    expect(saverActive("on", null)).toBe(true);
    expect(saverActive("on", { level: 1, charging: true })).toBe(true);
    expect(saverActive("off", { level: 0.01, charging: false })).toBe(false);
  });

  it("draws less often while saving, and least while nobody touches the screen", () => {
    expect(minFrameMs(false, false, false)).toBe(0);
    expect(minFrameMs(false, true, false)).toBe(0);
    expect(minFrameMs(false, false, true)).toBe(POWER.frameLow);
    const playing = minFrameMs(true, false, false);
    const idle = minFrameMs(true, true, false);
    expect(playing).toBeGreaterThan(0);
    expect(idle).toBeGreaterThan(playing);
    // low graphics doesn't make the saver draw more
    expect(minFrameMs(true, false, true)).toBe(playing);
  });

  it("ticks less often while saving, never slower than once a second", () => {
    expect(minTickMs(false, true)).toBe(POWER.tick);
    expect(minTickMs(true, false)).toBeGreaterThan(POWER.tick);
    expect(minTickMs(true, true)).toBeGreaterThan(minTickMs(true, false));
    expect(minTickMs(true, true)).toBeLessThanOrEqual(1000);
  });

  it("the setting survives a save, and a broken one falls back to auto", () => {
    const s = createInitialState(1_000);
    expect(s.settings.saver).toBe("auto");
    s.settings.saver = "on";
    const raw = JSON.parse(JSON.stringify(s));
    expect(migrate(raw, 2_000).settings.saver).toBe("on");
    raw.settings.saver = "turbo";
    expect(migrate(raw, 2_000).settings.saver).toBe("auto");
    delete raw.settings.saver;
    expect(migrate(raw, 2_000).settings.saver).toBe("auto");
  });
});
