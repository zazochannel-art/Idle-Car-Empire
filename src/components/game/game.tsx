"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Crown, Factory, FlaskConical, Hammer, ListChecks, Map as MapIcon, Store, TrendingUp, Users, Warehouse } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Progress } from "@/components/ui/progress";
import { MANAGERS } from "@/game/config/managers";
import { RESEARCH } from "@/game/config/research";
import { ZONE_BY_ID } from "@/game/config/city";
import { canResearch, isManagerUnlocked } from "@/game/engine/actions";
import { buildingUpgradeCost } from "@/game/engine/city";
import { levelCost } from "@/game/engine/chain";
import { nextGoals } from "@/game/engine/insights";
import { canPrestige } from "@/game/engine/prestige";
import { claimableCount } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi, type View } from "@/store/ui-store";
import { GarageView } from "../garage/garage-view";
import { EmpireMap } from "../map/empire-map";
import { BuildPanel, GaragesView, MechanicsSummary, MenuPanel, PlotPanel, UpgradePanel, ZonePanel, plotTitle } from "../panels/map-panels";
import { Sheet } from "../panels/sheet";
import { AchievementsView } from "../views/achievements-view";
import { CarsView } from "../views/cars-view";
import { LogisticsView } from "../views/logistics-view";
import { DealersView } from "../views/dealers-view";
import { ProductionView } from "../views/production-view";
import { ManagersView } from "../views/managers-view";
import { MissionsView } from "../views/missions-view";
import { PrestigeView } from "../views/prestige-view";
import { ResearchView } from "../views/research-view";
import { StatsView } from "../views/stats-view";
import { Coach } from "./coach";
import { goalText, runGoal } from "./goals";
import { Hud } from "./hud";
import { OfflineDialog, PrestigeOverlay, SettingsDialog, Toasts } from "./overlays";
import { FirstCarOverlay } from "./first-car";
import { PlantFloor } from "../plant/plant-floor";

type Icon = React.ComponentType<{ className?: string }>;

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

function useBadges() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const idle = Object.values(snap.city.garages).reduce((a, g) => a + Math.max(0, g.workstations - g.staffed), 0);
  const upgrades = Object.entries(state.city.buildings).filter(([id, b]) => {
    const c = b.plant ? levelCost(b, snap.gm) : buildingUpgradeCost(state, id);
    return c !== null && c <= state.cash;
  }).length;
  return {
    research: RESEARCH.filter((r) => canResearch(state, r.id) && state.rp >= r.cost).length,
    managers: MANAGERS.filter((m) => !state.managers[m.id].hired && isManagerUnlocked(state, m.id) && state.cash >= m.cost).length + (idle > 0 ? 1 : 0),
    missions: claimableCount(state, snap),
    prestige: canPrestige(state) ? 1 : 0,
    upgrade: upgrades,
  };
}

