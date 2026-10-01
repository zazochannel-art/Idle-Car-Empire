"use client";

import { ArrowRight, CheckCircle2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MILESTONES } from "@/game/config/missions";
import { nextGoals } from "@/game/engine/insights";
import { dailyProgress, metric, openMilestones, rewardCash } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import type { MissionState, Reward } from "@/game/types";

/** "What's next" — always visible on the Empire screen. */
export function NextGoals() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { build, hireManager, buyFactory, setView } = useGame.getState();
  const goals = nextGoals(state, snap, 2);
  if (!goals.length) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {goals.map((g) => {
        const pct = g.cost ? Math.min(100, (state.cash / g.cost) * 100) : 100;
        const ready = !g.cost || state.cash >= g.cost;
        const eta = g.cost && !ready && snap.incomePerSec > 0 ? (g.cost - state.cash) / snap.incomePerSec : null;
        const onGo = () => {
          if (g.kind === "build") build("garage");
          else if (g.kind === "automate" && ready && g.target) hireManager(g.target as "mike", "garage");
          else if (g.kind === "factory" && ready && g.factory) buyFactory(g.factory);
          else if (g.kind === "prestige") setView("prestige");
          else if (g.kind === "manager") setView("managers");
          else if (g.kind === "car") document.getElementById(`factory-${g.factory}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        };
        return (
          <div
            key={g.kind + g.title}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-2xl p-3 ring-1",
              ready ? "bg-gold/[0.07] ring-gold/30" : "bg-white/[0.03] ring-white/[0.07]",
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{g.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                <Target className="size-3" /> Next goal
              </div>
              <div className="truncate text-sm font-semibold">{g.title}</div>
              <div className="truncate text-[11px] text-white/45">{g.detail}</div>
              {g.cost !== undefined && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={pct} className="h-1.5" indicatorClassName={ready ? "from-gold to-amber-300" : undefined} />
                  <span className="shrink-0 text-[10px] tabular-nums text-white/50">
                    {ready ? formatMoney(g.cost) : eta !== null ? `~${formatDuration(eta)}` : formatMoney(g.cost)}
                  </span>
                </div>
              )}
            </div>
            <Button size="icon" variant={ready ? "gold" : "secondary"} onClick={onGo} aria-label="Go">
              <ArrowRight />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function rewardLabel(r: Reward, snapCash: number): string {
  const parts: string[] = [];
  if (snapCash > 0) parts.push(formatMoney(snapCash));
  if (r.rp) parts.push(`${formatNumber(r.rp)} RP`);
  return parts.join(" + ");
}

export function MissionRow({
  title,
  value,
  target,
  reward,
  claimed,
  onClaim,
  money,
}: {
  title: string;
  value: number;
  target: number;
  reward: Reward;
  claimed?: boolean;
  onClaim: () => void;
  money?: boolean;
}) {
  const snap = useGame((g) => g.snap);
  const done = value >= target;
  const fmt = (n: number) => (money ? formatMoney(n) : formatNumber(Math.floor(n)));
  return (
    <div className={cn("flex items-center gap-3 rounded-xl p-3 ring-1", done && !claimed ? "bg-emerald-500/[0.07] ring-emerald-400/30" : "bg-white/[0.03] ring-white/[0.06]")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {claimed && <CheckCircle2 className="size-4 text-emerald-400" />}
          <span className={cn("truncate", claimed && "text-white/40 line-through")}>{title}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={(Math.min(value, target) / target) * 100} className="h-1.5" indicatorClassName={done ? "from-emerald-400 to-emerald-300" : undefined} />
          <span className="shrink-0 text-[10px] tabular-nums text-white/50">
            {fmt(Math.min(value, target))}/{fmt(target)}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-gold/80">Reward: {rewardLabel(reward, rewardCash(reward, snap))}</div>
      </div>
      {!claimed && (
        <Button size="sm" variant={done ? "gold" : "locked"} disabled={!done} onClick={onClaim}>
          Claim
        </Button>
      )}
    </div>
  );
}

/** Compact mission list for the Empire screen. */
export function MissionStrip() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { claimDaily, claimMilestone, setView } = useGame.getState();
  const daily = state.missions.daily.filter((m) => !m.claimed);
  const milestone = openMilestones(state, 1)[0];

  const items: { key: string; node: React.ReactNode }[] = [];
  if (milestone) {
    items.push({
      key: milestone.id,
      node: (
        <MissionRow
          title={milestone.title}
          value={metric(state, milestone.metric, snap)}
          target={milestone.target}
          reward={milestone.reward}
          money={milestone.metric === "moneyEarned"}
          onClaim={() => claimMilestone(milestone.id)}
        />
      ),
    });
  }
  const firstDaily: MissionState | undefined = daily.sort((a, b) => dailyProgress(state, b, snap) / b.target - dailyProgress(state, a, snap) / a.target)[0];
  if (firstDaily) {
    items.push({
      key: firstDaily.id,
      node: (
        <MissionRow
          title={`Daily · ${firstDaily.title}`}
          value={dailyProgress(state, firstDaily, snap)}
          target={firstDaily.target}
          reward={firstDaily.reward}
          money={firstDaily.metric === "moneyEarned"}
          onClaim={() => claimDaily(firstDaily.id)}
        />
      ),
    });
  }
  if (!items.length) return null;
  const left = MILESTONES.length - state.missions.milestonesClaimed.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Missions</h2>
        <button onClick={() => setView("missions")} className="text-xs text-sky-300 hover:underline">
          All missions ({left + daily.length})
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <div key={i.key} className="min-w-0">
            {i.node}
          </div>
        ))}
      </div>
    </div>
  );
}
