"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Car, Factory, FlaskConical, ListChecks, Star, Store, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { MANAGERS } from "@/game/config/managers";
import { RESEARCH } from "@/game/config/research";
import { canResearch, isManagerUnlocked } from "@/game/engine/actions";
import { canPrestige } from "@/game/engine/prestige";
import { claimableCount } from "@/game/engine/progress";
import { cn } from "@/lib/utils";
import { useGame, type View } from "@/store/game-store";
import { AchievementsView } from "../views/achievements-view";
import { CarsView } from "../views/cars-view";
import { DealersView } from "../views/dealers-view";
import { EmpireView } from "../views/empire-view";
import { ManagersView } from "../views/managers-view";
import { MissionsView } from "../views/missions-view";
import { PrestigeView } from "../views/prestige-view";
import { ResearchView } from "../views/research-view";
import { StatsView } from "../views/stats-view";
import { Hud } from "./hud";
import { OfflineDialog, PrestigeOverlay, SettingsDialog, Toasts } from "./overlays";

type Icon = React.ComponentType<{ className?: string }>;

const NAV: { view: View; label: string; icon: Icon }[] = [
  { view: "empire", label: "Empire", icon: Factory },
  { view: "dealers", label: "Dealerships", icon: Store },
  { view: "cars", label: "Cars", icon: Car },
  { view: "research", label: "Research", icon: FlaskConical },
  { view: "managers", label: "Managers", icon: Users },
  { view: "missions", label: "Missions", icon: ListChecks },
  { view: "achievements", label: "Achievements", icon: Trophy },
  { view: "stats", label: "Statistics", icon: BarChart3 },
  { view: "prestige", label: "Global Expansion", icon: Star },
];

/** Phone navigation: five tabs; the first and last group several screens. */
const MOBILE_TABS: { label: string; icon: Icon; views: View[] }[] = [
  { label: "Empire", icon: Factory, views: ["empire", "dealers"] },
  { label: "Cars", icon: Car, views: ["cars"] },
  { label: "Research", icon: FlaskConical, views: ["research"] },
  { label: "Managers", icon: Users, views: ["managers"] },
  { label: "Prestige", icon: Star, views: ["prestige", "missions", "achievements", "stats"] },
];

const LABEL: Record<View, string> = Object.fromEntries(NAV.map((n) => [n.view, n.label])) as Record<View, string>;

function useBadges(): Partial<Record<View, number>> {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  return {
    research: RESEARCH.filter((r) => canResearch(state, r.id) && state.rp >= r.cost).length,
    managers: MANAGERS.filter((m) => !state.managers[m.id].hired && isManagerUnlocked(state, m.id) && state.cash >= m.cost).length,
    missions: claimableCount(state, snap),
    prestige: canPrestige(state) ? 1 : 0,
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
  const view = useGame((g) => g.view);
  const setView = useGame((g) => g.setView);
  const [settings, setSettings] = useState(false);
  const badges = useBadges();
  const mobileGroup = MOBILE_TABS.find((t) => t.views.includes(view)) ?? MOBILE_TABS[0];

  return (
    <div className="min-h-dvh">
      <Hud onSettings={() => setSettings(true)} />

      <div className="mx-auto flex max-w-6xl gap-6 px-3 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-4 sm:px-5 lg:pb-10">
        {/* Desktop sidebar */}
        <aside className="sticky top-24 hidden h-fit w-56 shrink-0 lg:block">
          <div className="mb-4 px-3">
            <div className="text-xs font-black uppercase tracking-[0.25em] text-gradient-electric">Idle Car</div>
            <div className="text-lg font-black uppercase tracking-[0.12em] text-gradient-gold">Empire</div>
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <button
                key={n.view}
                onClick={() => setView(n.view)}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  view === n.view ? "bg-electric/15 text-white ring-1 ring-electric/40" : "text-white/55 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                <n.icon className={cn("size-4", view === n.view ? "text-sky-300" : n.view === "prestige" ? "text-gold" : "")} />
                {n.label}
                <NavBadge n={badges[n.view]} gold={n.view === "prestige"} className="ml-auto" />
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {mobileGroup.views.length > 1 && (
            <div className="scrollbar-none -mx-3 mb-4 flex gap-1.5 overflow-x-auto px-3 lg:hidden">
              {mobileGroup.views.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "relative shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition",
                    view === v ? "bg-electric/20 text-white ring-electric/50" : "bg-white/[0.03] text-white/55 ring-white/10",
                  )}
                >
                  {LABEL[v]}
                  {(badges[v] ?? 0) > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-gold align-middle" />}
                </button>
              ))}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
              <ViewSwitch view={view} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map((t) => {
            const active = t.views.includes(view);
            const badge = t.views.reduce((sum, v) => sum + (badges[v] ?? 0), 0);
            return (
              <button
                key={t.label}
                onClick={() => setView(t.views.includes(view) ? view : t.views[0])}
                className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition", active ? "text-white" : "text-white/45")}
              >
                {active && <motion.span layoutId="tab-glow" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-electric shadow-[0_0_12px_#3b82f6]" />}
                <span className="relative">
                  <t.icon className={cn("size-5", active && (t.label === "Prestige" ? "text-gold" : "text-sky-300"))} />
                  <NavBadge n={badge} gold={t.label === "Prestige"} className="absolute -right-2.5 -top-1.5" />
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <Toasts />
      <OfflineDialog />
      <PrestigeOverlay />
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </div>
  );
}

function NavBadge({ n, gold, className }: { n?: number; gold?: boolean; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums",
        gold ? "bg-gold text-black" : "bg-electric text-white",
        className,
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

function ViewSwitch({ view }: { view: View }) {
  switch (view) {
    case "empire":
      return <EmpireView />;
    case "dealers":
      return <DealersView />;
    case "cars":
      return <CarsView />;
    case "research":
      return <ResearchView />;
    case "managers":
      return <ManagersView />;
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
