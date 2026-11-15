// Diagnostic mode: a small, hidden panel that shows how the game really runs on a phone
// (FPS now / lowest / average, frame times, the quality level in use, draw calls, memory) and
// can copy a short report. It is off by default and is not part of the save: the flag lives
// in the browser's own storage, and nothing is measured while it is off (the 3D views call
// `diagFrame` on every drawn frame, which returns at once).
//
// Turn it on by tapping the "Credits" heading in Settings seven times, or open the game with
// `?diag=1` in the address (the web build). The panel's ✕ turns it off.
//
// The 3D views register themselves once (`registerDiagSource`, with their renderer and a
// function that says which quality they run at) and call `diagFrame(source)` after each frame
// they draw. The numbers are the frames the game draws, not the screen's refresh: with the
// battery saver or low graphics the views draw 30 a second on purpose (lib/power.ts).

import { isIdle, isSaving, minFrameMs } from "./power";

// ───────────────────────────── the frame meter (pure) ─────────────────────────────

/** A pause longer than this between two frames (a hidden tab, a screen swap) is not a slow frame. */
const GAP_MS = 1500;
const DELTAS = 1024;
const STAMPS = 256;
/** A frame slower than this misses 45 FPS ("slow"); slower than the second one is a visible hitch. */
export const SLOW_MS = 1000 / 45;
export const HITCH_MS = 50;
const SERIES = 300;

export type FpsSnapshot = {
  /** Frames drawn in the last second. */
  fps: number;
  /** The lowest of the full-second readings since the last reset (0 until one second has passed). */
  min: number;
  /** All frames over the time spent drawing. */
  avg: number;
  /** FPS of the slowest 1% of frames. */
  low1: number;
  /** The last frame, the 95th percentile and the worst (ms). */
  frameMs: number;
  p95Ms: number;
  worstMs: number;
  /** Share of frames slower than 45 FPS (0–1) and the count of hitches over 50 ms. */
  slowShare: number;
  hitches: number;
  frames: number;
  /** Seconds spent drawing (pauses left out). */
  seconds: number;
};

export class FpsMeter {
  private deltas = new Float32Array(DELTAS);
  private dn = 0;
  private stamps = new Float64Array(STAMPS);
  private sn = 0;
  private last: number | null = null;
  private winStart = 0;
  private winFrames = 0;
  private total = 0;
  private activeMs = 0;
  private minFps = Infinity;
  private worst = 0;
  private slow = 0;
  private hitch = 0;
  /** One reading a second (newest last), for the report. */
  readonly series: number[] = [];

  /** A frame was drawn at `now` (ms, the browser's clock). */
  frame(now: number) {
    const prev = this.last;
    this.last = now;
    this.stamps[this.sn++ % STAMPS] = now;
    if (prev === null || now - prev > GAP_MS) {
      // the first frame, or one after a pause: nothing to measure yet
      this.winStart = now;
      this.winFrames = 0;
      return;
    }
    const d = now - prev;
    this.deltas[this.dn++ % DELTAS] = d;
    this.total++;
    this.activeMs += d;
    if (d > this.worst) this.worst = d;
    if (d > SLOW_MS) this.slow++;
    if (d > HITCH_MS) this.hitch++;
    this.winFrames++;
    const span = now - this.winStart;
    if (span >= 1000) {
      const fps = (this.winFrames * 1000) / span;
      if (fps < this.minFps) this.minFps = fps;
      this.series.push(Math.round(fps));
      if (this.series.length > SERIES) this.series.shift();
      this.winStart = now;
      this.winFrames = 0;
    }
  }

  /** A pause (idle saver, scene change): the next frame starts a new measure. */
  pause() {
    this.last = null;
  }

  reset() {
    this.dn = 0;
    this.sn = 0;
    this.last = null;
    this.winStart = 0;
    this.winFrames = 0;
    this.total = 0;
    this.activeMs = 0;
    this.minFps = Infinity;
    this.worst = 0;
    this.slow = 0;
    this.hitch = 0;
    this.series.length = 0;
  }

  /** The newest frame times, oldest first (up to `n`), for a sparkline. */
  recent(n: number): number[] {
    const count = Math.min(n, this.dn, DELTAS);
    const out: number[] = [];
    for (let i = this.dn - count; i < this.dn; i++) out.push(this.deltas[i % DELTAS]);
    return out;
  }

