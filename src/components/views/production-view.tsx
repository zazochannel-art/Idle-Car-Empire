"use client";

import { ChevronDown, Lock, MapPin } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { PLANTS, PLANT_BY_ID } from "@/game/config/chain";
import { DEALERS } from "@/game/config/dealerships";
import { TRANSPORT_TIERS } from "@/game/config/logistics";
import type { MessageKey } from "@/i18n";
import { DEPOT, MARKET } from "@/game/city/layout";
import { plantBuildCost, plantLock, plantsOf } from "@/game/engine/chain";
import { freePlotFor } from "@/game/engine/construction";
import { formatMoney, formatNumber } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { MissionStrip, NextGoals } from "../game/goals";
import { itemName, plantName } from "../panels/plant-panel";
import { SectionTitle } from "./section-title";

/**
 * The supply chain at a glance: Materials → plants → assembly → dealers →
 * customers, with what each link makes per minute and where it is stuck.
 */
export function ProductionView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const selectPlot = useUi((u) => u.selectPlot);
  const setView = useUi((u) => u.setView);
  const { t, lang } = useT();
  const n = useContent(lang);
  const plants = plantsOf(state);
  const onRoad = state.chain.shipments.filter((sh) => !sh.back).length;
  const dealers = DEALERS.filter((d) => state.dealers[d.id].owned);

  const node = (key: string, icon: string, title: string, sub: string, tone: "ok" | "bad" | "wait" | "off", onClick?: () => void) => (
    <button
      key={key}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-2.5 text-left ring-1 transition enabled:hover:bg-white/[0.07]",
        tone === "bad" ? "bg-amber-500/[0.08] ring-amber-400/40" : tone === "off" ? "bg-white/[0.02] opacity-60 ring-white/[0.05]" : "bg-white/[0.04] ring-white/[0.07]",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className={cn("block truncate text-[11px]", tone === "bad" ? "text-amber-300" : "text-white/50")}>{sub}</span>
      </span>
      {onClick && <MapPin className="size-4 shrink-0 text-white/30" />}
    </button>
  );
  const arrow = (k: string, label?: string) => (
    <div key={k} className="flex items-center justify-center gap-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
      <ChevronDown className="size-3.5" /> {label}
    </div>
  );

  return (
    <div className="@container space-y-5 pb-2">
      <NextGoals />
      <section>
        <SectionTitle title={t("chain.title")} subtitle={t("chain.subtitle", { n: plants.length, trucks: onRoad })} />
        <div className="space-y-0.5">
          {node("depot", "🏗️", t("depot.title"), t("chain.depot"), "ok", () => selectPlot(DEPOT))}
          {arrow("a0", t("chain.raw"))}
          {PLANTS.map((cfg) => {
            const mine = plants.filter(([, b]) => b.type === cfg.id);
            if (!mine.length) {
              const lock = plantLock(state, cfg.id);
              if (lock?.kind === "plant" && plantLock(state, lock.plant)) return null;
              const site = Object.entries(state.city.sites).find(([, st]) => st.type === cfg.id)?.[0];
              const where = site ?? freePlotFor(state, cfg.id);
              return (
                <Fragment key={cfg.id}>
                  {node(
                    cfg.id,
                    cfg.emoji,
                    t(`structure.${cfg.id}`),
                    lock ? `🔒 ${n.plantLock(lock)}` : site ? t("goal.site", { name: t(`structure.${cfg.id}`) }) : t("chain.buildFor", { cost: formatMoney(plantBuildCost(state, cfg.id)) }),
                    "off",
                    where && !lock ? () => selectPlot(where) : undefined,
                  )}
                </Fragment>
              );
            }
            return mine.map(([id, b]) => {
              const st = snap.chain.plants[id];
              const bad = b.plant.status === "noParts" || (b.plant.status === "noRaw" && !state.chain.shipments.some((sh) => sh.to === id && sh.item === "raw"));
              const sub =
                b.plant.status === "noParts"
                  ? t("status.noParts", { item: itemName(b.plant.missing ?? "engine", t) })
                  : t("chain.rate", { n: formatNumber((st?.unitsPerSec ?? 0) * 60), item: itemName(cfg.item ?? "car", t), stock: formatNumber(Math.floor(b.plant.out)) });
              return node(id, cfg.emoji, plantName(state, id, t), sub, bad ? "bad" : "ok", () => selectPlot(id));
            });
          })}
          {arrow("a1", t("chain.trucks"))}
          {node("logistics", TRANSPORT_TIERS[state.logistics.tier].emoji, t("logistics.title"), `${t("logistics.network")}: ${t(`logistics.tier.${TRANSPORT_TIERS[state.logistics.tier].id}` as MessageKey)}`, "ok", () => setView("logistics"))}
          {node("market", "💰", t("market.title"), t("chain.market"), "ok", () => selectPlot(MARKET))}
          {dealers.length > 0 ? (
            dealers.map((d) => {
              const stock = state.chain.dealers[d.id];
              return node(d.id, d.emoji, n.dealer(d), t("chain.dealer", { cars: formatNumber(stock?.cars ?? 0), sold: formatNumber(stock?.sold ?? 0) }), "ok", () => selectPlot(`d:${d.id}`));
            })
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/15 p-3 text-xs text-white/50">
              <Lock className="size-4" /> {t("chain.noDealer")}
            </div>
          )}
          {arrow("a2", t("chain.customers"))}
          <div className="flex items-center justify-between rounded-2xl bg-gold/[0.07] p-3 ring-1 ring-gold/30">
            <span className="text-sm font-bold">👤 {t("chain.money")}</span>
            <Badge variant="gold">
              {formatMoney(snap.incomePerSec)}
              {t("unit.perSec")}
            </Badge>
          </div>
        </div>
      </section>
      <MissionStrip />
      <p className="px-1 text-[11px] text-white/40">{t("chain.footer", { name: t(`structure.${PLANT_BY_ID.assemblyPlant.id}`) })}</p>
    </div>
  );
}
