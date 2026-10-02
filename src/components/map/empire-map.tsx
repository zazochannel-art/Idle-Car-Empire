"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef } from "react";
import { ZONES, ZONE_BY_ID } from "@/game/config/city";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { FACTORY_BY_ID } from "@/game/config/factories";
import { BLOCKS, WORLD_MAP, dealerPlot, factoryPlot, plotOf } from "@/game/city/layout";
import { zoneBlocker } from "@/game/engine/city";
import type { EconomySnapshot } from "@/game/engine/economy";
import { formatMoney } from "@/game/format";
import type { GameState, ZoneId } from "@/game/types";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { MapEngine } from "./map-engine";
import { Minimap } from "./minimap";
import { buildScene } from "./scene";
import type { Site, TrafficWorld } from "./traffic";

/** Changes only when something visible on the map changes (not every tick). */
function sceneKey(s: GameState, snap: EconomySnapshot) {
  const b = Object.entries(s.city.buildings)
    .map(([id, x]) => `${id}:${x.type}:${x.level}:${x.garage?.spec ?? ""}:${x.garage?.workers ?? ""}:${x.garage?.facilities.length ?? ""}:${(snap.city.garages[id]?.incomePerSec ?? 0) > 0 ? 1 : 0}`)
    .join("|");
  const f = Object.values(s.factories).map((x) => `${x.owned ? 1 : 0}${x.level}`).join(",");
  const d = Object.values(s.dealers).map((x) => `${x.owned ? 1 : 0}${x.level}`).join(",");
  return `${s.city.zones.join()}#${b}#${f}#${d}#${snap.gm.unlockedFactories.size}`;
}

function trafficWorld(s: GameState, snap: EconomySnapshot): TrafficWorld {
  const unlocked = new Set(s.city.zones);
  const garages: Site[] = [];
  const suppliers: Site[] = [];
  for (const [id, b] of Object.entries(s.city.buildings)) {
    const plot = plotOf(id);
    if (!plot) continue;
    if (b.type === "garage") {
      const inc = snap.city.garages[id]?.incomePerSec ?? 0;
      if (inc > 0) garages.push({ id, entry: plot.entry, weight: 1 + (snap.city.garages[id]?.staffed ?? 0) });
    } else if (["warehouse", "partsFactory", "logistics", "truckDepot"].includes(b.type)) {
      suppliers.push({ id, entry: plot.entry, weight: b.level });
    }
  }
  const factories: Site[] = [];
  for (const f of Object.keys(FACTORY_BY_ID) as (keyof typeof FACTORY_BY_ID)[]) {
    const plot = factoryPlot(f);
    if (!plot || !s.factories[f].owned) continue;
    const site = { id: plot.id, entry: plot.entry, weight: 1 };
    suppliers.push(site);
    // car carriers only leave plants that produce on their own
    if (snap.factories[f]?.automated) factories.push(site);
  }
  const dealers: Site[] = [];
  for (const id of Object.keys(DEALER_BY_ID) as (keyof typeof DEALER_BY_ID)[]) {
    const plot = dealerPlot(id);
    if (plot && s.dealers[id].owned) dealers.push({ id: plot.id, entry: plot.entry, weight: 1 });
  }
  const busyBlocks: [number, number][] = [];
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const z = WORLD_MAP.blockZone[by][bx];
      if (z && unlocked.has(z)) busyBlocks.push([bx, by]);
    }
  return { unlocked, garages, factories, dealers, suppliers, busyBlocks };
}

