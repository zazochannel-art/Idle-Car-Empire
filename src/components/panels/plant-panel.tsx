"use client";

import { WorksBanner } from "./land-panel";
import { Factory, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { AUTOMATION, BASE_MAX_LEVEL, CHASSIS_BONUS, COMPONENTS, COMPONENT_BY_ID, GRADES, MAKER, OUTSOURCE, OUTSOURCED_PARTS, PLANT_BY_ID, PLANT_LEVELS, PLANT_TRUCKS, SPEED } from "@/game/config/chain";
import { DEALER_BY_ID, DEALER_SPECIALTY } from "@/game/config/dealerships";
import { MANAGERS } from "@/game/config/managers";
import { DEPOT, MARKET, plotOf } from "@/game/city/layout";
import { MATERIALS } from "@/game/config/economy";
import { debtVars, marketPrice, usedMaterials } from "@/game/engine/materials";
import { REGIONS } from "@/game/config/regions";
import { AUTO_UPGRADE_FROM, plantNetValue, plantProfitPerMin, plantUnitCost, automationCost, bestGrade, carLock, carValue, componentValue, dealerStats, trucksOf, gradeCost, levelCost, hasPlant, plantNumber, plantsOf, recipe, speedCost, supplied, suppliedGrade, supplierPrice } from "@/game/engine/chain";
import { isManagerUnlocked } from "@/game/engine/actions";
import { dealerUpgradeCost, managerUpgradeCost } from "@/game/engine/economy";
import { dealerRequirement } from "@/game/engine/insights";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { ComponentId, DealerId, GameState, ItemId, PlantType } from "@/game/types";
import type { MessageKey, Vars } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { buildCar, loadHeroes, type BodyModel } from "@/components/three/car-models";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CostButton } from "../game/cost-button";
import { MaterialsPanel, RunningCosts, materialName } from "./materials-panel";
import { CarRoutePicker, QualityPicker } from "./market-controls";

type T = (k: MessageKey, v?: Vars) => string;

/** "Engine Factory #2" — numbered when there are several of a kind. */
export function plantName(s: GameState, plotId: string, t: T): string {
  const b = s.city.buildings[plotId];
  if (!b) return "";
  // the company starts as a "Small Car Body Works"
  const base = b.type === "bodyWorks" && b.level === 1 ? t("structure.bodyWorksSmall") : t(`structure.${b.type}`);
  const many = plantsOf(s).filter(([, o]) => o.type === b.type).length > 1;
  return many ? `${base} #${plantNumber(s, plotId)}` : base;
}

export const itemName = (item: ItemId, t: T) => t(`item.${item}`);
export const gradeName = (item: ComponentId, grade: number, t: T) => t(`grade.${item}.${grade}` as MessageKey);
const rawName = (type: PlantType, t: T) => t(`raw.${PLANT_BY_ID[type].raw}` as MessageKey);

/** The steps of a plant's process, e.g. Steel → Pressing → Welding → Car body. */
export function processSteps(type: PlantType, t: T): string[] {
  return t(`process.${type}`).split("|");
}

// ───────────────────────────── plants ─────────────────────────────

