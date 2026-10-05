"use client";

import { territoryCenterTile } from "@/game/city/layout";
import { restockPlan } from "@/game/engine/materials";
import { RESTOCK_UNITS } from "@/game/config/economy";
import { ArrowRight, CheckCircle2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MILESTONES } from "@/game/config/missions";
import { nextGoals } from "@/game/engine/insights";
import { dailyProgress, metric, openMilestones, rewardCash } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import { CAR_BY_ID } from "@/game/config/cars";
import { MAKER } from "@/game/config/chain";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { MANAGER_BY_ID } from "@/game/config/managers";
import { type Goal } from "@/game/engine/insights";
import { plantFlow, plantName } from "../panels/plant-panel";
import type { Content } from "@/i18n/content";
import { useContent } from "@/i18n/content";
import type { MessageKey, Vars } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import type { MissionState, Reward } from "@/game/types";

/** Title and one-line detail for a goal, in the player's language. */
export function goalText(g: Goal, t: (k: MessageKey, v?: Vars) => string, n: Content): { title: string; detail: string } {
  switch (g.kind) {
    case "plant":
      return { title: t("goal.plant", { name: t(`structure.${g.plant}`) }), detail: plantFlow(g.plant, t) };
    case "site":
      return { title: t("goal.site", { name: t(`structure.${g.type}`) }), detail: t("goal.siteDetail", { time: formatDuration(g.left), pct: Math.floor(g.progress * 100) }) };
    case "upgrade": {
      const s = useGame.getState().state;
      return { title: t(g.what === "speed" ? "goal.speed" : "goal.level", { name: plantName(s, g.plot, t) }), detail: t("goal.upgradeDetail") };
    }
    case "materials":
      return { title: t("goal.materials", { m: t(`mat.${g.material}` as MessageKey) }), detail: t("goal.materialsDetail", { name: plantName(useGame.getState().state, g.plot, t), n: g.units }) };
    case "racing":
      return { title: t("goal.racing"), detail: t("goal.racingDetail") };
    case "raceCar":
      return { title: t("goal.raceCar"), detail: t("goal.raceCarDetail") };
    case "sendCar":
      return { title: t("goal.sendCar"), detail: t("goal.sendCarDetail") };
    case "firstRace":
      return { title: t("goal.firstRace"), detail: t("goal.firstRaceDetail") };
    case "warehouse":
      return { title: t("goal.warehouse", { name: plantName(useGame.getState().state, g.plot, t) }), detail: t("goal.warehouseDetail", { n: formatNumber(Math.max(0.1, Math.round(g.minutes * 10) / 10)) }) };
    case "autoBuy":
      return { title: t("goal.autoBuy"), detail: t("goal.autoBuyDetail", { n: g.plots.length }) };
    case "shortage":
      return {
        title: t("goal.shortage", { item: t(`item.${g.component}`) }),
        detail: t(g.what ? "goal.shortageFix" : "goal.shortageDetail", { name: t(`structure.${MAKER[g.component]}`) }),
      };
    case "dealer":
      return { title: t("goal.dealer"), detail: t("goal.dealerDetail") };
    case "dealerFull":
      return {
        title: t("goal.dealerFull", { n: formatNumber(g.perMin) }),
        detail: t(g.open ? "goal.dealerFullOpen" : "goal.dealerFullUpgrade", { name: n.dealer(DEALER_BY_ID[g.dealer]) }),
      };
    case "car":
      return { title: t("goal.car", { name: n.car(CAR_BY_ID[g.car]) }), detail: g.requirement ? t("goal.needs", { req: n.requirement(g.requirement) }) : "" };
    case "manager": {
      const m = MANAGER_BY_ID[g.manager];
      return { title: t("goal.manager", { name: m.name }), detail: n.role(m) };
    }
    case "prestige":
      return {
        title: g.stalled ? t("goal.prestigeStalled", { pct: formatPercent(g.gain) }) : t("goal.prestige", { n: g.points }),
        detail: g.stalled ? t("goal.prestigeStalledDetail", { n: g.points }) : t("goal.prestigeDetail", { pct: formatPercent(g.gain) }),
      };
    case "facility":
      return { title: t("goal.facility"), detail: t("goal.facilityDetail") };
    case "worker":
      return { title: t("goal.worker"), detail: t("goal.workerDetail", { n: g.idle }) };
    case "zone":
      return { title: t("goal.zone", { name: t(`zone.${g.zone}`) }), detail: t("goal.zoneDetail") };
    case "territory":
      return { title: t("goal.territory", { name: t(`territory.${g.territory}`) }), detail: t(`territoryDesc.${g.territory}`) };
    case "made":
      return { title: t("goal.made", { n: g.n, item: t(`item.${g.item}`) }), detail: t("goal.madeDetail", { have: Math.min(g.have, g.n), n: g.n, name: t(`structure.${g.plant}`) }) };
  }
}

