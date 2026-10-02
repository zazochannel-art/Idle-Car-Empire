"use client";

import { ArrowRight, Lock, LogIn, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SPEC_BY_ID, STRUCTURE_BY_ID, ZONES, ZONE_BY_ID, type StructureConfig } from "@/game/config/city";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { FACTORY_BY_ID } from "@/game/config/factories";
import { WORLD_MAP, plotOf } from "@/game/city/layout";
import { buildingUpgradeCost, builtInZone, garagePlots, structureCost, zoneBlocker } from "@/game/engine/city";
import { dealerCapacity, dealerMarkup, dealerUpgradeCost } from "@/game/engine/economy";
import { dealerRequirement } from "@/game/engine/insights";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { DealerId, StructureType, ZoneId } from "@/game/types";
import type { MessageKey, Vars } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CostButton } from "../game/cost-button";
import { FactoryCard, LockedFactoryCard } from "../game/factory-card";

type T = (k: MessageKey, v?: Vars) => string;

/** One line describing what a plot building does, per level. */
export function structureEffect(cfg: StructureConfig, scale: number, t: T): string {
  if (cfg.id === "garage") return t("effect.garage");
  if (cfg.income) return t("effect.income", { amount: formatMoney(cfg.income * scale) });
  if (cfg.zoneGarageIncome) return t("effect.zoneIncome", { pct: formatPercent(cfg.zoneGarageIncome) });
  if (cfg.zoneGarageSpeed) return t("effect.zoneSpeed", { pct: formatPercent(cfg.zoneGarageSpeed) });
  if (cfg.speed) return t("effect.speed", { pct: formatPercent(cfg.speed) });
  if (cfg.delivery) return t("effect.delivery", { pct: formatPercent(cfg.delivery) });
  if (cfg.dealerCap) return t("effect.dealerCap", { pct: formatPercent(cfg.dealerCap) });
  if (cfg.rp) return t("effect.rp", { pct: formatPercent(cfg.rp) });
  if (cfg.markup) return t("effect.markup", { pct: formatPercent(cfg.markup) });
  if (cfg.income2) return t("effect.income2", { pct: formatPercent(cfg.income2) });
  return "";
}

const lv2 = (n: number) => String(n).padStart(2, "0");

// ───────────────────────────── selected plot ─────────────────────────────

export function plotTitle(id: string, t: T, n: ReturnType<typeof useContent>, s: ReturnType<typeof useGame.getState>["state"]): { title: string; icon: string } {
  const plot = plotOf(id);
  if (!plot) return { title: "", icon: "" };
  if (plot.kind === "factory") {
    const f = FACTORY_BY_ID[plot.factory!];
    return { title: n.factory(f), icon: f.emoji };
  }
  if (plot.kind === "dealer") {
    const d = DEALER_BY_ID[plot.dealer!];
    return { title: n.dealer(d), icon: d.emoji };
  }
  const b = s.city.buildings[id];
  if (!b) return { title: t("map.emptyPlot"), icon: "🏗️" };
  if (b.type === "garage") return { title: t("garage.title", { no: lv2(b.garage?.no ?? 1) }), icon: SPEC_BY_ID[b.garage?.spec ?? "repair"].emoji };
  return { title: t(`structure.${b.type}`), icon: STRUCTURE_BY_ID[b.type].emoji };
}

export function PlotPanel({ id }: { id: string }) {
  const plot = plotOf(id);
  const b = useGame((g) => g.state.city.buildings[id]);
  if (!plot) return null;
  if (plot.kind === "factory") return <FactoryPanel id={id} />;
  if (plot.kind === "dealer") return <DealerPanel id={plot.dealer!} />;
  if (!b) return <BuildMenu id={id} />;
  if (b.type === "garage") return <GarageSummary id={id} />;
  return <StructurePanel id={id} />;
}

function FactoryPanel({ id }: { id: string }) {
  const factory = plotOf(id)!.factory!;
  const owned = useGame((g) => g.state.factories[factory].owned);
  return <div className="space-y-3 pb-2">{owned ? <FactoryCard id={factory} /> : <LockedFactoryCard id={factory} highlight />}</div>;
}

