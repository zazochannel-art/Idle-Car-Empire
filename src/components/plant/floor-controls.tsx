"use client";

import { Wrench, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BOOST, MORALE, moraleOf } from "@/game/engine/floor";
import { formatPercent } from "@/game/format";
import { cue } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";

/** A face for the crew's mood. */
export const moodFace = (m: number) => (m >= 85 ? "😄" : m >= 70 ? "🙂" : m >= 50 ? "😐" : m >= 30 ? "😟" : "😫");

/** A machine down at the plant: how long until the mechanic has fixed it, and a button to fix it now. */
export function BreakdownBanner({ plotId, compact }: { plotId: string; compact?: boolean }) {
  const p = useGame((g) => g.state.city.buildings[plotId]?.plant);
  const repair = useGame((g) => g.repairPlant);
  const { t } = useT();
  if (!p?.broken) return null;
  return (
    <div className={cn("flex items-center gap-2 rounded-xl bg-red-500/90 px-2.5 py-1.5 text-white shadow-lg", compact ? "text-[11px]" : "text-xs")}>
      <span className="animate-pulse">🔧</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black">{t("floor.broken")}</div>
        <div className="truncate text-[10px] text-white/80">{t("floor.mechanic", { s: Math.ceil(p.broken) })}</div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 shrink-0 px-2 text-[11px]"
        onClick={() => {
          if (repair(plotId)) cue("buy");
        }}
      >
        <Wrench className="size-3.5" /> {t("floor.repairNow")}
      </Button>
    </div>
  );
}

/** The crew's morale, and what it does to the pace. */
export function MoraleChip({ plotId }: { plotId: string }) {
  const p = useGame((g) => g.state.city.buildings[plotId]?.plant);
  const { t } = useT();
  if (!p) return null;
  const m = moraleOf(p);
  const effect = (m - MORALE.base) * MORALE.per;
  return (
    <span className="inline-flex items-center gap-1" title={t("floor.morale")}>
      {moodFace(m)} {t("floor.morale")} {Math.round(m)}
      {Math.abs(effect) >= 0.005 && <span className={effect > 0 ? "text-emerald-300" : "text-amber-300"}>· {t("floor.moraleEffect", { pct: `${effect > 0 ? "+" : ""}${formatPercent(effect)}` })}</span>}
    </span>
  );
}

/** Overtime: hold the button to boost the line (double speed for a while), then it cools down. */
export function BoostButton({ plotId, className }: { plotId: string; className?: string }) {
  const p = useGame((g) => g.state.city.buildings[plotId]?.plant);
  const boost = useGame((g) => g.boostPlant);
  const { t } = useT();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (!p) return null;
  const active = (p.boost ?? 0) > 0;
  const cooling = !active && (p.boostCd ?? 0) > 0;
  const ready = !active && !cooling && p.status === "ok";
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const label = active ? t("floor.boostOn", { s: Math.ceil(p.boost ?? 0) }) : cooling ? t("floor.boostWait", { s: Math.ceil(p.boostCd ?? 0) }) : t("floor.boost");
  return (
    <Button
      size="sm"
      variant={active ? "default" : "secondary"}
      disabled={!ready && !active}
      title={t("floor.boostHint", { s: BOOST.dur })}
      className={cn("relative select-none overflow-hidden shadow-lg", active && "bg-cyan-500 text-black hover:bg-cyan-400", className)}
      onPointerDown={(e) => {
        if (!ready) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setHolding(true);
        timer.current = setTimeout(() => {
          stop();
          if (boost(plotId)) cue("coin");
        }, 650);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* the charge filling up while held */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 bg-cyan-400/40", holding ? "w-full transition-[width] duration-[650ms] ease-linear" : "w-0")} />
      <span className="relative inline-flex items-center gap-1.5">
        <Zap className={cn(active && "animate-pulse")} /> {label}
      </span>
    </Button>
  );
}
