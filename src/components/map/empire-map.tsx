"use client";

import { BUYABLE_TERRITORIES, TERRITORIES, TERRITORY_BY_ID, type TerritoryId } from "@/game/config/city";
import { territoryLock } from "@/game/engine/territory";
import { unlockedAreas } from "@/game/engine/territory";
import { Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CAR_BY_ID } from "@/game/config/cars";
import { COMPONENT_BY_ID } from "@/game/config/chain";
import { ZONES, ZONE_BY_ID } from "@/game/config/city";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { RACING, WORLD_MAP, plotOf } from "@/game/city/layout";
import { racingBlocker, racingCost } from "@/game/engine/racing";
import { zoneBlocker } from "@/game/engine/city";
import { plotStatus, type PlotStatus } from "@/game/engine/construction";
import * as Ch from "@/game/engine/chain";
import { formatMoney } from "@/game/format";
import type { GameState, ZoneId } from "@/game/types";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import type { MapEngine } from "./world/engine";
import { Showcase } from "./showcase";
import { HAS_INTERIOR } from "../plant/interior/factory-interior";
import { setLiveryOverrides } from "../three/livery";
import { Minimap } from "./minimap";
import { plantName } from "../panels/plant-panel";
import type { MapArea, MapNames, ShipView, Site } from "./map-types";
import { CAR_MODEL_FOR } from "./vehicles";

