"use client";

import { Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CAR_BY_ID } from "@/game/config/cars";
import { PLANT_BY_ID } from "@/game/config/chain";
import { TERRITORY_BY_ID } from "@/game/config/city";
import { LANDMARK, LANDMARKS, type LandmarkConfig } from "@/game/config/landmarks";
import * as Lm from "@/game/engine/landmarks";
import { isTerritoryOpen } from "@/game/engine/territory";
import { formatMoney, formatNumber } from "@/game/format";
import type { GameState } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

const pct = (x: number) => Math.round(x * 100);

/** The landmark works of the map's territories: the three steps to each line, its level, what it adds. */
export function LandmarksView() {
  const state = useGame((g) => g.view.state);
  const { t } = useT();
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#10241a] via-[#0b1510] to-[#07080b] p-4 ring-1 ring-emerald-400/25">
        <div className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-3xl ring-1 ring-emerald-300/40">🏗️</div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black">{t("landmark.title")}</div>
            <div className="text-[11px] leading-snug text-white/55">{t("landmark.subtitle")}</div>
          </div>
        </div>
      </div>
      {LANDMARKS.map((l) => (
        <LandmarkCard key={l.territory} l={l} state={state} />
      ))}
    </div>
  );
}

function LandmarkCard({ l, state }: { l: LandmarkConfig; state: GameState }) {
  const { t, lang } = useT();
  const n = useContent(lang);
  const car = CAR_BY_ID[l.car];
  const carName = n.car(car);
  const works = t(`structure.${l.works}` as MessageKey);
  const zone = t(`territory.${l.territory}` as MessageKey);
  const open = isTerritoryOpen(state, l.territory);
  const restored = Lm.restored(state, l);
  const built = Lm.lineBuilt(state, l);
  const level = Lm.landmarkLevel(state, l);
  const next = Lm.nextLevelAt(state, l);
  const steps = [
    { ok: open, label: t("landmark.step.land", { zone: `${TERRITORY_BY_ID[l.territory].emoji} ${zone}` }) },
    { ok: restored, label: t("landmark.step.restore", { works }) },
    { ok: built > 0, label: t("landmark.step.firstCar", { car: carName }) },
  ];
  const go = () => {
    const ui = useUi.getState();
    // the works' lot, or the territory while it is closed
    if (open) ui.selectPlot(`w:${l.territory}`, true);
    else ui.setView(null);
    if (!open) ui.map({ kind: "plot", id: `w:${l.territory}`, zoom: 0.6 });
  };
  return (
    <div className={cn("space-y-2 rounded-2xl p-3 ring-1", restored ? "bg-white/[0.05] ring-emerald-400/25" : "bg-white/[0.03] ring-white/[0.07]")}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{PLANT_BY_ID[l.works].emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">{works}</div>
          <div className="truncate text-[11px] text-white/50">
            {TERRITORY_BY_ID[l.territory].emoji} {zone} → {car.emoji} {carName}
          </div>
        </div>
        {level > 0 ? <Badge variant="gold">{t("landmark.level", { n: level, max: LANDMARK.maxLevel })}</Badge> : <Lock className="size-4 text-white/35" />}
      </div>

      <div className="space-y-1 rounded-xl bg-black/25 p-2 text-[11px]">
        {steps.map((st, i) => (
          <div key={i} className={cn("flex items-center gap-1.5", st.ok ? "text-emerald-300" : "text-white/55")}>
            {st.ok ? <Check className="size-3.5 shrink-0" /> : <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-white/30 text-[8px]">{i + 1}</span>}
            <span className="min-w-0">{st.label}</span>
          </div>
        ))}
        {built === 0 && <div className="pl-5 text-white/40">{t("landmark.reward", { money: formatMoney(Math.max(LANDMARK.firstCar.minCash, Math.max(0, state.chain.steady ?? state.chain.rate) * LANDMARK.firstCar.incomeSeconds)), stars: LANDMARK.firstCar.stars })}</div>}
        {restored && built === 0 && <div className="pl-5 text-amber-200/80">{t("landmark.choose", { car: carName })}</div>}
      </div>

      {level > 0 && (
        <div className="space-y-1 text-[11px] text-white/70">
          {next !== null ? (
            <div>
              <div className="mb-0.5 text-white/50">{t("landmark.next", { n: formatNumber(built), need: formatNumber(next) })}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (built / next) * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div className="font-bold text-gold">{t("landmark.max")}</div>
          )}
          <div>💰 {t("landmark.local", { car: carName, pct: pct(LANDMARK.localPerLevel * level) })}</div>
          <div>⭐ {specialty(l, state, level, carName, t)}</div>
        </div>
      )}

      <Button size="sm" variant={open ? "gold" : "secondary"} className="w-full" onClick={go}>
        {open ? t("landmark.go") : t("landmark.goZone")}
      </Button>
    </div>
  );
}

/** What the territory's specialty does at this level, in words. */
function specialty(l: LandmarkConfig, s: GameState, level: number, car: string, t: ReturnType<typeof useT>["t"]): string {
  switch (l.territory) {
    case "raw":
      return t("landmark.spec.raw", { pct: pct(LANDMARK.raw.materials * level) });
    case "suburbs":
      return t("landmark.spec.suburbs", { pct: pct(LANDMARK.suburbs.lease * level), car });
    case "mountain":
      return t("landmark.spec.mountain", { pct: pct(LANDMARK.mountain.race * level) });
    case "boulevard":
      return t("landmark.spec.boulevard", { pct: pct(LANDMARK.boulevard.editions * level) });
    case "port":
      return t("landmark.spec.port", { pct: pct(LANDMARK.port.exports * level) });
    case "airport":
      return t("landmark.spec.airport", { n: Math.min(s.landmarks.fleet, Lm.fleetMax(s)), max: Lm.fleetMax(s), money: formatMoney(Lm.fleetIncome(s)) });
    default:
      return "";
  }
}
