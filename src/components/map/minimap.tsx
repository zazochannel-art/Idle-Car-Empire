"use client";

import { unlockedAreas } from "@/game/engine/territory";
import { Building2, Factory, Globe2, Home, Lock, MapPin, Minus, Plus, Map as MapIcon } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { STRUCTURE_BY_ID, TERRITORIES, ZONES } from "@/game/config/city";
import { WORLD_MAP, zoneCenterTile } from "@/game/city/layout";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { ZOOM_TIERS, type MapArea, type ZoomTier } from "./map-types";
import type { MapEngine } from "./world/engine";
import { cn } from "@/lib/utils";

const TIER_ICON: Record<ZoomTier, typeof Globe2> = { region: Globe2, districts: MapIcon, buildings: Building2, detail: Factory };

/** The minimap is the island's own picture (3:2). */
const W = 172;
const H = 115;
const [SX, SZ] = WORLD_MAP.size;
/** Game area ids in the order of the areas raster (id = index + 1). */
const AREA_IDS = ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global", "mountain", "port", "raw", "suburbs", "boulevard", "airport", "campus", "racing"];

/** Map position → minimap pixel. */
const mm = (x: number, y: number): [number, number] => [(x / SX + 0.5) * W, (y / SZ + 0.5) * H];

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** A grey veil over the areas still locked (redrawn when an area opens). */
function veil(areas: HTMLImageElement, unlocked: ReadonlySet<string>): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = areas.width;
  cv.height = areas.height;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(areas, 0, 0);
  const img = g.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const id = d[i];
    const locked = id > 0 && !unlocked.has(AREA_IDS[id - 1]);
    d[i] = 120;
    d[i + 1] = 132;
    d[i + 2] = 146;
    d[i + 3] = locked ? 170 : 0;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export function Minimap({ engine }: { engine: RefObject<MapEngine | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useGame((g) => g.state);
  const stateRef = useRef(state);
  const { t } = useT();
  const [tier, setTier] = useState<ZoomTier>("buildings");
  const [list, setList] = useState(false);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    const base = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/world`;
    let island: HTMLImageElement | null = null;
    let areas: HTMLImageElement | null = null;
    let fog: { key: string; cv: HTMLCanvasElement } | null = null;
    load(`${base}/minimap.webp`).then((i) => (island = i), () => {});
    load(`${base}/areas.png`).then((i) => (areas = i), () => {});
    let raf = 0;
    let frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (frame++ % 3) return; // 20 fps is plenty
      const s = stateRef.current;
      const unlocked = unlockedAreas(s);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#3a9be0";
      ctx.fillRect(0, 0, W, H);
      if (island) ctx.drawImage(island, 0, 0, W, H);
      if (areas) {
        const key = [...unlocked].sort().join();
        if (fog?.key !== key) fog = { key, cv: veil(areas, unlocked) };
        ctx.drawImage(fog.cv, 0, 0, W, H);
      }
      ctx.font = "8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const z of ZONES) {
        if (unlocked.has(z.id)) continue;
        const c = zoneCenterTile(z.id);
        const [cx, cy] = mm(c.x, c.y);
        ctx.fillText("🔒", cx, cy);
      }
      for (const p of WORLD_MAP.plots) {
        if (!unlocked.has(p.zone)) continue;
        const b = s.city.buildings[p.id];
        let color: string | null = null;
        if (p.kind === "racing") color = s.racing.unlocked ? "#f5c451" : null;
        else if (p.kind === "market") color = "#22c55e";
        else if (p.kind === "depot") color = "#a16207";
        else if (b?.plant) color = "#fb923c";
        else if (p.kind === "dealer" && s.dealers[p.dealer!].owned) color = "#facc15";
        else if (b?.type === "garage") color = "#60a5fa";
        else if (b) color = STRUCTURE_BY_ID[b.type].roof;
        if (!color) continue;
        const [x, y] = mm(p.x, p.y);
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, p.big ? 2.6 : 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const e = engine.current;
      if (e) {
        const now = e.zoomTier();
        setTier((old) => (old === now ? old : now));
        const v = e.viewQuad().map(([x, y]) => mm(x, y));
        ctx.beginPath();
        v.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * SX;
    const y = ((e.clientY - r.top) / r.height - 0.5) * SZ;
    engine.current?.lookAt(x, y);
  };

  const btn = "flex size-8 items-center justify-center rounded-lg hud-bar text-white transition hover:brightness-110";
  const areas = unlockedAreas(state);
  const go = (id: MapArea) => {
    engine.current?.flyToArea(id);
    setList(false);
  };
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      <div className="overflow-hidden rounded-xl bg-white p-1 shadow-[0_3px_0_0_rgba(0,0,0,0.3)]">
        <canvas ref={ref} onPointerDown={onTap} style={{ aspectRatio: `${W} / ${H}` }} className="block w-[118px] cursor-pointer rounded-lg md:w-[172px]" aria-label={t("map.minimap")} />
      </div>
      {/* zoom tiers: the whole region, districts, buildings, factory detail */}
      <div className="flex gap-0.5 rounded-lg hud-bar p-0.5" role="radiogroup" aria-label={t("map.tiers")}>
        {ZOOM_TIERS.map((k) => {
          const Icon = TIER_ICON[k];
          return (
            <button
              key={k}
              role="radio"
              aria-checked={tier === k}
              title={t(`map.tier.${k}`)}
              aria-label={t(`map.tier.${k}`)}
              onClick={() => engine.current?.setTier(k)}
              className={cn("flex size-7 items-center justify-center rounded-md transition", tier === k ? "bg-gold text-[#2a1d00]" : "text-white/75 hover:text-white")}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        <button className={cn(btn, list && "bg-gold text-[#2a1d00]")} onClick={() => setList((v) => !v)} aria-label={t("map.districts")} aria-expanded={list}>
          <MapPin className="size-4" />
        </button>
        <button className={btn} onClick={() => engine.current?.zoomBy(1.35)} aria-label={t("map.zoomIn")}>
          <Plus className="size-4" />
        </button>
        <button className={btn} onClick={() => engine.current?.zoomBy(1 / 1.35)} aria-label={t("map.zoomOut")}>
          <Minus className="size-4" />
        </button>
        <button className={btn} onClick={() => engine.current?.home()} aria-label={t("map.home")}>
          <Home className="size-4" />
        </button>
      </div>
      {list && (
        <div className="max-h-[50vh] w-56 overflow-y-auto rounded-xl bg-[#232b66] p-1.5 ring-1 ring-white/10 text-xs shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]">
          <div className="px-1.5 pb-1 text-[10px] font-black uppercase tracking-widest text-white/50">{t("map.districts")}</div>
          {ZONES.map((z) => (
            <AreaRow key={z.id} open={areas.has(z.id)} label={t(`zone.${z.id}`)} onClick={() => go(z.id)} />
          ))}
          <div className="mt-1 px-1.5 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-white/50">{t("map.territories")}</div>
          {TERRITORIES.map((x) => (
            <AreaRow key={x.id} open={areas.has(x.id)} label={`${x.emoji} ${t(`territory.${x.id}`)}`} onClick={() => go(`t:${x.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AreaRow({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left font-bold transition hover:bg-white/10", open ? "text-white" : "text-white/45")}>
      {open ? <MapPin className="size-3 shrink-0 text-gold" /> : <Lock className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}
