"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SKINS } from "@/game/config/racing";
import { rewardCash } from "@/game/engine/progress";
import { ADVENT, WINTER, WINTER_GOALS, adventDay, goalProgress, winterEnd, winterYear, type WinterGoal } from "@/game/engine/winter";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

const GOAL_ICON: Record<WinterGoal, string> = { cars: "🚗", earned: "💰", wins: "🏆" };

/** The winter festival: the advent calendar, the three goals and the liveries to win. */
export function WinterView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { openAdventDoor, claimWinterGoal } = useGame.getState();
  const { t } = useT();
  const [now] = useState(Date.now);
  const year = winterYear(now);
  const header = <ViewHeader icon="🎄" title={t("nav.winter")} subtitle={t("winter.subtitle")} />;
  if (year === null || state.winter.year !== year) {
    return (
      <div className="space-y-4">
        {header}
        <p className="rounded-2xl bg-[#2b2b2e] p-4 text-center text-sm text-white/70 ring-1 ring-white/10">{t("winter.off")}</p>
      </div>
    );
  }
  const open = adventDay(now);
  const W = state.winter;
  const skinRow = (id: string, how: MessageKey) => {
    const has = state.racing.skins.includes(id);
    return (
      <div key={id} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1", has ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-white/[0.04] ring-white/[0.07]")}>
        <span className="size-6 shrink-0 rounded-full ring-2" style={{ background: SKINS[id].color, boxShadow: `inset 0 0 0 4px ${SKINS[id].accent}` }} />
        <span className="min-w-0 flex-1 text-xs">
          <b>
            {SKINS[id].emoji} {t(`race.skin.${id}` as MessageKey)}
          </b>
          <span className="block text-[11px] text-white/50">{t(how)}</span>
        </span>
        <span className={cn("text-xs font-black", has ? "text-emerald-300" : "text-white/40")}>{has ? "✓" : "🔒"}</span>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      {header}
      <p className="px-1 text-[11px] text-white/55">{t("winter.ends", { time: formatDuration((winterEnd(year) - now) / 1000) })}</p>

      {/* the advent calendar */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0b2a4a] via-[#10243a] to-[#0a1626] p-3 ring-1 ring-sky-300/25">
        <div className="mb-2 text-sm font-black">🗓️ {t("winter.advent")}</div>
        <div className="grid grid-cols-6 gap-1.5">
          {ADVENT.map((r, i) => {
            const day = i + 1;
            const done = W.doors.includes(day);
            const ready = !done && day <= open;
            return (
              <button
                key={day}
                disabled={!ready}
                onClick={() => openAdventDoor(day)}
                aria-label={t("winter.door", { day })}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-black ring-1 transition",
                  done ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" : ready ? "animate-pulse bg-gold/25 text-gold ring-gold hover:bg-gold/35" : "bg-white/[0.04] text-white/30 ring-white/10",
                )}
              >
                <span className={cn(day === 24 && "text-base")}>{done ? "✓" : day}</span>
                <span className="text-[10px] leading-none">{day === 24 ? "🎁" : r.stars ? "⭐" : ready ? "🎄" : ""}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-sky-100/60">{t("winter.adventHint")}</p>
      </div>

      {/* the goals */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("winter.goals")}</div>
        {WINTER_GOALS.map((g) => {
          const p = goalProgress(state, g);
          const done = W.goals.includes(g);
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
                  <Button size="sm" variant={reached ? "gold" : "locked"} disabled={!reached} onClick={() => claimWinterGoal(g)}>
                    {t("winter.claim")}
                  </Button>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${Math.min(100, (p.value / Math.max(1, p.target)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-white/50">
                <span className="tabular-nums">
                  {fmt(Math.min(p.value, p.target))} / {fmt(p.target)}
                </span>
                <span className="text-gold">
                  +{formatMoney(rewardCash(WINTER.goalReward, snap))} · ⭐ {WINTER.goalReward.stars}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* the liveries */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("winter.liveries")}</div>
        {skinRow(WINTER.doorSkin, "winter.doorSkin")}
        {skinRow(WINTER.goalsSkin, "winter.goalsSkin")}
      </div>
    </div>
  );
}