export function Game() {
  const ready = useGame((g) => g.ready);
  const init = useGame((g) => g.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return <Splash />;
  return <Shell />;
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <motion.div animate={{ x: [-30, 30, -30] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} className="text-6xl">
        🏎️
      </motion.div>
      <div className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Idle Car Empire</div>
    </div>
  );
}

function Shell() {
  const view = useUi((u) => u.view);
  const plot = useUi((u) => u.plot);
  const zone = useUi((u) => u.zone);
  const garage = useUi((u) => u.garage);
  const floor = useUi((u) => u.floor);
  const showcase = useUi((u) => !!u.showcase);
  const closeAll = useUi((u) => u.closeAll);
  const state = useGame((g) => g.state);
  const [settings, setSettings] = useState(false);
  const desktop = useDesktop();
  const { t, lang } = useT();
  const n = useContent(lang);

  const open = !!(view || plot || zone);

  useEffect(() => {
    if (garage || floor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [garage, floor, closeAll]);
  const panelOffset = desktop ? { x: 470, y: 0 } : { x: 0, y: typeof window !== "undefined" ? window.innerHeight * 0.55 : 400 };

  let title: React.ReactNode = null;
  let icon: React.ReactNode = null;
  let body: React.ReactNode = null;
  let key = "none";
  if (plot) {
    const h = plotTitle(plot, t, n, state);
    title = h.title;
    icon = h.icon;
    body = <PlotPanel id={plot} />;
    key = `plot:${plot}`;
  } else if (zone) {
    title = `${t("map.stage", { n: ZONE_BY_ID[zone].stage })} · ${t(`zone.${zone}`)}`;
    icon = "🗺️";
    body = <ZonePanel id={zone} />;
    key = `zone:${zone}`;
  } else if (view) {
    title = viewTitle(view, t);
    body = <ViewSwitch view={view} onSettings={() => setSettings(true)} />;
    key = `view:${view}`;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink">
      <EmpireMap active={!garage && !floor} panelOffset={panelOffset} />
      <Hud onSettings={() => setSettings(true)} />
      <LeftRail />
      {/* on phones the showroom card sits where the goal tracker is */}
      {!open && !(showcase && !desktop) && <GoalTracker />}
      {!open && !showcase && <Coach />}
      <BottomDock />

      <Sheet open={open} onClose={closeAll} title={title} icon={icon} sheetKey={desktop ? "panel" : key}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>
            {body}
          </motion.div>
        </AnimatePresence>
      </Sheet>

      <AnimatePresence>{garage && <GarageView key={garage} plotId={garage} />}</AnimatePresence>
      <AnimatePresence>{floor && <PlantFloor key={floor} plotId={floor} />}</AnimatePresence>
      <FirstCarOverlay />

      <Toasts />
      <OfflineDialog />
      <PrestigeOverlay />
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </div>
  );
}

function viewTitle(v: View, t: ReturnType<typeof useT>["t"]): string {
  switch (v) {
    case "garages":
      return t("map.nav.garages");
    case "build":
      return t("bar.build");
    case "upgrade":
      return t("bar.upgrade");
    case "menu":
      return t("bar.empire");
    case "empire":
      return t("map.nav.factories");
    default:
      return t(`nav.${v}`);
  }
}

function ViewSwitch({ view, onSettings }: { view: View; onSettings: () => void }) {
  switch (view) {
    case "garages":
      return <GaragesView />;
    case "build":
      return <BuildPanel />;
    case "upgrade":
      return <UpgradePanel />;
    case "menu":
      return <MenuPanel onSettings={onSettings} />;
    case "empire":
      return <ProductionView />;
    case "dealers":
      return <DealersView />;
    case "logistics":
      return <LogisticsView />;
    case "cars":
      return <CarsView />;
    case "research":
      return <ResearchView />;
    case "managers":
      return (
        <>
          <MechanicsSummary />
          <ManagersView />
        </>
      );
    case "missions":
      return <MissionsView />;
    case "achievements":
      return <AchievementsView />;
    case "stats":
      return <StatsView />;
    case "prestige":
      return <PrestigeView />;
  }
}

const RAIL: { id: "map" | View; icon: Icon; label: "map.nav.map" | "map.nav.garages" | "map.nav.factories" | "map.nav.dealers" | "map.nav.research" }[] = [
  { id: "map", icon: MapIcon, label: "map.nav.map" },
  { id: "garages", icon: Warehouse, label: "map.nav.garages" },
  { id: "empire", icon: Factory, label: "map.nav.factories" },
  { id: "dealers", icon: Store, label: "map.nav.dealers" },
  { id: "research", icon: FlaskConical, label: "map.nav.research" },
];

function LeftRail() {
  const view = useUi((u) => u.view);
  const plot = useUi((u) => u.plot);
  const zone = useUi((u) => u.zone);
  const { setView, closeAll, map } = useUi.getState();
  const badges = useBadges();
  const { t } = useT();
  const nothing = !view && !plot && !zone;
  return (
    <nav className="absolute left-[calc(env(safe-area-inset-left)+0.5rem)] top-[6.75rem] z-20 flex flex-col gap-1 rounded-2xl border border-white/10 bg-ink/75 p-1 backdrop-blur-xl md:left-[calc(env(safe-area-inset-left)+0.75rem)] md:top-[5.5rem]">
      {RAIL.map((r) => {
        const active = r.id === "map" ? nothing : view === r.id;
        const badge = r.id === "research" ? badges.research : 0;
        return (
          <button
            key={r.id}
            onClick={() => {
              if (r.id === "map") {
                closeAll();
                map({ kind: "home" });
              } else setView(view === r.id ? null : r.id);
            }}
            className={cn(
              "relative flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[9px] font-bold uppercase tracking-wide transition md:w-[4.5rem] md:text-[10px]",
              active ? "bg-electric/25 text-white ring-1 ring-electric/50" : "text-white/55 hover:bg-white/5 hover:text-white",
            )}
            aria-label={t(r.label)}
          >
            <r.icon className={cn("size-5", active && "text-sky-300")} />
            <span className="hidden md:block">{t(r.label)}</span>
            <NavBadge n={badge} className="absolute right-0.5 top-0.5" />
          </button>
        );
      })}
    </nav>
  );
}

const DOCK: { id: View; icon: Icon; label: "bar.build" | "bar.upgrade" | "bar.missions" | "bar.employees" | "bar.empire"; badge: "upgrade" | "missions" | "managers" | "prestige" | null }[] = [
  { id: "build", icon: Hammer, label: "bar.build", badge: null },
  { id: "upgrade", icon: TrendingUp, label: "bar.upgrade", badge: "upgrade" },
  { id: "missions", icon: ListChecks, label: "bar.missions", badge: "missions" },
  { id: "managers", icon: Users, label: "bar.employees", badge: "managers" },
  { id: "menu", icon: Crown, label: "bar.empire", badge: "prestige" },
];

function BottomDock() {
  const view = useUi((u) => u.view);
  const setView = useUi((u) => u.setView);
  const badges = useBadges();
  const { t } = useT();
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-[calc(env(safe-area-inset-left)+0.5rem)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className="grid w-full max-w-xl grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-ink/85 p-1.5 shadow-[0_-10px_40px_-12px_rgba(0,0,0,.9)] backdrop-blur-xl">
        {DOCK.map((d) => {
          const active = view === d.id;
          const badge = d.badge ? badges[d.badge] : 0;
          return (
            <button
              key={d.id}
              onClick={() => setView(active ? null : d.id)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-black uppercase tracking-wide transition",
                active ? "bg-electric/25 text-white ring-1 ring-electric/50" : d.id === "build" ? "bg-gold/10 text-gold ring-1 ring-gold/30 hover:bg-gold/15" : "text-white/60 hover:bg-white/5",
              )}
            >
              <d.icon className="size-5" />
              {t(d.label)}
              <NavBadge n={badge} gold={d.badge === "prestige"} className="absolute right-1.5 top-1" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The current goal, floating above the dock like a quest tracker. */
function GoalTracker() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { t, lang } = useT();
  const n = useContent(lang);
  const goal = nextGoals(state, snap, 1)[0];
  if (!goal) return null;
  const cost = "cost" in goal ? goal.cost : undefined;
  const ready = !cost || state.cash >= cost;
  const pct = goal.kind === "made" ? Math.min(100, (goal.have / goal.n) * 100) : cost ? Math.min(100, (state.cash / cost) * 100) : 100;
  const eta = cost && !ready && snap.incomePerSec > 0 && (cost - state.cash) / snap.incomePerSec < 86400 * 30 ? (cost - state.cash) / snap.incomePerSec : null;
  const text = goalText(goal, t, n);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-20 flex justify-center px-3">
      <button
        onClick={() => runGoal(goal, ready)}
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border p-2.5 text-left shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)] backdrop-blur-xl transition hover:brightness-110",
          ready ? "border-gold/40 bg-[#2a2210]/85" : "border-white/10 bg-ink/80",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{goal.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">{t("goal.next")}</span>
          <span className="block truncate text-sm font-bold">{text.title}</span>
          {goal.kind === "made" ? (
            <span className="mt-1 flex items-center gap-2">
              <Progress value={pct} className="h-1.5" />
              <span className="shrink-0 text-[10px] tabular-nums text-white/55">
                {formatNumber(Math.min(goal.have, goal.n))}/{formatNumber(goal.n)}
              </span>
            </span>
          ) : cost !== undefined ? (
            <span className="mt-1 flex items-center gap-2">
              <Progress value={pct} className="h-1.5" indicatorClassName={ready ? "from-gold to-amber-300" : undefined} />
              <span className="shrink-0 text-[10px] tabular-nums text-white/55">{ready ? formatMoney(cost) : eta !== null ? `~${formatDuration(eta)}` : formatMoney(cost)}</span>
            </span>
          ) : (
            <span className="block truncate text-[11px] text-white/50">{text.detail}</span>
          )}
        </span>
        <ArrowRight className={cn("size-5 shrink-0", ready ? "text-gold" : "text-white/40")} />
      </button>
    </div>
  );
}

function NavBadge({ n, gold, className }: { n?: number; gold?: boolean; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums", gold ? "bg-gold text-black" : "bg-electric text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  );
}
