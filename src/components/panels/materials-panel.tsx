"use client";

// 📦 MATERIALS: a plant's warehouse and the material market it buys from.
// Every number comes from the engine (prices, discounts, room, costs);
// the panel only shows them and sends the orders.
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { MATERIAL_BY_ID, POWER_SYSTEM, RESTOCK_UNITS, SUPPLIERS, type MaterialId } from "@/game/config/economy";
import { bulkDiscount, marketPrice, maxOrder, orderCost, plantMaterials, powerCost, restockPlan, stockTotal, supplierOf, warehouseCap, warehouseCost, warehouseRoom, incomingMaterials } from "@/game/engine/materials";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { PlantType } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";

const STEPS = [10, 100, 1_000, 10_000];

export const materialName = (m: MaterialId, t: (k: MessageKey) => string) => t(`mat.${m}` as MessageKey);

export function MaterialsPanel({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const g = useGame.getState();
  const { t } = useT();
  const b = state.city.buildings[id];
  const st = snap.chain.plants[id];
  if (!b?.plant || !st) return null;
  const p = b.plant;
  const mats = plantMaterials(b.type as PlantType);
  if (!mats.length) return null;
  const cap = warehouseCap(p);
  const used = stockTotal(p.stock);
  const coming = stockTotal(incomingMaterials(state, id));
  const sp = supplierOf(state);
  const next = SUPPLIERS[SUPPLIERS.indexOf(sp) + 1];
  // one click: materials for the next units (up to 10, as many as fit and the cash allows)
  const fit = restockPlan(state, id, st.need, RESTOCK_UNITS, true);
  const plan = fit.units ? restockPlan(state, id, st.need, fit.units) : fit;
  const shown = plan.units ? plan : restockPlan(state, id, st.need, 1, true);
  return (
    <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold uppercase tracking-wider text-white/55">📦 {t("mat.title")}</span>
        <span className="text-white/50">
          {sp.emoji} {t(`supplier.${sp.id}` as MessageKey)}
          {sp.discount > 0 && <span className="text-emerald-300"> −{formatPercent(sp.discount)}</span>}
        </span>
      </div>
      {/* the warehouse */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-white/60">
          <span>🏬 {t("mat.warehouse")}</span>
          <span className="tabular-nums">
            {formatNumber(Math.floor(used))}
            {coming > 0 && <span className="text-sky-300"> +{formatNumber(coming)}</span>} / {formatNumber(cap)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-amber-400/80" style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
          <div className="-mt-2 h-2 bg-sky-400/50" style={{ marginLeft: `${Math.min(100, (used / cap) * 100)}%`, width: `${Math.min(100, (coming / cap) * 100)}%` }} />
        </div>
      </div>
      {mats.map((m) => (
        <MaterialRow key={m} id={id} m={m} per={st.need[m] ?? 0} />
      ))}
      {fit.units > 0 && stockTotal(shown.want) > 0 && (
        <CostButton className="w-full" cost={shown.cost} onBuy={() => g.buyPlan(id, plan)} label={t("mat.buyFor", { n: Math.max(1, shown.units) })} />
      )}
      {next && <p className="text-[10px] text-white/40">{t("mat.nextSupplier", { name: t(`supplier.${next.id}` as MessageKey), n: formatNumber(next.unlockBought - state.market.bought), pct: formatPercent(next.discount) })}</p>}
      {/* automatic restocking: from the Wholesale supplier on */}
      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
        <div className="min-w-0 text-[11px]">
          <div className="font-semibold">🔁 {t("mat.autoBuy")}</div>
          <div className="text-white/45">{sp.autoBuy ? t("mat.autoBuyHint") : t("mat.autoBuyLocked")}</div>
        </div>
        <button
          role="switch"
          aria-checked={!!p.autoBuy && sp.autoBuy}
          disabled={!sp.autoBuy}
          onClick={() => g.setAutoBuy(id, !p.autoBuy)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-30", p.autoBuy && sp.autoBuy ? "bg-emerald-500" : "bg-white/15")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", p.autoBuy && sp.autoBuy ? "left-[1.4rem]" : "left-0.5")} />
        </button>
      </div>
      <CostButton className="w-full" cost={warehouseCost(b, snap.gm.costMult)} onBuy={() => g.upgradeWarehouse(id)} label={t("mat.bigger", { n: formatNumber(cap * 2) })} />
    </div>
  );
}

function MaterialRow({ id, m, per }: { id: string; m: MaterialId; per: number }) {
  const state = useGame((g) => g.state);
  const buy = useGame((g) => g.buyMaterial);
  const { t } = useT();
  const [qty, setQty] = useState(100);
  const p = state.city.buildings[id]?.plant;
  if (!p) return null;
  const have = p.stock[m] ?? 0;
  const max = maxOrder(state, id, m);
  const room = warehouseRoom(state, id);
  const q = Math.max(1, Math.min(qty, Math.max(1, Math.min(room, supplierOf(state).maxOrder))));
  const cost = orderCost(state, m, q);
  const price = marketPrice(state, m);
  const base = MATERIAL_BY_ID[m].price;
  const trend = price / base - 1;
  const short = p.status === "noRaw" && p.short === m;
  const disc = bulkDiscount(q);
  return (
    <div className={cn("rounded-xl bg-white/[0.03] p-2 ring-1", short ? "ring-amber-400/60" : "ring-white/[0.06]")}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">
          {MATERIAL_BY_ID[m].emoji} {materialName(m, t)}
        </span>
        <span className="tabular-nums text-white/70">
          {formatMoney(price)}/{t("mat.unit")}
          <span className={cn("ml-1 text-[10px]", trend >= 0 ? "text-rose-300" : "text-emerald-300")}>
            {trend >= 0 ? "▲" : "▼"}
            {formatPercent(Math.abs(trend))}
          </span>
        </span>
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-white/45">
        <span>
          {t("mat.stock")}: <b className={cn("tabular-nums", short ? "text-amber-300" : "text-white/75")}>{formatNumber(Math.floor(have))}</b>
        </span>
        <span>{t("mat.perUnit", { n: formatNumber(per) })}</span>
      </div>
      {short && <div className="mt-1 text-[10px] font-semibold text-amber-300">⚠️ {t("mat.need", { need: formatNumber(per), have: formatNumber(Math.floor(have)), n: formatNumber(Math.ceil(per - have)) })}</div>}
      <div className="mt-1.5 flex items-center gap-1">
        <button className="rounded-lg bg-white/[0.06] p-1.5 ring-1 ring-white/10 disabled:opacity-30" disabled={q <= 10} onClick={() => setQty(stepDown(q))} aria-label="-">
          <Minus className="size-3.5" />
        </button>
        <div className="min-w-[3.6rem] rounded-lg bg-black/30 px-2 py-1 text-center text-xs font-bold tabular-nums">{formatNumber(q)}</div>
        <button className="rounded-lg bg-white/[0.06] p-1.5 ring-1 ring-white/10 disabled:opacity-30" disabled={q >= room} onClick={() => setQty(stepUp(q))} aria-label="+">
          <Plus className="size-3.5" />
        </button>
        <button className="rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] font-bold ring-1 ring-white/10 disabled:opacity-30" disabled={max < 1} onClick={() => setQty(Math.max(1, max))}>
          {t("mat.max")}
        </button>
        <button
          className="ml-auto rounded-lg bg-emerald-500/90 px-2.5 py-1 text-[11px] font-black text-black shadow disabled:bg-white/10 disabled:text-white/40"
          disabled={cost > state.cash || q > room || room < 1}
          onClick={() => buy(id, m, q)}
        >
          {t("mat.buy")} {formatMoney(cost)}
        </button>
      </div>
      {disc > 0 && <div className="mt-0.5 text-right text-[10px] text-emerald-300">{t("mat.bulk", { pct: formatPercent(disc) })}</div>}
    </div>
  );
}

const stepUp = (q: number) => STEPS.find((s) => s > q) ?? q * 2;
const stepDown = (q: number) => [...STEPS].reverse().find((s) => s < q) ?? Math.max(1, Math.floor(q / 2));

/** Running costs: crew, robots, power, and the ⚡ Power System upgrade. */
export function RunningCosts({ id }: { id: string }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const g = useGame.getState();
  const { t } = useT();
  const b = state.city.buildings[id];
  const st = snap.chain.plants[id];
  if (!b?.plant || !st) return null;
  const per = (x: number) => `${formatMoney(x * 60)}${t("unit.perMin")}`;
  return (
    <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold uppercase tracking-wider text-white/55">💸 {t("cost.title")}</span>
        <span className="text-white/45">{t("cost.whileRunning")}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Mini label={`👷 ${t("cost.labor")}`} value={per(st.op.labor)} sub={t("cost.workers", { n: formatNumber(Math.round(st.op.workers * 10) / 10) })} />
        <Mini label={`⚡ ${t("cost.energy")}`} value={per(st.op.energy)} sub={`${formatNumber(Math.round(st.op.kw))} kW`} />
        <Mini label={`🔧 ${t("cost.maintenance")}`} value={per(st.op.maintenance)} sub={st.op.robots ? t("cost.robots", { n: formatNumber(st.op.robots) }) : "—"} />
      </div>
      <CostButton
        className="w-full"
        cost={powerCost(b, snap.gm.costMult)}
        onBuy={() => g.upgradePower(id)}
        label={b.plant.power < POWER_SYSTEM.max ? t("cost.power", { n: b.plant.power + 1, pct: formatPercent(POWER_SYSTEM.cut) }) : t("cost.powerMax")}
      />
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-white/[0.05] px-1 py-1">
      <div className="truncate text-[9px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="truncate text-xs font-bold tabular-nums">{value}</div>
      <div className="truncate text-[9px] text-white/40">{sub}</div>
    </div>
  );
}