/** What tapping a goal does. */
export function runGoal(g: Goal, ready: boolean) {
  const game = useGame.getState();
  const ui = useUi.getState();
  switch (g.kind) {
    case "plant":
      // the plot zoned for it: land details, ready to buy and build
      ui.selectPlot(g.plot);
      ui.setPreview({ plot: g.plot, type: g.plant });
      break;
    case "site":
      ui.selectPlot(g.plot);
      break;
    case "upgrade":
      if (ready) {
        if (g.what === "speed") game.plantSpeed(g.plot);
        else game.plantLevel(g.plot);
      }
      ui.selectPlot(g.plot);
      break;
    case "materials": {
      // one tap restocks this plant and every other one running low
      const st = game.snap.chain.plants[g.plot];
      if (ready && st && !game.restockLow()) game.buyPlan(g.plot, restockPlan(game.state, g.plot, st.need, RESTOCK_UNITS));
      ui.selectPlot(g.plot);
      break;
    }
    case "racing":
      if (ready) game.unlockRacing();
      ui.setView("racing");
      break;
    case "raceCar":
      ui.setView("racing");
      break;
    case "sendCar":
      if (ready) game.sendCar(g.car, "racing");
      ui.setView("racing");
      break;
    case "firstRace":
      ui.setRace({ phase: "prep", event: "amateurCup" });
      break;
    case "warehouse":
      if (ready) game.upgradeWarehouse(g.plot);
      ui.selectPlot(g.plot);
      break;
    case "autoBuy":
      for (const plot of g.plots) game.setAutoBuy(plot, true);
      ui.selectPlot(g.plots[0]);
      break;
    case "shortage":
      // one tap fixes it: buy the maker's cheapest upgrade
      if (ready && g.what) {
        if (g.what === "speed") game.plantSpeed(g.plot);
        else game.plantLevel(g.plot);
      }
      ui.selectPlot(g.plot);
      break;
    case "dealer":
      if (ready) game.buyDealer(g.dealer);
      ui.selectPlot(`d:${g.dealer}`);
      break;
    case "dealerFull":
      if (ready) {
        if (g.open) game.buyDealer(g.dealer);
        else game.upgradeDealer(g.dealer);
      }
      ui.selectPlot(`d:${g.dealer}`);
      break;
    case "car":
      if (g.plot) {
        if (ready && g.cost !== undefined) game.plantGrade(g.plot);
        ui.selectPlot(g.plot);
      } else ui.setView("research");
      break;
    case "prestige":
      ui.setView("prestige");
      break;
    case "manager":
      ui.setView("managers");
      break;
    case "facility":
    case "worker":
      ui.enterGarage(g.plot);
      break;
    case "zone":
      if (ready) game.unlockZone(g.zone);
      ui.selectZone(g.zone);
      break;
    case "territory": {
      if (ready) game.unlockTerritory(g.territory);
      const c = territoryCenterTile(g.territory);
      ui.map({ kind: "look", x: c.x, y: c.y });
      break;
    }
    case "made":
      if (g.plot) ui.selectPlot(g.plot);
      break;
  }
}

