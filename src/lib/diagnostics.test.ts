import { describe, expect, it } from "vitest";
import { buildReport, diagEnabled, diagFrame, diagTap, FpsMeter, readSource, registerDiagSource, setDiagEnabled, snapHz, verdict } from "./diagnostics";

/** Feeds `seconds` of frames at a steady `fps` and returns the meter. */
function steady(fps: number, seconds: number, meter = new FpsMeter(), start = 1000) {
  const step = 1000 / fps;
  for (let t = 0; t <= seconds * 1000; t += step) meter.frame(start + t);
  return meter;
}

describe("FpsMeter", () => {
  it("reads a steady 60 FPS", () => {
    const s = steady(60, 5).snapshot();
    expect(s.fps).toBeGreaterThan(59);
    expect(s.fps).toBeLessThan(61);
    expect(s.avg).toBeGreaterThan(59);
    expect(s.min).toBeGreaterThan(58);
    expect(s.low1).toBeGreaterThan(58);
    expect(s.hitches).toBe(0);
    expect(s.slowShare).toBe(0);
  });

  it("sees a slow stretch in the minimum and the 1% low, not only the average", () => {
    const m = steady(60, 4);
    // two seconds at 20 FPS, then 60 again
    steady(20, 2, m, 1000 + 4100);
    steady(60, 4, m, 1000 + 6200);
    const s = m.snapshot();
    expect(s.min).toBeLessThan(30);
    expect(s.avg).toBeGreaterThan(30);
    expect(s.avg).toBeLessThan(60);
    expect(s.slowShare).toBeGreaterThan(0.05);
    expect(s.worstMs).toBeGreaterThanOrEqual(50);
    expect(s.hitches).toBeGreaterThan(0);
  });

  it("does not count a long pause (a hidden tab) as a slow frame", () => {
    const m = steady(60, 3);
    m.frame(1000 + 3000 + 20_000);
    m.frame(1000 + 3000 + 20_016);
    const s = m.snapshot();
    expect(s.worstMs).toBeLessThan(20);
    expect(s.avg).toBeGreaterThan(58);
  });

  it("pause() starts a new measure on the next frame", () => {
    const m = steady(60, 2);
    m.pause();
    m.frame(50_000);
    expect(m.snapshot().worstMs).toBeLessThan(20);
  });

  it("keeps one reading a second for the report and forgets on reset", () => {
    const m = steady(30, 6);
    expect(m.series.length).toBeGreaterThanOrEqual(5);
    expect(m.series.every((v) => v >= 29 && v <= 31)).toBe(true);
    m.reset();
    expect(m.snapshot().frames).toBe(0);
    expect(m.series).toHaveLength(0);
  });

  it("hands out the newest frame times for the sparkline", () => {
    const m = steady(60, 3);
    const r = m.recent(10);
    expect(r).toHaveLength(10);
    expect(r[9]).toBeCloseTo(1000 / 60, 0);
  });
});

describe("verdict", () => {
  const read = (fps: number) => steady(fps, 5).snapshot();
  it("waits for a couple of seconds of frames", () => {
    expect(verdict(steady(60, 1).snapshot(), null, 60)).toBe("none");
  });
  it("is ok at 60, under at 45, bad at 30 (target 60)", () => {
    expect(verdict(read(60), null, 60)).toBe("ok");
    expect(verdict(read(50), null, 60)).toBe("warn");
    expect(verdict(read(30), null, 60)).toBe("bad");
  });
  it("judges against the cap that low graphics or the saver puts on purpose", () => {
    expect(verdict(read(30), 30, 60)).toBe("ok");
  });
  it("judges against the screen when it is slower than 60 Hz", () => {
    expect(verdict(read(30), null, 30)).toBe("ok");
  });
});

describe("snapHz", () => {
  it("snaps to the usual refresh rates", () => {
    expect(snapHz(16.7)).toBe(60);
    expect(snapHz(8.4)).toBe(120);
    expect(snapHz(11.1)).toBe(90);
    expect(snapHz(0)).toBe(0);
  });
});

describe("the diagnostic mode", () => {
  const renderer = { info: { render: { calls: 120, triangles: 45_000 }, memory: { geometries: 80, textures: 30 }, programs: [1, 2, 3] } };

  it("measures nothing while it is off", () => {
    expect(diagEnabled()).toBe(false);
    const off = registerDiagSource("t-off", { renderer, quality: () => ({ label: "x" }) });
    diagFrame("t-off");
    diagFrame("t-off");
    expect(readSource("t-off", false)?.fps.frames).toBe(0);
    off();
  });

  it("reads the renderer's counters on each drawn frame once on, and a view that leaves is forgotten", () => {
    setDiagEnabled(true);
    const off = registerDiagSource("t-on", { renderer, quality: () => ({ label: "standard", dpr: 2, shadows: true }) });
    diagFrame("t-on");
    diagFrame("t-on");
    const r = readSource("t-on", false);
    expect(r?.gpu).toMatchObject({ calls: 120, triangles: 45_000, geometries: 80, textures: 30, programs: 3 });
    expect(r?.hasGpu).toBe(true);
    expect(r?.quality.label).toBe("standard");
    off();
    expect(readSource("t-on", false)).toBeNull();
    setDiagEnabled(false);
  });

  it("a 2D view has no GPU numbers", () => {
    setDiagEnabled(true);
    const off = registerDiagSource("t-2d", { quality: () => ({ label: "standard" }) });
    diagFrame("t-2d");
    expect(readSource("t-2d", false)?.hasGpu).toBe(false);
    off();
    setDiagEnabled(false);
  });

  it("seven quick taps turn it on, and seven more off; slow taps do not count", () => {
    let t = 10_000;
    let result: boolean | null = null;
    for (let i = 0; i < 7; i++) result = diagTap((t += 300));
    expect(result).toBe(true);
    expect(diagEnabled()).toBe(true);
    for (let i = 0; i < 7; i++) result = diagTap((t += 300));
    expect(result).toBe(false);
    expect(diagEnabled()).toBe(false);
    for (let i = 0; i < 12; i++) result = diagTap((t += 2000));
    expect(result).toBeNull();
    expect(diagEnabled()).toBe(false);
  });

  it("the report holds the numbers of each view that drew, and nothing of the save", () => {
    setDiagEnabled(true);
    const off = registerDiagSource("t-report", { renderer, quality: () => ({ label: "low graphics", dpr: 1, shadows: false }) });
    const off2 = registerDiagSource("t-never-drew", { quality: () => ({ label: "standard" }) });
    for (let i = 0; i < 3; i++) diagFrame("t-report");
    const rep = buildReport({ appVersion: "1.2.3 (30)", lowGraphics: true, saver: "auto", displayHz: 60 });
    expect(rep.kind).toBe("idle-car-empire-diagnostics");
    expect(rep.app).toBe("1.2.3 (30)");
    expect(rep.settings).toMatchObject({ lowGraphics: true, saver: "auto" });
    expect(rep.views.map((v) => v.view)).toEqual(["t-report"]);
    expect(rep.views[0].quality.label).toBe("low graphics");
    expect(rep.views[0].gpu?.calls).toBe(120);
    expect(JSON.stringify(rep)).not.toMatch(/email|password|token/i);
    off();
    off2();
    setDiagEnabled(false);
  });
});
