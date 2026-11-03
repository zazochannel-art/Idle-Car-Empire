"use client";

import { DAILY_COUNT, MILESTONES } from "@/game/config/missions";
import { chestStreakToday, claimableCount, dailyChestReady, dailyChestReward, dailyProgress, dateKey, isMoneyMetric, metric, openMilestones, rewardCash } from "@/game/engine/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { MissionRow, MissionStrip, rewardLabel } from "../game/goals";
import { EventCard, EventGoalCard } from "../game/event-chip";
import { ContractCard } from "./contract-card";
import { VipCard } from "./live-cards";
import { SectionTitle, ViewHeader } from "./section-title";

function untilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return (next.getTime() - now.getTime()) / 1000;
}

export function MissionsView() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { claimDaily, claimMilestone } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const miles = openMilestones(state, 5).sort((a, b) => Number(metric(state, b.metric, snap) >= b.target) - Number(metric(state, a.metric, snap) >= a.target));
  const daily = [...state.missions.daily].sort((a, b) => Number(dailyProgress(state, b, snap) >= b.target) - Number(dailyProgress(state, a, snap) >= a.target));
  const ready = claimableCount(state, snap);

  return (
    <div className="space-y-5">
      <ViewHeader icon="📋" title={t("nav.missions")} subtitle={t("missions.subtitle")}>
        {ready > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-500/10 p-2.5 ring-1 ring-emerald-400/25">
            <div className="min-w-0">
              <div className="text-sm font-bold text-emerald-300">{t("missions.ready", { n: ready })}</div>
              <div className="text-[11px] text-white/55">{t("missions.readyHint")}</div>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-black text-white">{ready}</span>
          </div>
        ) : null}
      </ViewHeader>
      <EventCard />
      <MissionStrip />
      <EventGoalCard />

      <section className="space-y-2">
        <SectionTitle title={t("contract.title")} subtitle={t("contract.subtitle", { n: state.contracts.done })} />
        <ContractCard />
      </section>

      <section className="space-y-2">
        <SectionTitle title={t("vip.title")} subtitle={t("vip.subtitle", { n: state.vip.done })} />
        <VipCard />
      </section>

      <section className="space-y-2">
        <SectionTitle title={t("mission.daily")} subtitle={t("missions.newIn", { time: formatDuration(untilMidnight()) })} />
        {daily.map((m) => (
          <MissionRow
            key={m.id}
            title={n.daily(m)}
            value={dailyProgress(state, m, snap)}
            target={m.target}
            reward={m.reward}
            claimed={m.claimed}
            money={isMoneyMetric(m.metric)}
            onClaim={() => claimDaily(m.id)}
          />
        ))}
        <DailyChest />
      </section>

      <section className="space-y-2">
        <SectionTitle title={t("missions.milestones")} subtitle={t("missions.completed", { n: state.missions.milestonesClaimed.length, total: MILESTONES.length })} />
        {miles.length === 0 && <p className="text-sm text-white/50">{t("missions.allDone")}</p>}
        {miles.map((m) => (
          <MissionRow
            key={m.id}
            title={n.milestone(m)}
            value={metric(state, m.metric, snap)}
            target={m.target}
            reward={m.reward}
            money={isMoneyMetric(m.metric)}
            onClaim={() => claimMilestone(m.id)}
          />
        ))}
      </section>
    </div>
  );
}

/** The chest at the end of the day's missions: opened once they are all taken, bigger each day in a row. */
function DailyChest() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { t } = useT();
  // the game's clock (it moves on every tick)
  const now = state.lastActiveAt;
  const daily = state.missions.daily;
  if (daily.length === 0) return null;
  const taken = daily.filter((m) => m.claimed).length;
  const ready = dailyChestReady(state, now);
  const opened = state.missions.chestDate === dateKey(now);
  const streak = chestStreakToday(state, now);
  const reward = dailyChestReward(state, now, snap);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl p-3 ring-1",
        ready ? "bg-amber-500/10 ring-amber-400/40" : opened ? "bg-white/[0.02] ring-white/[0.05]" : "bg-white/[0.03] ring-white/[0.06]",
      )}
    >
      <span className={cn("text-3xl", ready && "animate-bounce", opened && "opacity-40 grayscale")}>🧰</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
          <span>{t("chest.title")}</span>
          {streak > 1 || opened ? <span className="text-[11px] font-semibold text-orange-300">{t("chest.streak", { n: streak })}</span> : null}
        </div>
        <div className="text-[11px] text-white/60">
          {opened ? t("chest.opened") : ready ? t("chest.ready") : t("chest.locked", { n: taken, total: Math.max(daily.length, DAILY_COUNT) })}
        </div>
        {!opened && (
          <div className="mt-1 text-[11px] text-gold/80">{t("mission.reward", { reward: rewardLabel(reward, rewardCash(reward, snap), t("unit.rp"), (pct) => t("mission.boost", { pct })) })}</div>
        )}
        <div className="mt-0.5 text-[10px] text-white/40">{t("chest.streakHint")}</div>
      </div>
      {!opened && (
        <Button size="sm" variant={ready ? "gold" : "locked"} disabled={!ready} onClick={() => useGame.getState().claimDailyChest()}>
          {t("chest.open")}
        </Button>
      )}
    </div>
  );
}