  snapshot(): FpsSnapshot {
    const count = Math.min(this.dn, DELTAS);
    const sorted = Array.from({ length: count }, (_, i) => this.deltas[(this.dn - count + i) % DELTAS]).sort((a, b) => a - b);
    const pct = (p: number) => (count ? sorted[Math.min(count - 1, Math.floor(count * p))] : 0);
    // frames inside the last second, from the newest stamp backwards
    let fps = 0;
    const have = Math.min(this.sn, STAMPS);
    if (have > 1) {
      const newest = this.stamps[(this.sn - 1) % STAMPS];
      let n = 1;
      let oldest = newest;
      for (let i = 2; i <= have; i++) {
        const t = this.stamps[(this.sn - i) % STAMPS];
        if (newest - t > 1000) break;
        n++;
        oldest = t;
      }
      // frames drawn after a long pause do not make a rate
      if (n > 1 && newest > oldest) fps = ((n - 1) * 1000) / (newest - oldest);
    }
    const p99 = pct(0.99);
    return {
      fps,
      min: Number.isFinite(this.minFps) ? this.minFps : 0,
      avg: this.activeMs > 0 ? (this.total * 1000) / this.activeMs : 0,
      low1: p99 > 0 ? 1000 / p99 : 0,
      frameMs: count ? this.deltas[(this.dn - 1) % DELTAS] : 0,
      p95Ms: pct(0.95),
      worstMs: this.worst,
      slowShare: this.total ? this.slow / this.total : 0,
      hitches: this.hitch,
      frames: this.total,
      seconds: this.activeMs / 1000,
    };
  }
}

export type Verdict = "none" | "ok" | "warn" | "bad";

/**
 * Whether the run reaches its target: 60 FPS (or the screen's refresh when that is lower, or the
 * cap that low graphics / the battery saver puts on purpose). `none` until two seconds were measured.
 */
export function verdict(s: FpsSnapshot, capFps: number | null, displayHz: number): Verdict {
  if (s.seconds < 2 || s.frames < 30) return "none";
  const target = Math.min(60, capFps ?? 60, displayHz > 0 ? displayHz : 60);
  if (s.avg >= target * 0.92 && s.low1 >= target * 0.6) return "ok";
  if (s.avg < target * 0.75) return "bad";
  return "warn";
}

/** The screen's refresh rate from the time between two animation frames (ms), snapped to the usual rates. */
export function snapHz(frameMs: number): number {
  if (!(frameMs > 0)) return 0;
  const hz = 1000 / frameMs;
  const usual = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  let best = usual[0];
  for (const u of usual) if (Math.abs(u - hz) < Math.abs(best - hz)) best = u;
  return Math.abs(best - hz) / best < 0.08 ? best : Math.round(hz);
}

// ───────────────────────────── the sources (the 3D views) ─────────────────────────────

/** What of a three.js renderer is read (a structural type: this file does not import three). */
export type RendererLike = {
  info: {
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs?: readonly unknown[] | null;
  };
  domElement?: { width: number; height: number };
  getContext?: () => unknown;
};

export type Quality = {
  /** The level in use, as the view names it ("high", "low", "saver"…). */
  label: string;
  /** Render resolution (pixels per CSS pixel) and whether shadows are drawn. */
  dpr?: number;
  shadows?: boolean;
  /** Anything else worth reading in a report. */
  notes?: Record<string, string | number | boolean>;
};

type Source = {
  /** Absent for the 2D views (the factory floors): they report frames only. */
  renderer?: RendererLike;
  quality: () => Quality;
  meter: FpsMeter;
  gpu: { calls: number; callsMax: number; triangles: number; geometries: number; textures: number; programs: number };
};

const sources = new Map<string, Source>();
let enabled = false;
let active: string | null = null;
let startedAt = 0;
const subs = new Set<() => void>();
const KEY = "ice-diag";

/** A 3D view registers once (when it starts); the returned function removes it (when it is destroyed). */
export function registerDiagSource(name: string, probe: { renderer?: RendererLike; quality: () => Quality }): () => void {
  const src: Source = { ...probe, meter: new FpsMeter(), gpu: { calls: 0, callsMax: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 } };
  sources.set(name, src);
  return () => {
    if (sources.get(name) === src) sources.delete(name);
    if (active === name) active = null;
  };
}

/** A frame of `name` was drawn. Free while the diagnostic mode is off. */
export function diagFrame(name: string) {
  if (!enabled) return;
  const src = sources.get(name);
  if (!src) return;
  const now = performance.now();
  active = name;
  // the saver's idle frames (a few a second, nobody touching the screen) are not a speed to judge
  if (isSaving() && isIdle(now)) {
    src.meter.pause();
    return;
  }
  src.meter.frame(now);
  if (!src.renderer) return;
  const info = src.renderer.info;
  const g = src.gpu;
  g.calls = info.render.calls;
  if (g.calls > g.callsMax) g.callsMax = g.calls;
  g.triangles = info.render.triangles;
  g.geometries = info.memory.geometries;
  g.textures = info.memory.textures;
  g.programs = info.programs?.length ?? 0;
}

// ───────────────────────────── on / off ─────────────────────────────

function notify() {
  for (const fn of subs) fn();
}

function store(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode or blocked storage: the flag lasts until the page closes */
  }
}

export const diagEnabled = () => enabled;

export function setDiagEnabled(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  if (on) {
    startedAt = performance.now();
    for (const s of sources.values()) {
      s.meter.reset();
      s.gpu.callsMax = 0;
    }
  }
  store(on);
  notify();
}

export function subscribeDiag(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Reads the stored flag and the `?diag=1` address (once, in the browser). */
export function initDiag() {
  if (typeof window === "undefined") return;
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    /* no storage */
  }
  try {
    const q = new URLSearchParams(window.location.search).get("diag");
    if (q === "1") on = true;
    else if (q === "0") on = false;
  } catch {
    /* no address to read */
  }
  if (on !== enabled) {
    enabled = on;
    if (on) startedAt = performance.now();
    store(on);
    notify();
  }
}

