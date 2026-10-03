"use client";

import { useMemo, useRef, useState } from "react";
import { formatDuration, formatMoney, formatPercent } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";

// One series, so no legend: the title names it. The line colour was checked
// against the dark card surface (lightness band and 3:1 contrast).
const LINE = "#2f8fd8";
const W = 320;
const H = 140;
const PAD = { l: 44, r: 8, t: 8, b: 20 };

/**
 * Income per second over the last hours (one sample a minute). The y axis is
 * logarithmic because an idle empire grows by orders of magnitude.
 */
export function IncomeChart() {
  const history = useGame((g) => g.state.history);
  const income = useGame((g) => g.snap.incomePerSec);
  const { t } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const chart = useMemo(() => {
    const pts = history.filter((p) => p.income > 0);
    if (pts.length < 2) return null;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const lo = Math.log10(Math.min(...pts.map((p) => p.income)));
    const hi = Math.log10(Math.max(...pts.map((p) => p.income)));
    // whole decades for the grid, at least one decade tall
    const yMin = Math.floor(lo);
    const yMax = Math.max(yMin + 1, Math.ceil(hi));
    const x = (tt: number) => PAD.l + ((tt - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (Math.log10(v) - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.income).toFixed(1)}`).join("");
    const step = Math.max(1, Math.ceil((yMax - yMin) / 4));
    const grid: number[] = [];
    for (let d = yMin; d <= yMax; d += step) grid.push(d);
    return { pts, t0, t1, x, y, path, grid };
  }, [history]);

  // growth over the last hour of this chart
  const growth = useMemo(() => {
    if (!chart) return null;
    const last = chart.pts[chart.pts.length - 1];
    const past = [...chart.pts].reverse().find((p) => last.t - p.t >= 3_600_000) ?? chart.pts[0];
    return past.income > 0 && past !== last ? last.income / past.income - 1 : null;
  }, [chart]);

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !chart) return;
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < chart.pts.length; i++) if (Math.abs(chart.x(chart.pts[i].t) - sx) < Math.abs(chart.x(chart.pts[best].t) - sx)) best = i;
    setHover(best);
  };

  const sel = chart && hover !== null ? chart.pts[hover] : null;
  const ago = (tt: number) => (chart ? formatDuration((chart.t1 - tt) / 1000) : "");

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("chart.title")}</h3>
          <div className="text-2xl font-black tabular-nums">
            {formatMoney(income)}
            <span className="text-sm font-semibold text-white/50">{t("unit.perSec")}</span>
          </div>
        </div>
        {growth !== null && (
          <div className="text-right text-xs text-white/55">
            <div className="font-bold tabular-nums text-white">
              {growth >= 0 ? "+" : ""}
              {formatPercent(growth)}
            </div>
            {t("chart.lastHour")}
          </div>
        )}
      </div>

      {chart ? (
        <>
          <div className="relative mt-3">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="block w-full touch-none select-none"
              role="img"
              aria-label={t("chart.title")}
              onPointerDown={(e) => pick(e.clientX)}
              onPointerMove={(e) => pick(e.clientX)}
              onPointerLeave={() => setHover(null)}
            >
              {chart.grid.map((d) => (
                <g key={d}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={chart.y(10 ** d)} y2={chart.y(10 ** d)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                  <text x={PAD.l - 6} y={chart.y(10 ** d) + 3} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.45)">
                    {formatMoney(10 ** d)}
                  </text>
                </g>
              ))}
              <text x={PAD.l} y={H - 5} fontSize={9} fill="rgba(255,255,255,0.45)">
                {t("chart.ago", { time: ago(chart.t0) })}
              </text>
              <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.45)">
                {t("chart.now")}
              </text>
              <path d={chart.path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {sel && (
                <g>
                  <line x1={chart.x(sel.t)} x2={chart.x(sel.t)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                  <circle cx={chart.x(sel.t)} cy={chart.y(sel.income)} r={4} fill={LINE} stroke="#0b1220" strokeWidth={2} />
                </g>
              )}
            </svg>
            {sel && (
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-black/80 px-2 py-1 text-center ring-1 ring-white/15"
                style={{ left: `${Math.min(85, Math.max(15, (chart.x(sel.t) / W) * 100))}%` }}
              >
                <div className="text-xs font-bold tabular-nums">
                  {formatMoney(sel.income)}
                  {t("unit.perSec")}
                </div>
                <div className="text-[10px] text-white/55">{hover === chart.pts.length - 1 ? t("chart.now") : t("chart.ago", { time: ago(sel.t) })}</div>
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/40">
            <span>{t("chart.log")}</span>
            <button onClick={() => setTable(!table)} className="text-sky-300">
              {table ? t("chart.hideTable") : t("chart.showTable")}
            </button>
          </div>
          {table && (
            <table className="mt-2 w-full text-xs">
              <tbody className="divide-y divide-white/[0.05]">
                {chart.pts
                  .filter((_, i, a) => i === a.length - 1 || (a.length - 1 - i) % 15 === 0)
                  .reverse()
                  .map((p) => (
                    <tr key={p.t}>
                      <td className="py-1 text-white/55">{p === chart.pts[chart.pts.length - 1] ? t("chart.now") : t("chart.ago", { time: ago(p.t) })}</td>
                      <td className="py-1 text-right font-semibold tabular-nums">
                        {formatMoney(p.income)}
                        {t("unit.perSec")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-white/45">{t("chart.empty")}</p>
      )}
    </div>
  );
}