/** "What's next" — always visible on the Empire screen. */
export function NextGoals() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const goals = nextGoals(state, snap, 2);
  const { t, lang } = useT();
  const n = useContent(lang);
  if (!goals.length) return null;

  return (
    <div className="grid gap-2 @sm:grid-cols-2">
      {goals.map((g) => {
        // a new plant is "ready" once its price and the materials to keep the others running are there
        const reserve = g.kind === "plant" ? g.reserve : 0;
        const cost = "cost" in g && g.cost !== undefined ? g.cost + reserve : undefined;
        const pct = g.kind === "made" ? Math.min(100, (g.have / g.n) * 100) : g.kind === "site" ? g.progress * 100 : cost ? Math.min(100, (state.cash / cost) * 100) : 100;
        const ready = !cost || state.cash >= cost;
        const keep = !ready && reserve > 0 && cost !== undefined && state.cash >= cost - reserve;
        const eta = cost && !ready && snap.incomePerSec > 0 && (cost - state.cash) / snap.incomePerSec < 86400 * 30 ? (cost - state.cash) / snap.incomePerSec : null;
        const text = goalText(g, t, n);
        const onGo = () => runGoal(g, ready);
        return (
          <div
            key={`${g.kind}:${"plot" in g ? g.plot : ""}`}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-2xl p-3 ring-1",
              ready ? "bg-gold/[0.07] ring-gold/30" : "bg-white/[0.03] ring-white/[0.07]",
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{g.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                <Target className="size-3" /> {t("goal.next")}
              </div>
              <div className="truncate text-sm font-semibold">{text.title}</div>
              <div className={cn("truncate text-[11px]", keep ? "text-amber-300/80" : "text-white/45")}>{keep ? t("goal.keepCash", { money: formatMoney(reserve) }) : text.detail}</div>
              {g.kind === "made" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={pct} className="h-1.5" />
                  <span className="shrink-0 text-[10px] tabular-nums text-white/50">
                    {formatNumber(Math.min(g.have, g.n))}/{formatNumber(g.n)}
                  </span>
                </div>
              )}
              {cost !== undefined && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={pct} className="h-1.5" indicatorClassName={ready ? "from-gold to-amber-300" : undefined} />
                  <span className="shrink-0 text-[10px] tabular-nums text-white/50">
                    {ready ? formatMoney(cost) : eta !== null ? `~${formatDuration(eta)}` : formatMoney(cost)}
                  </span>
                </div>
              )}
            </div>
            <Button size="icon" variant={ready ? "gold" : "secondary"} onClick={onGo} aria-label={t("common.go")}>
              <ArrowRight />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function rewardLabel(r: Reward, snapCash: number, rpUnit = "RP", boostLabel = (pct: string) => `+${pct} income forever`): string {
  const parts: string[] = [];
  if (snapCash > 0) parts.push(formatMoney(snapCash));
  if (r.rp) parts.push(`${formatNumber(r.rp)} ${rpUnit}`);
  if (r.stars) parts.push(`⭐ ${formatNumber(r.stars)}`);
  if (r.boost) parts.push(boostLabel(formatPercent(r.boost)));
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
  const { t } = useT();
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
        <div className="mt-1 text-[11px] text-gold/80">{t("mission.reward", { reward: rewardLabel(reward, rewardCash(reward, snap), t("unit.rp"), (pct) => t("mission.boost", { pct })) })}</div>
      </div>
      {!claimed && (
        <Button size="sm" variant={done ? "gold" : "locked"} disabled={!done} onClick={onClaim}>
          {t("mission.claim")}
        </Button>
      )}
    </div>
  );
}

/** Compact mission list for the Empire screen. */
export function MissionStrip() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { claimDaily, claimMilestone } = useGame.getState();
  const setView = useUi((u) => u.setView);
  const daily = state.missions.daily.filter((m) => !m.claimed);
  const milestone = openMilestones(state, 1)[0];
  const { t, lang } = useT();
  const n = useContent(lang);

  const items: { key: string; node: React.ReactNode }[] = [];
  if (milestone) {
    items.push({
      key: milestone.id,
      node: (
        <MissionRow
          title={n.milestone(milestone)}
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
          title={`${t("mission.daily")} · ${n.daily(firstDaily)}`}
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
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{t("nav.missions")}</h2>
        <button onClick={() => setView("missions")} className="text-xs text-sky-300 hover:underline">
          {t("mission.all", { n: left + daily.length })}
        </button>
      </div>
      <div className="grid gap-2 @sm:grid-cols-2">
        {items.map((i) => (
          <div key={i.key} className="min-w-0">
            {i.node}
          </div>
        ))}
      </div>
    </div>
  );
}