/** Changes only when something visible on the map changes (not every tick). */
function sceneKey(s: GameState) {
  const b = Object.entries(s.city.buildings)
    .map(([id, x]) => `${id}:${x.type}:${x.level}:${x.garage?.spec ?? ""}:${x.garage?.no ?? ""}:${x.works ? 1 : 0}`)
    .join("|");
  const d = Object.values(s.dealers).map((x) => `${x.owned ? 1 : 0}${x.level}`).join(",");
  return `${s.city.zones.join()}#${(s.city.territories ?? []).join()}#${s.racing.unlocked ? 1 : 0}#${b}#${d}#${s.city.land.length}#${Object.keys(s.city.sites).join(",")}`;
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
function enterFactory(engine: MapEngine, plotId: string, schedule: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>) {
  const ui = useUi.getState();
  ui.closeAll();
  returnView.current = { x: engine.cam.x, y: engine.cam.y, zoom: engine.cam.zoom };
  engine.focusPlot(plotId, { x: 0, y: 0 }, engine.cam.maxZoom * 0.8, 0.55);
  schedule(() => useUi.getState().openFloor(plotId), 480);
}

export function EmpireMap({ active, panelOffset }: { active: boolean; panelOffset: { x: number; y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  /** Bumped when the engine is up (effects below re-run then). */
  const [engine, setEngine] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  /** The padlock whose card is open. */
  const [lockOpen, setLockOpen] = useState<MapArea | null>(null);
  // Subscribe only to changes that can affect the map. The simulation still ticks at
  // 100ms, but money/progress changes no longer rerender this entire 3D map shell.
  const mapKey = useGame((g) => sceneKey(g.state));
  const unlockReadyKey = useGame((g) => {
    const s = g.state;
    const zones = ZONES.filter((z) => !s.city.zones.includes(z.id)).map((z) => `z:${z.id}:${!zoneBlocker(s, z.id) && s.cash >= z.cost ? 1 : 0}`);
    const areas = unlockedAreas(s);
    const territories = BUYABLE_TERRITORIES.filter((x) => !areas.has(x.id)).map((x) => `t:${x.id}:${territoryLock(s, x.id) === null && s.cash >= x.cost ? 1 : 0}`);
    const racing = !s.racing.unlocked && s.chain.firstCar ? `r:${racingBlocker(s) === null && s.cash >= racingCost(s) ? 1 : 0}` : "";
    return [...zones, ...territories, racing].join("|");
  });
  const earnersKey = useGame((g) => {
    const s = g.snap.city;
    return [
      ...Object.entries(s.garages).map(([id, x]) => `g:${id}:${x.incomePerSec}`),
      ...Object.entries(s.structureIncome).map(([id, x]) => `s:${id}:${x}`),
    ].join("|");
  });
  const state = useGame.getState().state;
  const plot = useUi((u) => u.plot);
  const command = useUi((u) => u.command);
  const showcase = useUi((u) => u.showcase);
  const { t, lang } = useT();
  const n = useContent(lang);
  const offsetRef = useRef(panelOffset);
  const activeRef = useRef(active);
  useEffect(() => {
    offsetRef.current = panelOffset;
    activeRef.current = active;
  }, [panelOffset, active]);

  // the 3D map loads on its own (three.js and the world files), after the game UI
  useEffect(() => {
    let alive = true;
    let made: MapEngine | null = null;
    const offs: (() => void)[] = [];
    let enterTimer: ReturnType<typeof setTimeout> | null = null;
    import("./world/engine")
      .then(({ MapEngine }) => {
        if (!alive) return;
        const e = new MapEngine(
          canvasRef.current!,
          labelsRef.current!,
          (target) => {
            const ui = useUi.getState();
            setLockOpen(null);
            if (!target) ui.closeAll();
            else if (target.kind === "zone") ui.selectZone(target.id);
            else if (target.kind === "vehicle") ui.setShowcase(target.v);
            else if (target.id === RACING) ui.setView("racing");
            else if (hasInterior(target.id)) {
              if (enterTimer) clearTimeout(enterTimer);
              enterTimer = enterFactory(e, target.id, (fn, delay) => {
                enterTimer = setTimeout(fn, delay);
                return enterTimer;
              });
            }
            else ui.selectPlot(target.id);
          },
          { base: process.env.NEXT_PUBLIC_BASE_PATH ?? "", low: useGame.getState().state.settings.lowGraphics },
        );
        made = e;
        e.money = (v) => formatMoney(v);
        e.live = () => {
          const g = useGame.getState();
          return { state: g.state, snap: g.snap };
        };
        e.overlay = overlayRef.current;
        e.traffic.setShipments(shipViews(useGame.getState().state));
        engineRef.current = e;
        if (process.env.NODE_ENV !== "production") Object.assign(window, { __map: e, __game: useGame, __ui: useUi });
        const onVis = () => (document.visibilityState === "hidden" ? e.stop() : activeRef.current ? e.start() : undefined);
        document.addEventListener("visibilitychange", onVis);
        offs.push(() => document.removeEventListener("visibilitychange", onVis));
        offs.push(
          uiEvents.on((ev) => {
            if (ev.type === "sale") {
              e.pop(ev.plot, `+${formatMoney(ev.amount)}`);
              // a buyer drives off in the car they just bought
              if (ev.item === "car") {
                const site = siteOf(ev.plot);
                const stock = useGame.getState().state.chain.dealers[ev.plot.slice(2) as keyof typeof DEALER_BY_ID];
                if (site) e.traffic.spawnBuyer(site, CAR_MODEL_FOR[stock?.models[0] ?? "sedan"]);
              }
            } else if (ev.type === "firstCar") {
              const car = CAR_BY_ID[ev.car];
              e.celebrateFirstCar(ev.plot, CAR_MODEL_FOR[car.id], car.color);
            }
          }),
        );
        // cars wear the colours picked in the Design studio
        const paint = (designs: GameState["designs"]) =>
          setLiveryOverrides(Object.fromEntries(Object.entries(designs).map(([id, d]) => [CAR_MODEL_FOR[id as keyof typeof CAR_MODEL_FOR], d.color])));
        paint(useGame.getState().state.designs);
        offs.push(
          useGame.subscribe((g, prev) => {
            if (g.state.designs !== prev.state.designs) paint(g.state.designs);
            if (g.state.settings.lowGraphics !== prev.state.settings.lowGraphics) e.setLowGraphics(g.state.settings.lowGraphics);
            // trucks follow the engine's shipments
            if (g.state.chain.shipments !== prev.state.chain.shipments) e.traffic.setShipments(shipViews(g.state));
          }),
        );
        setEngine((k) => k + 1);
        e.ready.then(
          () => alive && setStatus("ready"),
          () => alive && setStatus("failed"),
        );
      })
      .catch((err) => {
        console.error("map: could not start", err);
        if (alive) setStatus("failed");
      });
    return () => {
      alive = false;
      if (enterTimer) clearTimeout(enterTimer);
      enterTimer = null;
      offs.forEach((f) => f());
      made?.destroy();
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
  }, [engine, showcase]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (active) e.start();
    else e.stop();
  }, [engine, active]);

  const key = mapKey;
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const s = useGame.getState().state;
    const names: MapNames = {
      garage: (no) => t("garage.title", { no: String(no).padStart(2, "0") }),
      plant: (id) => plantName(s, id, t),
      market: t("market.title"),
      depot: t("depot.title"),
      dealer: (id) => n.dealer(DEALER_BY_ID[id]),
      structure: (type) => t(`structure.${type}`),
      level: (lv) => t("common.lv", { level: lv }),
      money: (v) => formatMoney(v),
      racing: t("racing.district"),
    };
    e.setState(s, names);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, lang]);

  // floating "+$" over everything that earns on its own
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const list: { plotId: string; perSec: number }[] = [];
    for (const [id, st] of Object.entries(snap.city.garages)) list.push({ plotId: id, perSec: st.incomePerSec });
    for (const [id, inc] of Object.entries(snap.city.structureIncome)) list.push({ plotId: id, perSec: inc });
    e.setEarners(list);
  }, [engine, earnersKey]);

  useEffect(() => {
    const e = engineRef.current;
    if (e) e.selected = plot;
  }, [engine, plot]);

  const timeMode = useUi((u) => u.timeMode);
  const preview = useUi((u) => u.preview);
  const view = useUi((u) => u.view);
  useEffect(() => {
    const e = engineRef.current;
    if (e) e.timeMode = timeMode;
  }, [engine, timeMode]);
  useEffect(() => {
    const e = engineRef.current;
    if (e) e.preview = preview;
  }, [engine, preview]);

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
  }, [engine, view, buildKey]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e || !command) return;
    if (command.kind === "plot") {
      // zoom -1: the default zoom (coming back out of a garage)
      const zoom = command.zoom === -1 ? e.defaultZoom() : command.zoom;
      e.focusPlot(command.id, command.zoom ? { x: 0, y: 0 } : offsetRef.current, zoom);
    } else if (command.kind === "zone") e.focusZone(command.id, offsetRef.current);
    else if (command.kind === "home") e.home();
    else if (command.kind === "zoom") e.zoomBy(command.f);
    else if (command.kind === "look") e.lookAt(command.x, command.y);
  }, [command]);

  const areas = unlockedAreas(state);
  // one padlock on every district and territory still locked (and on the paddock)
  const locks: { id: MapArea; ready: boolean; name: string }[] = [
    ...ZONES.filter((z) => !state.city.zones.includes(z.id)).map((z) => ({ id: z.id as MapArea, ready: !zoneBlocker(state, z.id) && state.cash >= z.cost, name: t(`zone.${z.id}`) })),
    ...BUYABLE_TERRITORIES.filter((x) => !areas.has(x.id)).map((x) => ({ id: `t:${x.id}` as MapArea, ready: territoryLock(state, x.id) === null && state.cash >= x.cost, name: t(`territory.${x.id}`) })),
    ...(!state.racing.unlocked && state.chain.firstCar ? [{ id: "racing" as MapArea, ready: racingBlocker(state) === null && state.cash >= racingCost(state), name: t("racing.district") }] : []),
  ];
  // Keep the selector above responsible for lock readiness; this render only occurs when it changes.
  void unlockReadyKey;
  const openLock = locks.some((l) => l.id === lockOpen) ? lockOpen : null;

  return (
    <div className="absolute inset-0 bg-[#bfe3f7]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" aria-label={t("map.nav.map")} />
      <canvas ref={labelsRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* from far away: the names of the districts and territories already open */}
        {ZONES.filter((z) => areas.has(z.id)).map((z) => (
          <AreaLabel key={z.id} id={z.id} name={t(`zone.${z.id}`)} engine={engineRef} />
        ))}
        {TERRITORIES.filter((x) => areas.has(x.id)).map((x) => (
          <AreaLabel key={x.id} id={`t:${x.id}`} name={`${x.emoji} ${t(`territory.${x.id}`)}`} engine={engineRef} />
        ))}
        {locks.map((l) => (
          <LockPin key={l.id} {...l} open={openLock === l.id} onToggle={() => setLockOpen((o) => (o === l.id ? null : l.id))} />
        ))}
        {openLock && <LockCard key={openLock} id={openLock} onClose={() => setLockOpen(null)} />}
      </div>
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-[#141a3f]/85 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-[0_3px_0_0_rgba(0,0,0,0.3)]">
            {status === "failed" ? t("map.noWebgl") : t("map.loading")}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute right-[calc(env(safe-area-inset-right)+0.5rem)] top-[9.25rem] z-20 md:right-[calc(env(safe-area-inset-right)+0.75rem)] md:top-[5.5rem]">
        <Minimap engine={engineRef} />
      </div>
      <Showcase />
    </div>
  );
}

