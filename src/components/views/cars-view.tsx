"use client";

import { PrototypeLab } from "./expansion-cards";
import { MyCars } from "./my-cars";
import { BrandStudio } from "./brand-studio";
import { DEALER_FEE, SALES_TAX } from "@/game/config/economy";
import { Lock, Palette } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CARS, CAR_MODEL, DESIGN_COLORS, DESIGN_MAX, DESIGN_OPTIONS, type CarConfig } from "@/game/config/cars";
import { COMPONENT_BY_ID } from "@/game/config/chain";
import { DEALERS } from "@/game/config/dealerships";
import { carBaseValue, carLock, carPartsValue, carValue, modelStats, recipe } from "@/game/engine/chain";
import { developCost, REVIEW_BASE, REVIEW_PER_STAR } from "@/game/engine/design";
import { carModelCost, unlockedCarIds } from "@/game/engine/economy";
import { formatMoney, formatNumber, formatPercent, formatTime } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { LIVERY } from "../three/livery";
import { CAR_MODEL_FOR } from "../map/vehicles";
import { CostButton } from "../game/cost-button";
import { gradeName } from "../panels/plant-panel";
import { ViewHeader } from "./section-title";

/**
 * Models & Design: every car platform carries the player's own model, with
 * its stats (power, comfort, quality, design), its price and profit, and a
 * studio to rename it, paint it and develop its options.
 */
