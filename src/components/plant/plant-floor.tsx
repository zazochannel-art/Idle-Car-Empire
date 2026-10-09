"use client";

import { motion } from "framer-motion";
import { ArrowLeft, HardHat, Plus, SlidersHorizontal, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COMPONENT_BY_ID, PLANT_BY_ID } from "@/game/config/chain";
import { STATION_MACHINES } from "@/components/three/industrial-models";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { debtVars, stockTotal } from "@/game/engine/materials";
import { bodyMachineCost, bodyWorkerCost } from "@/game/engine/chain";
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
  const [cinematic, setCinematic] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(0);
  const buyMachine = useGame((g) => g.buyBodyMachine);
  const hireWorker = useGame((g) => g.hireBodyWorker);
  const b = state.city.buildings[plotId];

  useEffect(() => {
    const engine = new FloorEngine(canvasRef.current!, (index) => setSelectedMachine(index));
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
      rawMaterial: cfg.raw,
      machineCount: st.type === "bodyWorks" ? (p.workshop?.machines ?? 1) : undefined,
      workers: st.type === "bodyWorks" ? (p.workshop?.workers ?? 1) : undefined,
      staffedLabel: state.settings.lang === "ro" ? "OCUPAT" : state.settings.lang === "ru" ? "ЗАНЯТ" : "STAFFED",
      vacantLabel: state.settings.lang === "ro" ? "LIBER" : state.settings.lang === "ru" ? "СВОБОДНО" : "HIRE",
      cinematic,
    });
  }, [p, st, b, t, cinematic]);

  if (!b?.plant || !st) return null;
  const cfg = PLANT_BY_ID[st.type];
  const item = cfg.item ?? "car";
  const workshop = b.plant.workshop ?? { machines: 1, workers: 1 };
  const machineCost = st.type === "bodyWorks" ? bodyMachineCost(state, plotId) : null;
  const workerCost = st.type === "bodyWorks" ? bodyWorkerCost(state, plotId) : null;
  const selectedKind = STATION_MACHINES.bodyWorks[selectedMachine] ?? "coils";
  const selectedHasWorker = selectedMachine < workshop.workers;
  const isNextHireSlot = selectedMachine === workshop.workers && selectedMachine < workshop.machines;
  const lang = state.settings.lang;
  const machineLabelFor = (kind: string) => {
    if (kind === "coils") return lang === "ro" ? "Alimentator de tablă" : lang === "ru" ? "Подача листового металла" : "Sheet metal feeder";
    if (kind === "press") return lang === "ro" ? "Presă hidraulică" : lang === "ru" ? "Гидравлический пресс" : "Hydraulic press";
    if (kind === "welder") return lang === "ro" ? "Stație de sudură" : lang === "ru" ? "Сварочная станция" : "Welding station";
    if (kind === "paintBooth") return lang === "ro" ? "Cabină de vopsire" : lang === "ru" ? "Покрасочная камера" : "Paint booth";
    if (kind === "qcTunnel") return lang === "ro" ? "Controlul calității" : lang === "ru" ? "Контроль качества" : "Quality inspection";
    if (kind === "packer") return lang === "ro" ? "Stație de ambalare" : lang === "ru" ? "Упаковочная станция" : "Packing station";
    return lang === "ro" ? "Stație de finisare" : lang === "ru" ? "Финишная станция" : "Finishing station";
  };
  const machineOperationFor = (kind: string) => {
    if (kind === "coils") return lang === "ro" ? "Pregătește și alimentează tabla" : lang === "ru" ? "Подготовка и подача листового металла" : "Prepare and feed sheet metal";
    if (kind === "press") return lang === "ro" ? "Formează panourile caroseriei" : lang === "ru" ? "Формовка панелей кузова" : "Form body panels";
    if (kind === "welder") return lang === "ro" ? "Sudează panourile caroseriei" : lang === "ru" ? "Сварка панелей кузова" : "Weld body panels";
    if (kind === "paintBooth") return lang === "ro" ? "Aplică stratul de vopsea" : lang === "ru" ? "Нанесение краски" : "Apply paint finish";
    if (kind === "qcTunnel") return lang === "ro" ? "Verifică defectele caroseriei" : lang === "ru" ? "Проверка кузова на дефекты" : "Inspect body for defects";
    if (kind === "packer") return lang === "ro" ? "Pregătește caroseria pentru transport" : lang === "ru" ? "Подготовка кузова к перевозке" : "Prepare body for shipping";
    return lang === "ro" ? "Finisează piesa" : lang === "ru" ? "Финишная обработка детали" : "Finish the part";
  };
  const machineLabel = machineLabelFor(selectedKind);
  const selectedOperation = machineOperationFor(selectedKind);
  const workshopText = lang === "ro"
    ? { title: "Atelier caroserii", machine: "Utilaj", worker: "Muncitor", build: "Construiește utilaj", hire: "Angajează muncitor", selected: "Utilaj selectat", idle: "Loc pregătit pentru următorul utilaj", limit: "Limită atinsă", needMachine: "Construiește mai întâi un utilaj pentru a angaja încă un muncitor.", effect: "Productivitate", hint: "Atinge utilajul din hală pentru a-l selecta.", assigned: "Muncitor repartizat", vacant: "Fără muncitor", hireSelected: "Angajează muncitor", selectNext: "Selectează următorul utilaj liber", operation: "Operațiune" }
    : lang === "ru"
      ? { title: "Цех кузовов", machine: "Станок", worker: "Рабочий", build: "Построить станок", hire: "Нанять рабочего", selected: "Выбранный станок", idle: "Место для следующего станка", limit: "Достигнут лимит", needMachine: "Сначала постройте станок, чтобы нанять рабочего.", effect: "Производительность", hint: "Нажмите на станок в цехе, чтобы выбрать его.", assigned: "Рабочий назначен", vacant: "Нет рабочего", hireSelected: "Нанять рабочего", selectNext: "Выберите следующий свободный станок", operation: "Операция" }
      : { title: "Body Works workshop", machine: "Machine", worker: "Worker", build: "Build machine", hire: "Hire worker", selected: "Selected machine", idle: "Space reserved for the next machine", limit: "Limit reached", needMachine: "Build another machine before hiring another worker.", effect: "Productivity", hint: "Tap a machine in the hall to select it.", assigned: "Worker assigned", vacant: "Unstaffed", hireSelected: "Hire worker", selectNext: "Select the next unstaffed machine", operation: "Operation" };
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
        <Button size="sm" variant={cinematic ? "default" : "secondary"} onClick={() => setCinematic((v) => !v)} className="hidden sm:flex">
          🎥 {cinematic ? "LIVE" : "Factory Cam"}
        </Button>
      </header>
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          <div className="rounded-xl bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-md ring-1 ring-white/10">
            {cinematic ? "🎥 LIVE FACTORY" : "🏭 LIVE PRODUCTION"}
          </div>
          <div className="rounded-xl bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white/75 backdrop-blur-md ring-1 ring-white/10">
            🤖 {(p?.automation ?? 0) >= 4 ? "AI Factory" : (p?.automation ?? 0) >= 2 ? "Automated" : "Human Shift"}
          </div>
          <div className="rounded-xl bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white/75 backdrop-blur-md ring-1 ring-white/10">
            📦 {formatNumber(b.plant.out)} / {formatNumber(st.outCap)}
          </div>
        </div>
        {st.type === "bodyWorks" && (
          <section className="absolute bottom-3 right-3 z-10 w-[min(88vw,320px)] rounded-2xl border border-white/15 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur-xl sm:bottom-4 sm:right-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="rounded-lg bg-amber-400/15 p-2 text-amber-300"><Wrench className="size-4" /></div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black">{workshopText.title}</div>
                  <div className="text-[10px] text-white/55">{workshopText.hint}</div>
                </div>
              </div>
              <Badge variant="gold">{workshop.machines}/5</Badge>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {Array.from({ length: workshop.machines }, (_, index) => (
                <button key={index} type="button" onClick={() => setSelectedMachine(index)} className={`rounded-xl border p-2 text-left transition ${selectedMachine === index ? "border-amber-300 bg-amber-300/15" : "border-white/10 bg-white/5"}`}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold"><Wrench className="size-3 shrink-0" /> <span>{index + 1}. {machineLabelFor(STATION_MACHINES.bodyWorks[index] ?? "coils")}</span></div>
                  <div className="mt-1 text-[10px] text-white/50">{index < workshop.workers ? workshopText.worker + " " + (index + 1) : lang === "ro" ? "Fără muncitor" : lang === "ru" ? "Без рабочего" : "Unstaffed"}</div>
                </button>
              ))}
              {workshop.machines < 5 && <div className="flex items-center justify-center rounded-xl border border-dashed border-white/15 p-2 text-[10px] text-white/40">{workshopText.idle}</div>}
            </div>
            <div className="mb-3 rounded-xl bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/45">{workshopText.selected}</div>
              <div className="mt-0.5 text-xs font-bold">{machineLabel}</div>
              <div className="mt-1 text-[10px] text-white/55">{workshopText.operation}: {selectedOperation} · {selectedHasWorker ? workshopText.assigned : workshopText.vacant}</div>
              <div className="mt-1 text-[10px] text-emerald-300">{workshopText.effect}: {Math.round((1 + Math.max(0, workshop.machines - 1) * 0.05 + Math.max(0, Math.min(workshop.machines, workshop.workers) - 1) * 0.15) * 100)}%</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" className="h-auto min-h-10 whitespace-normal px-2 py-2 text-[11px]" disabled={machineCost === null || state.cash < machineCost} onClick={() => buyMachine(plotId)}>
                <Plus className="size-3 shrink-0" /> <span>{workshopText.build}{machineCost === null ? ` · ${workshopText.limit}` : ` · ${formatMoney(machineCost)}`}</span>
              </Button>
              <Button size="sm" variant="secondary" className="h-auto min-h-10 whitespace-normal px-2 py-2 text-[11px]" disabled={!isNextHireSlot || workerCost === null || state.cash < (workerCost ?? Infinity)} onClick={() => hireWorker(plotId)}>
                <HardHat className="size-3 shrink-0" /> <span>{isNextHireSlot ? workshopText.hireSelected : selectedHasWorker ? workshopText.assigned : workshopText.selectNext}{workerCost !== null && isNextHireSlot ? " · " + formatMoney(workerCost) : ""}</span>
              </Button>
            </div>
          </section>
        )}
        {b.plant.status !== "ok" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="rounded-xl bg-amber-500/90 px-3 py-1.5 text-xs font-black text-black shadow-lg">
              ⚠️ {b.plant.status === "noParts" ? t("status.noParts", { item: itemName(b.plant.missing ?? "engine", t).toUpperCase() }) : t(`status.${b.plant.status}` as MessageKey, { ...debtVars(state, formatMoney), raw: t(`raw.${cfg.raw}` as MessageKey) })} · {t("status.paused")}
            </div>
          </div>
        )}
      </div>
      <footer className="grid gap-2 border-t border-white/10 bg-ink/90 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl sm:grid-cols-[1fr_auto]">
        <Button size="sm" variant={cinematic ? "default" : "secondary"} className="sm:hidden" onClick={() => setCinematic((v) => !v)}>
          🎥 {cinematic ? "LIVE FACTORY" : "Factory Cam"}
        </Button>
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