export function PlantPanel({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const g = useGame.getState();
  const openFloor = useUi((u) => u.openFloor);
  const { t, lang } = useT();
  const n = useContent(lang);
  const b = state.city.buildings[id];
  const st = snap.chain.plants[id];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const cfg = PLANT_BY_ID[st.type];
  const gm = snap.gm;
  const item: ItemId = cfg.item ?? "car";
  const plot = plotOf(id)!;
  const busy = state.chain.shipments.filter((sh) => sh.from === id).length;
  const hasAssembly = plantsOf(state).some(([, o]) => o.type === "assemblyPlant");
  const steps = processSteps(st.type, t);
  const step = Math.min(steps.length - 1, Math.floor(p.progress * (steps.length - 1)));
  const unitCost = plantUnitCost(st, gm);

  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="gold">
          {t("common.lv", { level: b.level })} · {t(`plantLevel.${b.level}` as MessageKey)}
        </Badge>
        <Badge variant="muted">🏭 {t(`plantStage.${b.level}` as MessageKey)}</Badge>
        <Badge variant="muted">🤖 {t(`automation.${p.automation}` as MessageKey)}</Badge>
        {cfg.item && <Badge variant="muted">★ {gradeName(cfg.item, p.grade, t)}</Badge>}
        <Badge variant="muted">📍 {t(`zone.${plot.zone}`)}</Badge>
      </div>

      <WorksBanner id={id} />
      <StatusLine id={id} />

      {/* production */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 flex items-center justify-between text-[11px] text-white/55">
          <span className="font-bold uppercase tracking-wider">{t("plant.production")}</span>
          <span className="tabular-nums">{t("plant.rate", { n: formatNumber(st.lines), item: itemName(st.combine ? "chassis" : item, t), time: formatDuration(st.cycle) })}</span>
        </div>
        {!cfg.item && st.car ? (
          <AssemblyLine id={id} steps={steps} step={step} />
        ) : (
          <div className="mb-2 flex flex-wrap items-center gap-1 text-[10px]">
            {steps.map((s, i) => (
              <span key={i} className="flex items-center gap-1">
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-semibold ring-1",
                    p.status === "ok" && i === step ? "bg-sky-400/20 text-sky-200 ring-sky-400/40" : "bg-white/[0.03] text-white/45 ring-white/10",
                  )}
                >
                  {s}
                </span>
                {i < steps.length - 1 && <span className="text-white/25">→</span>}
              </span>
            ))}
          </div>
        )}
        <Progress value={p.status === "ok" ? p.progress * 100 : 0} className="h-2" />
        {/* the core loop at a glance: how much, how full, how profitable */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label={t("plant.perMin")} value={`${formatNumber(st.unitsPerSec * 60)}${t("unit.perMin")}`} />
          <Stat label={t("plant.capacity")} value={`${formatNumber(Math.floor(p.out))}/${formatNumber(st.outCap)}`} />
          <Stat label={t("plant.profitMin")} value={formatMoney(plantProfitPerMin(st, gm))} gold />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label={t("plant.unitCost")} value={formatMoney(unitCost)} />
          <Stat label={t("plant.unitValue")} value={formatMoney(st.unitValue)} />
          <Stat label={t("plant.unitProfit")} value={formatMoney(plantNetValue(st) - unitCost)} gold />
        </div>
      </div>

      {/* 📦 the warehouse and the material market, then what running the plant costs */}
      <MaterialsPanel id={id} />
      <RunningCosts id={id} />

      {/* engine factory before assembly: sell engines, or motorized chassis */}
      {st.type === "engineFactory" && <EngineStrategy id={id} />}

      {/* assembly: what car is on the line, and where the cars go */}
      {!cfg.item && <ModelPicker id={id} />}
      {!cfg.item && <CarRoutePicker id={id} />}
      <QualityPicker id={id} />

      {/* stock */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("plant.stock")}</div>
        <div className="space-y-2">
          {st.combine && (
            <StockBar label={`${COMPONENT_BY_ID.body.emoji} ${itemName("body", t)}`} value={p.inputs.body ?? 0} cap={st.inCap} color={COMPONENT_BY_ID.body.color} warn={p.missing === "body"} />
          )}
          {!cfg.item &&
            st.car &&
            recipe(st.car).map((c) => (
              <StockBar key={c} label={`${COMPONENT_BY_ID[c].emoji} ${itemName(c, t)}`} value={p.inputs[c] ?? 0} cap={st.inCap} color={COMPONENT_BY_ID[c].color} warn={p.missing === c} />
            ))}
          <StockBar label={`📦 ${itemName(st.combine ? "chassis" : item, t)}`} value={p.out} cap={st.outCap} color="#38bdf8" />
        </div>
        {!cfg.item &&
          st.car &&
          recipe(st.car)
            .filter((c) => supplied(state, c))
            .map((c) => (
              <p key={c} className="mt-2 rounded-lg bg-sky-400/10 px-2 py-1.5 text-[11px] text-sky-200 ring-1 ring-sky-400/25">
                🚚 {t("supplier.note", { item: itemName(c, t), price: formatMoney(supplierPrice(c, suppliedGrade(c, st.car!))), plant: t(`structure.${PLANT_BY_ID[MAKER[c]].id}` as MessageKey) })}
              </p>
            ))}
        {!cfg.item && st.car && <EmergencyParts id={id} parts={recipe(st.car).filter((c) => OUTSOURCED_PARTS.includes(c) && hasPlant(state, MAKER[c]))} />}
      </div>

      {/* transport */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">{t("plant.transport")}</span>
          <span className="flex items-center gap-1 text-[11px] tabular-nums text-white/60">
            <Truck className="size-3.5" /> {t("plant.trucks", { busy, n: st.trucks, vehicle: t(`vehicle.${st.vehicle}`), cap: st.capacity })}
          </span>
        </div>
        <p className="text-[11px] text-white/55">{cfg.item ? (hasAssembly ? t("route.useHint") : t("route.useNoAssembly")) : t("plant.carsTo")}</p>
      </div>

      <ManagerSlot id={id} />

      {/* upgrades: capacity, speed, automation, value */}
      <div className="space-y-2">
        <UpgradeRow
          icon="🏗️"
          title={b.level < PLANT_LEVELS.length ? t("plant.levelUp", { name: t(`plantLevel.${b.level + 1}` as MessageKey) }) : t("plant.levelMax")}
          detail={b.level < PLANT_LEVELS.length ? `${t(`plantStage.${b.level + 1}` as MessageKey)} · ${t("plant.levelDetail", { a: PLANT_LEVELS[b.level - 1].lines, b: PLANT_LEVELS[b.level].lines, n: Math.max(trucksOf(b), PLANT_TRUCKS[b.level]) + st.trucks - trucksOf(b) })}` : ""}
          cost={levelCost(b, gm)}
          onBuy={() => g.plantLevel(id)}
          gold
          // levels 11+ open one per region: name the region that unlocks the next one
          maxedLabel={b.works ? t("works.inProgress") : b.level < PLANT_LEVELS.length && b.level >= gm.maxPlantLevel ? `🔒 ${REGIONS[b.level + 1 - BASE_MAX_LEVEL].emoji} ${n.region(REGIONS[b.level + 1 - BASE_MAX_LEVEL])}` : undefined}
        />
        <UpgradeRow icon="⚡" title={t("plant.speed", { n: p.speed })} detail={t("plant.speedDetail", { pct: formatPercent(SPEED.mult - 1) })} cost={speedCost(b, gm)} onBuy={() => g.plantSpeed(id)} />
        <UpgradeRow
          icon="🤖"
          title={p.automation < AUTOMATION.length - 1 ? t("plant.automate", { name: t(`automation.${p.automation + 1}` as MessageKey) }) : t(`automation.${p.automation}` as MessageKey)}
          detail={p.automation < AUTOMATION.length - 1 ? t("plant.automateDetail", { speed: AUTOMATION[p.automation + 1].speed, off: formatPercent(AUTOMATION[p.automation + 1].offline) }) : ""}
          cost={automationCost(b, gm)}
          onBuy={() => g.plantAutomation(id)}
        />
        <AutoUpgradeRow id={id} />
        {cfg.item && (
          <UpgradeRow
            icon="★"
            title={p.grade < GRADES.length ? t("plant.grade", { name: gradeName(cfg.item, p.grade + 1, t) }) : gradeName(cfg.item, p.grade, t)}
            detail={p.grade < GRADES.length ? t("plant.gradeDetail", { x: GRADES[p.grade].value / GRADES[p.grade - 1].value }) : ""}
            cost={gradeCost(b, gm)}
            onBuy={() => g.plantGrade(id)}
          />
        )}
      </div>

      <Button variant="secondary" className="w-full" onClick={() => openFloor(id)}>
        <Factory /> {t("plant.floor")}
      </Button>
    </div>
  );
}

/**
 * The first strategic choice: sell engines as they are, or fit each one into
 * a car body and sell the motorized chassis (worth more, needs bodies).
 * The game recommends one from your body and engine output.
 */
function EngineStrategy({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const setCombine = useGame((g) => g.setCombine);
  const { t } = useT();
  const st = snap.chain.plants[id];
  const p = state.city.buildings[id]?.plant;
  if (!st || !p || st.chassisValue === null) return null;
  const hasAssembly = plantsOf(state).some(([, b]) => b.type === "assemblyPlant");
  if (hasAssembly)
    return (
      <div className="rounded-2xl bg-white/[0.04] p-3 text-[11px] text-white/55 ring-1 ring-white/[0.07]">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("strategy.title")}</div>
        {t("strategy.assembly")}
      </div>
    );
  const bodyRate = Object.values(snap.chain.plants).reduce((a, o) => (o.type === "bodyWorks" ? a + o.unitsPerSec : a), 0);
  const engineRate = st.unitsPerSec;
  const bodyValue = st.chassisValue / CHASSIS_BONUS - st.engineValue;
  const extra = (st.chassisValue - st.engineValue - bodyValue) * Math.min(engineRate, bodyRate) * 60;
  const recommend = bodyRate >= engineRate * 0.95;
  const options = [
    { on: false, icon: "⚙️", title: t("strategy.sell"), value: st.engineValue, hint: t("strategy.sellHint") },
    { on: true, icon: "🚙⚙️", title: t("strategy.combine"), value: st.chassisValue, hint: t("strategy.combineHint", { pct: formatPercent(CHASSIS_BONUS - 1) }) },
  ];
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("strategy.title")}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = !!p.combine === o.on;
          const best = recommend === o.on;
          return (
            <button
              key={String(o.on)}
              onClick={() => setCombine(id, o.on)}
              className={cn("relative rounded-xl p-2.5 text-left ring-1 transition", active ? "bg-electric/20 ring-electric/60" : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]")}
            >
              {best && <span className="absolute -top-2 right-2 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-black uppercase text-black">{t("strategy.best")}</span>}
              <div className="text-lg leading-none">{o.icon}</div>
              <div className="mt-1 text-xs font-bold">{o.title}</div>
              <div className="text-sm font-black tabular-nums text-gold">{formatMoney(o.value)}</div>
              <div className="text-[10px] leading-tight text-white/50">{o.hint}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-white/55">
        {recommend
          ? t("strategy.why", { bodies: formatNumber(bodyRate * 60), engines: formatNumber(engineRate * 60), extra: formatMoney(extra) })
          : t("strategy.whyNot", { bodies: formatNumber(bodyRate * 60), engines: formatNumber(engineRate * 60) })}
      </p>
    </div>
  );
}

/** Which component each of the nine assembly stations fits (final assembly and QC fit none). */
const STATION_PART: (ComponentId | null)[] = ["body", "engine", "suspension", "interior", "glass", "tires", "paint", null, null];

/**
 * The assembly line station by station: what the car gains at each one, and
 * whether that part is in stock, missing, or not used by this model.
 */
function AssemblyLine({ id, steps, step }: { id: string; steps: string[]; step: number }) {
  const state = useGame((g) => g.state);
  const st = useGame((g) => g.snap.chain.plants[id]);
  const { t } = useT();
  const p = state.city.buildings[id]?.plant;
  if (!p || !st?.car) return null;
  const needs = new Set(recipe(st.car));
  return (
    <div className="mb-2 grid grid-cols-3 gap-1.5">
      {steps.map((name, i) => {
        const part = STATION_PART[i];
        const used = !part || needs.has(part);
        const have = part ? Math.floor(p.inputs[part] ?? 0) : 0;
        const missing = !!part && used && have < 1;
        const active = p.status === "ok" && i === step;
        return (
          <div
            key={i}
            className={cn(
              "rounded-lg px-2 py-1.5 ring-1",
              active ? "bg-sky-400/20 ring-sky-400/50" : missing ? "bg-amber-500/10 ring-amber-400/40" : used ? "bg-white/[0.04] ring-white/10" : "bg-white/[0.015] opacity-45 ring-white/5",
            )}
          >
            <div className="flex items-center justify-between gap-1 text-[9px] font-bold text-white/40">
              <span>{i + 1}</span>
              <span>{part ? COMPONENT_BY_ID[part].emoji : i === 7 ? "🔧" : "✅"}</span>
            </div>
            <div className="truncate text-[10px] font-semibold">{name}</div>
            <div className={cn("text-[9px] tabular-nums", missing ? "text-amber-300" : "text-white/45")}>
              {!part ? t("line.always") : !used ? t("line.notUsed") : missing ? t("line.missing") : t("line.inStock", { n: formatNumber(have) })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The factory's manager: who runs it, or hire / assign one right here. */
function ManagerSlot({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const { hireManager, assignManager, upgradeManager } = useGame.getState();
  const setView = useUi((u) => u.setView);
  const { t, lang } = useT();
  const n = useContent(lang);
  const here = MANAGERS.find((m) => state.managers[m.id].hired && state.managers[m.id].assignedTo === id);
  const idle = MANAGERS.filter((m) => m.scope === "factory" && state.managers[m.id].hired && !state.managers[m.id].assignedTo);
  const hireable = MANAGERS.find((m) => m.scope === "factory" && !state.managers[m.id].hired && isManagerUnlocked(state, m.id));
  const next = MANAGERS.find((m) => m.scope === "factory" && !state.managers[m.id].hired && !isManagerUnlocked(state, m.id));
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("plant.manager")}</div>
      {here ? (
        <div className="flex items-center gap-3">
          <span className="text-3xl">{here.avatar}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">
              {here.name} · {t("common.lv", { level: state.managers[here.id].level })}
            </div>
            <div className="truncate text-[11px] text-white/50">{n.role(here)}</div>
            <div className="truncate text-[11px] text-emerald-300">{n.bonus(here.bonus, state.managers[here.id].level)}</div>
          </div>
          <CostButton size="sm" cost={managerUpgradeCost(state, here.id)} onBuy={() => upgradeManager(here.id)} label={t("managers.train")} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-white/50">{t("plant.noManager")}</p>
          {idle.map((m) => (
            <button
              key={m.id}
              onClick={() => assignManager(m.id, id)}
              className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] p-2 text-left ring-1 ring-white/10 transition hover:bg-white/[0.08]"
            >
              <span className="text-2xl">{m.avatar}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.name}</span>
                <span className="block truncate text-[11px] text-emerald-300">{n.bonus(m.bonus, state.managers[m.id].level)}</span>
              </span>
              <span className="rounded-lg bg-electric px-2.5 py-1 text-[11px] font-black uppercase text-white">{t("plant.assign")}</span>
            </button>
          ))}
          {hireable && (
            <CostButton
              className="w-full"
              variant="gold"
              cost={hireable.cost}
              onBuy={() => hireManager(hireable.id, id)}
              label={`${hireable.avatar} ${t("plant.hire", { name: hireable.name })} · ${n.bonus(hireable.bonus, 1)}`}
            />
          )}
          {!hireable && !idle.length && next && (
            <p className="text-[11px] text-white/40">
              {next.avatar} {t("managers.unlockAt", { amount: formatMoney(next.unlockAt) })}
            </p>
          )}
          <button onClick={() => setView("managers")} className="text-[11px] font-semibold text-sky-300 hover:text-sky-200">
            {t("plant.allManagers")} →
          </button>
        </div>
      )}
    </div>
  );
}

/** Emergency parts: off unless switched on; bought at the emergency price when the company's own plants for them stop. */
function EmergencyParts({ id, parts }: { id: string; parts: ComponentId[] }) {
  const on = useGame((g) => !!g.state.city.buildings[id]?.plant?.backup);
  const setBackup = useGame((g) => g.setBackupParts);
  const { t } = useT();
  if (!parts.length) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
      <div className="min-w-0 text-[11px]">
        <div className="font-semibold">🆘 {t("supplier.backup")}</div>
        <div className="text-white/45">{t("supplier.backupHint", { items: parts.map((c) => itemName(c, t)).join(", "), pct: formatPercent(OUTSOURCE.emergency - 1) })}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => setBackup(id, !on)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-amber-500" : "bg-white/15")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.4rem]" : "left-0.5")} />
      </button>
    </div>
  );
}

function StatusLine({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const st = useGame((g) => g.snap.chain.plants[id]);
  const { t } = useT();
  const b = state.city.buildings[id];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const cfg = PLANT_BY_ID[st.type];
  let tone = "ok";
  let text = t("status.ok");
  if (p.status === "noRaw") {
    const inbound = state.chain.shipments.some((sh) => sh.to === id && sh.item === "raw" && !sh.back);
    const raw = p.short ? materialName(p.short, t) : t("chain.raw");
    tone = inbound ? "wait" : "bad";
    text = inbound ? t("status.rawComing", { raw }) : t("status.noRaw", { raw });
  } else if (p.status === "noCash") {
    tone = "bad";
    text = t("status.noCash");
  } else if (p.status === "suspended") {
    tone = "bad";
    text = t("status.suspended", debtVars(state, formatMoney));
  } else if (p.status === "full") {
    tone = "wait";
    text = t("status.full");
  } else if (p.status === "noParts") {
    tone = "bad";
    text = t("status.noParts", { item: itemName(p.missing ?? "engine", t).toUpperCase() });
  } else if (p.status === "noModel") {
    tone = "bad";
    text = t("status.noModel");
  }
  const cls =
    tone === "ok" ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/30" : tone === "wait" ? "bg-sky-500/10 text-sky-200 ring-sky-400/30" : "bg-amber-500/10 text-amber-200 ring-amber-400/40";
  return (
    <div className={cn("rounded-xl p-2.5 text-xs font-semibold ring-1", cls)}>
      {tone === "ok" ? "✅" : tone === "wait" ? "⏳" : "⚠️"} {text}
      {tone === "bad" && <div className="mt-0.5 text-[11px] font-normal opacity-80">{t("status.paused")}</div>}
      {cfg.item && tone !== "bad" && p.status === "ok" && <span className="font-normal opacity-70"> · {t("status.made", { n: formatNumber(p.made) })}</span>}
    </div>
  );
}

const CAR_THUMB_CACHE = new Map<string, string>();
let carThumbRenderer: THREE.WebGLRenderer | null = null;
let carThumbCanvas: HTMLCanvasElement | null = null;
let carThumbReady: Promise<void> | null = null;

async function renderCarThumbnail(model: (typeof CARS)[number]["id"], color: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const key = `${model}|${color}`;
  const cached = CAR_THUMB_CACHE.get(key);
  if (cached) return cached;

  carThumbReady ??= loadHeroes(THREE);
  await carThumbReady;

  carThumbCanvas ??= document.createElement("canvas");
  carThumbCanvas.width = 192;
  carThumbCanvas.height = 108;

  carThumbRenderer ??= new THREE.WebGLRenderer({
    canvas: carThumbCanvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  carThumbRenderer.setPixelRatio(1);
  carThumbRenderer.setSize(192, 108, false);
  carThumbRenderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 192 / 108, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223044, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(4, 6, 5);
  scene.add(light);

  const bodyModel: BodyModel = model === "perfSuv" ? "muscle" : (model as BodyModel);
  const car = buildCar(THREE, { model: bodyModel, color, finish: "gloss" });
  if (!car.children.length) return null;
  car.rotation.y = -0.2;
  scene.add(car);

  const box = new THREE.Box3().setFromObject(car);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  camera.position.set(center.x + radius * 1.45, center.y + radius * 0.7, center.z + radius * 1.45);
  camera.lookAt(center.x, center.y * 0.9, center.z);
  carThumbRenderer.render(scene, camera);

  const data = carThumbCanvas.toDataURL("image/png");
  CAR_THUMB_CACHE.set(key, data);
  return data;
}

function CarThumbnail({ model, color }: { model: (typeof CARS)[number]["id"]; color: string }) {
  const key = `${model}|${color}`;
  const [src, setSrc] = useState<string | null>(() => CAR_THUMB_CACHE.get(key) ?? null);

  useEffect(() => {
    if (src) return;
    let alive = true;
    void renderCarThumbnail(model, color).then((data) => {
      if (alive && data) setSrc(data);
    });
    return () => {
      alive = false;
    };
  }, [model, color, src]);

  return src ? (
    <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain p-1" draggable={false} />
  ) : (
    <div className="absolute inset-4 animate-pulse rounded-lg bg-white/[0.06]" />
  );
}

function ModelPicker({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const setPlantCar = useGame((g) => g.setPlantCar);
  const { t, lang } = useT();
  const n = useContent(lang);
  const chosen = state.city.buildings[id]?.plant?.car ?? null;
  const st = snap.chain.plants[id];
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("plant.model")}</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => setPlantCar(id, null)} className={cn("rounded-xl p-2 text-left text-xs ring-1", chosen === null ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10")}>
          <div className="font-bold">✨ {t("plant.bestModel")}</div>
          <div className="text-[10px] text-white/50">{st?.car ? state.designs[st.car.id].name : "—"}</div>
        </button>
        {CARS.map((c) => {
          const lock = carLock(state, c, snap.gm);
          return (
            <button
              key={c.id}
              disabled={!!lock}
              onClick={() => setPlantCar(id, c.id)}
              className={cn("group overflow-hidden rounded-xl text-left text-xs ring-1 disabled:opacity-40", chosen === c.id ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10")}
            >
              <div className="relative h-20 overflow-hidden bg-gradient-to-b from-white/[0.07] to-black/20 px-2">
                <div className="absolute inset-x-3 bottom-1 h-5 rounded-full bg-black/30 blur-md" />
                <CarThumbnail model={c.id} color={c.color} />
                <span className="absolute right-1.5 top-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/60">{c.body}</span>
              </div>
              <div className="p-2">
                <div className="truncate font-bold">{state.designs[c.id].name}</div>
                <div className="text-[10px] tabular-nums text-white/50">{lock ? `🔒 ${n.carLock(lock)}` : formatMoney(carValue(state, c, snap.gm))}</div>
              </div>
            </button>
          );
        })}
      </div>
      {st?.car && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-white/55">
          {t("plant.recipe")}:
          {recipe(st.car).map((c) => (
            <span key={c} className="rounded bg-white/5 px-1">
              {COMPONENT_BY_ID[c].emoji} {gradeName(c, st.car!.grade, t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function UpgradeRow({
  icon,
  title,
  detail,
  cost,
  onBuy,
  gold,
  maxedLabel,
}: {
  icon: string;
  title: string;
  detail: string;
  cost: number | null;
  onBuy: () => unknown;
  gold?: boolean;
  maxedLabel?: string;
}) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        {detail && <span className="block text-[11px] leading-snug text-white/50">{detail}</span>}
      </span>
      <CostButton size="sm" variant={gold ? "gold" : "default"} cost={cost} label={t("plot.upgrade")} maxedLabel={maxedLabel ?? t("common.max")} onBuy={onBuy} />
    </div>
  );
}

export function StockBar({ label, value, cap, color, warn }: { label: string; value: number; cap: number; color: string; warn?: boolean }) {
  const pct = cap > 0 ? Math.min(100, (value / cap) * 100) : 0;
  return (
    <div>
      <div className={cn("mb-0.5 flex justify-between text-[11px]", warn ? "font-bold text-amber-300" : "text-white/60")}>
        <span className="truncate">
          {warn && "⚠️ "}
          {label}
        </span>
        <span className="tabular-nums">
          {formatNumber(Math.floor(value))} / {formatNumber(cap)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: warn ? "#f59e0b" : color }} />
      </div>
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2 py-1.5 ring-1 ring-white/[0.06]">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums", gold && "text-gold")}>{value}</div>
    </div>
  );
}

// ───────────────────────────── market & depot ─────────────────────────────

export function MarketPanel() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { t } = useT();
  const onRoad = state.chain.shipments.filter((sh) => sh.to === MARKET && !sh.back);
  return (
    <div className="space-y-3 pb-2">
      <p className="text-sm text-white/65">{t("market.desc")}</p>
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("market.prices")}</div>
        <div className="space-y-1.5">
          {COMPONENTS.map((c) => {
            const g = Math.max(1, bestGrade(state, c.id));
            const made = bestGrade(state, c.id) > 0;
            return (
              <div key={c.id} className={cn("flex items-center justify-between text-xs", !made && "opacity-40")}>
                <span>
                  {c.emoji} {itemName(c.id, t)} <span className="text-white/40">· {gradeName(c.id, g, t)}</span>
                </span>
                <span className="font-bold tabular-nums text-gold">{formatMoney(componentValue(c.id, g, snap.gm))}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2.5 text-xs text-white/65 ring-1 ring-white/[0.07]">
        <Truck className="size-4 text-sky-300" /> {t("market.incoming", { n: onRoad.length, value: formatMoney(onRoad.reduce((a, sh) => a + sh.value, 0)) })}
      </div>
    </div>
  );
}

export function DepotPanel() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const out = state.chain.shipments.filter((sh) => sh.from === DEPOT && !sh.back);
  return (
    <div className="space-y-3 pb-2">
      <p className="text-sm text-white/65">{t("depot.desc")}</p>
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("depot.prices")}</div>
        <div className="space-y-1.5">
          {MATERIALS.map((m) => {
            const used = usedMaterials(state).includes(m.id);
            return (
              <div key={m.id} className={cn("flex items-center justify-between text-xs", !used && "opacity-40")}>
                <span>
                  {m.emoji} {materialName(m.id, t)}
                </span>
                <span className="tabular-nums text-white/80">{t("depot.per", { price: formatMoney(marketPrice(state, m.id)) })}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2.5 text-xs text-white/65 ring-1 ring-white/[0.07]">
        <Truck className="size-4 text-amber-300" /> {t("depot.trucks", { n: out.length })}
      </div>
      <p className="text-[11px] text-white/45">{t("depot.hint")}</p>
    </div>
  );
}

// ───────────────────────────── dealerships ─────────────────────────────

/** `inList`: shown under the dealer's own title, so its description is already on screen. */
export function DealerPanel({ id, inList }: { id: DealerId; inList?: boolean }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { buyDealer, upgradeDealer } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const d = DEALER_BY_ID[id];
  const st = state.dealers[id];
  const req = dealerRequirement(state, id);
  const ds = dealerStats(state, id, snap.gm);
  const info = t("dealers.stats", { n: formatNumber(60 / ds.interval), markup: formatPercent(ds.markup) });
  // the classes this dealer specialises in: +20% price, faster customers
  const specialty = (
    <div className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">{t("dealers.specialty")}</span>
        {d.classes.map((c) => (
          <Badge key={c} variant="gold">
            {t(`class.${c}` as MessageKey)}
          </Badge>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-white/50">{t("dealers.specialtyHint", { pct: formatPercent(DEALER_SPECIALTY.price), x: DEALER_SPECIALTY.speed })}</div>
    </div>
  );
  if (!st.owned) {
    return (
      <div className="space-y-3 pb-2">
        {!inList && <p className="text-sm text-white/60">{n.dealerDesc(d)}</p>}
        {specialty}
        <div className="text-xs text-white/50">{info}</div>
        <CostButton className="w-full" size="lg" variant="gold" cost={d.cost} locked={!!req} label={req ? n.requirement(req) : t("dealers.open")} onBuy={() => buyDealer(id)} />
      </div>
    );
  }
  const stock = state.chain.dealers[id];
  const cars = stock?.cars ?? 0;
  const incoming = state.chain.shipments.filter((sh) => sh.to === `d:${id}` && !sh.back).reduce((a, sh) => a + sh.qty, 0);
  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="gold">{t("common.lv", { level: st.level })}</Badge>
        <span className="text-xs text-white/50">{info}</span>
      </div>
      {specialty}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <StockBar label={`🚗 ${t("dealers.showroom")}`} value={cars} cap={ds.stockCap} color="#facc15" />
        <div className="mt-2 flex min-h-6 flex-wrap gap-0.5 text-lg">
          {(stock?.models ?? []).slice(0, 24).map((m, i) => (
            <span key={i} title={n.car(CAR_BY_ID[m])}>
              {CAR_BY_ID[m].emoji}
            </span>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-white/55">
          {cars < 1 ? (incoming > 0 ? t("dealers.transporter", { n: incoming }) : t("dealers.empty")) : t("dealers.nextCustomer", { time: formatDuration(Math.max(0, stock?.next ?? 0)) })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={t("dealers.sold")} value={formatNumber(stock?.sold ?? 0)} gold />
        <Stat label={t("dealers.markup")} value={`+${formatPercent(ds.markup)}`} />
        <Stat label={t("dealers.avgPrice")} value={cars >= 1 ? formatMoney(((stock?.value ?? 0) / cars) * (1 + ds.markup)) : "—"} />
      </div>
      <CostButton className="w-full" size="lg" cost={dealerUpgradeCost(state, id)} onBuy={() => upgradeDealer(id)} label={t("dealers.upgrade")} />
    </div>
  );
}

/** Small "makes → goes to" summary for build menus and lists. */
export function plantFlow(type: PlantType, t: T): string {
  const cfg = PLANT_BY_ID[type];
  if (!cfg.item) return t("flow.assembly");
  return t("flow.component", { raw: rawName(type, t), item: itemName(cfg.item, t) });
}

/** The switch that lets an Automated plant buy its own upgrades. */
function AutoUpgradeRow({ id }: { id: string }) {
  const p = useGame((g) => g.state.city.buildings[id]?.plant);
  const setAutoUpgrade = useGame((g) => g.setAutoUpgrade);
  const { t } = useT();
  if (!p) return null;
  const ready = p.automation >= AUTO_UPGRADE_FROM;
  const on = ready && !!p.auto;
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={!ready}
      onClick={() => setAutoUpgrade(id, !on)}
      className={cn("flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 text-left ring-1 ring-white/[0.07]", !ready && "opacity-60")}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg">🔁</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{t("auto.title")}</span>
        <span className="block text-[11px] leading-snug text-white/50">{ready ? t("auto.detail") : t("auto.locked", { name: t(`automation.${AUTO_UPGRADE_FROM}` as MessageKey) })}</span>
      </span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition", on ? "bg-emerald-500" : "bg-white/15")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}
