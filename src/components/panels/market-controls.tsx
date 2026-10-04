"use client";

// Market dynamics in the UI: quality mode and car routing on a plant, the
// market news card, and the company's reputation.
import { EXPORT_BY_ID } from "@/game/config/expansion";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { MATERIAL_BY_ID } from "@/game/config/economy";
import { HOT_CLASS, MATERIAL_SWING, QUALITY_MODES, QUALITY_MODE_IDS, RECALL } from "@/game/config/market";
import { qualityOf, repPriceMult, trendOf } from "@/game/engine/market";
import { formatDuration, formatPercent } from "@/game/format";
import type { CarRoute, DealerId } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { materialName } from "./materials-panel";

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{title}</div>
    {children}
  </div>
);

/** Fast · Balanced · Premium for one plant. */
export function QualityPicker({ id }: { id: string }) {
  const p = useGame((g) => g.state.city.buildings[id]?.plant);
  const setMode = useGame((g) => g.setQualityMode);
  const { t } = useT();
  if (!p) return null;
  const cur = qualityOf(p);
  return (
    <Box title={t("quality.title")}>
      <div className="grid grid-cols-3 gap-1.5">
        {QUALITY_MODE_IDS.map((m) => (
          <button
            key={m}
            onClick={() => setMode(id, m)}
            className={cn("rounded-xl p-2 text-center text-xs ring-1", cur === m ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10")}
          >
            <div className="text-lg leading-none">{QUALITY_MODES[m].emoji}</div>
            <div className="mt-1 font-bold">{t(`quality.${m}` as MessageKey)}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/55">{t(`quality.${cur}Desc` as MessageKey)}</p>
    </Box>
  );
}

/** Where an assembly plant sends its cars. */
export function CarRoutePicker({ id }: { id: string }) {
  const p = useGame((g) => g.state.city.buildings[id]?.plant);
  const dealers = useGame((g) => g.state.dealers);
  const setRoute = useGame((g) => g.setCarRoute);
  const { t, lang } = useT();
  const n = useContent(lang);
  if (!p) return null;
  const cur: CarRoute = p.carRoute ?? "price";
  const owned = (Object.keys(dealers) as DealerId[]).filter((d) => dealers[d].owned);
  const exportOpen = useGame.getState().state.export.open;
  const opts: { id: CarRoute; label: string }[] = [
    { id: "price", label: `💰 ${t("route.price")}` },
    { id: "fast", label: `⏱️ ${t("route.fast")}` },
    ...owned.map((d) => ({ id: d as CarRoute, label: `${DEALER_BY_ID[d].emoji} ${n.dealer(DEALER_BY_ID[d])}` })),
    ...exportOpen.map((m) => ({ id: `export:${m}` as CarRoute, label: `${EXPORT_BY_ID[m].emoji} ${t(`export.market.${m}` as MessageKey)}` })),
  ];
  return (
    <Box title={t("route.title")}>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button key={o.id} onClick={() => setRoute(id, o.id)} className={cn("rounded-lg px-2 py-1 text-xs ring-1", cur === o.id ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10")}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/55">{cur === "price" ? t("route.priceDesc") : cur === "fast" ? t("route.fastDesc") : cur.startsWith("export:") ? t("route.exportDesc") : t("route.dealerDesc")}</p>
    </Box>
  );
}

/** 📰 What the market wants right now, and when it changes. */
export function MarketNewsCard() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const tr = trendOf(state);
  if (!tr.hot) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-white/55 ring-1 ring-white/[0.07]">
        📰 {t("news.closed")}
      </div>
    );
  }
  const shortage = tr.materialMult > 1;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-3 ring-1 ring-sky-400/25">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200">📰 {t("news.title")}</span>
        <span className="text-[10px] tabular-nums text-white/45">{t("news.next", { time: formatDuration(tr.left) })}</span>
      </div>
      <div className="space-y-1 text-xs">
        <div>🔥 {t("news.hot", { cls: t(`class.${tr.hot}` as MessageKey), price: formatPercent(HOT_CLASS.price), demand: formatPercent(HOT_CLASS.demand - 1) })}</div>
        <div>
          {MATERIAL_BY_ID[tr.material].emoji}{" "}
          {shortage
            ? t("news.shortage", { material: materialName(tr.material, t), pct: formatPercent(MATERIAL_SWING.shortage - 1) })
            : t("news.glut", { material: materialName(tr.material, t), pct: formatPercent(1 - MATERIAL_SWING.glut) })}
        </div>
      </div>
    </div>
  );
}

/** ⭐ Reputation: what it does to prices, and a running scandal. */
export function ReputationCard() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const q = state.quality;
  const mult = repPriceMult(state) - 1;
  const scandal = state.market.t < q.scandalUntil;
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">⭐ {t("rep.title")}</span>
        <span className={cn("text-sm font-black tabular-nums", q.rep >= 50 ? "text-emerald-300" : "text-rose-300")}>{Math.round(q.rep)}/100</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", q.rep >= 50 ? "bg-emerald-400" : "bg-rose-400")} style={{ width: `${q.rep}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-white/55">{t("rep.desc", { pct: `${mult >= 0 ? "+" : "−"}${formatPercent(Math.abs(mult))}` })}</p>
      {scandal && <p className="mt-1 text-[11px] font-semibold text-rose-300">📰 {t("rep.scandal", { pct: formatPercent(RECALL.scandalPrice), time: formatDuration(q.scandalUntil - state.market.t) })}</p>}
    </div>
  );
}