let taps = 0;
let tapAt = 0;
/** The hidden gesture: seven quick taps (each within 1.5 s of the last) turn the mode on or off. Returns the new state when it changed. */
export function diagTap(now = performance.now()): boolean | null {
  taps = now - tapAt > 1500 ? 1 : taps + 1;
  tapAt = now;
  if (taps < 7) return null;
  taps = 0;
  setDiagEnabled(!enabled);
  return enabled;
}

export function resetDiag() {
  startedAt = performance.now();
  for (const s of sources.values()) {
    s.meter.reset();
    s.gpu.callsMax = 0;
  }
  notify();
}

// ───────────────────────────── what the panel and the report read ─────────────────────────────

export type SourceReading = {
  name: string;
  fps: FpsSnapshot;
  quality: Quality;
  gpu: Source["gpu"];
  /** The view is a 3D one (draw calls and GPU memory mean something). */
  hasGpu: boolean;
  /** Frame-rate ceiling now (low graphics / battery saver), or null when none. */
  capFps: number | null;
  /** One reading a second, newest last. */
  series: number[];
  /** The newest frame times (ms) for the sparkline. */
  recent: number[];
};

export type MemoryReading = {
  /** JavaScript heap in use and its limit (MB), where the browser tells (Chromium, the Android web view). */
  heapMb: number | null;
  heapLimitMb: number | null;
  /** The phone's rough RAM in GB, where the browser tells. */
  deviceGb: number | null;
};

export function readMemory(): MemoryReading {
  const perf = typeof performance !== "undefined" ? (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }) : null;
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : null;
  const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
  return {
    heapMb: perf?.memory ? mb(perf.memory.usedJSHeapSize) : null,
    heapLimitMb: perf?.memory ? mb(perf.memory.jsHeapSizeLimit) : null,
    deviceGb: nav?.deviceMemory ?? null,
  };
}

/** The view drawing now (the last to draw a frame), or null when none has. */
export function activeSource(): string | null {
  return active && sources.has(active) ? active : null;
}

export function readSource(name: string, low: boolean): SourceReading | null {
  const src = sources.get(name);
  if (!src) return null;
  const gap = minFrameMs(isSaving(), false, low);
  return {
    name,
    fps: src.meter.snapshot(),
    quality: src.quality(),
    gpu: { ...src.gpu },
    hasGpu: !!src.renderer,
    capFps: gap > 0 ? Math.round(1000 / gap) : null,
    series: [...src.meter.series],
    recent: src.meter.recent(120),
  };
}

export function sourceNames(): string[] {
  return [...sources.keys()];
}

export type Report = ReturnType<typeof buildReport>;

/** The short report the panel copies: the device, the settings, and each view's numbers. No account or save data. */
export function buildReport(ctx: { appVersion: string; lowGraphics: boolean; /** The device's graphics profile (lib/graphics-profile.ts). */ profile?: string; saver: string; displayHz: number }) {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const first = [...sources.values()].find((s) => s.renderer);
  let gl: { vendor: string | null; renderer: string | null } = { vendor: null, renderer: null };
  try {
    const c = first?.renderer?.getContext?.() as WebGLRenderingContext | undefined;
    const ext = c?.getExtension("WEBGL_debug_renderer_info");
    if (c && ext) gl = { vendor: String(c.getParameter(ext.UNMASKED_VENDOR_WEBGL)), renderer: String(c.getParameter(ext.UNMASKED_RENDERER_WEBGL)) };
  } catch {
    /* the browser hides it */
  }
  return {
    kind: "idle-car-empire-diagnostics",
    at: new Date().toISOString(),
    app: ctx.appVersion || "dev",
    measuredSeconds: Math.round((performance.now() - startedAt) / 100) / 10,
    device: {
      userAgent: nav?.userAgent ?? "",
      cores: nav?.hardwareConcurrency ?? null,
      ...readMemory(),
      screen: typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : null,
      window: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : null,
      displayHz: ctx.displayHz || null,
      gpu: gl,
    },
    settings: { lowGraphics: ctx.lowGraphics, ...(ctx.profile ? { graphicsProfile: ctx.profile } : {}), saver: ctx.saver, saverActive: isSaving() },
    views: sourceNames()
      .map((n) => readSource(n, ctx.lowGraphics))
      .filter((r): r is SourceReading => !!r && r.fps.frames > 0)
      .map((r) => ({
        view: r.name,
        quality: r.quality,
        capFps: r.capFps,
        fps: roundAll(r.fps),
        gpu: r.hasGpu ? r.gpu : null,
        verdict: verdict(r.fps, r.capFps, ctx.displayHz),
        fpsPerSecond: r.series,
      })),
  };
}

function roundAll<T extends Record<string, number>>(o: T): T {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) out[k] = Math.round(v * 100) / 100;
  return out as T;
}

// initialised at load in the browser, so the 3D views' first frames are already counted
initDiag();