export function EmpireMap({ active, panelOffset }: { active: boolean; panelOffset: { x: number; y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const plot = useUi((u) => u.plot);
  const command = useUi((u) => u.command);
  const { t, lang } = useT();
  const n = useContent(lang);
  const offsetRef = useRef(panelOffset);
  useEffect(() => {
    offsetRef.current = panelOffset;
  }, [panelOffset]);

  useEffect(() => {
    const engine = new MapEngine(canvasRef.current!, (target) => {
      const ui = useUi.getState();
      if (!target) ui.closeAll();
      else if (target.kind === "zone") ui.selectZone(target.id);
      else ui.selectPlot(target.id);
    });
    engine.money = (v) => formatMoney(v);
    engine.overlay = overlayRef.current;
    engineRef.current = engine;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map?: MapEngine }).__map = engine;
    const onVis = () => (document.visibilityState === "hidden" ? engine.stop() : engine.start());
    document.addEventListener("visibilitychange", onVis);
    const off = uiEvents.on((e) => {
      if (e.type !== "sale") return;
      const auto = useGame.getState().snap.factories[e.factory]?.automated;
      if (!auto) engine.pop(`f:${e.factory}`, `+${formatMoney(e.amount)}`);
    });
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (active) e.start();
    else e.stop();
  }, [active]);

  const key = sceneKey(state, snap);
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const { state: s, snap: sn } = useGame.getState();
    const scene = buildScene(s, sn, {
      garage: (no) => t("garage.title", { no: String(no).padStart(2, "0") }),
      factory: (id) => n.factory(FACTORY_BY_ID[id]),
      dealer: (id) => n.dealer(DEALER_BY_ID[id]),
      structure: (type) => t(`structure.${type}`),
      level: (lv) => t("common.lv", { level: lv }),
      money: (v) => formatMoney(v),
    });
    e.setScene(scene, new Set(s.city.zones), trafficWorld(s, sn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  // Floating "+$" over everything that earns on its own.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const list: { plotId: string; perSec: number }[] = [];
    for (const [id, st] of Object.entries(snap.city.garages)) list.push({ plotId: id, perSec: st.incomePerSec });
    for (const [id, inc] of Object.entries(snap.city.structureIncome)) list.push({ plotId: id, perSec: inc });
    for (const [id, st] of Object.entries(snap.factories)) if (st?.automated) list.push({ plotId: `f:${id}`, perSec: st.incomeBeforeDealers * snap.dealers.multiplier });
    e.setEarners(list);
  }, [snap]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.selected = plot;
  }, [plot]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e || !command) return;
    if (command.kind === "plot") {
      // zoom -1: the default zoom (coming back out of a garage)
      const zoom = command.zoom === -1 ? e.defaultZoom() : command.zoom;
      e.focusPlot(command.id, command.zoom ? { x: 0, y: 0 } : offsetRef.current, zoom);
    }
    else if (command.kind === "zone") e.focusZone(command.id, offsetRef.current);
    else if (command.kind === "home") e.home();
    else if (command.kind === "zoom") e.zoomBy(command.f);
    else if (command.kind === "look") e.lookAt(command.x, command.y);
  }, [command]);

  const nextLocked = ZONES.find((z) => !state.city.zones.includes(z.id));
  const locked = ZONES.filter((z) => !state.city.zones.includes(z.id));

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" aria-label={t("map.nav.map")} />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden">
        {locked.map((z) => (
          <ZoneCard key={z.id} id={z.id} full={z.id === nextLocked?.id} />
        ))}
      </div>
      <div className="pointer-events-none absolute right-2 top-[6.75rem] z-20 md:right-3 md:top-[5.5rem]">
        <Minimap engine={engineRef} />
      </div>
    </div>
  );
}

function ZoneCard({ id, full }: { id: ZoneId; full: boolean }) {
  const cash = useGame((g) => g.state.cash);
  const blocker = useGame((g) => zoneBlocker(g.state, id));
  const unlockZone = useGame((g) => g.unlockZone);
  const selectZone = useUi((u) => u.selectZone);
  const { t } = useT();
  const z = ZONE_BY_ID[id];
  const can = !blocker && cash >= z.cost;

  return (
    <div data-zone={id} className="pointer-events-auto absolute left-0 top-0 will-change-transform" style={{ visibility: "hidden" }}>
      {full ? (
        <div className="w-56 rounded-2xl border border-gold/40 bg-ink/85 p-3 text-center shadow-[0_20px_50px_-10px_rgba(0,0,0,.8)] backdrop-blur-md">
          <div className="mx-auto mb-1 flex size-9 items-center justify-center rounded-full bg-gold/15 ring-1 ring-gold/40">
            <Lock className="size-4 text-gold" />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/80">{t("map.stage", { n: z.stage })}</div>
          <div className="text-sm font-black uppercase tracking-wide">{t(`zone.${id}`)}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-white/55">{t(`zoneDesc.${id}`)}</div>
          <button
            onClick={() => (can ? unlockZone(id) : selectZone(id))}
            className={cn(
              "mt-2 w-full rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition",
              can ? "bg-gradient-to-b from-gold to-gold-deep text-black shadow-[0_0_20px_rgba(245,196,81,.45)] hover:brightness-110" : "bg-white/10 text-white/70",
            )}
          >
            🔓 {t("map.unlock")} · {formatMoney(z.cost)}
          </button>
          {blocker && <div className="mt-1 text-[10px] text-amber-300/80">{t("map.requires", { name: t(`zone.${blocker}`) })}</div>}
        </div>
      ) : (
        <button onClick={() => selectZone(id)} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-ink/80 px-3 py-1.5 text-[11px] font-bold backdrop-blur-md">
          <Lock className="size-3 text-white/60" />
          <span className="text-white/50">{t("map.stage", { n: z.stage })}</span>
          <span>{t(`zone.${id}`)}</span>
        </button>
      )}
    </div>
  );
}