function BuildMenu({ id }: { id: string }) {
  const plot = plotOf(id)!;
  const state = useGame((g) => g.state);
  const buildStructure = useGame((g) => g.buildStructure);
  const preview = useUi((u) => u.preview);
  const setPreview = useUi((u) => u.setPreview);
  const { t } = useT();
  const zone = ZONE_BY_ID[plot.zone];
  return (
    <div className="space-y-2 pb-2">
      <p className="px-1 text-xs text-white/50">
        {t("map.buildHere")} · {t(`zone.${plot.zone}`)}
      </p>
      {zone.builds.map((type) => {
        const cfg = STRUCTURE_BY_ID[type];
        const cost = structureCost(state, id, type);
        const taken = type !== "garage" && builtInZone(state, plot.zone, type);
        // first tap shows the building on the plot, the second one builds it
        const previewing = preview?.plot === id && preview.type === type;
        return (
          <div
            key={type}
            onClick={() => !taken && setPreview({ plot: id, type })}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 transition",
              taken ? "cursor-default bg-white/[0.02] opacity-50 ring-white/[0.05]" : previewing ? "bg-emerald-500/[0.1] ring-emerald-400/50" : "bg-white/[0.04] ring-white/[0.07] hover:bg-white/[0.07]",
            )}
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl ring-1 ring-white/10" style={{ background: `${cfg.roof}22` }}>
              {cfg.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{t(`structure.${type}`)}</div>
              <div className="text-[11px] leading-snug text-white/50">{t(`structureDesc.${type}`)}</div>
              <div className="mt-0.5 text-[11px] font-medium text-emerald-300/90">{structureEffect(cfg, zone.scale, t)}</div>
            </div>
            <CostButton
              size="sm"
              variant={type === "garage" ? "gold" : "default"}
              cost={cost}
              locked={taken}
              label={taken ? t("map.onePerZone") : previewing ? t("map.confirm") : t("map.build")}
              onBuy={() => {
                if (!previewing) setPreview({ plot: id, type });
                else if (buildStructure(id, type)) setPreview(null);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function GarageSummary({ id }: { id: string }) {
  const b = useGame((g) => g.state.city.buildings[id]);
  const st = useGame((g) => g.snap.city.garages[id]);
  const upgradeBuilding = useGame((g) => g.upgradeBuilding);
  const cost = useGame((g) => buildingUpgradeCost(g.state, id));
  const enterGarage = useUi((u) => u.enterGarage);
  const { t } = useT();
  if (!b?.garage || !st) return null;
  const spec = SPEC_BY_ID[b.garage.spec];
  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="gold">{t("common.lv", { level: b.level })}</Badge>
        <Badge style={{ color: spec.color }} variant="muted">
          {spec.emoji} {t(`spec.${spec.id}`)}
        </Badge>
        <Badge variant="muted">📍 {t(`zone.${st.zone}`)}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={t("garage.profit")} value={`${formatMoney(st.incomePerSec)}${t("unit.perSec")}`} gold />
        <Stat label={t("garage.cars")} value={`${st.staffed}/${st.workstations}`} />
        <Stat label={t("garage.efficiency")} value={formatPercent(st.efficiency)} />
      </div>
      {st.workstations === 0 && <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200 ring-1 ring-amber-400/30">{t("garage.noStations")}</div>}
      <Button size="lg" variant="gold" className="w-full" onClick={() => enterGarage(id)}>
        <LogIn /> {t("map.enter")}
      </Button>
      <CostButton className="w-full" cost={cost} label={t("garage.upgradeTo", { level: b.level + 1 })} maxedLabel={t("garage.maxLevel")} onBuy={() => upgradeBuilding(id)} />
    </div>
  );
}

function StructurePanel({ id }: { id: string }) {
  const b = useGame((g) => g.state.city.buildings[id]);
  const cost = useGame((g) => buildingUpgradeCost(g.state, id));
  const income = useGame((g) => g.snap.city.structureIncome[id]);
  const upgradeBuilding = useGame((g) => g.upgradeBuilding);
  const { t } = useT();
  const plot = plotOf(id)!;
  if (!b) return null;
  const cfg = STRUCTURE_BY_ID[b.type];
  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="gold">{t("common.lv", { level: b.level })}</Badge>
        <Badge variant="muted">📍 {t(`zone.${plot.zone}`)}</Badge>
      </div>
      <p className="text-sm text-white/65">{t(`structureDesc.${b.type}`)}</p>
      <div className="rounded-xl bg-emerald-500/[0.08] p-3 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
        {structureEffect(cfg, ZONE_BY_ID[plot.zone].scale, t)}
        {income !== undefined && <div className="mt-1 text-base font-bold text-white">{formatMoney(income)}{t("unit.perSec")}</div>}
      </div>
      <CostButton className="w-full" size="lg" cost={cost} label={t("plot.upgrade")} maxedLabel={t("plot.maxed")} onBuy={() => upgradeBuilding(id)} />
    </div>
  );
}

function DealerPanel({ id }: { id: DealerId }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { buyDealer, upgradeDealer } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const d = DEALER_BY_ID[id];
  const st = state.dealers[id];
  const req = dealerRequirement(state, id);
  if (!st.owned) {
    return (
      <div className="space-y-3 pb-2">
        <p className="text-sm text-white/60">{n.dealerDesc(d)}</p>
        <div className="text-xs text-white/50">{t("dealers.stats", { n: formatNumber(d.capacity), markup: formatPercent(d.markup) })}</div>
        <CostButton className="w-full" size="lg" variant="gold" cost={d.cost} locked={!!req} label={req ? n.requirement(req) : t("dealers.open")} onBuy={() => buyDealer(id)} />
      </div>
    );
  }
  const cap = dealerCapacity(state, id, snap.gm);
  const slot = snap.dealers.slots.find((x) => x.id === id);
  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center gap-2">
        <Badge variant="gold">{t("common.lv", { level: st.level })}</Badge>
        <span className="text-xs text-white/50">{t("dealers.stats", { n: formatNumber(cap), markup: formatPercent(dealerMarkup(state, id, snap.gm)) })}</span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-white/50">
          <span>{t("dealers.selling")}</span>
          <span className="tabular-nums">
            {formatNumber(slot?.sold ?? 0)}/{formatNumber(cap)}
            {t("unit.perSec")}
          </span>
        </div>
        <Progress value={cap > 0 ? ((slot?.sold ?? 0) / cap) * 100 : 0} />
      </div>
      <CostButton className="w-full" size="lg" cost={dealerUpgradeCost(state, id)} onBuy={() => upgradeDealer(id)} label={t("dealers.upgrade")} />
    </div>
  );
}

// ───────────────────────────── zones ─────────────────────────────

export function ZonePanel({ id }: { id: ZoneId }) {
  const state = useGame((g) => g.state);
  const unlockZone = useGame((g) => g.unlockZone);
  const { t, lang } = useT();
  const n = useContent(lang);
  const z = ZONE_BY_ID[id];
  const open = state.city.zones.includes(id);
  const blocker = zoneBlocker(state, id);
  const lots = WORLD_MAP.plots.filter((p) => p.zone === id);
  const factories = lots.filter((p) => p.kind === "factory").map((p) => FACTORY_BY_ID[p.factory!]);
  const dealers = lots.filter((p) => p.kind === "dealer").map((p) => DEALER_BY_ID[p.dealer!]);
  const plots = lots.filter((p) => p.kind === "plot").length;
  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center gap-2">
        <Badge variant={open ? "success" : "gold"}>{t("map.stage", { n: z.stage })}</Badge>
        {!open && (
          <Badge variant="muted">
            <Lock className="size-3" /> {t("map.locked")}
          </Badge>
        )}
      </div>
      <p className="text-sm text-white/65">{t(`zoneDesc.${id}`)}</p>
      <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">{t("map.inZone")}</div>
        <div className="flex flex-wrap gap-1.5">
          {factories.map((f) => (
            <Badge key={f.id} variant="muted">
              {f.emoji} {n.factory(f)}
            </Badge>
          ))}
          {dealers.map((d) => (
            <Badge key={d.id} variant="muted">
              {d.emoji} {n.dealer(d)}
            </Badge>
          ))}
          <Badge variant="muted">🏗️ {t("build.free", { n: plots })}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {z.builds.map((b) => (
            <span key={b} title={t(`structure.${b}`)} className="rounded-lg bg-white/5 px-1.5 py-0.5 text-sm">
              {STRUCTURE_BY_ID[b].emoji}
            </span>
          ))}
        </div>
      </div>
      {!open && (
        <CostButton
          className="w-full"
          size="lg"
          variant="gold"
          cost={z.cost}
          locked={!!blocker}
          label={blocker ? t("map.requires", { name: t(`zone.${blocker}`) }) : `🔓 ${t("map.unlock")}`}
          onBuy={() => unlockZone(id)}
        />
      )}
    </div>
  );
}

// ───────────────────────────── lists ─────────────────────────────

export function GaragesView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { enterGarage, selectPlot } = useUi.getState();
  const { t } = useT();
  const ids = garagePlots(state);
  const total = ids.reduce((a, id) => a + (snap.city.garages[id]?.incomePerSec ?? 0), 0);
  return (
    <div className="space-y-2.5 pb-2">
      <p className="px-1 text-xs text-white/50">{t("garages.subtitle", { n: ids.length, income: formatMoney(total) })}</p>
      {ids.map((id) => {
        const b = state.city.buildings[id];
        const st = snap.city.garages[id];
        if (!b?.garage || !st) return null;
        const spec = SPEC_BY_ID[b.garage.spec];
        return (
          <div key={id} className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-electric/15 ring-1 ring-electric/30">
                <span className="text-lg leading-none">{spec.emoji}</span>
                <span className="text-[10px] font-black text-sky-200">#{lv2(b.garage.no)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold">{t("garage.title", { no: lv2(b.garage.no) })}</span>
                  <Badge variant="gold">{t("common.lv", { level: b.level })}</Badge>
                </div>
                <div className="truncate text-[11px] text-white/50">
                  {t(`zone.${st.zone}`)} · {t(`spec.${spec.id}`)} · {t("garages.cars", { n: formatNumber(st.carsPerSec * 60) })}
                </div>
                <div className="text-sm font-bold tabular-nums text-gold">
                  {formatMoney(st.incomePerSec)}
                  {t("unit.perSec")}
                </div>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={() => selectPlot(id)}>
                <MapPin /> {t("map.locate")}
              </Button>
              <Button size="sm" variant="gold" onClick={() => enterGarage(id)}>
                <LogIn /> {t("map.enter")}
              </Button>
            </div>
          </div>
        );
      })}
      <div className="rounded-2xl border border-dashed border-white/15 p-3 text-xs text-white/55">
        {t("garages.newHint")}
        <FreePlotButton type="garage" />
      </div>
    </div>
  );
}

function FreePlotButton({ type }: { type?: StructureType }) {
  const state = useGame((g) => g.state);
  const selectPlot = useUi((u) => u.selectPlot);
  const { t } = useT();
  const free = WORLD_MAP.plots.find((p) => p.kind === "plot" && state.city.zones.includes(p.zone) && !state.city.buildings[p.id] && (!type || ZONE_BY_ID[p.zone].builds.includes(type)));
  if (!free) return null;
  return (
    <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => selectPlot(free.id)}>
      <MapPin /> {t("garages.findPlot")}
    </Button>
  );
}

export function BuildPanel() {
  const state = useGame((g) => g.state);
  const selectPlot = useUi((u) => u.selectPlot);
  const selectZone = useUi((u) => u.selectZone);
  const { t } = useT();
  const next = ZONES.find((z) => !state.city.zones.includes(z.id));
  return (
    <div className="space-y-2.5 pb-2">
      <p className="px-1 text-xs text-white/50">{t("build.subtitle")}</p>
      {ZONES.filter((z) => state.city.zones.includes(z.id)).map((z) => {
        const free = WORLD_MAP.plots.filter((p) => p.zone === z.id && p.kind === "plot" && !state.city.buildings[p.id]);
        return (
          <div key={z.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xs font-black ring-1 ring-white/10" style={{ background: `${z.ground}55` }}>
              {z.stage}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{t(`zone.${z.id}`)}</div>
              <div className="text-[11px] text-white/50">{free.length ? t("build.free", { n: free.length }) : t("build.none")}</div>
              <div className="mt-0.5 flex gap-1 text-sm">
                {z.builds.map((b) => (
                  <span key={b} title={t(`structure.${b}`)}>
                    {STRUCTURE_BY_ID[b].emoji}
                  </span>
                ))}
              </div>
            </div>
            <Button size="sm" variant={free.length ? "default" : "locked"} disabled={!free.length} onClick={() => free[0] && selectPlot(free[0].id)}>
              <ArrowRight />
            </Button>
          </div>
        );
      })}
      {next && (
        <button onClick={() => selectZone(next.id)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-gold/40 bg-gold/[0.05] p-3 text-left">
          <Lock className="size-5 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gold/80">{t("build.nextZone")}</div>
            <div className="truncate text-sm font-bold">{t(`zone.${next.id}`)}</div>
          </div>
          <span className="text-sm font-bold tabular-nums text-gold">{formatMoney(next.cost)}</span>
        </button>
      )}
    </div>
  );
}

export function UpgradePanel() {
  const state = useGame((g) => g.state);
  const upgradeBuilding = useGame((g) => g.upgradeBuilding);
  const { selectPlot, setView } = useUi.getState();
  const { t } = useT();
  const items = Object.entries(state.city.buildings)
    .map(([id, b]) => ({ id, b, cost: buildingUpgradeCost(state, id) }))
    .filter((x) => x.cost !== null)
    .sort((a, b) => a.cost! - b.cost!);
  return (
    <div className="space-y-2 pb-2">
      <p className="px-1 text-xs text-white/50">{t("upgrade.subtitle")}</p>
      {items.length === 0 && <div className="p-4 text-center text-sm text-white/40">{t("upgrade.none")}</div>}
      {items.map(({ id, b, cost }) => {
        const name = b.type === "garage" ? t("garage.title", { no: lv2(b.garage?.no ?? 1) }) : t(`structure.${b.type}`);
        const icon = b.type === "garage" ? "🔧" : STRUCTURE_BY_ID[b.type].emoji;
        return (
          <div key={id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
            <button onClick={() => selectPlot(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{name}</span>
                <span className="block text-[11px] text-white/50">
                  {t("common.lv", { level: b.level })} → {b.level + 1} · {t(`zone.${plotOf(id)!.zone}`)}
                </span>
              </span>
            </button>
            <CostButton size="sm" cost={cost} label={t("plot.upgrade")} onBuy={() => upgradeBuilding(id)} />
          </div>
        );
      })}
      <Button variant="secondary" className="w-full" onClick={() => setView("empire")}>
        🏭 {t("map.nav.factories")}
      </Button>
    </div>
  );
}

export function MenuPanel({ onSettings }: { onSettings: () => void }) {
  const setView = useUi((u) => u.setView);
  const { t } = useT();
  const tiles: { icon: string; label: string; go: () => void; gold?: boolean }[] = [
    { icon: "⭐", label: t("nav.prestige"), go: () => setView("prestige"), gold: true },
    { icon: "🚗", label: t("nav.cars"), go: () => setView("cars") },
    { icon: "🏆", label: t("nav.achievements"), go: () => setView("achievements") },
    { icon: "📊", label: t("nav.stats"), go: () => setView("stats") },
    { icon: "👔", label: t("nav.managers"), go: () => setView("managers") },
    { icon: "🏪", label: t("nav.dealers"), go: () => setView("dealers") },
    { icon: "⚙️", label: t("menu.settings"), go: onSettings },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
      {tiles.map((x) => (
        <button
          key={x.label}
          onClick={x.go}
          className={cn("flex flex-col items-center gap-1.5 rounded-2xl p-4 text-sm font-semibold ring-1 transition hover:bg-white/[0.07]", x.gold ? "bg-gold/[0.08] ring-gold/30" : "bg-white/[0.04] ring-white/[0.07]")}
        >
          <span className="text-2xl">{x.icon}</span>
          <span className="text-center leading-tight">{x.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MechanicsSummary() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const enterGarage = useUi((u) => u.enterGarage);
  const { t } = useT();
  const ids = garagePlots(state);
  return (
    <div className="mb-4 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-1 text-sm font-bold">👷 {t("employees.mechanics")}</div>
      <div className="mb-2 text-[11px] text-white/50">{t("employees.mechanicsHint")}</div>
      <div className="space-y-1.5">
        {ids.map((id) => {
          const st = snap.city.garages[id];
          const no = state.city.buildings[id]?.garage?.no ?? 1;
          if (!st) return null;
          return (
            <button key={id} onClick={() => enterGarage(id)} className="flex w-full items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-left text-xs ring-1 ring-white/[0.05] hover:bg-white/[0.06]">
              <span className="font-semibold">{t("garage.title", { no: lv2(no) })}</span>
              <span className={cn("tabular-nums", st.workstations > st.staffed ? "text-amber-300" : "text-white/60")}>
                {st.workers}/{st.workerCap} · {st.staffed}/{st.workstations}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2 py-2 ring-1 ring-white/[0.06]">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums", gold && "text-gold")}>{value}</div>
    </div>
  );
}

