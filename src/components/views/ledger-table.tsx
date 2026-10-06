"use client";

// Where the money came from and where it went: revenue lines, every cost,
// and the net. Used by the Welcome Back report and the Economy dashboard.
import { COST_KEYS, REVENUE_KEYS, ledgerNet, ledgerRevenue } from "@/game/engine/materials";
import { formatMoney } from "@/game/format";
import type { LedgerKey, LedgerValues } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

export const LEDGER_ICON: Record<LedgerKey, string> = {
  carSales: "🚘",
  partSales: "⚙️",
  services: "🔧",
  racing: "🏁",
  materials: "📦",
  labor: "👷",
  energy: "⚡",
  maintenance: "🛠️",
  logistics: "🚚",
  dealerFees: "🏪",
  tax: "🏛️",
  repairs: "🧰",
  rewards: "🎁",
};

/** `suffix` is appended to every amount (e.g. "/min"); `scale` converts the values (e.g. ×60 for per-minute rates). */
export function LedgerTable({ values, scale = 1, suffix = "", compact }: { values: LedgerValues; scale?: number; suffix?: string; compact?: boolean }) {
  const { t } = useT();
  const net = ledgerNet(values) * scale;
  const revenue = ledgerRevenue(values) * scale;
  // operating revenue and costs; rewards are shown below the net (they are not earned by the business)
  const rows = [...REVENUE_KEYS, ...COST_KEYS];
  const rewards = (values.rewards ?? 0) * scale;
  return (
    <div className={cn("rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.07]", compact ? "p-2.5" : "p-3")}>
      {rows.map((k) => {
        const rev = REVENUE_KEYS.includes(k);
        const v = values[k] * scale;
        if (!rev && v < 0.5) return null;
        if (rev && v < 0.5 && k !== "carSales") return null;
        return (
          <div key={k} className="flex items-center justify-between py-0.5 text-xs">
            <span className="text-white/65">
              {LEDGER_ICON[k]} {t(`ledger.${k}` as MessageKey)}
            </span>
            <span className={cn("font-semibold tabular-nums", rev ? "text-emerald-300" : "text-rose-300")}>
              {rev ? "+" : "−"}
              {formatMoney(v)}
              {suffix}
            </span>
          </div>
        );
      })}
      <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-1.5 text-sm font-black">
        <span>{t("ledger.net")}</span>
        <span className={cn("tabular-nums", net >= 0 ? "text-gold" : "text-rose-300")}>
          {net < 0 ? "−" : ""}
          {formatMoney(Math.abs(net))}
          {suffix}
        </span>
      </div>
      {revenue > 0 && (
        <div className="text-right text-[10px] text-white/45">
          {t("ledger.margin", { pct: `${Math.round((net / revenue) * 100)}%` })}
        </div>
      )}
      {rewards >= 0.5 && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-white/55">
          <span>
            {LEDGER_ICON.rewards} {t("ledger.rewards")}
          </span>
          <span className="tabular-nums text-sky-200">
            +{formatMoney(rewards)}
            {suffix}
          </span>
        </div>
      )}
    </div>
  );
}
