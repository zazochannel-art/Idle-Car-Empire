"use client";

import { motion } from "framer-motion";
import { ArrowLeft, BarChart3, Check, Hammer, Move, RotateCw, Trash2, TrendingUp, Users, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FACILITIES, FACILITY_BY_ID, FACILITY_GROWTH, GARAGE_LEVEL_MULT, GARAGE_MAX_LEVEL, SPECS, SPEC_BY_ID, ZONE_BY_ID } from "@/game/config/city";
import { plotOf } from "@/game/city/layout";
import {
  buildingUpgradeCost,
  facilityCap,
  facilityCost,
  facilityCount,
  findSpot,
  footprint,
  gridSize,
  placementProblem,
  specCost,
  workerCost,
} from "@/game/engine/city";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { FacilityType } from "@/game/types";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CostButton } from "../game/cost-button";
import { GarageEngine, type Ghost } from "./garage-engine";

type Tab = "build" | "upgrade" | "workers" | "production" | "stats";
const lv2 = (n: number) => String(n).padStart(2, "0");

export function GarageView({ plotId }: { plotId: string }) {
  const b = useGame((g) => g.state.city.buildings[plotId]);
  const st = useGame((g) => g.snap.city.garages[plotId]);
  const cash = useGame((g) => g.state.cash);
  const exitGarage = useUi((u) => u.exitGarage);
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GarageEngine | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [ghost, setGhost] = useState<Omit<Ghost, "valid"> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const g = b?.garage;
  const level = b?.level ?? 1;
  const [gw, gd] = gridSize(level);
  const spec = SPEC_BY_ID[g?.spec ?? "repair"];

  // Placement validity, including whether we can pay for it.
  const problem = useMemo(() => {
    if (!ghost || !g) return null;
    const p = placementProblem(level, g, ghost.type, ghost.x, ghost.y, ghost.rot, ghost.uid);
    if (p) return p;
    if (ghost.uid === undefined && cash < facilityCost(useGame.getState().state, plotId, ghost.type)) return "cash" as const;
    return null;
  }, [ghost, g, level, cash, plotId]);

  const latest = useRef({ ghost, gw, gd });
  useEffect(() => {
    latest.current = { ghost, gw, gd };
  }, [ghost, gw, gd]);

  const centerGhost = useCallback((tx: number, ty: number) => {
    setGhost((cur) => {
      if (!cur) return cur;
      const { gw: w0, gd: d0 } = latest.current;
      const fp = footprint(cur.type, cur.rot);
      const x = Math.max(0, Math.min(w0 - fp.w, tx - Math.floor((fp.w - 1) / 2)));
      const y = Math.max(0, Math.min(d0 - fp.d, ty - Math.floor((fp.d - 1) / 2)));
      return x === cur.x && y === cur.y ? cur : { ...cur, x, y };
    });
  }, []);

  useEffect(() => {
    const engine = new GarageEngine(canvasRef.current!, {
      onTapTile: (x, y) => {
        if (latest.current.ghost) centerGhost(x, y);
        else {
          setSelected(null);
          const { gw: w0, gd: d0 } = latest.current;
          if (x >= 0 && y >= 0 && x < w0 && y < d0) setTab("build");
        }
      },
      onTapFacility: (uid) => {
        setSelected(uid);
        setTab(null);
      },
      onGhostDrag: (x, y) => centerGhost(x, y),
    });
    engine.money = (v) => formatMoney(v);
    engineRef.current = engine;
    engine.start();
    return () => engine.destroy();
  }, [centerGhost]);

  useEffect(() => {
    if (!g || !st) return;
    engineRef.current?.setScene({ grid: [gw, gd], facilities: g.facilities, stations: st.stations, accent: spec.color });
  }, [g, st, gw, gd, spec.color]);

  useEffect(() => {
    engineRef.current?.setGhost(ghost ? { ...ghost, valid: problem === null } : null);
  }, [ghost, problem]);

  useEffect(() => {
    engineRef.current?.setSelected(selected);
  }, [selected]);

  const startPlacing = (type: FacilityType) => {
    if (!g) return;
    const spot = findSpot(level, g, type, 0) ?? findSpot(level, g, type, 1);
    const rot: 0 | 1 = findSpot(level, g, type, 0) ? 0 : 1;
    setGhost({ type, x: spot?.x ?? 0, y: spot?.y ?? 0, rot });
    setSelected(null);
    setTab(null);
  };

  const rotate = () =>
    setGhost((cur) => {
      if (!cur) return cur;
      const rot: 0 | 1 = cur.rot ? 0 : 1;
      const fp = footprint(cur.type, rot);
      return { ...cur, rot, x: Math.max(0, Math.min(gw - fp.w, cur.x)), y: Math.max(0, Math.min(gd - fp.d, cur.y)) };
    });

  const confirm = () => {
    if (!ghost || problem) return;
    const s = useGame.getState();
    const ok = ghost.uid !== undefined ? s.moveFacility(plotId, ghost.uid, ghost.x, ghost.y, ghost.rot) : s.placeFacility(plotId, ghost.type, ghost.x, ghost.y, ghost.rot);
    if (ok) setGhost(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "Enter") confirm();
      else if (e.key === "Escape") {
        if (ghost) setGhost(null);
        else if (tab) setTab(null);
        else if (selected !== null) setSelected(null);
        else exitGarage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!b || !g || !st) return null;
  const sel = selected !== null ? g.facilities.find((f) => f.uid === selected) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.06 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-0 z-[35] bg-ink"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />

      {/* header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="flex items-start gap-2 p-2 md:p-3">
          <button onClick={exitGarage} className="pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-ink/80 px-3 text-sm font-bold backdrop-blur-xl hover:bg-white/5">
            <ArrowLeft className="size-4" /> {t("garage.back")}
          </button>
          <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl border border-white/10 bg-ink/80 p-2 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
              <span className="text-base font-black uppercase tracking-wide md:text-lg">{t("garage.title", { no: lv2(g.no) })}</span>
              <Badge variant="gold">{t("common.lv", { level })}</Badge>
              <Badge variant="muted" style={{ color: spec.color }}>
                {spec.emoji} {t(`spec.${spec.id}`)}
              </Badge>
              <span className="hidden text-xs text-white/40 sm:inline">📍 {t(`zone.${st.zone}`)}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1 md:grid-cols-6">
              <HeadStat label={t("garage.level")} value={`${level}/${GARAGE_MAX_LEVEL}`} />
              <HeadStat label={t("garage.profit")} value={`${formatMoney(st.incomePerSec)}${t("unit.perSec")}`} gold />
              <HeadStat label={t("garage.cars")} value={`${st.staffed}/${st.workstations}`} />
              <HeadStat label={t("garage.workers")} value={`${st.workers}/${st.workerCap}`} warn={st.workstations > st.staffed} />
              <HeadStat label={t("garage.energy")} value={formatPercent(st.power / st.powerCap)} warn={st.powerFactor < 1} />
              <HeadStat label={t("garage.efficiency")} value={formatPercent(st.efficiency)} />
            </div>
          </div>
        </div>
      </div>

      {g.facilities.length === 0 && !ghost && !tab && (
        <button
          onClick={() => setTab("build")}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 animate-pulse-soft rounded-2xl border-2 border-dashed border-sky-300/60 bg-sky-500/15 px-5 py-3 text-sm font-black tracking-wide text-sky-100 backdrop-blur"
        >
          ＋ {t("garage.empty")}
        </button>
      )}

      {/* placement bar */}
      {ghost && (
        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-20 flex justify-center px-3">
          <div className="glass-strong w-full max-w-md rounded-2xl p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="text-xl">{FACILITY_BY_ID[ghost.type].emoji}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{t(`facility.${ghost.type}`)}</span>
              <span className={cn("text-xs font-semibold", problem ? "text-rose-300" : "text-emerald-300")}>{problem ? t(`garage.bad.${problem}`) : t("garage.placeHint")}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={rotate}>
                <RotateCw /> {t("garage.rotate")}
              </Button>
              <Button variant="secondary" onClick={() => setGhost(null)}>
                <X /> {t("garage.cancel")}
              </Button>
              <Button variant={problem ? "locked" : "gold"} disabled={!!problem} onClick={confirm}>
                <Check />
                {ghost.uid !== undefined ? t("garage.moveHere") : formatMoney(facilityCost(useGame.getState().state, plotId, ghost.type))}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* selected facility */}
      {sel && !ghost && (
        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-20 flex justify-center px-3">
          <FacilityCard plotId={plotId} uid={sel.uid} onMove={() => setGhost({ type: sel.type, x: sel.x, y: sel.y, rot: sel.rot, uid: sel.uid })} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* tabs */}
      {tab && !ghost && (
        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-20 flex justify-center px-2 lg:inset-x-auto lg:right-3 lg:top-[7.5rem] lg:w-[440px]">
          <div className="glass-strong flex max-h-[58dvh] w-full max-w-xl flex-col rounded-3xl lg:max-h-[calc(100dvh-14rem)]">
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <div className="text-sm font-black uppercase tracking-wider">{t(`garage.tab.${tab}`)}</div>
              <button onClick={() => setTab(null)} className="flex size-8 items-center justify-center rounded-lg text-white/50 ring-1 ring-white/10 hover:text-white" aria-label={t("map.close")}>
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
              {tab === "build" && <BuildTab plotId={plotId} onPick={startPlacing} />}
              {tab === "upgrade" && <UpgradeTab plotId={plotId} />}
              {tab === "workers" && <WorkersTab plotId={plotId} />}
              {tab === "production" && <ProductionTab plotId={plotId} />}
              {tab === "stats" && <StatsTab plotId={plotId} />}
            </div>
          </div>
        </div>
      )}

      {/* bottom bar */}
      <nav className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="grid w-full max-w-lg grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-ink/85 p-1.5 backdrop-blur-xl">
          {(
            [
              ["build", Hammer],
              ["upgrade", TrendingUp],
              ["workers", Users],
              ["production", Wrench],
              ["stats", BarChart3],
            ] as const
          ).map(([id, Icon]) => {
            const alert = (id === "workers" && st.workstations > st.staffed) || (id === "build" && g.facilities.length === 0);
            return (
              <button
                key={id}
                onClick={() => {
                  setGhost(null);
                  setSelected(null);
                  setTab(tab === id ? null : id);
                }}
                className={cn("relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-bold uppercase tracking-wide transition", tab === id ? "bg-electric/25 text-white ring-1 ring-electric/50" : "text-white/60 hover:bg-white/5")}
              >
                <Icon className="size-5" />
                {t(`garage.tab.${id}`)}
                {alert && <span className="absolute right-2 top-1.5 size-2 rounded-full bg-gold" />}
              </button>
            );
          })}
        </div>
      </nav>
    </motion.div>
  );
}

function HeadStat({ label, value, gold, warn }: { label: string; value: string; gold?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-white/[0.05] px-2 py-1">
      <div className="truncate text-[8px] font-semibold uppercase tracking-wider text-white/40 md:text-[9px]">{label}</div>
      <div className={cn("truncate text-xs font-bold tabular-nums md:text-sm", gold && "text-gold", warn && "text-amber-300")}>{value}</div>
    </div>
  );
}

function facilityLine(type: FacilityType, t: ReturnType<typeof useT>["t"], scale: number) {
  const f = FACILITY_BY_ID[type];
  const parts: string[] = [];
  if (f.fee) parts.push(t("facility.perCar", { amount: formatMoney(f.fee * 20 * scale), time: formatDuration(f.time!) }));
  if (f.income) parts.push(t("facility.income", { pct: formatPercent(f.income) }));
  if (f.speed) parts.push(t("facility.speed", { pct: formatPercent(f.speed) }));
  if (f.workers) parts.push(t("facility.workers", { n: f.workers }));
  return parts.join(" · ");
}

function BuildTab({ plotId, onPick }: { plotId: string; onPick: (t: FacilityType) => void }) {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const b = state.city.buildings[plotId]!;
  const g = b.garage!;
  const scale = ZONE_BY_ID[plotOf(plotId)!.zone].scale;
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] text-white/50">{t("garage.buildHelp")}</p>
      {FACILITIES.map((f) => {
        const cap = facilityCap(b.level, f.id);
        const count = facilityCount(g, f.id);
        const unlockAt = f.caps.findIndex((c) => c > 0) + 1;
        const locked = cap === 0;
        const full = !locked && count >= cap;
        const cost = facilityCost(state, plotId, f.id);
        return (
          <div key={f.id} className={cn("flex items-center gap-3 rounded-2xl p-2.5 ring-1", locked ? "bg-white/[0.02] opacity-55 ring-white/[0.05]" : "bg-white/[0.04] ring-white/[0.08]")}>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xl ring-1 ring-white/10" style={{ background: `${f.color}26` }}>
              {f.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold">{t(`facility.${f.id}`)}</span>
                <span className="shrink-0 rounded bg-white/10 px-1 text-[10px] font-semibold tabular-nums text-white/70">{t("garage.size", { w: f.w, d: f.d })}</span>
              </div>
              <div className="truncate text-[11px] text-emerald-300/90">{facilityLine(f.id, t, scale)}</div>
              <div className="text-[10px] text-white/45">
                {locked ? `🔒 ${t("garage.unlocksAt", { level: unlockAt })}` : `${t("garage.count", { n: count, cap })} · ${t("facility.power", { n: f.power })}`}
              </div>
            </div>
            {!locked && !full && <CostButton size="sm" cost={cost} label={t("garage.place")} onBuy={() => onPick(f.id)} />}
            {full && <Badge variant="muted">{t("common.max")}</Badge>}
          </div>
        );
      })}
    </div>
  );
}

function UpgradeTab({ plotId }: { plotId: string }) {
  const b = useGame((g) => g.state.city.buildings[plotId]);
  const cost = useGame((g) => buildingUpgradeCost(g.state, plotId));
  const upgradeBuilding = useGame((g) => g.upgradeBuilding);
  const { t } = useT();
  if (!b) return null;
  if (b.level >= GARAGE_MAX_LEVEL) return <div className="p-4 text-center text-sm text-gold">{t("garage.maxLevel")}</div>;
  const next = b.level + 1;
  const [w0, d0] = gridSize(b.level);
  const [w1, d1] = gridSize(next);
  const fresh = FACILITIES.filter((f) => facilityCap(b.level, f.id) === 0 && facilityCap(next, f.id) > 0);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="text-base font-black">{t("garage.upgradeTo", { level: next })}</div>
        <ul className="mt-2 space-y-1 text-sm text-white/75">
          <li>
            📐 {t("garage.grid", { w: w0, d: d0 })} → <b className="text-white">{t("garage.grid", { w: w1, d: d1 })}</b>
          </li>
          <li>💰 {t("garage.incomeMult", { pct: formatPercent(GARAGE_LEVEL_MULT - 1) })}</li>
          <li>👷 {t("garage.moreSlots")}</li>
        </ul>
        {fresh.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gold/80">{t("garage.newSlots")}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {fresh.map((f) => (
                <Badge key={f.id} variant="gold">
                  {f.emoji} {t(`facility.${f.id}`)}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 text-[11px] text-white/45">{t("garage.exterior")}</div>
      </div>
      <CostButton className="w-full" size="lg" variant="gold" cost={cost} label={t("garage.upgradeTo", { level: next })} onBuy={() => upgradeBuilding(plotId)} />
    </div>
  );
}

function WorkersTab({ plotId }: { plotId: string }) {
  const st = useGame((g) => g.snap.city.garages[plotId]);
  const cost = useGame((g) => workerCost(g.state, plotId));
  const hireWorker = useGame((g) => g.hireWorker);
  const { t } = useT();
  if (!st) return null;
  const idle = st.workstations - st.staffed;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">👷 {t("garage.mechanics")}</span>
          <span className="text-lg font-black tabular-nums">
            {st.workers}/{st.workerCap}
          </span>
        </div>
        <Progress className="mt-2" value={(st.workers / st.workerCap) * 100} />
        <p className="mt-2 text-[11px] text-white/50">{t("garage.workersHelp")}</p>
        {idle > 0 && <div className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200 ring-1 ring-amber-400/30">{t("garage.idleStations", { n: idle })}</div>}
      </div>
      <CostButton className="w-full" size="lg" variant={idle > 0 ? "gold" : "default"} cost={cost} label={t("garage.hire")} maxedLabel={t("garage.workersFull")} onBuy={() => hireWorker(plotId)} />
    </div>
  );
}

function ProductionTab({ plotId }: { plotId: string }) {
  const b = useGame((g) => g.state.city.buildings[plotId]);
  const st = useGame((g) => g.snap.city.garages[plotId]);
  const cost = useGame((g) => specCost(g.state, plotId));
  const setSpecialization = useGame((g) => g.setSpecialization);
  const { t } = useT();
  if (!b?.garage || !st) return null;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{t("garage.spec")}</div>
        <p className="mb-2 px-1 text-[11px] text-white/50">{t("garage.specHelp", { cost: formatMoney(cost) })}</p>
        <div className="grid grid-cols-1 gap-1.5">
          {SPECS.map((s) => {
            const current = b.garage!.spec === s.id;
            const locked = b.level < s.level;
            return (
              <div key={s.id} className={cn("flex items-center gap-2.5 rounded-xl p-2 ring-1", current ? "bg-electric/15 ring-electric/40" : "bg-white/[0.03] ring-white/[0.06]", locked && "opacity-50")}>
                <span className="text-xl">{s.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold" style={{ color: s.color }}>
                    {t(`spec.${s.id}`)}
                  </div>
                  <div className="truncate text-[10px] text-white/50">×2 · {s.boosts.map((f) => t(`facility.${f}`)).join(", ")}</div>
                </div>
                {current ? (
                  <Badge>{t("garage.current")}</Badge>
                ) : locked ? (
                  <Badge variant="muted">🔒 {t("garage.unlocksAt", { level: s.level })}</Badge>
                ) : (
                  <CostButton size="sm" cost={cost} showEta={false} onBuy={() => setSpecialization(plotId, s.id)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{t("garage.stations")}</div>
        {st.stations.length === 0 && <div className="p-3 text-xs text-white/45">{t("garage.noStations")}</div>}
        <div className="space-y-1">
          {st.stations.map((s) => (
            <div key={s.uid} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-1.5 text-xs ring-1 ring-white/[0.05]">
              <span>{FACILITY_BY_ID[s.type].emoji}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{t(`facility.${s.type}`)}</span>
              {s.boosted && <span className="text-gold">×2</span>}
              {s.staffed ? (
                <span className="tabular-nums text-white/70">
                  {formatMoney(s.perCar)} · {t("garage.perMin", { n: formatNumber(60 / s.time) })}
                </span>
              ) : (
                <span className="text-amber-300">{t("garage.idle")}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsTab({ plotId }: { plotId: string }) {
  const b = useGame((g) => g.state.city.buildings[plotId]);
  const st = useGame((g) => g.snap.city.garages[plotId]);
  const { t } = useT();
  if (!b?.garage || !st) return null;
  const rows: [string, string][] = [
    [t("garage.zone"), t(`zone.${st.zone}`)],
    [t("garage.profit"), `${formatMoney(st.incomePerSec)}${t("unit.perSec")}`],
    [t("garage.cars"), t("garage.perMin", { n: formatNumber(st.carsPerSec * 60) })],
    [t("garage.serviced"), formatNumber(b.garage.serviced)],
    [t("garage.earned"), formatMoney(b.garage.earned)],
    [t("garage.valueMult"), `×${st.valueMult.toFixed(2)}`],
    [t("garage.speedMult"), `×${st.speedMult.toFixed(2)}`],
    [t("garage.power"), `${st.power}/${st.powerCap}`],
  ];
  return (
    <div className="space-y-2">
      {st.powerFactor < 1 && <div className="rounded-xl bg-rose-500/10 p-2.5 text-xs text-rose-200 ring-1 ring-rose-400/30">{t("garage.overload", { pct: formatPercent(st.powerFactor) })}</div>}
      <div className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-white/55">{k}</span>
            <span className="font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacilityCard({ plotId, uid, onMove, onClose }: { plotId: string; uid: number; onMove: () => void; onClose: () => void }) {
  const f = useGame((g) => g.state.city.buildings[plotId]?.garage?.facilities.find((x) => x.uid === uid));
  const st = useGame((g) => g.snap.city.garages[plotId]?.stations.find((x) => x.uid === uid));
  // what the last one of this kind cost, halved (see removeFacility)
  const refund = useGame((g) => (facilityCost(g.state, plotId, f?.type ?? "serviceBay") / FACILITY_GROWTH) * 0.5);
  const removeFacility = useGame((g) => g.removeFacility);
  const { t } = useT();
  if (!f) return null;
  const cfg = FACILITY_BY_ID[f.type];
  const fp = footprint(f.type, f.rot);
  const scale = ZONE_BY_ID[plotOf(plotId)!.zone].scale;
  return (
    <div className="glass-strong w-full max-w-md rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl text-2xl ring-1 ring-white/10" style={{ background: `${cfg.color}26` }}>
          {cfg.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{t(`facility.${f.type}`)}</span>
            <span className="rounded bg-white/10 px-1 text-[10px] font-semibold text-white/70">{t("garage.size", { w: fp.w, d: fp.d })}</span>
          </div>
          <div className="text-[11px] text-emerald-300/90">
            {st ? (st.staffed ? `${formatMoney(st.perCar)} · ${t("garage.perMin", { n: formatNumber(60 / st.time) })}` : t("garage.idle")) : facilityLine(f.type, t, scale)}
          </div>
        </div>
        <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-white/50 ring-1 ring-white/10" aria-label={t("map.close")}>
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={onMove}>
          <Move /> {t("garage.move")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="text-rose-200"
          onClick={() => {
            if (removeFacility(plotId, uid)) onClose();
          }}
        >
          <Trash2 /> {t("garage.demolish", { amount: formatMoney(refund) })}
        </Button>
      </div>
    </div>
  );
}
