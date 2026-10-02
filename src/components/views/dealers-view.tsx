"use client";

import { DEALERS } from "@/game/config/dealerships";
import { dealerStats } from "@/game/engine/chain";
import { formatNumber } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { DealerPanel } from "../panels/plant-panel";
import { ViewHeader } from "./section-title";

export function DealersView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const selectPlot = useUi((u) => u.selectPlot);
  const { t, lang } = useT();
  const n = useContent(lang);
  const owned = DEALERS.filter((d) => state.dealers[d.id].owned);
  const customers = owned.reduce((a, d) => a + 60 / dealerStats(state, d.id, snap.gm).interval, 0);
  const inStock = owned.reduce((a, d) => a + (state.chain.dealers[d.id]?.cars ?? 0), 0);
  const nextLocked = DEALERS.find((d) => !state.dealers[d.id].owned);

  return (
    <div className="space-y-4">
      <ViewHeader icon="🏬" title={t("nav.dealers")} subtitle={t("dealers.subtitle")}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label={t("dealers.production")} value={`${formatNumber(snap.carsPerSec * 60)}${t("unit.perMin")}`} />
          <Metric label={t("dealers.customers")} value={`${formatNumber(customers)}${t("unit.perMin")}`} />
          <Metric label={t("dealers.inStock")} value={formatNumber(inStock)} gold />
        </div>
      </ViewHeader>
      <div className="grid gap-3 @xl:grid-cols-2">
        {DEALERS.filter((d) => state.dealers[d.id].owned || d.id === nextLocked?.id).map((d) => (
          <div key={d.id} className="glass rounded-2xl p-4">
            <button onClick={() => selectPlot(`d:${d.id}`)} className="mb-2 flex items-center gap-3 text-left">
              <span className="text-3xl">{d.emoji}</span>
              <span>
                <span className="block font-semibold">{n.dealer(d)}</span>
                <span className="block text-xs text-white/45">{n.dealerDesc(d)}</span>
              </span>
            </button>
            <DealerPanel id={d.id} />
          </div>
        ))}
      </div>
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
