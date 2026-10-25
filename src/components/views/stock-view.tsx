"use client";

import { useState } from "react";
import { CostButton } from "@/components/game/cost-button";
import { Button } from "@/components/ui/button";
import { passiveIncome } from "@/game/engine/economy";
import { STOCK, buybackCost, companyValue, sharePrice, stockUnlocked, trancheValue } from "@/game/engine/stock";
import { formatMoney } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

const pct = (x: number) => Math.round(x * 100);

/** The company on the stock exchange: what it is worth, who owns it, selling a tenth or buying one back. */
export function StockView() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const sell = useGame((g) => g.sellShares);
  const buyBack = useGame((g) => g.buyBackShares);
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const st = state.stock;
  const header = <ViewHeader icon="📈" title={t("nav.stock")} subtitle={t("stock.subtitle")} />;

  if (!stockUnlocked(state)) {
    const p = Math.min(100, (state.lifetime.moneyEarned / STOCK.unlockEarned) * 100);
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-2 rounded-2xl bg-[#2b2b2e] p-4 ring-1 ring-white/10">
          <div className="text-sm font-bold">🔒 {t("stock.locked", { money: formatMoney(STOCK.unlockEarned) })}</div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold" style={{ width: `${p}%` }} />
          </div>
          <div className="text-[11px] text-white/50">{t("stock.lockedNow", { money: formatMoney(state.lifetime.moneyEarned) })}</div>
        </div>
        <Rules />
      </div>
    );
  }

  const price = sharePrice(snap);
  const prices = [...st.history, price];
  const full = Math.round(st.sold / STOCK.tranche) >= Math.round(STOCK.maxSold / STOCK.tranche);
  const raise = trancheValue(snap);
  const divPerMin = Math.max(0, passiveIncome(snap)) * st.sold * 60;

  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-2 gap-1.5">
        <Figure label={t("stock.value")} value={formatMoney(companyValue(snap))} />
        <Figure label={t("stock.price")} value={formatMoney(price)} trend={prices.length > 1 ? price / prices[0] - 1 : 0} />
        <Figure label={t("stock.owned")} value={`${pct(1 - st.sold)}%`} gold />
        <Figure label={t("stock.dividendsNow")} value={st.sold > 0 ? `${formatMoney(divPerMin)}/min` : "—"} />
      </div>

      {prices.length > 1 && (
        <div className="rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-white/45">{t("stock.chart")}</div>
          <Spark values={prices} />
        </div>
      )}

      <div className="space-y-2 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
        <div className="text-sm font-bold">{t("stock.shares")}</div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={cn("flex-1", i < Math.round((1 - st.sold) * 10) ? "bg-gold" : "bg-sky-500", i === 10 - Math.round(STOCK.maxSold * 10) && "ml-1")} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-white/50">
          <span>🟨 {t("stock.you", { pct: pct(1 - st.sold) })}</span>
          <span>🟦 {t("stock.investors", { pct: pct(st.sold) })}</span>
        </div>

        {asking ? (
          <div className="space-y-2 rounded-xl bg-black/30 p-2.5 text-[11px] text-white/75 ring-1 ring-gold/30">
            <div>{t("stock.confirm", { money: formatMoney(raise), pct: pct(STOCK.tranche) })}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAsking(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                variant="gold"
                onClick={() => {
                  sell();
                  setAsking(false);
                }}
              >
                {t("stock.sellNow")}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="gold" className="w-full" disabled={full || !(raise > 0)} onClick={() => setAsking(true)}>
            {full ? t("stock.full", { pct: pct(STOCK.maxSold) }) : t("stock.sell", { pct: pct(STOCK.tranche), money: formatMoney(raise) })}
          </Button>
        )}
        <CostButton size="sm" className="w-full" cost={st.sold > 0 ? buybackCost(state, snap) : null} label={t("stock.buyBack", { pct: pct(STOCK.tranche) })} maxedLabel={t("stock.allYours")} onBuy={buyBack} />
      </div>

      <div className="space-y-1 rounded-2xl bg-white/[0.04] p-3 text-[11px] text-white/70 ring-1 ring-white/[0.07]">
        <div className="flex justify-between">
          <span>{t("stock.raised")}</span>
          <b className="text-emerald-300">{formatMoney(st.raised)}</b>
        </div>
        <div className="flex justify-between">
          <span>{t("stock.dividends")}</span>
          <b className="text-rose-300">{formatMoney(st.dividends)}</b>
        </div>
        <div className="flex justify-between">
          <span>{t("stock.boughtBack")}</span>
          <b className="text-rose-300">{formatMoney(st.boughtBack)}</b>
        </div>
      </div>
      <Rules />
    </div>
  );
}

function Rules() {
  const { t } = useT();
  return <p className="px-1 text-[11px] leading-snug text-white/45">{t("stock.rules", { hours: STOCK.valueSeconds / 3600, max: pct(STOCK.maxSold), premium: pct(STOCK.buyPremium) })}</p>;
}

function Figure({ label, value, gold, trend }: { label: string; value: string; gold?: boolean; trend?: number }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn("text-base font-black tabular-nums", gold && "text-gold")}>{value}</div>
      {trend !== undefined && Math.abs(trend) >= 0.001 && <div className={cn("text-[10px] font-bold", trend > 0 ? "text-emerald-300" : "text-rose-300")}>{`${trend > 0 ? "▲" : "▼"} ${Math.abs(trend * 100).toFixed(1)}%`}</div>}
    </div>
  );
}

/** The share price over the last hours, as a line. */
function Spark({ values }: { values: number[] }) {
  const w = 300;
  const h = 64;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - lo) / span) * (h - 8)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
