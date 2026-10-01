"use client";

import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { DEALERS } from "@/game/config/dealerships";
import { FACTORIES } from "@/game/config/factories";
import { formatDuration, formatHours, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { CarId } from "@/game/types";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

export function StatsView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const L = state.lifetime;

  const mostProduced = CARS.reduce<{ id: CarId; n: number } | null>(
    (best, c) => (L.carsByType[c.id] > (best?.n ?? 0) ? { id: c.id, n: L.carsByType[c.id] } : best),
    null,
  );
  let mostValuable: { id: CarId; v: number } | null = null;
  for (const st of Object.values(snap.factories)) {
    if (!st) continue;
    const v = st.valuePerCar * snap.dealers.multiplier;
    if (!mostValuable || v > mostValuable.v) mostValuable = { id: st.car.id, v };
  }

  const rows: [string, string][] = [
    ["Total cars produced", formatNumber(Math.floor(L.carsProduced))],
    ["Total money earned", formatMoney(L.moneyEarned)],
    ["This run earned", formatMoney(state.run.moneyEarned)],
    ["Factories owned", `${FACTORIES.filter((f) => state.factories[f.id].owned).length} / ${FACTORIES.length}`],
    ["Dealerships owned", `${DEALERS.filter((d) => state.dealers[d.id].owned).length} / ${DEALERS.length}`],
    ["Current profit/sec", `${formatMoney(snap.incomePerSec)}/s`],
    ["Highest profit/sec", `${formatMoney(L.highestIncome)}/s`],
    ["Total play time", formatDuration(L.playTime)],
    ["Offline earnings", formatMoney(L.offlineEarned)],
    ["Offline efficiency", `${formatPercent(snap.gm.offline)} · up to ${formatHours(snap.gm.offlineCapHours)}`],
    ["Global Expansions", formatNumber(state.prestigeCount)],
    ["Empire Points", formatNumber(state.empirePoints)],
    ["Most produced car", mostProduced ? `${CAR_BY_ID[mostProduced.id].emoji} ${CAR_BY_ID[mostProduced.id].name} (${formatNumber(mostProduced.n)})` : "—"],
    ["Most valuable car", mostValuable ? `${CAR_BY_ID[mostValuable.id].emoji} ${CAR_BY_ID[mostValuable.id].name} (${formatMoney(mostValuable.v)})` : "—"],
    ["Research completed", formatNumber(L.researchDone)],
    ["Upgrades bought", formatNumber(L.upgradesBought)],
    ["Factory levels bought", formatNumber(L.levelsBought)],
    ["Managers hired", formatNumber(L.managersHired)],
    ["Achievements", formatNumber(state.achievements.length)],
  ];

  return (
    <div className="space-y-4">
      <ViewHeader icon="📊" title="Statistics" subtitle={`Empire founded ${new Date(state.createdAt).toLocaleDateString()}`} />
      <div className="glass divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-white/55">{k}</span>
            <span className="text-right font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold">Cars by model</h3>
        <div className="space-y-2">
          {CARS.map((c) => {
            const n = L.carsByType[c.id];
            const pct = L.carsProduced > 0 ? (n / L.carsProduced) * 100 : 0;
            return (
              <div key={c.id} className="flex items-center gap-3 text-xs">
                <span className="w-6 text-base">{c.emoji}</span>
                <span className="w-36 truncate text-white/60">{c.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                </div>
                <span className="w-16 text-right tabular-nums">{formatNumber(n)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
