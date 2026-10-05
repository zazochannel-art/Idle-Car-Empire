"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { STRUCTURE_BY_ID, ZONE_BY_ID } from "@/game/config/city";
import { plotOf } from "@/game/city/layout";
import * as Co from "@/game/engine/construction";
import { formatDuration, formatMoney } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CostButton } from "../game/cost-button";

const lv2 = (n: number) => String(n).padStart(2, "0");

/** "Engine Factory Plot #02": the plot's number among the plots zoned for the same building. */
export function landName(id: string, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  const use = Co.plotUse(id);
  if (!use) return "";
  return t("land.title", { name: t(`structure.${use}`), no: lv2(Co.plotsFor(use).indexOf(id) + 1) });
}

const STATUS_STYLE: Record<Co.PlotStatus, string> = {
  available: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
  owned: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  construction: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
  operational: "bg-white/10 text-white/80 ring-white/20",
  locked: "bg-white/[0.04] text-white/45 ring-white/10",
};
const STATUS_ICON: Record<Co.PlotStatus, string> = { available: "🟩", owned: "🟦", construction: "🚧", operational: "🏭", locked: "🔒" };

export function StatusChip({ status }: { status: Co.PlotStatus }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1", STATUS_STYLE[status])}>
      {STATUS_ICON[status]} {t(`land.status.${status}` as MessageKey)}
    </span>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-white/55">{label}</span>
      <span className={cn("tabular-nums", strong ? "font-bold text-gold" : "font-semibold")}>{value}</span>
    </div>
  );
}

/** An empty plot: what it is zoned for, its size, prices, requirements, and BUY LAND / BUILD. */
export function LandPanel({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const buyLand = useGame((g) => g.buyLand);
  const startConstruction = useGame((g) => g.startConstruction);
  const buildStructure = useGame((g) => g.buildStructure);
  const setPreview = useUi((u) => u.setPreview);
  const { t, lang } = useT();
  const n = useContent(lang);
  const plot = plotOf(id)!;
  const use = Co.plotUse(id);
  // show the finished building on the plot while its details are open
  useEffect(() => {
    if (use) setPreview({ plot: id, type: use });
    return () => setPreview(null);
  }, [id, use, setPreview]);
  if (!use) return null;
  const cfg = STRUCTURE_BY_ID[use];
  const status = Co.plotStatus(state, id);
  const lock = Co.landLock(state, id);
  const land = Co.landCost(state, id);
  const build = Co.constructionCost(state, id);
  const time = Co.constructionTime(state, id);
  const owned = status === "owned";
  const zone = ZONE_BY_ID[plot.zone];
  const lockText =
    lock?.kind === "zone"
      ? t("land.reqZone", { name: t(`zone.${lock.zone}`), stage: ZONE_BY_ID[lock.zone].stage })
      : lock?.kind === "chain"
        ? n.plantLock(lock.lock)
        : lock?.kind === "onePerZone"
          ? t("land.reqOne")
          : null;

  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={status} />
        <Badge variant="muted">📐 {t(`land.size.${plot.size ?? "small"}` as MessageKey)}</Badge>
        <Badge variant="muted">📍 {t(`zone.${plot.zone}`)}</Badge>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl ring-1 ring-white/10" style={{ background: `${cfg.roof}22` }}>
          {cfg.emoji}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{t("land.zonedFor")}</div>
          <div className="text-sm font-bold">{t(`structure.${use}`)}</div>
          <div className="text-[11px] leading-snug text-white/50">{t(`structureDesc.${use}`)}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/[0.03] px-3 py-1.5 ring-1 ring-white/[0.06]">
        <Row label={t("land.price")} value={owned ? t("land.paid") : formatMoney(land)} />
        <Row label={t("land.construction")} value={formatMoney(build)} />
        <Row label={t("land.time")} value={formatDuration(time)} />
        <div className="my-1 h-px bg-white/10" />
        <Row label={t("land.total")} value={formatMoney((owned ? 0 : land) + build)} strong />
      </div>

      <div className="rounded-2xl bg-white/[0.03] p-3 text-xs ring-1 ring-white/[0.06]">
        <div className="mb-1 font-bold uppercase tracking-wider text-white/40">{t("land.requires")}</div>
        <div className={cn(state.city.zones.includes(plot.zone) ? "text-emerald-300" : "text-amber-300")}>
          {state.city.zones.includes(plot.zone) ? "✓" : "🔒"} {t("land.reqZone", { name: t(`zone.${plot.zone}`), stage: zone.stage })}
        </div>
        {lock && lock.kind !== "zone" && <div className="text-amber-300">🔒 {lockText}</div>}
      </div>

      {owned ? (
        <>
          <p className="px-1 text-xs text-white/55">{t("land.ownedNote")}</p>
          <CostButton className="w-full" size="lg" variant="gold" cost={build} locked={!!lock} label={`🏗️ ${t("land.build")}`} onBuy={() => startConstruction(id)} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <CostButton size="lg" cost={land} locked={!!lock} label={`📜 ${t("land.buy")}`} onBuy={() => buyLand(id)} />
          <CostButton size="lg" variant="gold" cost={land + build} locked={!!lock} label={`🏗️ ${t("land.buyBuild")}`} onBuy={() => buildStructure(id, use)} />
        </div>
      )}
      {lock && <p className="px-1 text-center text-[11px] text-amber-300/90">🔒 {lockText}</p>}
    </div>
  );
}

