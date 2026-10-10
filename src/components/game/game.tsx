"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Briefcase, Car, Crown, Factory, Flag, Hammer, ListChecks, Map as MapIcon, TrendingUp, Users } from "lucide-react";
import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { Progress } from "@/components/ui/progress";
import { MANAGERS } from "@/game/config/managers";
import { RESEARCH } from "@/game/config/research";
import { ZONE_BY_ID } from "@/game/config/city";
import { canResearch, isManagerUnlocked } from "@/game/engine/actions";
import { buildingUpgradeCost } from "@/game/engine/city";
import { levelCost } from "@/game/engine/chain";
import { nextGoals, type Goal } from "@/game/engine/insights";
import { canPrestige } from "@/game/engine/prestige";
import { claimableCount } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { useContent, type Content } from "@/i18n/content";
import { useShallow } from "zustand/react/shallow";
import type { GameState } from "@/game/types";
import type { EconomySnapshot } from "@/game/engine/economy";
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
import { EconomyView } from "../views/economy-view";
import { RacingView } from "../views/racing-view";
import { RaceViewer } from "../racing/race-viewer";
import { Coach } from "./coach";
import { FeedbackBridge } from "./feedback-bridge";
import { ServiceWorker } from "./service-worker";
import { TransferImport } from "./transfer-import";
import { LoginDialog } from "./login-dialog";
import { goalText, runGoal } from "./goals";
import { Hud } from "./hud";
import { OfflineDialog, PrestigeOverlay, SettingsDialog, Toasts } from "./overlays";
import { FirstCarOverlay } from "./first-car";
import { Onboarding } from "./onboarding";
import { UnlockCard } from "./unlock-card";
import { RecallDialog } from "./recall-dialog";
import { PoachDialog } from "../views/expansion-cards";
import { PlantFloor } from "../plant/plant-floor";
import { FactoryInterior, HAS_INTERIOR } from "../plant/interior/factory-interior";

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

function badgeCounts(state: ReturnType<typeof useGame.getState>["state"], snap: ReturnType<typeof useGame.getState>["snap"]) {
  const idle = Object.values(snap.city.garages).reduce((a, g) => a + Math.max(0, g.workstations - g.staffed), 0);
  const upgrades = Object.entries(state.city.buildings).filter(([id, b]) => {
    const cost = b.plant ? levelCost(b, snap.gm) : buildingUpgradeCost(state, id);
    return cost !== null && cost <= state.cash;
  }).length;
  return {
    research: RESEARCH.filter((r) => canResearch(state, r.id) && state.rp >= r.cost).length,
    managers: MANAGERS.filter((m) => !state.managers[m.id].hired && isManagerUnlocked(state, m.id) && state.cash >= m.cost).length + (idle > 0 ? 1 : 0),
    missions: claimableCount(state, snap),
    prestige: canPrestige(state) ? 1 : 0,
    upgrade: upgrades,
  };
}

function useBadges() {
  // The selector still evaluates cheaply on each simulation commit, but the
  // component rerenders only when one of the five visible badge counts changes.
  const badgeKey = useGame((g) => {
    const b = badgeCounts(g.state, g.snap);
    return `${b.research}|${b.managers}|${b.missions}|${b.prestige}|${b.upgrade}`;
  });
  void badgeKey;
  return badgeCounts(useGame.getState().state, useGame.getState().snap);
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
  const tutorial = useUi((u) => u.tutorial);
  const closeAll = useUi((u) => u.closeAll);
  // Subscribe only to the selected plot's title-relevant structure. This keeps the
  // shell off the 100ms tick while still updating a title after a build/upgrade.
  const plotTitleKey = useGame((g) => {
    if (!plot) return "";
    const s = g.state;
    const b = s.city.buildings[plot];
    const site = s.city.sites[plot];
    return JSON.stringify({
      type: b?.type ?? null,
      level: b?.level ?? null,
      garage: b?.garage?.no ?? null,
      spec: b?.garage?.spec ?? null,
      plant: !!b?.plant,
      site: site?.type ?? null,
      land: s.city.land.includes(plot),
      titleLang: s.settings.lang,
    });
  });
  void plotTitleKey;
  // plotTitleKey subscribes to every field consumed by plotTitle; read the matching snapshot after it changes.
  const state = plot ? useGame.getState().state : null;
  const [settings, setSettings] = useState(false);
  const openSettings = () => setSettings(true);
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
    const h = plotTitle(plot, t, n, state!);
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
    body = <ViewSwitch view={view} onSettings={openSettings} />;
    key = `view:${view}`;
  }

  return (
    <div className="game-shell fixed inset-0 overflow-hidden bg-ink">
      <EmpireMap active={!garage && !floor} panelOffset={panelOffset} />
      <Hud onSettings={() => setSettings(true)} />
      <LeftRail />
      {/* on phones the showroom card sits where the goal tracker is */}
      {!open && !(showcase && !desktop) && <GoalTracker />}
      {!open && !showcase && !tutorial && <Coach />}
      <BottomDock />

      <Sheet open={open} onClose={closeAll} title={title} icon={icon} sheetKey={desktop ? "panel" : key}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>
            {body}
          </motion.div>
        </AnimatePresence>
      </Sheet>

      <AnimatePresence>{garage && <GarageView key={garage} plotId={garage} />}</AnimatePresence>
      <AnimatePresence>
        {floor && (HAS_INTERIOR.has(useGame.getState().state.city.buildings[floor]?.type ?? "") ? <FactoryInterior key={floor} plotId={floor} /> : <PlantFloor key={floor} plotId={floor} />)}
      </AnimatePresence>
      <FirstCarOverlay />
      <Onboarding />
      <UnlockCard />
      <RecallDialog />
      <PoachDialog />

      <Toasts />
      <FeedbackBridge />
      <ServiceWorker />
      <TransferImport />
      <LoginDialog />
      <OfflineDialog />
      <PrestigeOverlay />
      <RaceViewer />
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

const ViewSwitch = memo(function ViewSwitch({ view, onSettings }: { view: View; onSettings: () => void }) {
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
    case "economy":
      return <EconomyView />;
    case "racing":
      return <RacingView />;
    case "prestige":
      return <PrestigeView />;
  }
});

