"use client";

// 📊 ECONOMY: how the company makes and spends money, right now and this run.
// Revenue and every cost per minute (from the ledger), the margin, output,
// what each plant earns, what materials cost today, and what is owed.
import { MATERIALS, SUPPLIERS } from "@/game/config/economy";
import { PLANT_BY_ID } from "@/game/config/chain";
import { plantNetValue, plantProfitPerMin, plantsOf } from "@/game/engine/chain";
import { LEDGER_KEYS, REVENUE_KEYS, ledgerNet, marketPrice, supplierOf, usedMaterials } from "@/game/engine/materials";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { LedgerValues } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { materialName } from "../panels/materials-panel";
import { MarketNewsCard, ReputationCard } from "../panels/market-controls";
import { plantName } from "../panels/plant-panel";
import { LEDGER_ICON, LedgerTable } from "./ledger-table";
import { SectionTitle } from "./section-title";

export function EconomyView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const selectPlot = useUi((u) => u.selectPlot);
  const { t } = useT();
  const rate = state.chain.ledger.rate;
  const perMin = (v: number) => `${formatMoney(v * 60)}${t("unit.perMin")}`;
  const revenue = REVENUE_KEYS.reduce((a, k) => a + rate[k], 0);
  const costs = LEDGER_KEYS.filter((k) => !REVENUE_KEYS.includes(k)).reduce((a, k) => a + rate[k], 0);
  const net = ledgerNet(rate);
  const margin = revenue > 0 ? net / revenue : 0;
  const carsMin = snap.carsPerSec * 60;
  const sp = supplierOf(state);
  return (
    <div className="space-y-4 pb-4">
      <p className="text-sm text-white/60">{t("eco.desc")}</p>
      {/* the headline numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={`💰 ${t("eco.money")}`} value={formatMoney(state.cash)} gold />
        <Tile label={`📈 ${t("eco.revenue")}`} value={perMin(revenue)} tone="up" />
        <Tile label={`🏭 ${t("eco.costs")}`} value={perMin(costs)} tone="down" />
        <Tile label={`💵 ${t("eco.net")}`} value={`${net < 0 ? "−" : ""}${perMin(Math.abs(net))}`} gold={net >= 0} tone={net < 0 ? "down" : undefined} />
        <Tile label={`📊 ${t("eco.margin")}`} value={formatPercent(margin)} />
        <Tile label={`🚘 ${t("eco.carsMin")}`} value={formatNumber(Math.round(carsMin * 100) / 100)} />
        <Tile label={`📅 ${t("eco.carsDay")}`} value={formatNumber(Math.round(carsMin * 60 * 24))} />
        <Tile label={`🧾 ${t("eco.owed")}`} value={formatMoney(state.chain.owed)} tone={state.chain.owed > 0 ? "down" : undefined} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MarketNewsCard />
        <ReputationCard />
      </div>

      <SectionTitle title={t("eco.perMinute")} />
      <LedgerTable values={rate} scale={60} suffix={t("unit.perMin")} />
      <CostBar values={rate} />

      <SectionTitle title={t("eco.plants")} />
      <div className="space-y-1.5">
        {plantsOf(state).map(([id, b]) => {
          const st = snap.chain.plants[id];
          if (!st) return null;
          const profit = plantProfitPerMin(st, snap.gm);
          return (
            <button key={id} onClick={() => selectPlot(id)} className="w-full rounded-xl bg-white/[0.04] p-2.5 text-left ring-1 ring-white/[0.07] hover:bg-white/[0.07]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">
                  {PLANT_BY_ID[st.type].emoji} {plantName(state, id, t)} <span className="text-white/40">· {t("common.lv", { level: b.level })}</span>
                </span>
                <span className={cn("font-bold tabular-nums", profit >= 0 ? "text-gold" : "text-rose-300")}>{formatMoney(profit)}{t("unit.perMin")}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-white/45">
                <span>{t("eco.unitCost", { v: formatMoney(st.unitCost) })}</span>
                <span>{t("eco.unitNet", { v: formatMoney(plantNetValue(st)) })}</span>
                <span>{formatNumber(Math.round(st.unitsPerSec * 600) / 10)}{t("unit.perMin")}</span>
                <span>⚡ {formatNumber(Math.round(st.op.kw))} kW</span>
                <span className={b.plant.status === "ok" ? "text-emerald-300" : "text-amber-300"}>{t(`eco.status.${b.plant.status}` as MessageKey)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <SectionTitle title={t("eco.market")} />
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
          {SUPPLIERS.map((x) => (
            <span key={x.id} className={cn("rounded-full px-2 py-0.5 ring-1", x.id === sp.id ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40" : state.market.bought >= x.unlockBought ? "ring-white/15" : "text-white/35 ring-white/10")}>
              {x.emoji} {t(`supplier.${x.id}` as MessageKey)} {x.discount > 0 ? `−${formatPercent(x.discount)}` : ""}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {MATERIALS.map((m) => {
            const used = usedMaterials(state).includes(m.id);
            const p = marketPrice(state, m.id);
            const trend = p / m.price - 1;
            return (
              <div key={m.id} className={cn("flex justify-between text-xs", !used && "opacity-35")}>
                <span>
                  {m.emoji} {materialName(m.id, t)}
                </span>
                <span className="tabular-nums">
                  {formatMoney(p)}
                  <span className={cn("ml-1 text-[10px]", trend >= 0 ? "text-rose-300" : "text-emerald-300")}>{trend >= 0 ? "▲" : "▼"}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-white/40">{t("eco.bought", { n: formatNumber(state.market.bought) })}</p>
      </div>

      <SectionTitle title={t("eco.run")} />
      <LedgerTable values={state.chain.ledger.run} />
    </div>
  );
}

function Tile({ label, value, gold, tone }: { label: string; value: string; gold?: boolean; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn("truncate text-base font-black tabular-nums", gold && "text-gold", tone === "up" && "text-emerald-300", tone === "down" && "text-rose-300")}>{value}</div>
    </div>
  );
}

/** Where every dollar of cost goes, as one bar. */
function CostBar({ values }: { values: LedgerValues }) {
  const { t } = useT();
  const keys = LEDGER_KEYS.filter((k) => !REVENUE_KEYS.includes(k) && values[k] > 0);
  const total = keys.reduce((a, k) => a + values[k], 0);
  if (total <= 0) return null;
  const colors: Record<string, string> = { materials: "#f59e0b", labor: "#38bdf8", energy: "#facc15", maintenance: "#a78bfa", logistics: "#22c55e", dealerFees: "#f472b6", tax: "#94a3b8" };
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {keys.map((k) => (
          <div key={k} style={{ width: `${(values[k] / total) * 100}%`, background: colors[k] }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/55">
        {keys.map((k) => (
          <span key={k}>
            <span className="mr-1 inline-block size-2 rounded-full" style={{ background: colors[k] }} />
            {LEDGER_ICON[k]} {t(`ledger.${k}` as MessageKey)} {Math.round((values[k] / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
