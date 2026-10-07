"use client";

import { MILESTONES } from "@/game/config/missions";
import { claimableCount, dailyProgress, isMoneyMetric, metric, openMilestones } from "@/game/engine/progress";
import { formatDuration } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { MissionRow, MissionStrip } from "../game/goals";
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
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
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
              <div className="text-sm font-bold text-emerald-300">{ready} {t("mission.claim")}</div>
              <div className="text-[11px] text-white/55">Recompensele sunt gata de revendicat</div>
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
