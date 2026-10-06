"use client";

import { motion } from "framer-motion";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COMPONENT_BY_ID, PLANT_BY_ID } from "@/game/config/chain";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { debtVars, stockTotal } from "@/game/engine/materials";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CAR_MODEL_FOR } from "../map/vehicles";
import { itemName, plantName, processSteps, StockBar } from "../panels/plant-panel";
import { FloorEngine } from "./floor-engine";

/** Full-screen view inside a plant: its production line, live. */
export function PlantFloor({ plotId }: { plotId: string }) {
  const state = useGame((g) => g.state);
  const st = useGame((g) => g.snap.chain.plants[plotId]);
  const openFloor = useUi((u) => u.openFloor);
  const selectPlot = useUi((u) => u.selectPlot);
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FloorEngine | null>(null);
  const b = state.city.buildings[plotId];

  useEffect(() => {
    const engine = new FloorEngine(canvasRef.current!);
    engineRef.current = engine;
    engine.start();
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openFloor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFloor]);

  const p = b?.plant;
  useEffect(() => {
    if (!p || !st || !b) return;
    const cfg = PLANT_BY_ID[st.type];
    engineRef.current?.setScene({
      type: st.type,
      // levels 11-15 keep the Auto City look
      level: Math.min(b.level, 10),
      automation: p.automation,
      progress: p.progress,
      running: p.status === "ok",
      steps: processSteps(st.type, t),
      raw: cfg.item ? stockTotal(p.stock) / st.rawCap : Math.min(1, Object.values(p.inputs).reduce((a, v) => a + (v ?? 0), 0) / (st.inCap * 6)),
      out: p.out / st.outCap,
      docked: p.out >= 1 ? 1 : 0,
      color: cfg.item ? COMPONENT_BY_ID[cfg.item].color : "#ef4444",
      item: cfg.item ?? "car",
      model: st.car ? CAR_MODEL_FOR[st.car.id] : undefined,
      paint: st.car?.color,
      accent: cfg.roof,
    });
  }, [p, st, b, t]);

  if (!b?.plant || !st) return null;
  const cfg = PLANT_BY_ID[st.type];
  const item = cfg.item ?? "car";
  return (
    <motion.div className="fixed inset-0 z-40 flex flex-col bg-ink" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.25 }}>
      <header className="flex items-center gap-2 border-b border-white/10 bg-ink/90 p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-xl">
        <Button size="icon" variant="secondary" onClick={() => openFloor(null)} aria-label={t("common.back")}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">
            {cfg.emoji} {plantName(state, plotId, t)}
          </div>
          <div className="truncate text-[11px] text-white/50">
            {t("plant.rate", { n: formatNumber(st.lines), item: itemName(item, t), time: formatDuration(st.cycle) })}
          </div>
        </div>
        <Badge variant="gold">
          {t("common.lv", { level: b.level })} · {t(`plantLevel.${b.level}` as MessageKey)}
        </Badge>
      </header>
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
        {b.plant.status !== "ok" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="rounded-xl bg-amber-500/90 px-3 py-1.5 text-xs font-black text-black shadow-lg">
              ⚠️ {b.plant.status === "noParts" ? t("status.noParts", { item: itemName(b.plant.missing ?? "engine", t).toUpperCase() }) : t(`status.${b.plant.status}` as MessageKey, { ...debtVars(state, formatMoney), raw: t(`raw.${cfg.raw}` as MessageKey) })} · {t("status.paused")}
            </div>
          </div>
        )}
      </div>
      <footer className="grid gap-2 border-t border-white/10 bg-ink/90 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl sm:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {cfg.item && <StockBar label={t(`raw.${cfg.raw}` as MessageKey)} value={stockTotal(b.plant.stock)} cap={st.rawCap} color="#a8a29e" />}
          <StockBar label={`📦 ${itemName(item, t)}`} value={b.plant.out} cap={st.outCap} color="#38bdf8" />
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            openFloor(null);
            selectPlot(plotId);
          }}
        >
          <SlidersHorizontal /> {t("plant.manage")}
        </Button>
      </footer>
    </motion.div>
  );
}
