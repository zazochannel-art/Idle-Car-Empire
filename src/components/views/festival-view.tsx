"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SKINS } from "@/game/config/racing";
import { FESTIVAL, FESTIVAL_GOALS, festivalNow, festivalProgress, type FestivalGoal } from "@/game/engine/festival";
import { rewardCash } from "@/game/engine/progress";
import { SEASON_ICON } from "@/game/engine/season";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

const GOAL_ICON: Record<FestivalGoal, string> = { cars: "🚗", earned: "💰", wins: "🏆" };

/** The spring or summer festival: three goals sized to the empire, and a livery for all three. */
export function FestivalView() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const claim = useGame((g) => g.claimFestivalGoal);
  const { t } = useT();
  const [now] = useState(Date.now);
  const w = festivalNow(now);
  if (!w || state.festival.key !== w.key) {
    return (
      <div className="space-y-4">
        <ViewHeader icon="🎪" title={t("festival.title")} subtitle={t("festival.subtitleOff")} />
        <p className="rounded-2xl bg-[#2b2b2e] p-4 text-center text-sm text-white/70 ring-1 ring-white/10">{t("festival.off")}</p>
      </div>
    );
  }
  const F = state.festival;
  const skin = FESTIVAL.skin[w.season];
  const hasSkin = state.racing.skins.includes(skin);
  const spring = w.season === "spring";
  return (
    <div className="space-y-4">
      <ViewHeader icon={SEASON_ICON[w.season]} title={t(`festival.${w.season}` as MessageKey)} subtitle={t(`festival.${w.season}Sub` as MessageKey)} />
      <p className="px-1 text-[11px] text-white/55">{t("festival.ends", { time: formatDuration((w.end - now) / 1000) })}</p>

      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("festival.goals")}</div>
        {FESTIVAL_GOALS.map((g) => {
          const p = festivalProgress(state, g);
          const done = F.goals.includes(g);
          const reached = p.value >= p.target;
          const fmt = g === "earned" ? formatMoney : formatNumber;
          return (
            <div key={g} className={cn("space-y-1.5 rounded-2xl p-3 ring-1", done ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-white/[0.04] ring-white/[0.07]")}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{GOAL_ICON[g]}</span>
                <span className="min-w-0 flex-1 text-sm font-bold">{t(`winter.goal.${g}` as MessageKey, { n: fmt(p.target) })}</span>
                {done ? (
                  <span className="text-xs font-black text-emerald-300">✓</span>
                ) : (
                  <Button size="sm" variant={reached ? "gold" : "locked"} disabled={!reached} onClick={() => claim(g)}>
                    {t("winter.claim")}
                  </Button>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className={cn("h-full rounded-full bg-gradient-to-r", spring ? "from-pink-400 to-lime-400" : "from-amber-400 to-orange-500")} style={{ width: `${Math.min(100, (p.value / Math.max(1, p.target)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-white/50">
                <span className="tabular-nums">
                  {fmt(Math.min(p.value, p.target))} / {fmt(p.target)}
                </span>
                <span className="text-gold">
                  +{formatMoney(rewardCash(FESTIVAL.goalReward, snap))} · ⭐ {FESTIVAL.goalReward.stars}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1", hasSkin ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-white/[0.04] ring-white/[0.07]")}>
        <span className="size-6 shrink-0 rounded-full ring-2" style={{ background: SKINS[skin].color, boxShadow: `inset 0 0 0 4px ${SKINS[skin].accent}` }} />
        <span className="min-w-0 flex-1 text-xs">
          <b>
            {SKINS[skin].emoji} {t(`race.skin.${skin}` as MessageKey)}
          </b>
          <span className="block text-[11px] text-white/50">{t("winter.goalsSkin")}</span>
        </span>
        <span className={cn("text-xs font-black", hasSkin ? "text-emerald-300" : "text-white/40")}>{hasSkin ? "✓" : "🔒"}</span>
      </div>
      <p className="px-1 text-[11px] leading-snug text-white/45">{t("festival.hint")}</p>
    </div>
  );
}
