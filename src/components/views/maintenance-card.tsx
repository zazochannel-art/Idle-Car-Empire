"use client";

import { CostButton } from "@/components/game/cost-button";
import { BREAKDOWN, CREW, crewRepair, crewWear } from "@/game/engine/floor";
import { maintenanceCost } from "@/game/engine/maintenance";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";

const pct = (x: number) => Math.round(x * 100);
const secs = (x: number) => `${Math.max(1, Math.round(x))}s`;

/** The maintenance crew for every plant: what it does at this level and the next, and its price. */
export function MaintenanceCard() {
  const level = useGame((g) => g.view.state.maintenance.level);
  const cost = useGame((g) => maintenanceCost(g.view.state, g.view.snap));
  const buy = useGame((g) => g.buyMaintenance);
  const { t } = useT();
  const effects = (l: number) =>
    t("crew.effects", {
      fewer: pct(1 - crewWear(l)),
      repair: secs(BREAKDOWN.repair * crewRepair(l)),
      managed: secs(BREAKDOWN.repairManaged * crewRepair(l)),
    });

  return (
    <div className="mb-4 space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold">🔧 {t("crew.title")}</div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-black">{t("crew.level", { n: level, max: CREW.maxLevel })}</span>
      </div>
      <div className="text-[11px] leading-snug text-white/50">{t("crew.hint")}</div>
      <div className="space-y-0.5 rounded-xl bg-black/25 p-2 text-[11px]">
        <div className="text-white/80">{level > 0 ? effects(level) : t("crew.none", { repair: secs(BREAKDOWN.repair), managed: secs(BREAKDOWN.repairManaged) })}</div>
        {level >= CREW.calmFrom && <div className="text-emerald-300">{t("crew.calm")}</div>}
        {level < CREW.maxLevel && (
          <div className="text-sky-300">
            {t("crew.next", { n: level + 1 })}: {effects(level + 1)}
            {level + 1 === CREW.calmFrom && ` · ${t("crew.calm")}`}
          </div>
        )}
      </div>
      <CostButton size="sm" className="w-full" cost={cost} label={level === 0 ? t("crew.hire") : t("crew.upgrade")} maxedLabel={t("crew.maxed")} onBuy={buy} />
    </div>
  );
}
