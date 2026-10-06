"use client";

import { PLANT_BY_ID } from "@/game/config/chain";
import { plantNumber, plantProfitPerMin } from "@/game/engine/chain";
import { formatMoney } from "@/game/format";
import { debtVars } from "@/game/engine/materials";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/**
 * Value each factory adds per minute, best first, with the ones that are
 * stuck (no material, full storage, missing parts) flagged so the player
 * sees where the chain is held up.
 */
export function ProfitReport() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const selectPlot = useUi((u) => u.selectPlot);
  const { t } = useT();
  const rows = Object.values(snap.chain.plants)
    .map((st) => {
      const b = state.city.buildings[st.plotId];
      return { st, status: b?.plant?.status ?? "ok", missing: b?.plant?.missing, profit: plantProfitPerMin(st, snap.gm), n: plantNumber(state, st.plotId) };
    })
    .sort((a, b) => b.profit - a.profit);
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.profit));
  const many = (type: string) => rows.filter((r) => r.st.type === type).length > 1;

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="text-sm font-semibold">{t("report.title")}</h3>
      <p className="mb-3 text-[11px] text-white/45">{t("report.subtitle")}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const stuck = r.status !== "ok";
          const raw = PLANT_BY_ID[r.st.type].raw;
          return (
            <li key={r.st.plotId}>
              <button onClick={() => selectPlot(r.st.plotId)} className="w-full rounded-xl bg-white/[0.03] p-2 text-left ring-1 ring-white/[0.06] hover:bg-white/[0.06]">
                <div className="flex items-center gap-2 text-sm">
                  <span>{PLANT_BY_ID[r.st.type].emoji}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {t(`structure.${r.st.type}` as MessageKey)}
                    {many(r.st.type) ? ` #${r.n}` : ""}
                  </span>
                  <span className="tabular-nums text-white/80">
                    {formatMoney(r.profit)}
                    {t("unit.perMin")}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${Math.max(2, (Math.max(0, r.profit) / top) * 100)}%` }} />
                </div>
                {stuck && (
                  <div className="mt-1 text-[11px] text-amber-300">
                    ⚠️{" "}
                    {t(`status.${r.status}` as MessageKey, {
                      ...debtVars(state, formatMoney),
                      raw: raw ? t(`raw.${raw}` as MessageKey) : "",
                      item: r.missing ? t(`item.${r.missing}` as MessageKey) : "",
                    })}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
