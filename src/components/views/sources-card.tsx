"use client";

// ⛏️ OWN SOURCES: the mines, plantations and works the company buys into, one per raw material.
// Each level takes a share off that material's price everywhere (engine/sources.ts).
import { MATERIALS } from "@/game/config/economy";
import { SOURCES, SOURCE_KIND } from "@/game/config/sources";
import { usedMaterials } from "@/game/engine/materials";
import { sourceCost, sourceDiscount, sourceLevel, sourcesOpen } from "@/game/engine/sources";
import { formatMoney, formatPercent } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";
import { materialName } from "../panels/materials-panel";

export function SourcesCard() {
  const state = useGame((g) => g.view.state);
  const g = useGame.getState();
  const { t } = useT();
  if (!sourcesOpen(state)) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-white/50 ring-1 ring-white/[0.07]">
        🔒 {t("source.locked", { money: formatMoney(SOURCES.unlockEarned), have: formatMoney(state.lifetime.moneyEarned) })}
      </div>
    );
  }
  const used = usedMaterials(state);
  // the materials the plants use first: those are the ones a source pays back on
  const list = [...MATERIALS].sort((a, b) => Number(used.includes(b.id)) - Number(used.includes(a.id)));
  return (
    <div className="space-y-1.5 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <p className="text-[11px] text-white/50">{t("source.desc", { pct: formatPercent(SOURCES.discountPerLevel), max: SOURCES.maxLevel })}</p>
      {list.map((m) => {
        const lv = sourceLevel(state, m.id);
        const cost = sourceCost(state, m.id);
        return (
          <div key={m.id} className={cn("flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] p-2", !used.includes(m.id) && "opacity-50")}>
            <div className="min-w-0 text-xs">
              <div className="font-semibold">
                {SOURCE_KIND[m.id].emoji} {t(`source.kind.${m.id}`)} <span className="text-white/40">· {materialName(m.id, t)}</span>
              </div>
              <div className="text-[10px] text-white/50">
                {t("common.lv", { level: lv })}/{SOURCES.maxLevel}
                {lv > 0 && <span className="text-emerald-300"> · −{formatPercent(sourceDiscount(state, m.id))}</span>}
              </div>
            </div>
            <CostButton size="sm" cost={cost} onBuy={() => g.buySource(m.id)} maxedLabel={t("common.max")} showEta={false} />
          </div>
        );
      })}
    </div>
  );
}
