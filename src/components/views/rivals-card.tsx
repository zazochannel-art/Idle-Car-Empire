"use client";

import { leaderboard } from "@/game/engine/retention";
import { formatMoney } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** The earnings table against the computer-run car makers. */
export function RivalsCard() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const rows = leaderboard(state, state.lastActiveAt);
  const total = rows.reduce((a, r) => a + r.earned, 0);
  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="text-sm font-semibold">{t("rival.title")}</h3>
      <p className="mb-3 text-[11px] text-white/45">{t("rival.subtitle")}</p>
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const share = total > 0 ? r.earned / total : 0;
          return (
            <li key={r.id} className={cn("rounded-xl p-2 ring-1", r.you ? "bg-gold/[0.08] ring-gold/30" : "bg-white/[0.03] ring-white/[0.06]")}>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-5 text-center font-bold text-white/50">{i + 1}</span>
                <span>{r.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{r.you ? t("rival.you") : r.name}</span>
                <span className="tabular-nums text-white/70">{formatMoney(r.earned)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 pl-7">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(1, share * 100)}%`, background: r.you ? "#f5c451" : "#64748b" }} />
                </div>
                <span className="w-10 text-right text-[10px] tabular-nums text-white/50">{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
