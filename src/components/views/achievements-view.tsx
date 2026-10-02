"use client";

import { Progress } from "@/components/ui/progress";
import { ACHIEVEMENTS, ACHIEVEMENT_INCOME_BONUS } from "@/game/config/achievements";
import { conditionProgress } from "@/game/engine/progress";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import { cn } from "@/lib/utils";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

export function AchievementsView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const count = state.achievements.length;
  const { t, lang } = useT();
  const n = useContent(lang);

  return (
    <div className="space-y-4">
      <ViewHeader
        icon="🏆"
        title={t("nav.achievements")}
        subtitle={t("achievements.subtitle", { n: count, total: ACHIEVEMENTS.length, each: formatPercent(ACHIEVEMENT_INCOME_BONUS), now: formatPercent(count * ACHIEVEMENT_INCOME_BONUS) })}
      >
        <Progress value={(count / ACHIEVEMENTS.length) * 100} indicatorClassName="from-gold to-amber-300" />
      </ViewHeader>
      <div className="grid gap-2 @sm:grid-cols-2 @3xl:grid-cols-3">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = state.achievements.includes(a.id);
          const p = conditionProgress(state, a.condition, snap);
          const isMoney = (a.condition.type === "metric" && a.condition.metric === "moneyEarned") || a.condition.type === "income";
          const fmt = (n: number) => (isMoney ? formatMoney(n) : formatNumber(Math.floor(n)));
          const reward = [a.reward.cash ? formatMoney(a.reward.cash) : null, a.reward.rp ? `${formatNumber(a.reward.rp)} ${t("unit.rp")}` : null].filter(Boolean).join(" + ");
          return (
            <div
              key={a.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl p-3 ring-1",
                unlocked ? "bg-gradient-to-br from-gold/[0.12] to-transparent ring-gold/30" : "bg-white/[0.02] ring-white/[0.06]",
              )}
            >
              <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl", unlocked ? "bg-gold/15" : "bg-white/5 grayscale opacity-50")}>{a.icon}</div>
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-semibold", unlocked && "text-gold")}>{n.achievement(a)}</div>
                <div className="text-xs text-white/50">{n.achievementDesc(a)}</div>
                {unlocked ? (
                  <div className="mt-0.5 text-[11px] text-white/40">{t("mission.reward", { reward })}</div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress value={(Math.min(p.value, p.target) / p.target) * 100} className="h-1" />
                    <span className="shrink-0 text-[10px] tabular-nums text-white/40">
                      {fmt(Math.min(p.value, p.target))}/{fmt(p.target)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
