"use client";

// 🌱 The environment (engine/eco.ts): the city's plants' pollution against the city's limit, the
// green label or the fine, and the eco programme to buy.
import { ECO, ecoActive, ecoCost, ecoIncomeMult, ecoLevel, pollution, pollutionLimit } from "@/game/engine/eco";
import { formatMoney, formatPercent } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";

export function EcoCard() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const buy = useGame((g) => g.buyEco);
  const { t } = useT();
  if (!ecoActive(state)) {
    return <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-white/50 ring-1 ring-white/[0.07]">🔒 {t("env.locked", { money: formatMoney(ECO.fromEarned) })}</div>;
  }
  const p = pollution(state);
  const limit = pollutionLimit(state.lifetime.moneyEarned);
  const mult = ecoIncomeMult(state);
  const over = p > limit;
  const lv = ecoLevel(state);
  return (
    <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="flex justify-between text-[11px]">
        <span className="text-white/60">🏭 {t("env.pollution")}</span>
        <span className={cn("font-bold tabular-nums", over ? "text-rose-300" : "text-emerald-300")}>
          {Math.round(p)} / {Math.round(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full", over ? "bg-rose-400" : "bg-emerald-400")} style={{ width: `${Math.min(100, (p / limit) * 100)}%` }} />
      </div>
      <p className={cn("text-[11px]", over ? "text-rose-200" : "text-emerald-200")}>
        {over ? t("env.fine", { pct: formatPercent(1 - mult) }) : t("env.green", { pct: formatPercent(mult - 1) })}
      </p>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] p-2">
        <div className="min-w-0 text-[11px]">
          <div className="font-semibold">🌱 {t("env.programme")}</div>
          <div className="text-white/50">{t("env.programmeDesc", { level: lv, max: ECO.maxLevel, pct: formatPercent(ECO.cutPerLevel) })}</div>
        </div>
        <CostButton size="sm" cost={ecoCost(state, snap.rewardIncomePerSec)} onBuy={() => buy()} maxedLabel={t("common.max")} showEta={false} />
      </div>
      <p className="text-[10px] text-white/40">{t("env.hint")}</p>
    </div>
  );
}