export function CarsView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { t } = useT();
  const unlocked = unlockedCarIds(state, snap.gm);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "models" | "dev" | "brand">("mine");

  return (
    <div className="space-y-4">
      <ViewHeader icon="🚗" title={t("cars.title")} subtitle={t("cars.subtitle", { n: unlocked.size, total: CARS.length })} />
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
        {(["mine", "models", "dev", "brand"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-xl py-2 text-[11px] font-black uppercase tracking-wide", tab === k ? "bg-gold text-black" : "text-white/60")}>
            {t(`cars.tab.${k}` as MessageKey)}
            {k === "mine" && state.racing.cars.length > 0 && <span className="ml-1 opacity-70">{state.racing.cars.length}</span>}
          </button>
        ))}
      </div>
      {tab === "mine" && <MyCars />}
      {tab === "dev" && <PrototypeLab />}
      {tab === "brand" && <BrandStudio />}
      {tab === "models" && (
        <div className="grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
          {CARS.map((car) => (
            <ModelCard key={car.id} car={car} unlocked={unlocked.has(car.id)} open={open === car.id} onToggle={() => setOpen(open === car.id ? null : car.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({ car, unlocked, open, onToggle }: { car: CarConfig; unlocked: boolean; open: boolean; onToggle: () => void }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const upgradeCarModel = useGame((g) => g.upgradeCarModel);
  const { t, lang } = useT();
  const n = useContent(lang);
  const d = state.designs[car.id];
  const ms = modelStats(state, car);
  const lock = unlocked ? null : carLock(state, car, snap.gm);
  const cost = carPartsValue(car);
  const value = carValue(state, car, snap.gm);
  const lvl = state.carModels[car.id] ?? 0;
  const paint = d.color || LIVERY[CAR_MODEL_FOR[car.id]].color;
  const onLine = Object.values(snap.chain.plants).some((p) => p.car?.id === car.id);
  // high demand when one of your dealers specialises in this class
  const demand = DEALERS.some((x) => state.dealers[x.id].owned && x.classes.includes(car.class));
  const specialist = DEALERS.find((x) => x.classes.includes(car.class));

  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-4 ring-1", unlocked ? "glass" : "bg-white/[0.02] ring-white/[0.05]")}>
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl" style={{ background: paint, opacity: unlocked ? 0.22 : 0.06 }} />
      <div className="relative flex items-start gap-3">
        <div className={cn("relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-3xl ring-1 ring-white/10", !unlocked && "opacity-50 grayscale")}>
          {car.emoji}
          <span className="absolute -bottom-1 -right-1 size-4 rounded-full ring-2 ring-ink" style={{ background: paint }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black">{d.name}</div>
          <div className="truncate text-[11px] text-white/45">
            {n.car(car)} · {t(`body.${car.body}` as MessageKey)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant={unlocked ? "default" : "muted"}>{t(`class.${car.class}` as MessageKey)}</Badge>
            {lvl > 0 && <Badge variant="gold">{t("cars.modelLv", { level: lvl })}</Badge>}
            {unlocked && (demand ? <Badge variant="gold">{t("demand.high")}</Badge> : <Badge variant="muted">{t("demand.normal")}</Badge>)}
          </div>
        </div>
      </div>

      {/* the model's stats */}
      <div className="relative mt-3 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-white/50">⚙️ {car.engine}</span>
          <span className="font-bold tabular-nums">{formatNumber(ms.hp)} HP</span>
        </div>
        <StatBar label={t("design.comfort")} value={ms.comfort} />
        <StatBar label={t("design.quality")} value={ms.quality} />
        <StatBar label={t("design.design")} value={ms.design} />
      </div>
      <Review car={car} stars={ms.stars} />

      <div className="relative mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Spec label={t("cars.cost")} value={formatMoney(cost)} />
        <Spec label={t("cars.price")} value={formatMoney(value)} />
        <Spec label={t("cars.profit")} value={formatMoney(value * (1 - DEALER_FEE - SALES_TAX) - cost)} accent />
      </div>
      <div className="relative mt-2 flex flex-wrap gap-1 text-[10px] text-white/55">
        {recipe(car).map((c) => (
          <span key={c} className="rounded bg-white/5 px-1">
            {COMPONENT_BY_ID[c].emoji} {gradeName(c, car.grade, t)}
          </span>
        ))}
      </div>
      <div className="relative mt-2 flex justify-between text-[11px] text-white/50">
        <span>{t("cars.baseTime", { time: formatTime(car.time * ms.timeMult) })}</span>
        <span>{t("cars.produced", { n: formatNumber(state.lifetime.carsByType[car.id]) })}</span>
      </div>
      {onLine && <div className="relative mt-1 text-[11px] text-emerald-300">{t("cars.onLine")}</div>}
      {unlocked && !demand && specialist && <div className="relative mt-1 text-[11px] text-white/45">{t("demand.hint", { name: n.dealer(specialist) })}</div>}

      {unlocked ? (
        <>
          <button
            onClick={onToggle}
            className="relative mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] py-2.5 text-xs font-bold uppercase tracking-wide ring-1 ring-white/10 transition hover:bg-white/[0.1]"
          >
            <Palette className="size-3.5" /> {open ? t("design.done") : t("design.open")}
          </button>
          {open && <DesignStudio car={car} />}
          <CostButton
            className="relative mt-2 w-full"
            cost={carModelCost(state, car.id)}
            onBuy={() => upgradeCarModel(car.id)}
            label={t("cars.refine", { pct: formatPercent(CAR_MODEL.valuePerLevel - 1) })}
          />
        </>
      ) : (
        <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-white/[0.03] p-2.5 text-xs text-white/55 ring-1 ring-white/[0.06]">
          <Lock className="size-3.5" /> {lock ? n.carLock(lock) : null}
        </div>
      )}
    </div>
  );
}

/** Rename, paint and develop the model's options. */
function DesignStudio({ car }: { car: CarConfig }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { developDesign, renameDesign, setDesignColor } = useGame.getState();
  const { t } = useT();
  const d = state.designs[car.id];
  const base = carBaseValue(state, car, snap.gm);
  const [name, setName] = useState(d.name);

  return (
    <div className="relative mt-2 space-y-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">{t("design.name")}</span>
        <input
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => renameDesign(car.id, name)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="mt-1 h-11 w-full rounded-xl bg-white/[0.06] px-3 text-base font-bold text-white ring-1 ring-white/10 outline-none focus:ring-electric/60"
        />
      </label>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">{t("design.color")}</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DESIGN_COLORS.map((c) => {
            const shown = c || LIVERY[CAR_MODEL_FOR[car.id]].color;
            return (
              <button
                key={c || "factory"}
                onClick={() => setDesignColor(car.id, c)}
                aria-label={c || t("design.factory")}
                title={c ? c : t("design.factory")}
                className={cn("relative size-9 rounded-full ring-2 transition", d.color === c ? "ring-white" : "ring-white/15 hover:ring-white/40")}
                style={{ background: shown }}
              >
                {!c && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white mix-blend-difference">F</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {DESIGN_OPTIONS.map((o) => {
          const lvl = d[o.id];
          const cost = developCost(base, d, o.id);
          return (
            <div key={o.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
              <span className="text-xl">{o.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">
                  {t(`design.${o.id}` as MessageKey)} · {t(`design.lv.${o.id}.${lvl}` as MessageKey)}
                </div>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: DESIGN_MAX }, (_, i) => (
                    <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < lvl ? "bg-emerald-400" : "bg-white/10")} />
                  ))}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-white/45">{t("design.effect", { value: formatPercent(o.value), time: formatPercent(o.time) })}</div>
              </div>
              {cost !== null ? (
                <CostButton size="sm" cost={cost} onBuy={() => developDesign(car.id, o.id)} label={t(`design.lv.${o.id}.${lvl + 1}` as MessageKey)} />
              ) : (
                <Badge variant="gold">MAX</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-white/50">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${value}%` }} />
      </span>
      <span className="w-7 shrink-0 text-right font-bold tabular-nums">{value}</span>
    </div>
  );
}

function Spec({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-1 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-semibold tabular-nums ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}

const OUTLETS = ["Motor Weekly", "Auto Review", "Drive Daily"];

/** The press review: stars, the outlet's verdict, and what the score does to price. */
function Review({ car, stars }: { car: CarConfig; stars: number }) {
  const { t } = useT();
  const outlet = OUTLETS[car.id.length % OUTLETS.length];
  const full = Math.floor(stars);
  const effect = REVIEW_BASE + REVIEW_PER_STAR * stars - 1;
  return (
    <div className="relative mt-3 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm tracking-tight text-gold" aria-label={t("review.aria", { n: stars })}>
          {"★".repeat(full)}
          {stars % 1 ? (
            <span className="bg-[linear-gradient(90deg,#f5c451_50%,rgba(255,255,255,0.2)_50%)] bg-clip-text text-transparent">★</span>
          ) : null}
          <span className="text-white/20">{"★".repeat(5 - Math.ceil(stars))}</span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{outlet}</span>
      </div>
      <p className="mt-1 text-[11px] italic text-white/60">“{t(`review.q${Math.max(1, full)}` as MessageKey)}”</p>
      <p className="mt-0.5 text-[10px] text-white/40">{t("review.effect", { pct: `${effect >= 0 ? "+" : "−"}${formatPercent(Math.abs(effect))}` })}</p>
    </div>
  );
}