/**
 * The four high-level navigation groups. Individual action buttons open
 * their own dedicated screen; no secondary navigation tabs are injected
 * into the opened sheet.
 */
export type PillarId = "empire" | "cars" | "racing" | "business";
export const PILLARS: { id: PillarId; icon: Icon; views: View[] }[] = [
  { id: "empire", icon: Factory, views: ["empire", "garages", "logistics", "research", "managers", "prestige"] },
  { id: "cars", icon: Car, views: ["cars"] },
  { id: "racing", icon: Flag, views: ["racing"] },
  { id: "business", icon: Briefcase, views: ["dealers", "economy", "missions", "stats", "achievements"] },
];
export const pillarOf = (v: View | null) => (v ? (PILLARS.find((p) => p.views.includes(v))?.id ?? null) : null);

function LeftRail() {
  const view = useUi((u) => u.view);
  const plot = useUi((u) => u.plot);
  const zone = useUi((u) => u.zone);
  const { setView, closeAll, map } = useUi.getState();
  const badges = useBadges();
  const { t } = useT();
  const nothing = !view && !plot && !zone;
  const current = pillarOf(view);
  const seen = useUi((u) => u.seen);
  const items: { id: "map" | PillarId; icon: Icon; badge: number }[] = [
    { id: "map", icon: MapIcon, badge: 0 },
    ...PILLARS.map((p) => ({ id: p.id, icon: p.icon, badge: p.id === "empire" ? badges.research : p.id === "business" ? badges.missions : 0 })),
  ];
  return (
    <nav className="hidden absolute left-[calc(env(safe-area-inset-left)+0.5rem)] top-[6.75rem] md:flex z-20 flex flex-col gap-1 rounded-xl hud-bar p-1 md:left-[calc(env(safe-area-inset-left)+0.75rem)] md:top-[5.5rem]">
      {items.map((r) => {
        const active = r.id === "map" ? nothing : current === r.id;
        const label = r.id === "map" ? t("map.nav.map") : t(`pillar.${r.id}`);
        return (
          <button
            key={r.id}
            onClick={() => {
              if (r.id === "map") {
                closeAll();
                map({ kind: "home" });
                return;
              }
              const pillar = PILLARS.find((p) => p.id === r.id)!;
              // a pillar reopens on the screen last seen in it
              const last = [...seen].reverse().find((v) => pillar.views.includes(v));
              setView(active ? null : (last ?? pillar.views[0]));
            }}
            className={cn(
              "race-type relative flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-2 text-[11px] transition md:w-[4.5rem] md:text-[12px]",
              active ? "bg-electric text-white shadow-[0_3px_0_0_#1747b8]" : "text-white hover:bg-white/10",
            )}
            aria-label={label}
          >
            <r.icon className="size-5 stroke-[2.5]" />
            <span className="hidden md:block">{label}</span>
            <NavBadge n={r.badge} className="absolute right-0.5 top-0.5" />
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
    <nav className="absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[env(safe-area-inset-bottom)] lg:px-3 lg:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      {/* full-width slanted tabs, as on the racing game's bottom bar */}
      <div className="grid w-full max-w-2xl grid-cols-5 gap-[3px] overflow-hidden bg-[#232326] px-1 pt-1 pb-1 shadow-[0_-8px_30px_-12px_rgba(0,0,0,.8)] lg:rounded-xl">
        {DOCK.map((d) => {
          const active = view === d.id;
          const badge = d.badge ? badges[d.badge] : 0;
          return (
            <button
              key={d.id}
              onClick={() => setView(active ? null : d.id)}
              className={cn(
                "race-type relative flex -skew-x-[9deg] flex-col items-center gap-0.5 rounded-md py-2 text-[13px] leading-none transition active:translate-y-[2px]",
                active
                  ? "bg-electric text-white shadow-[0_3px_0_0_#1747b8]"
                  : d.id === "build"
                    ? "bg-gold text-[#2a1d00] shadow-[0_3px_0_0_#c48300]"
                    : "bg-[#5a5a5f] text-white shadow-[0_3px_0_0_#2f2f33] hover:bg-[#646469]",
              )}
            >
              <span className="flex skew-x-[9deg] flex-col items-center gap-0.5">
                <d.icon className="size-5 stroke-[2.5]" />
                {t(d.label)}
              </span>
              <NavBadge n={badge} gold={d.badge === "prestige"} className="absolute right-1 top-0.5 skew-x-[9deg]" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The current goal, floating above the dock like a quest tracker. */
function GoalTracker() {
  const { t, lang } = useT();
  const n = useContent(lang);
  // the card as it shows (texts, whole-percent progress): worked out every tick,
  // re-rendered only when something on it changes
  const view = useGame(useShallow((g) => goalView(g.state, g.snap, t, n)));
  if (!view) return null;
  const { icon, title, detail, bar, pct, label, ready } = view;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 flex justify-center px-3">
      <button
        onClick={() => {
          const g = useGame.getState();
          const goal = nextGoals(g.state, g.snap, 1)[0];
          if (goal) runGoal(goal, goalReady(goal, g.state.cash));
        }}
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl p-2.5 text-left shadow-[0_4px_0_0_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:brightness-110",
          ready ? "bg-[#2b2b2e]/95 ring-2 ring-gold" : "bg-[#2b2b2e]/90",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">{t("goal.next")}</span>
          <span className="race-type block truncate text-[17px] leading-tight">{title}</span>
          {bar ? (
            <span className="mt-1 flex items-center gap-2">
              <Progress value={pct} className="h-1.5" indicatorClassName={bar === "cost" && ready ? "from-gold to-amber-300" : undefined} />
              <span className="shrink-0 text-[10px] tabular-nums text-white/55">{label}</span>
            </span>
          ) : (
            <span className="block truncate text-[11px] text-white/50">{detail}</span>
          )}
        </span>
        <ArrowRight className={cn("size-5 shrink-0", ready ? "text-gold" : "text-white/40")} />
      </button>
    </div>
  );
}

const goalReady = (goal: Goal, cash: number) => !("cost" in goal) || !goal.cost || cash >= goal.cost;

/** What the goal card shows, as plain values (so an unchanged card is not drawn again). */
function goalView(state: GameState, snap: EconomySnapshot, t: ReturnType<typeof useT>["t"], n: Content) {
  const goal = nextGoals(state, snap, 1)[0];
  if (!goal) return null;
  const cost = "cost" in goal ? goal.cost : undefined;
  const ready = goalReady(goal, state.cash);
  const text = goalText(goal, t, n);
  const view = { icon: goal.icon, title: text.title, detail: text.detail, ready, bar: "" as "" | "made" | "cost", pct: 0, label: "" };
  if (goal.kind === "made") {
    view.bar = "made";
    view.pct = Math.floor(Math.min(100, (goal.have / goal.n) * 100));
    view.label = `${formatNumber(Math.min(goal.have, goal.n))}/${formatNumber(goal.n)}`;
  } else if (cost !== undefined) {
    view.bar = "cost";
    view.pct = Math.floor(cost ? Math.min(100, (state.cash / cost) * 100) : 100);
    const eta = !ready && snap.incomePerSec > 0 && (cost - state.cash) / snap.incomePerSec < 86400 * 30 ? (cost - state.cash) / snap.incomePerSec : null;
    view.label = ready ? formatMoney(cost) : eta !== null ? `~${formatDuration(eta)}` : formatMoney(cost);
  }
  return view;
}

function NavBadge({ n, gold, className }: { n?: number; gold?: boolean; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums ring-2 ring-white", gold ? "bg-gold text-black" : "bg-stop text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  );
}
