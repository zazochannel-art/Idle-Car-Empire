"use client";

import { BUYABLE_TERRITORIES, TERRITORY_BY_ID, type TerritoryId } from "@/game/config/city";
import { territoryLock } from "@/game/engine/territory";
import { unlockedAreas } from "@/game/engine/territory";
import { Lock } from "lucide-react";
import { useEffect, useRef } from "react";
import { CAR_BY_ID } from "@/game/config/cars";
import { COMPONENT_BY_ID } from "@/game/config/chain";
import { ZONES, ZONE_BY_ID, buildableIn } from "@/game/config/city";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { BLOCKS, RACING, WORLD_MAP, dealerPlot, plotOf } from "@/game/city/layout";
import { racingBlocker, racingCost } from "@/game/engine/racing";
import { RaceLayer } from "./race-layer";
import { zoneBlocker } from "@/game/engine/city";
import { plotStatus, type PlotStatus } from "@/game/engine/construction";
import * as Ch from "@/game/engine/chain";
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
import { Showcase } from "./showcase";
import { sprites3d } from "../three/sprites";
import { HAS_INTERIOR } from "../plant/interior/factory-interior";
import { setLiveryOverrides } from "../three/livery";
import { Minimap } from "./minimap";
import { plantName } from "../panels/plant-panel";
import { buildScene } from "./scene";
import type { ShipView, Site, TrafficWorld } from "./traffic";
import { CAR_MODEL_FOR } from "./vehicles";

/** Changes only when something visible on the map changes (not every tick). */
function sceneKey(s: GameState, snap: EconomySnapshot) {
  const b = Object.entries(s.city.buildings)
    .map(([id, x]) => `${id}:${x.type}:${x.level}:${x.garage?.spec ?? ""}:${x.garage?.workers ?? ""}:${x.garage?.facilities.length ?? ""}:${(snap.city.garages[id]?.incomePerSec ?? 0) > 0 ? 1 : 0}:${snap.chain.plants[id]?.car?.id ?? ""}`)
    .join("|");
  const d = Object.values(s.dealers).map((x) => `${x.owned ? 1 : 0}${x.level}`).join(",");
  // land bought, building sites and upgrades under way
  const w = Object.entries(s.city.buildings).filter(([, x]) => x.works).map(([id]) => id).join(",");
  return `${s.city.zones.join()}#${b}#${d}#${s.city.land.length}#${Object.keys(s.city.sites).join(",")}#${w}`;
}