/** The phases of a job, ticked off as it goes. */
function Phases({ progress }: { progress: number }) {
  const { t } = useT();
  const current = Co.phaseOf(progress);
  const at = Co.PHASES.findIndex((p) => p.id === current);
  return (
    <ol className="grid grid-cols-3 gap-1 text-[10px] sm:grid-cols-6">
      {Co.PHASES.map((p, i) => (
        <li
          key={p.id}
          className={cn(
            "rounded-lg px-1.5 py-1 text-center ring-1",
            i < at ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20" : i === at ? "bg-amber-500/15 font-bold text-amber-100 ring-amber-400/40" : "bg-white/[0.03] text-white/40 ring-white/[0.06]",
          )}
        >
          {i < at ? "✓ " : ""}
          {t(`site.phase.${p.id}` as MessageKey)}
        </li>
      ))}
    </ol>
  );
}

function ProgressBar({ value }: { value: number }) {
  const blocks = 10;
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 to-gold transition-[width] duration-500" style={{ width: `${value * 100}%` }} />
      <div className="absolute inset-0 flex">
        {Array.from({ length: blocks - 1 }).map((_, i) => (
          <div key={i} className="flex-1 border-r border-black/25" />
        ))}
        <div className="flex-1" />
      </div>
    </div>
  );
}

/** A building site: phase, progress, time left, and FINISH NOW for money. */
export function SitePanel({ id }: { id: string }) {
  const site = useGame((g) => g.state.city.sites[id]);
  const speedUpCost = useGame((g) => Co.speedUpCost(g.state, id));
  const speedUp = useGame((g) => g.speedUp);
  const { t } = useT();
  const plot = plotOf(id);
  if (!site || !plot) return null;
  const progress = Math.min(1, site.t / site.dur);
  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status="construction" />
        <Badge variant="muted">📐 {t(`land.size.${plot.size ?? "small"}` as MessageKey)}</Badge>
        <Badge variant="muted">📍 {t(`zone.${plot.zone}`)}</Badge>
      </div>
      <div className="rounded-2xl bg-amber-500/[0.06] p-3 ring-1 ring-amber-400/20">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-bold">
            {STRUCTURE_BY_ID[site.type].emoji} {t(`structure.${site.type}`)}
          </span>
          <span className="font-black tabular-nums text-gold">{Math.floor(progress * 100)}%</span>
        </div>
        <ProgressBar value={progress} />
        <div className="mt-2 flex items-center justify-between text-[11px] text-white/55">
          <span>🚧 {t(`site.phase.${Co.phaseOf(progress)}` as MessageKey)}</span>
          <span className="tabular-nums">⏱ {t("site.left", { time: formatDuration(site.dur - site.t) })}</span>
        </div>
      </div>
      <Phases progress={progress} />
      <div className="rounded-2xl bg-white/[0.03] px-3 py-1.5 ring-1 ring-white/[0.06]">
        <Row label={t("land.construction")} value={formatMoney(site.cost)} />
        <Row label={t("land.time")} value={formatDuration(site.dur)} />
      </div>
      <p className="px-1 text-xs text-white/50">{t("site.offline")}</p>
      <CostButton className="w-full" cost={speedUpCost} label={`⚡ ${t("site.speedUp")}`} onBuy={() => speedUp(id)} />
    </div>
  );
}

/** An upgrade being built onto a building: shown at the top of its panel. */
export function WorksBanner({ id }: { id: string }) {
  const works = useGame((g) => g.state.city.buildings[id]?.works);
  const speedUpCost = useGame((g) => Co.speedUpCost(g.state, id));
  const speedUp = useGame((g) => g.speedUp);
  const { t } = useT();
  if (!works) return null;
  const progress = Math.min(1, works.t / works.dur);
  return (
    <div className="space-y-2 rounded-2xl bg-amber-500/[0.06] p-3 ring-1 ring-amber-400/20">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">{t("works.title", { level: works.to })}</span>
        <span className="text-[11px] tabular-nums text-white/55">⏱ {t("site.left", { time: formatDuration(works.dur - works.t) })}</span>
      </div>
      <ProgressBar value={progress} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/50">🚧 {t(`site.phase.${Co.phaseOf(progress)}` as MessageKey)}</span>
        <CostButton size="sm" cost={speedUpCost} label={`⚡ ${t("site.speedUp")}`} onBuy={() => speedUp(id)} />
      </div>
    </div>
  );
}
