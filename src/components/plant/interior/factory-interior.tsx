"use client";

import { lineBuildLook } from "@/game/engine/car-dna";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CostButton } from "@/components/game/cost-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AUTOMATION, BODY_WORKSHOP, COMPONENT_BY_ID, GRADES, PLANT_BY_ID, PLANT_LEVELS, SPEED } from "@/game/config/chain";
import { MANAGERS } from "@/game/config/managers";
import { automationCost, bodyMachineCost, bodyWorkerCost, gradeCost, levelCost, speedCost, workshopMachines, workshopOf, workshopSpeed, type Workshop } from "@/game/engine/chain";
import { formatMoney, formatNumber, formatPercent, formatTime } from "@/game/format";
import type { GameState, PlantData } from "@/game/types";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { debtVars, stockTotal } from "@/game/engine/materials";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CAR_MODEL_FOR } from "../../map/vehicles";
import { gradeName, itemName, plantName, PlantPanel } from "../../panels/plant-panel";
import { Sheet } from "../../panels/sheet";
import { InteriorEngine, type InteriorScene, type StationPick } from "./interior-engine";
import { interiorLayout, RECIPES, recipeFor, type PlacedStation, type StationId } from "./layout";

/** Plants with a walk-in interior (every plant with a recipe; others keep the factory floor view). */
export const HAS_INTERIOR = new Set(Object.keys(RECIPES));

/**
 * Inside a plant: the halls and lines live, with the money, income and
 * output on top, and a small card for the machine you tap.
 */
