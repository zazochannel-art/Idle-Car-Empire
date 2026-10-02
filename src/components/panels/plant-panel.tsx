"use client";

import { Factory, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { AUTOMATION, COMPONENTS, COMPONENT_BY_ID, GRADES, PLANTS, PLANT_BY_ID, PLANT_LEVELS, SPEED } from "@/game/config/chain";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { MANAGERS } from "@/game/config/managers";
import { DEPOT, MARKET, plotOf } from "@/game/city/layout";
import {
  automationCost,
  bestGrade,
  carLock,
  carPartsValue,
  carValue,
  componentBase,
  dealerStats,
  fleetCost,
  gradeCost,
  levelCost,
  plantNumber,
  plantsOf,
  recipe,
  speedCost,
} from "@/game/engine/chain";
import { dealerUpgradeCost } from "@/game/engine/economy";
import { dealerRequirement } from "@/game/engine/insights";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { ComponentId, DealerId, GameState, ItemId, PlantType, Route } from "@/game/types";
import type { MessageKey, Vars } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CostButton } from "../game/cost-button";

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
  const { t } = useT();
  const b = state.city.buildings[id];
  const st = snap.chain.plants[id];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const cfg = PLANT_BY_ID[st.type];
  const gm = snap.gm;
  const item: ItemId = cfg.item ?? "car";
  const plot = plotOf(id)!;
  const busy = state.chain.shipments.filter((sh) => sh.from === id).length;
  const manager = MANAGERS.find((m) => state.managers[m.id].hired && state.managers[m.id].assignedTo === id);
  const steps = processSteps(st.type, t);
  const step = Math.min(steps.length - 1, Math.floor(p.progress * (steps.length - 1)));
  const unitCost = cfg.item ? st.rawPrice * cfg.rawPer : st.car ? carPartsValue(st.car) * gm.value[1] * gm.income : 0;

  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="gold">
          {t("common.lv", { level: b.level })} · {t(`plantLevel.${b.level}` as MessageKey)}
        </Badge>
        <Badge variant="muted">🤖 {t(`automation.${p.automation}` as MessageKey)}</Badge>
        {cfg.item && <Badge variant="muted">★ {gradeName(cfg.item, p.grade, t)}</Badge>}
        <Badge variant="muted">📍 {t(`zone.${plot.zone}`)}</Badge>
        {manager && (
          <Badge variant="muted">
            {manager.avatar} {manager.name}
          </Badge>
        )}
      </div>

      <StatusLine id={id} />

      {/* production */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 flex items-center justify-between text-[11px] text-white/55">
          <span className="font-bold uppercase tracking-wider">{t("plant.production")}</span>
          <span className="tabular-nums">
            {t("plant.rate", { n: formatNumber(st.lines), item: itemName(item, t), time: formatDuration(st.cycle) })}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1 text-[10px]">
          {steps.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className={cn("rounded-md px-1.5 py-0.5 font-semibold ring-1", p.status === "ok" && i === step ? "bg-sky-400/20 text-sky-200 ring-sky-400/40" : "bg-white/[0.03] text-white/45 ring-white/10")}>{s}</span>
              {i < steps.length - 1 && <span className="text-white/25">→</span>}
            </span>
          ))}
        </div>
        <Progress value={p.status === "ok" ? p.progress * 100 : 0} className="h-2" />
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label={t("plant.unitCost")} value={formatMoney(unitCost)} />
          <Stat label={t("plant.unitValue")} value={formatMoney(st.unitValue)} />
          <Stat label={t("plant.unitProfit")} value={formatMoney(st.unitValue - unitCost)} gold />
        </div>
      </div>

      {/* assembly: what car is on the line */}
      {!cfg.item && <ModelPicker id={id} />}

      {/* stock */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("plant.stock")}</div>
        <div className="space-y-2">
          {cfg.item && <StockBar label={`${rawName(st.type, t)}`} value={p.raw} cap={st.rawCap} color="#a8a29e" />}
          {!cfg.item &&
            st.car &&
            recipe(st.car).map((c) => <StockBar key={c} label={`${COMPONENT_BY_ID[c].emoji} ${itemName(c, t)}`} value={p.inputs[c] ?? 0} cap={st.inCap} color={COMPONENT_BY_ID[c].color} warn={p.missing === c} />)}
          <StockBar label={`📦 ${itemName(item, t)}`} value={p.out} cap={st.outCap} color="#38bdf8" />
        </div>
      </div>

      {/* transport */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">{t("plant.transport")}</span>
          <span className="flex items-center gap-1 text-[11px] tabular-nums text-white/60">
            <Truck className="size-3.5" /> {t("plant.trucks", { busy, n: p.fleet, vehicle: t(`vehicle.${st.vehicle}`), cap: st.capacity })}
          </span>
        </div>
        {cfg.item ? <RouteToggle id={id} route={p.route} item={cfg.item} /> : <p className="text-[11px] text-white/55">{t("plant.carsTo")}</p>}
      </div>

      {/* upgrades */}
      <div className="space-y-2">
        <UpgradeRow
          icon="🏗️"
          title={b.level < PLANT_LEVELS.length ? t("plant.levelUp", { name: t(`plantLevel.${b.level + 1}` as MessageKey) }) : t("plant.levelMax")}
          detail={b.level < PLANT_LEVELS.length ? t("plant.levelDetail", { a: PLANT_LEVELS[b.level - 1].lines, b: PLANT_LEVELS[b.level].lines }) : ""}
          cost={levelCost(b, gm)}
          onBuy={() => g.plantLevel(id)}
          gold
        />
        <UpgradeRow icon="⚡" title={t("plant.speed", { n: p.speed })} detail={t("plant.speedDetail", { pct: formatPercent(SPEED.mult - 1) })} cost={speedCost(b, gm)} onBuy={() => g.plantSpeed(id)} />
        <UpgradeRow
          icon="🤖"
          title={p.automation < AUTOMATION.length - 1 ? t("plant.automate", { name: t(`automation.${p.automation + 1}` as MessageKey) }) : t(`automation.${p.automation}` as MessageKey)}
          detail={p.automation < AUTOMATION.length - 1 ? t("plant.automateDetail", { speed: AUTOMATION[p.automation + 1].speed, off: formatPercent(AUTOMATION[p.automation + 1].offline) }) : ""}
          cost={automationCost(b, gm)}
          onBuy={() => g.plantAutomation(id)}
        />
        <UpgradeRow icon="🚚" title={t("plant.truck", { n: p.fleet + 1 })} detail={t("plant.truckDetail")} cost={fleetCost(b, gm)} onBuy={() => g.plantTruck(id)} />
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
    tone = inbound ? "wait" : "bad";
    text = inbound ? t("status.rawComing", { raw: rawName(st.type, t) }) : t("status.noCash", { raw: rawName(st.type, t) });
  } else if (p.status === "full") {
    tone = "wait";
    text = p.route === "store" ? t("status.stored") : t("status.full");
  } else if (p.status === "noParts") {
    tone = "bad";
    text = t("status.noParts", { item: itemName(p.missing ?? "engine", t).toUpperCase() });
  } else if (p.status === "noModel") {
    tone = "bad";
    text = t("status.noModel");
  }
  const cls = tone === "ok" ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/30" : tone === "wait" ? "bg-sky-500/10 text-sky-200 ring-sky-400/30" : "bg-amber-500/10 text-amber-200 ring-amber-400/40";
  return (
    <div className={cn("rounded-xl p-2.5 text-xs font-semibold ring-1", cls)}>
      {tone === "ok" ? "✅" : tone === "wait" ? "⏳" : "⚠️"} {text}
      {tone === "bad" && <div className="mt-0.5 text-[11px] font-normal opacity-80">{t("status.paused")}</div>}
      {cfg.item && tone !== "bad" && p.status === "ok" && <span className="font-normal opacity-70"> · {t("status.made", { n: formatNumber(p.made) })}</span>}
    </div>
  );
}