/** A district's name over the map at the region and districts zoom; a tap flies there. */
function AreaLabel({ id, name, engine }: { id: MapArea; name: string; engine: React.RefObject<MapEngine | null> }) {
  return (
    <button
      data-zone={id}
      data-far=""
      onClick={() => engine.current?.flyToArea(id)}
      className="pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full bg-[#141a3f]/80 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-[0_3px_0_0_rgba(0,0,0,0.3)] will-change-transform"
      style={{ visibility: "hidden" }}
    >
      {name}
    </button>
  );
}

/** A locked district, territory or the Racing District: one padlock, the same size at every zoom. */
function LockPin({ id, ready, name, open, onToggle }: { id: MapArea; ready: boolean; name: string; open: boolean; onToggle: () => void }) {
  const { t } = useT();
  return (
    <button
      data-zone={id}
      data-fixed=""
      onClick={onToggle}
      aria-label={`${t("map.locked")}: ${name}`}
      aria-expanded={open}
      className={cn(
        "pointer-events-auto absolute left-0 top-0 flex size-8 items-center justify-center rounded-full shadow-[0_3px_0_0_rgba(0,0,0,0.35)] will-change-transform",
        ready ? "bg-gold text-[#2a1d00] ring-2 ring-white/80" : "bg-[#2b2b2e]/90 text-white/85 ring-1 ring-white/25",
        open && "ring-2 ring-gold",
      )}
      style={{ visibility: "hidden" }}
    >
      <Lock className="size-4" strokeWidth={2.5} />
    </button>
  );
}

