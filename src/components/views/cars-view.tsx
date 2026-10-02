"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CARS, CAR_MODEL, carProfit } from "@/game/config/cars";
import { carModelCost, unlockedCarIds } from "@/game/engine/economy";
import { carRequirement } from "@/game/engine/insights";
import { formatMoney, formatNumber, formatPercent, formatTime } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";
import { ViewHeader } from "./section-title";

export function CarsView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const upgradeCarModel = useGame((g) => g.upgradeCarModel);
  const { t, lang } = useT();
  const n = useContent(lang);
  const unlocked = unlockedCarIds(state, snap.gm);

  // Best live value per car across factories currently building it.
  const liveValue = new Map<string, number>();
  for (const st of Object.values(snap.factories)) {
    if (!st) continue;
    const v = st.valuePerCar * snap.dealers.multiplier;
    liveValue.set(st.car.id, Math.max(liveValue.get(st.car.id) ?? 0, v));
  }

  return (
    <div className="space-y-4">
      <ViewHeader icon="🚗" title={t("cars.title")} subtitle={t("cars.subtitle", { n: unlocked.size, total: CARS.length })} />
      <div className="grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
        {CARS.map((car) => {
          const isUnlocked = unlocked.has(car.id);
          const requirement = isUnlocked ? null : carRequirement(state, car, snap);
          const req = requirement ? n.requirement(requirement) : null;
          const lvl = state.carModels[car.id] ?? 0;
          const produced = state.lifetime.carsByType[car.id];
          return (
            <div key={car.id} className={`relative overflow-hidden rounded-2xl p-4 ring-1 ${isUnlocked ? "glass" : "bg-white/[0.02] ring-white/[0.05]"}`}>
              <div
                className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl"
                style={{ background: car.color, opacity: isUnlocked ? 0.18 : 0.05 }}
              />
              <div className="relative flex items-start gap-3">
                <div className={`flex size-16 items-center justify-center rounded-2xl bg-white/5 text-4xl ring-1 ring-white/10 ${isUnlocked ? "" : "grayscale opacity-50"}`}>
                  {car.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{n.car(car)}</span>
                    <Badge variant={isUnlocked ? "default" : "muted"}>{t("cars.tier", { tier: car.tier })}</Badge>
                    {lvl > 0 && <Badge variant="gold">{t("cars.modelLv", { level: lvl })}</Badge>}
                  </div>
                  <p className="text-xs text-white/45">{n.carTagline(car)}</p>
                </div>
              </div>

              <div className="relative mt-3 grid grid-cols-3 gap-1.5 text-center">
                <Spec label={t("cars.cost")} value={formatMoney(car.cost)} />
                <Spec label={t("cars.price")} value={formatMoney(car.price)} />
                <Spec label={t("cars.profit")} value={formatMoney(carProfit(car))} accent />
              </div>
              <div className="relative mt-2 flex justify-between text-[11px] text-white/50">
                <span>{t("cars.baseTime", { time: formatTime(car.time) })}</span>
                <span>{t("cars.produced", { n: formatNumber(produced) })}</span>
              </div>
              {liveValue.has(car.id) && (
                <div className="relative mt-1 text-[11px] text-emerald-300">{t("cars.sellingNow", { price: formatMoney(liveValue.get(car.id)!) })}</div>
              )}

              {isUnlocked ? (
                <CostButton
                  className="relative mt-3 w-full"
                  cost={carModelCost(state, car.id)}
                  onBuy={() => upgradeCarModel(car.id)}
                  label={t("cars.refine", { pct: formatPercent(CAR_MODEL.valuePerLevel - 1) })}
                />
              ) : (
                <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-white/[0.03] p-2.5 text-xs text-white/55 ring-1 ring-white/[0.06]">
                  <Lock className="size-3.5" /> {req}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spec({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-1 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-semibold tabular-nums ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}
