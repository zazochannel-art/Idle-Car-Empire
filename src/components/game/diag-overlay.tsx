"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/store/game-store";
import { batteryState, isIdle, isSaving } from "@/lib/power";
import { activeSource, buildReport, readMemory, readSource, resetDiag, setDiagEnabled, snapHz, SLOW_MS, sourceNames, verdict, type SourceReading, type Verdict } from "@/lib/diagnostics";
import { cn } from "@/lib/utils";

// The diagnostic panel (lib/diagnostics.ts): FPS now / lowest / average, the quality level in
// use, draw calls and memory, and a button that copies a short report. English only: it is a
// tool for whoever tests the game on a phone, not a part of the game.

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
const TONE: Record<Verdict, string> = { none: "text-white/60", ok: "text-emerald-300", warn: "text-amber-300", bad: "text-rose-300" };
const WORDS: Record<Verdict, string> = { none: "measuring…", ok: "on target", warn: "a bit under", bad: "well under" };

const fmt = (n: number, d = 0) => (n > 0 ? n.toFixed(d) : "–");
const k = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The screen's refresh rate, from the time between animation frames (the median of the last 90). */
function useDisplayHz() {
  const [hz, setHz] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const gaps: number[] = [];
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last && now - last < 100) {
        gaps.push(now - last);
        if (gaps.length > 90) gaps.shift();
      }
      last = now;
    };
    raf = requestAnimationFrame(loop);
    const timer = setInterval(() => {
      if (gaps.length < 20) return;
      const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
      const next = snapHz(med);
      if (next !== ref.current) {
        ref.current = next;
        setHz(next);
      }
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);
  return hz;
}

