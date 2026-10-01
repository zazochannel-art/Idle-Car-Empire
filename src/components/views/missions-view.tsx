"use client";

import { MILESTONES } from "@/game/config/missions";
import { dailyProgress, metric, openMilestones } from "@/game/engine/progress";
import { formatDuration } from "@/game/format";
import { useGame } from "@/store/game-store";
import { MissionRow } from "../game/goals";
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
  const miles = openMilestones(state, 5);

  return (
    <div className="space-y-5">
      <ViewHeader icon="📋" title="Missions" subtitle="Clear goals, real rewards. Daily missions refresh at midnight and scale with your empire." />

      <section className="space-y-2">
        <SectionTitle title="Daily" subtitle={`New missions in ${formatDuration(untilMidnight())}`} />
        {state.missions.daily.map((m) => (
          <MissionRow
            key={m.id}
            title={m.title}
            value={dailyProgress(state, m, snap)}
            target={m.target}
            reward={m.reward}
            claimed={m.claimed}
            money={m.metric === "moneyEarned"}
            onClaim={() => claimDaily(m.id)}
          />
        ))}
      </section>

      <section className="space-y-2">
        <SectionTitle title="Milestones" subtitle={`${state.missions.milestonesClaimed.length}/${MILESTONES.length} completed`} />
        {miles.length === 0 && <p className="text-sm text-white/50">Every milestone completed. Legendary.</p>}
        {miles.map((m) => (
          <MissionRow
            key={m.id}
            title={m.title}
            value={metric(state, m.metric, snap)}
            target={m.target}
            reward={m.reward}
            money={m.metric === "moneyEarned"}
            onClaim={() => claimMilestone(m.id)}
          />
        ))}
      </section>
    </div>
  );
}
