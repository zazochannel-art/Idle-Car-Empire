"use client";

import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { DEALERS } from "@/game/config/dealerships";
import { carValue, plantsOf } from "@/game/engine/chain";
import { formatDuration, formatHours, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { CarId } from "@/game/types";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { IncomeChart } from "./income-chart";
import { ViewHeader } from "./section-title";

export function StatsView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const L = state.lifetime;
  const { t, lang } = useT();
  const n = useContent(lang);

  const mostProduced = CARS.reduce<{ id: CarId; n: number } | null>(
    (best, c) => (L.carsByType[c.id] > (best?.n ?? 0) ? { id: c.id, n: L.carsByType[c.id] } : best),
    null,
  );
  let mostValuable: { id: CarId; v: number } | null = null;
  for (const car of snap.chain.cars) {
    const v = carValue(state, car, snap.gm);
    if (!mostValuable || v > mostValuable.v) mostValuable = { id: car.id, v };
  }
  const parts = Object.values(L.parts).reduce((a, b) => a + b, 0);

  const rows: [string, string][] = [
    [t("stats.cars"), formatNumber(Math.floor(L.carsProduced))],
    [t("stats.carsSold"), formatNumber(L.carsSold)],
    [t("stats.parts"), formatNumber(parts)],
    [t("stats.deliveries"), formatNumber(L.deliveries)],
    [t("stats.serviced"), formatNumber(Math.floor(state.city.carsServiced))],
    [t("stats.money"), formatMoney(L.moneyEarned)],
    [t("stats.run"), formatMoney(state.run.moneyEarned)],
    [t("stats.factories"), formatNumber(plantsOf(state).length)],
    [t("stats.dealers"), `${DEALERS.filter((d) => state.dealers[d.id].owned).length} / ${DEALERS.length}`],
    [t("stats.profit"), `${formatMoney(snap.incomePerSec)}${t("unit.perSec")}`],
    [t("stats.highest"), `${formatMoney(L.highestIncome)}${t("unit.perSec")}`],
    [t("stats.playTime"), formatDuration(L.playTime)],
    [t("stats.offline"), formatMoney(L.offlineEarned)],
    [t("stats.offlineEff"), t("stats.offlineEffValue", { pct: formatPercent(snap.gm.offline), hours: formatHours(snap.gm.offlineCapHours) })],
    [t("stats.expansions"), formatNumber(state.prestigeCount)],
    [t("stats.imperiums"), formatNumber(state.imperiumCount)],
    [t("stats.ep"), formatNumber(state.empirePoints)],
    [t("stats.mostProduced"), mostProduced ? `${CAR_BY_ID[mostProduced.id].emoji} ${n.car(CAR_BY_ID[mostProduced.id])} (${formatNumber(mostProduced.n)})` : "—"],
    [t("stats.mostValuable"), mostValuable ? `${CAR_BY_ID[mostValuable.id].emoji} ${n.car(CAR_BY_ID[mostValuable.id])} (${formatMoney(mostValuable.v)})` : "—"],
    [t("stats.research"), formatNumber(L.researchDone)],
    [t("stats.upgrades"), formatNumber(L.upgradesBought)],
    [t("stats.levels"), formatNumber(L.levelsBought)],
    [t("stats.managers"), formatNumber(L.managersHired)],
    [t("stats.achievements"), formatNumber(state.achievements.length)],
  ];

  return (
    <div className="space-y-4">
      <ViewHeader icon="📊" title={t("nav.stats")} subtitle={t("stats.founded", { date: new Date(state.createdAt).toLocaleDateString(lang) })} />
      <IncomeChart />
      <div className="glass divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-white/55">{k}</span>
            <span className="text-right font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold">{t("stats.byModel")}</h3>
        <div className="space-y-2">
          {CARS.map((c) => {
            const count = L.carsByType[c.id];
            const pct = L.carsProduced > 0 ? (count / L.carsProduced) * 100 : 0;
            return (
              <div key={c.id} className="flex items-center gap-3 text-xs">
                <span className="w-6 text-base">{c.emoji}</span>
                <span className="w-36 truncate text-white/60">{n.car(c)}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                </div>
                <span className="w-16 text-right tabular-nums">{formatNumber(count)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
