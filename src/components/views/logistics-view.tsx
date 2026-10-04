"use client";

import { ExportCard } from "./expansion-cards";
import { Badge } from "@/components/ui/badge";
import { LOGISTICS, TRANSPORT_TIERS } from "@/game/config/logistics";
import { logisticsCost, logisticsMods, nextTier } from "@/game/engine/logistics";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";
import { ViewHeader } from "./section-title";

/**
 * The Logistics Center: company-wide upgrades for every truck, dock and
 * warehouse, and the transport ladder Truck → Train → Port → Export.
 */
export function LogisticsView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { buyLogistics, buyTransportTier } = useGame.getState();
  const { t } = useT();
  const l = state.logistics;
  const lm = logisticsMods(state);
  const next = nextTier(state);
  const onRoad = state.chain.shipments.length;

  return (
    <div className="space-y-4 pb-2">
      <ViewHeader icon="🚚" title={t("logistics.title")} subtitle={t("logistics.subtitle")}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label={t("logistics.onRoad")} value={formatNumber(onRoad)} />
          <Metric label={t("logistics.speed")} value={`×${lm.speed.toFixed(2)}`} />
          <Metric label={t("logistics.capacity")} value={`×${lm.capacity.toFixed(2)}`} gold />
        </div>
      </ViewHeader>
      <ExportCard />

      {/* transport ladder */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("logistics.network")}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {TRANSPORT_TIERS.map((tier, i) => (
            <div
              key={tier.id}
              className={cn(
                "rounded-xl p-2 text-center ring-1",
                i <= l.tier ? "bg-emerald-500/10 ring-emerald-400/40" : i === l.tier + 1 ? "bg-white/[0.05] ring-white/15" : "bg-white/[0.02] opacity-50 ring-white/5",
              )}
            >
              <div className="text-2xl">{tier.emoji}</div>
              <div className="text-[10px] font-bold">{t(`logistics.tier.${tier.id}` as MessageKey)}</div>
            </div>
          ))}
        </div>
        {next ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-white/55">
              {t(`logistics.tierHint.${next.id}` as MessageKey, { speed: next.speed, cap: next.capacity, market: formatPercent(next.market), cars: formatPercent(next.cars) })}
            </p>
            <CostButton
              className="w-full"
              variant="gold"
              cost={next.cost * snap.gm.costMult}
              onBuy={() => buyTransportTier()}
              label={`${next.emoji} ${t("logistics.unlock", { name: t(`logistics.tier.${next.id}` as MessageKey) })}`}
            />
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-emerald-300">{t("logistics.maxTier")}</p>
        )}
      </div>

      {/* company-wide upgrades */}
      <div className="space-y-2">
        {LOGISTICS.map((u) => {
          const lvl = l[u.id];
          const cost = logisticsCost(state, u.id, snap.gm.costMult);
          return (
            <div key={u.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{u.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold">{t(`logistics.up.${u.id}` as MessageKey)}</span>
                  <Badge variant="muted">
                    {lvl}/{u.max}
                  </Badge>
                </div>
                <div className="truncate text-[11px] text-white/50">{t(`logistics.upHint.${u.id}` as MessageKey, { pct: formatPercent(u.step), n: u.step })}</div>
              </div>
              {cost !== null ? <CostButton size="sm" cost={cost} onBuy={() => buyLogistics(u.id)} /> : <Badge variant="gold">MAX</Badge>}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[11px] text-white/40">{t("logistics.footer", { money: formatMoney(snap.incomePerSec) })}</p>
    </div>
  );
}

function Metric({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${gold ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}