function trafficWorld(s: GameState, snap: EconomySnapshot): TrafficWorld {
  const unlocked = unlockedAreas(s);
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
  // car transporters are real shipments now (see shipViews)
  const factories: Site[] = [];
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

const siteOf = (id: string): Site | null => {
  const plot = plotOf(id);
  return plot ? { id, entry: plot.entry, weight: 1 } : null;
};

/** The engine's shipments, as trucks for the map. */
function shipViews(s: GameState): ShipView[] {
  const out: ShipView[] = [];
  for (const sh of s.chain.shipments) {
    const from = siteOf(sh.from);
    const to = siteOf(sh.to);
    if (!from || !to) continue;
    const color = sh.item === "raw" ? "#a8a29e" : sh.item === "car" ? "#f8fafc" : sh.item === "chassis" ? COMPONENT_BY_ID.engine.color : COMPONENT_BY_ID[sh.item].color;
    out.push({ id: sh.id, from, to, t: sh.t, dur: sh.dur, back: sh.back, vehicle: sh.vehicle, color, item: sh.item, models: sh.models?.map((m) => CAR_MODEL_FOR[m]) });
  }
  return out;
}

/** Plants you can walk into: tapping them on the map zooms into their interior. */
function hasInterior(plotId: string) {
  const b = useGame.getState().state.city.buildings[plotId];
  return !!b?.plant && HAS_INTERIOR.has(b.type);
}

/** Where the camera was before walking into a factory (to zoom back out on exit). */
const returnView: { current: { x: number; y: number; zoom: number } | null } = { current: null };

/** Map → factory: the camera dives onto the building, then the interior opens. */
function enterFactory(engine: MapEngine, plotId: string) {
  const ui = useUi.getState();
  ui.closeAll();
  returnView.current = { x: engine.cam.x, y: engine.cam.y, zoom: engine.cam.zoom };
  engine.focusPlot(plotId, { x: 0, y: 0 }, engine.cam.maxZoom, 0.55);
  setTimeout(() => useUi.getState().openFloor(plotId), 480);
}

export function EmpireMap({ active, panelOffset }: { active: boolean; panelOffset: { x: number; y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const plot = useUi((u) => u.plot);
  const command = useUi((u) => u.command);
  const showcase = useUi((u) => u.showcase);
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
      else if (target.kind === "vehicle") ui.setShowcase(target.v);
      else if (target.id === RACING) ui.setView("racing");
      else if (hasInterior(target.id)) enterFactory(engine, target.id);
      else ui.selectPlot(target.id);
    });
    engine.money = (v) => formatMoney(v);
    engine.race = new RaceLayer(() => useGame.getState().state);
    engine.racingOpen = useGame.getState().state.racing.unlocked;
    engine.setLowGraphics(useGame.getState().state.settings.lowGraphics);
    engine.overlay = overlayRef.current;
    engineRef.current = engine;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __map: engine, __game: useGame, __ui: useUi, __sprites: sprites3d });
    const onVis = () => (document.visibilityState === "hidden" ? engine.stop() : engine.start());
    document.addEventListener("visibilitychange", onVis);
    const off = uiEvents.on((e) => {
      if (e.type === "sale") {
        engine.pop(e.plot, `+${formatMoney(e.amount)}`);
        // a buyer drives off in the car they just bought
        if (e.item === "car") {
          const site = siteOf(e.plot);
          const stock = useGame.getState().state.chain.dealers[e.plot.slice(2) as keyof typeof DEALER_BY_ID];
          if (site) engine.traffic.spawnBuyer(site, CAR_MODEL_FOR[stock?.models[0] ?? "sedan"]);
        }
      } else if (e.type === "firstCar") {
        const car = CAR_BY_ID[e.car];
        engine.celebrateFirstCar(e.plot, CAR_MODEL_FOR[car.id], car.color);
      }
    });
    // cars on the map wear the colours picked in the Design studio
    const paint = (designs: GameState["designs"]) =>
      setLiveryOverrides(Object.fromEntries(Object.entries(designs).map(([id, d]) => [CAR_MODEL_FOR[id as keyof typeof CAR_MODEL_FOR], d.color])));
    paint(useGame.getState().state.designs);
    const offPaint = useGame.subscribe((g, prev) => {
      if (g.state.designs !== prev.state.designs) paint(g.state.designs);
    });
    const offGfx = useGame.subscribe((g) => {
      engine.setLowGraphics(g.state.settings.lowGraphics);
      engine.racingOpen = g.state.racing.unlocked;
    });
    // trucks follow the engine's shipments
    const offShips = useGame.subscribe((g, prev) => {
      if (g.state.chain.shipments !== prev.state.chain.shipments) engine.traffic.setShipments(shipViews(g.state));
    });
    return () => {
      off();
      offShips();
      offPaint();
      offGfx();
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // back from a factory interior: zoom out to where the player was
  useEffect(
    () =>
      useUi.subscribe((u, prev) => {
        const e = engineRef.current;
        if (!e || !prev.floor || u.floor) return;
        const back = returnView.current;
        returnView.current = null;
        if (back) e.cam.flyTo(back.x, back.y, back.zoom, 0.7);
      }),
    [],
  );

  // the camera glides after the vehicle in the showroom
  useEffect(() => {
    engineRef.current?.track(showcase?.ref ?? null);
  }, [showcase]);

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
      plant: (id) => plantName(s, id, t),
      market: t("market.title"),
      depot: t("depot.title"),
      dealer: (id) => n.dealer(DEALER_BY_ID[id]),
      structure: (type) => t(`structure.${type}`),
      level: (lv) => t("common.lv", { level: lv }),
      money: (v) => formatMoney(v),
      racing: t("racing.district"),
    }, () => useGame.getState().state);
    e.setScene(scene, unlockedAreas(s), trafficWorld(s, sn));
    e.traffic.setShipments(shipViews(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  // Floating "+$" over everything that earns on its own.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const list: { plotId: string; perSec: number }[] = [];
    for (const [id, st] of Object.entries(snap.city.garages)) list.push({ plotId: id, perSec: st.incomePerSec });
    for (const [id, inc] of Object.entries(snap.city.structureIncome)) list.push({ plotId: id, perSec: inc });
    e.setEarners(list);
  }, [snap]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.selected = plot;
  }, [plot]);

  const timeMode = useUi((u) => u.timeMode);
  const preview = useUi((u) => u.preview);
  const view = useUi((u) => u.view);
  useEffect(() => {
    if (engineRef.current) engineRef.current.timeMode = timeMode;
  }, [timeMode]);
  useEffect(() => {
    if (engineRef.current) engineRef.current.preview = preview;
  }, [preview]);

  // BUILD mode: every plot coloured by its status (available, owned, building, operational, locked)
  const buildKey = view === "build" ? `${state.city.zones.join()}|${Object.keys(state.city.buildings).length}|${state.city.land.length}|${Object.keys(state.city.sites).length}|${Ch.plantsOf(state).map(([, b]) => b.type).join()}` : "";
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (view !== "build") {
      e.buildInfo = null;
      return;
    }
    const s = useGame.getState().state;
    const info = new Map<string, PlotStatus>();
    for (const p of WORLD_MAP.plots) if (p.kind === "plot") info.set(p.id, plotStatus(s, p.id));
    e.buildInfo = info;
  }, [view, buildKey]);

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
  const areas = unlockedAreas(state);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" aria-label={t("map.nav.map")} />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden">
        {locked.map((z) => (
          <ZoneCard key={z.id} id={z.id} full={z.id === nextLocked?.id} />
        ))}
        {!state.racing.unlocked && state.chain.firstCar && <RacingCard />}
        {BUYABLE_TERRITORIES.filter((t) => !areas.has(t.id)).map((t) => (
          <TerritoryCard key={t.id} id={t.id} />
        ))}
      </div>
      <div className="pointer-events-none absolute right-[calc(env(safe-area-inset-right)+0.5rem)] top-[9.25rem] z-20 md:right-[calc(env(safe-area-inset-right)+0.75rem)] md:top-[5.5rem]">
        <Minimap engine={engineRef} />
      </div>
      <Showcase />
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