function Spark({ ms }: { ms: number[] }) {
  const W = 156;
  const H = 30;
  const MAX = 50;
  const y = (v: number) => H - Math.min(1, v / MAX) * H;
  const pts = ms.map((v, i) => `${((i / Math.max(1, ms.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} className="mt-1 block rounded bg-white/5" aria-hidden>
      <line x1="0" x2={W} y1={y(1000 / 60)} y2={y(1000 / 60)} stroke="rgba(52,211,153,0.5)" strokeDasharray="2 3" />
      <line x1="0" x2={W} y1={y(SLOW_MS)} y2={y(SLOW_MS)} stroke="rgba(251,191,36,0.5)" strokeDasharray="2 3" />
      {ms.length > 1 && <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />}
    </svg>
  );
}

export default function DiagOverlay() {
  const lowGraphics = useGame((g) => g.state.settings.lowGraphics);
  const saver = useGame((g) => g.state.settings.saver);
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [, setTick] = useState(0);
  const hz = useDisplayHz();

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const name = activeSource() ?? sourceNames()[0] ?? null;
  const r: SourceReading | null = name ? readSource(name, lowGraphics) : null;
  const v: Verdict = r ? verdict(r.fps, r.capFps, hz) : "none";
  const mem = readMemory();
  const idleSaving = isSaving() && isIdle();
  const battery = batteryState();

  const makeReport = () => JSON.stringify(buildReport({ appVersion: APP_VERSION, lowGraphics, saver, displayHz: hz }), null, 1);
  const copy = async () => {
    const text = makeReport();
    try {
      await navigator.clipboard.writeText(text);
      setReport(null);
      setNote("Report copied");
    } catch {
      setReport(text);
      setNote("Select the text below and copy it");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Idle Car Empire diagnostics", text: makeReport() });
    } catch {
      /* closed without sharing */
    }
  };

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-[calc(env(safe-area-inset-left)+0.5rem)] z-[95] w-[min(19rem,calc(100vw-1rem))] font-mono text-[11px] leading-snug text-white",
        top ? "top-[calc(env(safe-area-inset-top)+0.5rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+6.5rem)]",
      )}
    >
      <div className="pointer-events-auto rounded-xl bg-black/80 p-2 ring-1 ring-white/15 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button className="flex min-w-0 flex-1 items-baseline gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Diagnostics">
            <span className={cn("text-base font-bold tabular-nums", TONE[v])}>{r ? fmt(r.fps.fps) : "–"}</span>
            <span className="text-white/50">fps</span>
            <span className="truncate text-white/70">
              min {r ? fmt(r.fps.min) : "–"} · avg {r ? fmt(r.fps.avg) : "–"}
            </span>
          </button>
          <button className="px-1 text-white/60" onClick={() => setTop((t) => !t)} aria-label="Move the panel">
            ⇅
          </button>
          <button className="px-1 text-white/60" onClick={() => setDiagEnabled(false)} aria-label="Turn diagnostics off">
            ✕
          </button>
        </div>

        {open && (
          <div className="mt-1.5 space-y-1.5 border-t border-white/10 pt-1.5">
            {!r && <p className="text-white/60">No 3D view is drawing yet. Open the map.</p>}
            {r && (
              <>
                <div className={cn("font-bold", TONE[v])}>
                  {r.name}: {WORDS[v]} (target {Math.min(60, r.capFps ?? 60, hz || 60)} fps)
                </div>
                {idleSaving && <div className="text-amber-300">Saver is idle: frames are paused on purpose.</div>}
                <Grid
                  rows={[
                    ["fps", `now ${fmt(r.fps.fps)} · min ${fmt(r.fps.min)} · avg ${fmt(r.fps.avg, 1)}`],
                    ["1% low", `${fmt(r.fps.low1)} fps`],
                    ["frame", `${fmt(r.fps.frameMs, 1)} ms · p95 ${fmt(r.fps.p95Ms, 1)} · worst ${fmt(r.fps.worstMs)}`],
                    ["slow frames", `${Math.round(r.fps.slowShare * 100)}% under 45 · ${r.fps.hitches} over 50 ms`],
                    ["measured", `${r.fps.seconds.toFixed(0)} s · ${r.fps.frames} frames`],
                  ]}
                />
                <Spark ms={r.recent} />
                <Grid
                  rows={[
                    ["quality", r.quality.label + (r.capFps ? ` · capped ${r.capFps} fps` : "")],
                    ["resolution", r.quality.dpr !== undefined ? `${r.quality.dpr.toFixed(2)}× · shadows ${r.quality.shadows ? "on" : "off"}` : "–"],
                    ...Object.entries(r.quality.notes ?? {}).map(([key, val]) => [key, String(val)] as [string, string]),
                    ...(r.hasGpu
                      ? ([
                          ["draw calls", `${r.gpu.calls} (max ${r.gpu.callsMax}) · ${k(r.gpu.triangles)} tris`],
                          ["gpu memory", `${r.gpu.geometries} geometries · ${r.gpu.textures} textures · ${r.gpu.programs} shaders`],
                        ] as [string, string][])
                      : []),
                    ["js heap", mem.heapMb !== null ? `${mem.heapMb} / ${mem.heapLimitMb} MB` : "n/a"],
                    ["device", `${mem.deviceGb ? mem.deviceGb + " GB · " : ""}screen ${hz ? hz + " Hz" : "?"}`],
                    ["saver", `${isSaving() ? "on" : "off"}${battery ? ` · battery ${Math.round(battery.level * 100)}%${battery.charging ? " ⚡" : ""}` : ""}`],
                  ]}
                />
              </>
            )}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <Btn onClick={copy}>Copy report</Btn>
              {typeof navigator !== "undefined" && "share" in navigator && <Btn onClick={share}>Share</Btn>}
              <Btn
                onClick={() => {
                  resetDiag();
                  setNote("Counters reset");
                  setReport(null);
                }}
              >
                Reset
              </Btn>
            </div>
            {note && <div className="text-sky-300">{note}</div>}
            {report && <textarea readOnly value={report} onFocus={(e) => e.currentTarget.select()} className="h-24 w-full resize-none rounded bg-black/60 p-1 text-[10px] text-white/80 outline-none" />}
          </div>
        )}
      </div>
    </div>
  );
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5">
      {rows.map(([a, b]) => (
        <div key={a} className="contents">
          <dt className="text-white/45">{a}</dt>
          <dd className="min-w-0 break-words text-white/90">{b}</dd>
        </div>
      ))}
    </dl>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg bg-white/10 px-2.5 py-1 font-semibold ring-1 ring-white/15 active:bg-white/20">
      {children}
    </button>
  );
}
