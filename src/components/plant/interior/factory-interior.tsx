"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CostButton } from "@/components/game/cost-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AUTOMATION, COMPONENT_BY_ID, GRADES, PLANT_BY_ID, PLANT_LEVELS, SPEED } from "@/game/config/chain";
import { MANAGERS } from "@/game/config/managers";
import { automationCost, gradeCost, levelCost, speedCost } from "@/game/engine/chain";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CAR_MODEL_FOR } from "../../map/vehicles";
import { gradeName, itemName, plantName } from "../../panels/plant-panel";
import { InteriorEngine, type StationPick } from "./interior-engine";
import { BODY_STATIONS, interiorLayout, type StationId } from "./layout";

/** Plants that already have a walk-in interior (the others keep the factory floor view). */
export const HAS_INTERIOR = new Set(["bodyWorks"]);

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
  const selectPlot = useUi((u) => u.selectPlot);
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<InteriorEngine | null>(null);
  const [pick, setPick] = useState<StationPick | null>(null);
  const [hint, setHint] = useState(true);
  const p = b?.plant;
  const manager = MANAGERS.some((m) => state.managers[m.id].hired && state.managers[m.id].assignedTo === plotId);

  useEffect(() => {
    const engine = new InteriorEngine(canvasRef.current!);
    engineRef.current = engine;
    engine.onSelect = (s) => {
      setPick(s);
      setHint(false);
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
      if (engineRef.current?.selected) {
        engineRef.current.selected = null;
        setPick(null);
      } else openFloor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFloor]);

  const labels = useMemo(() => Object.fromEntries(BODY_STATIONS.map((d) => [d.id, t(`interior.station.${d.id}` as MessageKey)])) as Record<StationId, string>, [t]);

  useEffect(() => {
    if (!p || !st || !b) return;
    const cfg = PLANT_BY_ID[st.type];
    const inbound = state.chain.shipments.some((sh) => sh.to === plotId && sh.item === "raw" && !sh.back);
    engineRef.current?.setScene({
      spec: { level: b.level, automation: p.automation, manager },
      running: p.status === "ok",
      raw: cfg.item ? p.raw / st.rawCap : 0,
      out: p.out / st.outCap,
      docked: p.out >= 1,
      inbound,
      accent: cfg.roof,
      color: cfg.item ? COMPONENT_BY_ID[cfg.item].color : "#ef4444",
      labels,
      lockedLabel: (hall, level) => t("interior.locked", { n: hall + 1, level }),
      model: CAR_MODEL_FOR.city,
    });
  }, [p, st, b, labels, manager, plotId, state.chain.shipments, t]);

  if (!b?.plant || !st || !p) return null;
  const cfg = PLANT_BY_ID[st.type];
  const perMin = st.unitsPerSec * 60;
  const layout = interiorLayout({ level: b.level, automation: p.automation, manager });
  return (
    <motion.div
      className="fixed inset-0 z-40 bg-[#0b1220]"
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
        {p.status !== "ok" && (
          <div className="mt-2 flex justify-center">
            <div className="rounded-xl bg-amber-500/90 px-3 py-1.5 text-xs font-black text-black shadow-lg">
              ⚠️ {t(`status.${p.status}` as MessageKey, { raw: t(`raw.${cfg.raw}` as MessageKey), item: itemName(p.missing ?? "engine", t) })} · {t("status.paused")}
            </div>
          </div>
        )}
      </div>

      {/* bottom: the picked machine, or a hint; and the plant's full controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="pointer-events-auto min-w-0 max-w-[340px] flex-1">
          <AnimatePresence mode="wait">
            {pick ? (
              <motion.div key={`${pick.line}-${pick.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.16 }}>
                <StationCard
                  plotId={plotId}
                  id={pick.id}
                  people={layout.people.filter((h) => h.line === pick.line && h.station === pick.id).length}
                  robots={layout.robots.filter((r) => r.line === pick.line && r.station === pick.id).length}
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
        <Button
          size="sm"
          variant="secondary"
          className="pointer-events-auto shadow-lg"
          onClick={() => {
            openFloor(null);
            selectPlot(plotId);
          }}
        >
          <SlidersHorizontal /> {t("plant.manage")}
        </Button>
      </div>
      {manager && (
        <div className="pointer-events-none absolute right-2 top-[calc(env(safe-area-inset-top)+6.2rem)] rounded-lg bg-black/55 px-2 py-1 text-[10px] font-semibold text-emerald-300 backdrop-blur">
          👔 {t("interior.manager")}
        </div>
      )}
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

/** The card for one machine: what it does, how it is doing, and its upgrade (the plant's real upgrade it stands for). */
function StationCard({ plotId, id, people, robots, onClose }: { plotId: string; id: StationId; people: number; robots: number; onClose: () => void }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const g = useGame.getState();
  const { t } = useT();
  const b = state.city.buildings[plotId];
  const st = snap.chain.plants[plotId];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const gm = snap.gm;
  const def = BODY_STATIONS.find((d) => d.id === id)!;
  const cfg = PLANT_BY_ID[st.type];
  const item = cfg.item ?? "body";
  const perMin = st.unitsPerSec * 60;

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
      stat = id === "rawStore" ? [t("interior.stock"), `${formatNumber(Math.floor(p.raw))}/${formatNumber(st.rawCap)}`] : [t("interior.stock"), `${formatNumber(Math.floor(p.out))}/${formatNumber(st.outCap)}`];
      title = b.level < PLANT_LEVELS.length ? t("interior.upgradeLevel", { name: t(`plantLevel.${b.level + 1}` as MessageKey) }) : level;
      cost = levelCost(b, gm);
      buy = () => g.plantLevel(plotId);
      break;
  }

  return (
    <div className="rounded-2xl bg-[#0f172a]/92 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">
            {def.icon} {t(`interior.station.${id}` as MessageKey)}
          </div>
          <div className="text-[11px] font-semibold text-amber-300">{level}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-white/50 hover:bg-white/10" aria-label={t("common.back")}>
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/55">{t(`interior.desc.${id}` as MessageKey)}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Mini label={t("interior.output")} value={`${formatNumber(perMin)}${t("unit.perMin")}`} />
        <Mini label={stat[0]} value={stat[1]} />
        <Mini label={robots ? t("interior.robots") : t("interior.people")} value={`${robots ? `🤖 ${robots}` : `👷 ${people}`}`} />
      </div>
      <CostButton className="mt-2 w-full" cost={cost} onBuy={buy} label={title} />
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