export function FactoryInterior({ plotId }: { plotId: string }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const st = snap.chain.plants[plotId];
  const b = state.city.buildings[plotId];
  const openFloor = useUi((u) => u.openFloor);
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<InteriorEngine | null>(null);
  const [pick, setPick] = useState<StationPick | null>(null);
  const [hint, setHint] = useState(true);
  // the plant's full controls, opened over the factory (the map stays closed)
  const [manage, setManage] = useState(false);
  const p = b?.plant;
  const manager = MANAGERS.some((m) => state.managers[m.id].hired && state.managers[m.id].assignedTo === plotId);

  useEffect(() => {
    const engine = new InteriorEngine(canvasRef.current!);
    engineRef.current = engine;
    engine.onSelect = (s) => {
      setPick(s);
      setHint(false);
      // a machine tapped: its card replaces the plant's panel
      if (s) setManage(false);
    };
    engine.low = useGame.getState().state.settings.lowGraphics;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __interior: engine });
    engine.start();
    const id = setTimeout(() => setHint(false), 6000);
    return () => {
      clearTimeout(id);
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (manage) setManage(false);
      else if (engineRef.current?.selected) {
        engineRef.current.selected = null;
        setPick(null);
      } else openFloor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFloor, manage]);

  const type = st?.type ?? "bodyWorks";
  const labels = useMemo(() => Object.fromEntries(recipeFor(type).map((d) => [d.id, t(`interior.station.${d.id}` as MessageKey)])) as Record<StationId, string>, [t, type]);
  const words = useMemo(() => ({ noOperator: t("interior.tag.noOperator"), build: t("interior.tag.build"), noRaw: t("interior.tag.noRaw"), full: t("interior.tag.full") }), [t]);
  // the Body Works shop floor: which machines are built and staffed (the engine's own numbers)
  const floor = type === "bodyWorks" && p ? workshopOf(p) : undefined;

  useEffect(() => {
    if (!p || !st || !b) return;
    const cfg = PLANT_BY_ID[st.type];
    const inbound = state.chain.shipments.some((sh) => sh.to === plotId && sh.item === "raw" && !sh.back);
    const stop: InteriorScene["stop"] = p.status === "noRaw" || p.status === "noParts" ? "noRaw" : p.status === "full" ? "full" : undefined;
    engineRef.current?.setScene({
      type: st.type,
      spec: { level: b.level, automation: p.automation, manager, floor: st.type === "bodyWorks" ? workshopOf(p) : undefined },
      running: p.status === "ok",
      // the line follows the real batch, and shows why it stands at the stage concerned
      progress: p.progress,
      cycle: st.cycle,
      stop,
      words,
      raw: cfg.item ? stockTotal(p.stock) / st.rawCap : 0,
      out: p.out / st.outCap,
      docked: p.out >= 1,
      inbound,
      accent: cfg.roof,
      color: cfg.item ? COMPONENT_BY_ID[cfg.item].color : "#ef4444",
      labels,
      lockedLabel: (hall, level) => t("interior.locked", { n: hall + 1, level }),
      // the model on the line, with the parts the factories make today
      model: CAR_MODEL_FOR[st.car?.id ?? "city"],
      build: st.car ? lineBuildLook(state, st.car.id) : undefined,
    });
  }, [p, st, b, labels, words, manager, plotId, state, t]);

  if (!b?.plant || !st || !p) return null;
  const cfg = PLANT_BY_ID[st.type];
  const perMin = st.unitsPerSec * 60;
  const layout = interiorLayout({ level: b.level, automation: p.automation, manager, floor }, recipeFor(st.type));
  const picked = pick ? layout.lines[pick.line]?.stations.find((x) => x.def.id === pick.id) : undefined;
  return (
    <motion.div
      className="fixed inset-0 z-40 bg-ink"
      initial={{ opacity: 0, scale: 1.12 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.12 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />

      {/* top: exit, the plant, and the empire's numbers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="pointer-events-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" className="shadow-lg" onClick={() => openFloor(null)}>
            <ArrowLeft /> {t("interior.exit")}
          </Button>
          <div className="min-w-0 flex-1 truncate rounded-xl bg-black/55 px-2.5 py-1.5 text-sm font-black backdrop-blur">
            {cfg.emoji} {plantName(state, plotId, t)}
          </div>
          <Badge variant="gold">{t("common.lv", { level: b.level })}</Badge>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Chip icon="💰" label={t("interior.money")} value={formatMoney(state.cash)} />
          <Chip icon="📈" label={t("interior.income")} value={`${formatMoney(snap.incomePerSec)}${t("unit.perSec")}`} />
          <Chip icon="🏭" label={t("interior.production")} value={`${formatNumber(perMin)}${t("unit.perMin")}`} />
          <Chip icon="🚗" label={t("interior.cars")} value={formatNumber(state.lifetime.carsProduced)} />
        </div>
        {/* the real batch on the line, and the Body Works shop floor */}
        <div className="mt-1.5 rounded-xl bg-black/55 px-2 py-1.5 backdrop-blur">
          <div className="flex items-center justify-between gap-2 text-[10px] text-white/60">
            <span className="truncate font-bold uppercase tracking-wide">⏱ {t("interior.batch")}</span>
            <span className="shrink-0 tabular-nums">{t("plant.rate", { n: formatNumber(st.lines), item: itemName(st.combine ? "chassis" : (cfg.item ?? "car"), t), time: formatTime(st.cycle) })}</span>
          </div>
          <BatchBar progress={p.progress} ok={p.status === "ok"} />
          {floor && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[10px] font-semibold text-white/70">
              <span>🏭 {t("interior.floor")}</span>
              <span>{t("interior.machinesN", { n: floor.machines, total: BODY_WORKSHOP.max })}</span>
              <span>👷 {t("interior.operatorsN", { n: floor.workers, total: floor.machines })}</span>
              <span className="text-emerald-300">{t("interior.floorSpeed", { n: formatNumber(st.workshopSpeed, 2) })}</span>
              {manager && <span className="text-emerald-300">👔 {t("interior.manager")}</span>}
            </div>
          )}
        </div>
        {manager && !floor && (
          <div className="mt-1.5 flex justify-end">
            <div className="rounded-lg bg-black/55 px-2 py-1 text-[10px] font-semibold text-emerald-300 backdrop-blur">👔 {t("interior.manager")}</div>
          </div>
        )}
        {p.status !== "ok" && (
          <div className="mt-2 flex justify-center">
            <div className="rounded-xl bg-amber-500/90 px-3 py-1.5 text-xs font-black text-black shadow-lg">
              ⚠️ {statusText(state, p, t)} · {t("status.paused")}
            </div>
          </div>
        )}
      </div>

      {/* bottom: the picked machine, or a hint; and the plant's full controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col-reverse gap-2 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:flex-row sm:items-end">
        {/* phones: the card takes the full width, the plant's controls sit above it */}
        <div className="pointer-events-auto min-w-0 flex-1 sm:max-w-[340px]">
          <AnimatePresence mode="wait">
            {pick ? (
              <motion.div key={`${pick.line}-${pick.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.16 }}>
                <StationCard
                  plotId={plotId}
                  id={pick.id}
                  placed={picked}
                  people={layout.people.filter((h) => h.line === pick.line && h.station === pick.id).length}
                  robots={layout.robots.filter((r) => r.line === pick.line && r.station === pick.id).length || (picked?.mode === "robot" ? 1 : 0)}
                  onClose={() => {
                    if (engineRef.current) engineRef.current.selected = null;
                    setPick(null);
                  }}
                />
              </motion.div>
            ) : hint ? (
              <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl bg-black/65 px-3 py-2 text-xs text-white/80 backdrop-blur">
                👆 {t("interior.hint")}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        {!manage && (
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto self-end shadow-lg"
            onClick={() => {
              if (engineRef.current) engineRef.current.selected = null;
              setPick(null);
              setManage(true);
            }}
          >
            <SlidersHorizontal /> {t("plant.manage")}
          </Button>
        )}
      </div>
      <Sheet open={manage} onClose={() => setManage(false)} title={plantName(state, plotId, t)} icon={cfg.emoji} sheetKey="factory-manage">
        <PlantPanel id={plotId} inside />
      </Sheet>
    </motion.div>
  );
}

function Chip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-black/55 px-2 py-1 backdrop-blur">
      <div className="truncate text-[9px] font-semibold uppercase tracking-wide text-white/50">
        {icon} {label}
      </div>
      <div className="truncate text-xs font-black tabular-nums">{value}</div>
    </div>
  );
}

/** Why a plant stands, in words (the plant's own status). */
function statusText(state: GameState, p: PlantData, t: ReturnType<typeof useT>["t"]) {
  return t(`status.${p.status}` as MessageKey, { ...debtVars(state, formatMoney), raw: p.short ? t(`mat.${p.short}` as MessageKey) : t("chain.raw"), item: itemName(p.missing ?? "engine", t) });
}

/** The plant's batch in progress (frozen, in amber, while the plant stands). */
function BatchBar({ progress, ok }: { progress: number; ok: boolean }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={cn("h-full rounded-full", ok ? "bg-emerald-400" : "bg-amber-500")} style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
    </div>
  );
}

/** The card for one machine: what it does, how it is doing, and its upgrade (the plant's real upgrade it stands for). */
function StationCard({ plotId, id, placed, people, robots, onClose }: { plotId: string; id: StationId; placed?: PlacedStation; people: number; robots: number; onClose: () => void }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const g = useGame.getState();
  const { t } = useT();
  const b = state.city.buildings[plotId];
  const st = snap.chain.plants[plotId];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const gm = snap.gm;
  const recipe = recipeFor(st.type);
  const def = recipe.find((d) => d.id === id) ?? recipe[0];
  const cfg = PLANT_BY_ID[st.type];
  const item = cfg.item ?? "body";
  const perMin = st.unitsPerSec * 60;
  // a Body Works machine: its place on the shop floor
  const slot = st.type === "bodyWorks" ? placed?.slot : undefined;
  const floor = slot !== undefined ? workshopOf(p) : null;
  const built = placed ? placed.mode !== "planned" : true;

  let level = "";
  let stat: [string, string] = ["", ""];
  let title = "";
  let cost: number | null = null;
  let buy: () => unknown = () => false;
  switch (def.upgrade) {
    case "speed":
      level = t("common.lv", { level: p.speed });
      stat = [t("interior.speedBonus"), `+${formatPercent(Math.pow(SPEED.mult, p.speed) - 1)}`];
      title = t("interior.upgradeSpeed");
      cost = speedCost(b, gm);
      buy = () => g.plantSpeed(plotId);
      break;
    case "automation":
      level = t(`automation.${p.automation}` as MessageKey);
      stat = [t("interior.speedBonus"), `×${AUTOMATION[p.automation].speed}`];
      title = p.automation < AUTOMATION.length - 1 ? t("interior.upgradeAuto", { name: t(`automation.${p.automation + 1}` as MessageKey) }) : level;
      cost = automationCost(b, gm);
      buy = () => g.plantAutomation(plotId);
      break;
    case "grade":
      level = gradeName(item, p.grade, t);
      stat = [t("interior.value"), `×${GRADES[p.grade - 1].value}`];
      title = p.grade < GRADES.length ? t("interior.upgradeGrade", { name: gradeName(item, p.grade + 1, t) }) : level;
      cost = gradeCost(b, gm);
      buy = () => g.plantGrade(plotId);
      break;
    case "level":
      level = t("common.lv", { level: b.level });
      stat = def === recipe[0] && cfg.item ? [t("interior.stock"), `${formatNumber(Math.floor(stockTotal(p.stock)))}/${formatNumber(st.rawCap)}`] : [t("interior.stock"), `${formatNumber(Math.floor(p.out))}/${formatNumber(st.outCap)}`];
      title = b.level < PLANT_LEVELS.length ? t("interior.upgradeLevel", { name: t(`plantLevel.${b.level + 1}` as MessageKey) }) : level;
      cost = levelCost(b, gm);
      buy = () => g.plantLevel(plotId);
      break;
  }

  return (
    <div className="rounded-2xl bg-[#2b2b2e]/95 p-3 shadow-[0_4px_0_0_rgba(0,0,0,0.35)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">
            {def.icon} {t(`interior.station.${id}` as MessageKey)}
          </div>
          <div className="text-[11px] font-semibold text-amber-300">
            {floor && slot !== undefined ? t("interior.machineOf", { n: slot + 1, total: BODY_WORKSHOP.max }) : ""}
            {floor && built ? " · " : ""}
            {built ? level : ""}
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-white/50 hover:bg-white/10" aria-label={t("common.back")}>
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/55">{t(`interior.desc.${id}` as MessageKey)}</p>
      {floor && slot !== undefined && <ShopFloorMachine plotId={plotId} id={id} slot={slot} floor={floor} robot={placed?.mode === "robot"} />}
      {built && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <Mini label={t("interior.output")} value={`${formatNumber(perMin)}${t("unit.perMin")}`} />
            <Mini label={stat[0]} value={stat[1]} />
            <Mini label={robots ? t("interior.robots") : t("interior.people")} value={`${robots ? `🤖 ${robots}` : `👷 ${people}`}`} />
          </div>
          <CostButton className="mt-2 w-full" cost={cost} onBuy={buy} label={title} />
        </>
      )}
    </div>
  );
}

/**
 * One machine of the Body Works shop floor: built or not, its operator, what
 * it adds to the plant's speed, the batch it is on, and what building or
 * staffing it costs and brings. Every number comes from the engine.
 */
function ShopFloorMachine({ plotId, id, slot, floor, robot }: { plotId: string; id: StationId; slot: number; floor: Workshop; robot: boolean }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const g = useGame.getState();
  const { t } = useT();
  const b = state.city.buildings[plotId];
  const st = snap.chain.plants[plotId];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const m = workshopMachines(floor)[slot];
  if (!m) return null;
  const perMin = st.unitsPerSec * 60;
  const stopped = p.status !== "ok";
  const look = !m.installed
    ? { text: t("interior.state.notBuilt"), tone: "text-white/55", dot: "bg-white/30" }
    : stopped
      ? { text: t("interior.state.stopped", { why: statusText(state, p, t) }), tone: "text-red-300", dot: "bg-red-500" }
      : m.staffed
        ? { text: t("interior.state.running"), tone: "text-emerald-300", dot: "bg-emerald-400" }
        : { text: t("interior.state.noOperator"), tone: "text-amber-300", dot: "bg-amber-400" };
  const operator = !m.installed ? "—" : m.staffed ? t(robot ? "interior.robotOperator" : "interior.operatorN", { n: slot + 1 }) : t("interior.noOperator");
  // what it adds now (or would add once built), and what an operator would add on top
  const adds = slot === 0 ? t("interior.base") : `+${formatPercent(m.installed ? m.bonus : BODY_WORKSHOP.machine)}`;
  const more = slot > 0 && !m.staffed ? t("interior.moreWithOperator", { n: formatPercent(BODY_WORKSHOP.operator) }) : "";
  // the effect of the next purchase: the plant's speed and output while it runs
  const gain = (next: Workshop) => {
    const r = workshopSpeed("bodyWorks", next) / st.workshopSpeed - 1;
    const n = perMin * r;
    return `${t("interior.gain", { p: formatPercent(r), n: formatNumber(n, 2), item: itemName("body", t) })} · ${t("interior.worth", { v: formatMoney(n * st.unitValue) })}`;
  };

  let action: React.ReactNode = null;
  if (!m.installed) {
    action =
      slot === floor.machines ? (
        <Buy cost={bodyMachineCost(state, plotId)} onBuy={() => g.buyBodyMachine(plotId)} label={t("interior.buildMachine")} gain={gain({ machines: floor.machines + 1, workers: floor.workers })} note={t("interior.oneOff")} />
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-white/50">🔒 {t("interior.buildFirst", { n: floor.machines + 1 })}</p>
      );
  } else if (!m.staffed) {
    action =
      slot === floor.workers ? (
        <Buy cost={bodyWorkerCost(state, plotId)} onBuy={() => g.hireBodyWorker(plotId)} label={t("interior.hireOperator")} gain={gain({ machines: floor.machines, workers: floor.workers + 1 })} note={t("interior.oneOff")} />
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-white/50">🔒 {t("interior.hireFirst", { n: floor.workers + 1 })}</p>
      );
  }

  return (
    <div className="mt-2 space-y-1 rounded-xl bg-white/[0.05] px-2 py-1.5 text-[11px]">
      <Row label={t("interior.state")}>
        <span className={cn("inline-flex items-center gap-1 font-bold", look.tone)}>
          <span className={cn("inline-block size-1.5 shrink-0 rounded-full", look.dot)} />
          <span>{look.text}</span>
        </span>
      </Row>
      <Row label={t("interior.operator")}>
        <span className="font-semibold">{m.staffed ? "👷 " : ""}{operator}</span>
      </Row>
      <Row label={t("interior.adds")}>
        <span className="font-bold text-emerald-300">{adds}</span>
        {more && <span className="text-white/45"> · {more}</span>}
      </Row>
      <Row label={t("interior.makes")}>
        <span className="font-semibold">{t(`interior.make.${id}` as MessageKey)}</span>
      </Row>
      {m.installed && (
        <div>
          <div className="flex items-center justify-between gap-2 text-[10px] text-white/50">
            <span>⏱ {t("interior.batch")}</span>
            <span className="tabular-nums">
              {Math.floor(p.progress * 100)}% · {t("plant.rate", { n: formatNumber(st.lines), item: itemName("body", t), time: formatTime(st.cycle) })}
            </span>
          </div>
          <BatchBar progress={p.progress} ok={!stopped} />
        </div>
      )}
      {action}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-white/45">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** A shop-floor purchase with its price and what it brings. */
function Buy({ cost, onBuy, label, gain, note }: { cost: number | null; onBuy: () => unknown; label: string; gain: string; note: string }) {
  return (
    <div className="pt-1">
      <CostButton className="w-full" size="sm" cost={cost} onBuy={onBuy} label={label} />
      <p className="mt-1 text-[10px] leading-snug text-emerald-300/90">{gain}</p>
      <p className="text-[10px] text-white/40">{note}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.05] px-1 py-1">
      <div className="truncate text-[9px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="truncate text-xs font-bold tabular-nums">{value}</div>
    </div>
  );
}