/** Over a territory not bought yet: what it is, what it takes, and its price. */
function TerritoryCard({ id }: { id: TerritoryId }) {
  const state = useGame((g) => g.state);
  const lock = territoryLock(state, id);
  const unlock = useGame((g) => g.unlockTerritory);
  const { t } = useT();
  const cfg = TERRITORY_BY_ID[id];
  const why =
    lock?.kind === "zone"
      ? t("map.requires", { name: t(`zone.${lock.zone}`) })
      : lock?.kind === "rep"
        ? t("territory.needRep", { n: lock.need.toLocaleString() })
        : lock?.kind === "ep"
          ? t("territory.needEp", { n: lock.need })
          : null;
  return (
    <div data-zone={`t:${id}`} className="pointer-events-auto absolute left-0 top-0 will-change-transform" style={{ visibility: "hidden" }}>
      <button
        onClick={() => !lock && unlock(id)}
        className={cn(
          "flex max-w-[15rem] flex-col items-center rounded-2xl border px-3 py-1.5 text-center backdrop-blur-md",
          !lock ? "border-gold/50 bg-[#2a2210]/85 shadow-[0_0_20px_rgba(245,196,81,.35)]" : "border-white/15 bg-ink/80",
        )}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide">
          <Lock className="size-3 text-white/60" />
          {cfg.emoji} {t(`territory.${id}`)}
        </span>
        <span className="text-[10px] leading-snug text-white/55">{t(`territoryDesc.${id}`)}</span>
        <span className={cn("mt-0.5 text-[11px] font-black", !lock ? "text-gold" : "text-white/70")}>🔓 {formatMoney(cfg.cost)}</span>
        {why && <span className="text-[10px] text-amber-300/80">{why}</span>}
      </button>
    </div>
  );
}

/** Over the fenced-off circuit: what it takes to build the Racing District. */
function RacingCard() {
  const blocker = useGame((g) => racingBlocker(g.state));
  const cost = useGame((g) => racingCost(g.state));
  const unlock = useGame((g) => g.unlockRacing);
  const setView = useUi((u) => u.setView);
  const { t } = useT();
  const can = blocker === null;
  return (
    <div data-zone="racing" className="pointer-events-auto absolute left-0 top-0 will-change-transform" style={{ visibility: "hidden" }}>
      <div className="w-56 rounded-2xl border border-gold/40 bg-ink/85 p-3 text-center shadow-[0_20px_50px_-10px_rgba(0,0,0,.8)] backdrop-blur-md">
        <div className="text-2xl">🏁</div>
        <div className="text-sm font-black uppercase tracking-wide">{t("racing.district")}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-white/55">{t("racing.districtDesc")}</div>
        <button
          onClick={() => (can ? unlock() : setView("racing"))}
          className={cn(
            "mt-2 w-full rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition",
            can ? "bg-gradient-to-b from-gold to-gold-deep text-black shadow-[0_0_20px_rgba(245,196,81,.45)] hover:brightness-110" : "bg-white/10 text-white/70",
          )}
        >
          🔓 {t("racing.build")} · {formatMoney(cost)}
        </button>
        {blocker === "firstCar" && <div className="mt-1 text-[10px] text-amber-300/80">{t("racing.blocker.firstCar")}</div>}
      </div>
    </div>
  );
}