function RouteToggle({ id, route, item }: { id: string; route: Route; item: ComponentId }) {
  const setRoute = useGame((g) => g.setRoute);
  const hasAssembly = useGame((g) => plantsOf(g.state).some(([, b]) => b.type === "assemblyPlant"));
  const { t } = useT();
  const options: { id: Route; label: string; icon: string }[] = [
    { id: "use", label: t("route.use"), icon: "🏭" },
    { id: "sell", label: t("route.sell"), icon: "💰" },
    { id: "store", label: t("route.store"), icon: "📦" },
  ];
  const hint = route === "use" ? (hasAssembly ? t("route.useHint") : t("route.useNoAssembly")) : route === "sell" ? t("route.sellHint") : t("route.storeHint");
  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => setRoute(id, o.id)}
            className={cn("rounded-lg px-1 py-1.5 text-[10px] font-black uppercase tracking-wide transition", route === o.id ? "bg-electric text-white" : "text-white/55 hover:text-white")}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-white/50">
        {hint} · {itemName(item, t)}
      </p>
    </div>
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
        <button
          onClick={() => setPlantCar(id, null)}
          className={cn("rounded-xl p-2 text-left text-xs ring-1", chosen === null ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10")}
        >
          <div className="font-bold">✨ {t("plant.bestModel")}</div>
          <div className="text-[10px] text-white/50">{st?.car ? n.car(st.car) : "—"}</div>
        </button>
        {CARS.map((c) => {
          const lock = carLock(state, c, snap.gm);
          return (
            <button
              key={c.id}
              disabled={!!lock}
              onClick={() => setPlantCar(id, c.id)}
              className={cn("rounded-xl p-2 text-left text-xs ring-1 disabled:opacity-40", chosen === c.id ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10")}
            >
              <div className="truncate font-bold">
                {c.emoji} {n.car(c)}
              </div>
              <div className="text-[10px] tabular-nums text-white/50">{lock ? `🔒 ${n.carLock(lock)}` : formatMoney(carValue(state, c, snap.gm))}</div>
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

function UpgradeRow({ icon, title, detail, cost, onBuy, gold }: { icon: string; title: string; detail: string; cost: number | null; onBuy: () => unknown; gold?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        {detail && <span className="block text-[11px] leading-snug text-white/50">{detail}</span>}
      </span>
      <CostButton size="sm" variant={gold ? "gold" : "default"} cost={cost} label={t("plot.upgrade")} maxedLabel={t("common.max")} onBuy={onBuy} />
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
                <span className="font-bold tabular-nums text-gold">{formatMoney(componentBase(c.id, g) * snap.gm.value[1] * snap.gm.income)}</span>
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
  const snap = useGame((g) => g.snap);
  const { t } = useT();
  const out = state.chain.shipments.filter((sh) => sh.from === DEPOT && !sh.back);
  const types = [...new Set(plantsOf(state).map(([, b]) => b.type))].filter((ty) => PLANT_BY_ID[ty].item);
  return (
    <div className="space-y-3 pb-2">
      <p className="text-sm text-white/65">{t("depot.desc")}</p>
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("depot.prices")}</div>
        <div className="space-y-1.5">
          {PLANTS.filter((pl) => pl.item).map((pl) => {
            const st = Object.values(snap.chain.plants).find((x) => x.type === pl.id);
            const price = st?.rawPrice ?? (componentBase(pl.item!, 1) * 0.6) / pl.rawPer;
            return (
              <div key={pl.id} className={cn("flex items-center justify-between text-xs", !types.includes(pl.id) && "opacity-40")}>
                <span>
                  {pl.emoji} {rawName(pl.id, t)} <span className="text-white/40">→ {t(`structure.${pl.id}`)}</span>
                </span>
                <span className="tabular-nums text-white/80">{t("depot.per", { price: formatMoney(price) })}</span>
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

export function DealerPanel({ id }: { id: DealerId }) {
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
  if (!st.owned) {
    return (
      <div className="space-y-3 pb-2">
        <p className="text-sm text-white/60">{n.dealerDesc(d)}</p>
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
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label={t("dealers.sold")} value={formatNumber(stock?.sold ?? 0)} gold />
        <Stat label={t("dealers.markup")} value={`+${formatPercent(ds.markup)}`} />
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