const unlockBtn = (can: boolean) =>
  cn(
    "mt-1.5 w-full rounded-lg px-2 py-1.5 text-[11px] font-black uppercase tracking-wide transition",
    can ? "bg-gold text-[#2a1d00] shadow-[0_2px_0_0_#c48300] hover:brightness-105" : "bg-white/10 text-white/70",
  );

/** What a padlock's area is, what it takes and its price; opens over the padlock. */
function LockCard({ id, onClose }: { id: MapArea; onClose: () => void }) {
  const { t } = useT();
  return (
    <div data-zone={id} data-anchor="above" className="pointer-events-auto absolute left-0 top-0 w-52 will-change-transform" style={{ visibility: "hidden" }}>
      <div className="relative rounded-xl bg-[#2b2b2e]/95 px-2.5 pb-2.5 pt-2 text-center shadow-[0_12px_30px_-8px_rgba(0,0,0,.7)] ring-1 ring-white/15 backdrop-blur-md">
        <button onClick={onClose} aria-label={t("map.close")} className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-white/55 hover:text-white">
          <X className="size-3.5" />
        </button>
        {id === "racing" ? <RacingInfo /> : id.startsWith("t:") ? <TerritoryInfo id={id.slice(2) as TerritoryId} /> : <ZoneInfo id={id as ZoneId} />}
      </div>
    </div>
  );
}

function ZoneInfo({ id }: { id: ZoneId }) {
  const cash = useGame((g) => g.state.cash);
  const blocker = useGame((g) => zoneBlocker(g.state, id));
  const unlockZone = useGame((g) => g.unlockZone);
  const selectZone = useUi((u) => u.selectZone);
  const { t } = useT();
  const z = ZONE_BY_ID[id];
  const can = !blocker && cash >= z.cost;
  return (
    <>
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-gold/80">{t("map.stage", { n: z.stage })}</div>
      <div className="px-5 text-xs font-black uppercase tracking-wide">{t(`zone.${id}`)}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-white/55">{t(`zoneDesc.${id}`)}</div>
      <button onClick={() => (can ? unlockZone(id) : selectZone(id))} className={unlockBtn(can)}>
        🔓 {t("map.unlock")} · {formatMoney(z.cost)}
      </button>
      {blocker && <div className="mt-1 text-[9px] leading-snug text-amber-300/80">{t("map.requires", { name: t(`zone.${blocker}`) })}</div>}
    </>
  );
}

function TerritoryInfo({ id }: { id: TerritoryId }) {
  const state = useGame((g) => g.state);
  const lock = territoryLock(state, id);
  const unlock = useGame((g) => g.unlockTerritory);
  const { t } = useT();
  const cfg = TERRITORY_BY_ID[id];
  const can = !lock && state.cash >= cfg.cost;
  const why =
    lock?.kind === "zone"
      ? t("map.requires", { name: t(`zone.${lock.zone}`) })
      : lock?.kind === "rep"
        ? t("territory.needRep", { n: lock.need.toLocaleString() })
        : lock?.kind === "ep"
          ? t("territory.needEp", { n: lock.need })
          : null;
  return (
    <>
      <div className="px-5 text-xs font-black uppercase tracking-wide">
        {cfg.emoji} {t(`territory.${id}`)}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-white/55">{t(`territoryDesc.${id}`)}</div>
      <button onClick={() => can && unlock(id)} disabled={!can} className={unlockBtn(can)}>
        🔓 {t("map.unlock")} · {formatMoney(cfg.cost)}
      </button>
      {why && <div className="mt-1 text-[9px] leading-snug text-amber-300/80">{why}</div>}
    </>
  );
}

function RacingInfo() {
  const blocker = useGame((g) => racingBlocker(g.state));
  const cost = useGame((g) => racingCost(g.state));
  const unlock = useGame((g) => g.unlockRacing);
  const setView = useUi((u) => u.setView);
  const { t } = useT();
  const can = blocker === null;
  return (
    <>
      <div className="px-5 text-xs font-black uppercase tracking-wide">🏁 {t("racing.district")}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-white/55">{t("racing.districtDesc")}</div>
      <button onClick={() => (can ? unlock() : setView("racing"))} className={unlockBtn(can)}>
        🔓 {t("racing.build")} · {formatMoney(cost)}
      </button>
      {blocker === "firstCar" && <div className="mt-1 text-[9px] leading-snug text-amber-300/80">{t("racing.blocker.firstCar")}</div>}
    </>
  );
}
