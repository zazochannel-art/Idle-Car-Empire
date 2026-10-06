"use client";

import { FleetPanel } from "./expansion-cards";
import { MILESTONES } from "@/game/config/missions";
import { dailyProgress, isMoneyMetric, metric, openMilestones } from "@/game/engine/progress";
import { formatDuration } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { MissionRow } from "../game/goals";
import { EventCard, EventGoalCard } from "../game/event-chip";
import { ContractCard } from "./contract-card";
import { ClassicsPanel, SeasonCard, ShowCard, VipCard } from "./live-cards";
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
  const miles = openMilestones(state, 5);

  return (
    <div className="space-y-5">
      <ViewHeader icon="📋" title={t("nav.missions")} subtitle={t("missions.subtitle")} />
      <EventCard />
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
        <SectionTitle title={t("live.title")} subtitle={t("live.subtitle")} />
        <ShowCard />
        <SeasonCard />
        <ClassicsPanel />
        <FleetPanel />
      </section>

      <section className="space-y-2">
        <SectionTitle title={t("mission.daily")} subtitle={t("missions.newIn", { time: formatDuration(untilMidnight()) })} />
        {state.missions.daily.map((m) => (
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
