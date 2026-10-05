"use client";

import { unlockedAreas } from "@/game/engine/territory";
import { Building2, Factory, Globe2, Home, Lock, MapPin, Minus, Plus, Map as MapIcon } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { STRUCTURE_BY_ID, TERRITORIES, WORLD_BLOCKS, ZONES, ZONE_BY_ID } from "@/game/config/city";
import { WAYS } from "@/game/city/network";
import { RIVER, WORLD, WORLD_MAP, blockKind, territoryOfBlock, zoneCenterTile, zoneOfBlock } from "@/game/city/layout";

/** Territory landmark colours on the minimap. */
const MINI_LANDMARK: Record<string, string | null> = {
  testFacility: "#64748b", port: "#94a3b8", railyard: "#78716c", raw: "#a16207", suburbs: "#86c06c", boulevard: "#f5c451",
  skyline: "#cbd5e1", airport: "#e2e8f0", campus: "#a5b4fc", racing: "#ef4444", racingAnnex: "#f87171", road: "#4d7c3a",
};
import { coastline } from "./terrain";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { ZOOM_TIERS, type MapEngine, type ZoomTier } from "./map-engine";
import { cn } from "@/lib/utils";

const TIER_ICON: Record<ZoomTier, typeof Globe2> = { region: Globe2, districts: MapIcon, buildings: Building2, detail: Factory };

const W = 172;
const H = 92;
const PAD = 6;

/** Tile → minimap pixel (same isometric projection, scaled to fit). */
function mm(x: number, y: number): [number, number] {
  const scale = (W - PAD * 2) / (WORLD * 2);
  return [W / 2 + (x - y) * scale, PAD + (x + y) * scale * 0.5 * ((H - PAD * 2) / ((W - PAD * 2) / 2))];
}

function fromMm(px: number, py: number) {
  const scale = (W - PAD * 2) / (WORLD * 2);
  const a = (px - W / 2) / scale;
  const b = (py - PAD) / (scale * 0.5 * ((H - PAD * 2) / ((W - PAD * 2) / 2)));
  return { x: (a + b) / 2, y: (b - a) / 2 };
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
    let raf = 0;
    let frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (frame++ % 3) return; // 20 fps is plenty
      const s = stateRef.current;
      const unlocked = unlockedAreas(s);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const poly = (pts: [number, number][], fill: string, stroke?: string) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      };
      const rect = (x: number, y: number, w: number, d: number): [number, number][] => [mm(x, y), mm(x + w, y), mm(x + w, y + d), mm(x, y + d)];
      ctx.fillStyle = "#2aa7e0";
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      for (const loop of coastline()) {
        loop.forEach(([x, y], i) => {
          const [px, py] = mm(x, y);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
      }
      ctx.fillStyle = "#78c04c";
      ctx.fill("evenodd");
      for (let by = 0; by < WORLD_BLOCKS.length; by++)
        for (let bx = 0; bx < WORLD_BLOCKS.length; bx++) {
          const zone = zoneOfBlock(bx, by);
          const kind = blockKind(bx, by);
          if (!zone) {
            const terr = territoryOfBlock(bx, by);
            const col = terr ? MINI_LANDMARK[kind] : kind === "mountains" ? "#8b917c" : kind === "lake" ? "#1d6fa5" : null;
            if (col) poly(rect(bx * 7, by * 7, 8, 8), terr && !unlocked.has(terr) ? "#aab4be" : col);
            continue;
          }
          const open = unlocked.has(zone);
          poly(rect(bx * 7, by * 7, 8, 8), open ? ZONE_BY_ID[zone].ground : "#9aa5b1");
        }
      for (const z of ZONES) {
        if (unlocked.has(z.id)) continue;
        const c = zoneCenterTile(z.id);
        const [cx, cy] = mm(c.x, c.y);
        ctx.font = "8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🔒", cx, cy);
      }
      poly(rect(RIVER * 7 - 0.3, 0, 1.6, WORLD), "#2b8fd0");
      // the motorway (orange) and the railway (dark, dashed)
      for (const w of WAYS) {
        const pts = w.loop ? [...w.pts, w.pts[0]] : w.pts;
        ctx.beginPath();
        pts.forEach(([x, y], i) => {
          const [px, py] = mm(x, y);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        const lit = !w.area || unlocked.has(w.area);
        ctx.strokeStyle = w.kind === "highway" ? (lit ? "#fb923c" : "#7c5a3e") : lit ? "#1f2937" : "#334155";
        ctx.lineWidth = w.kind === "highway" ? 2 : 1;
        ctx.setLineDash(w.kind === "rail" ? [2, 1.5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
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
        const [x, y] = mm(p.x + p.w / 2, p.y + p.d / 2);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, p.w > 3 ? 3 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const e = engine.current;
      if (e) {
        const now = e.zoomTier();
        setTier((old) => (old === now ? old : now));
        const v = e.viewTiles().map((p) => mm(p.x, p.y));
        ctx.beginPath();
        v.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tile = fromMm(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
    engine.current?.lookAt(Math.max(0, Math.min(WORLD, tile.x)), Math.max(0, Math.min(WORLD, tile.y)));
  };

  const btn = "flex size-8 items-center justify-center rounded-lg hud-bar text-white transition hover:brightness-110";
  const areas = unlockedAreas(state);
  const go = (id: Parameters<MapEngine["flyToArea"]>[0]) => {
    engine.current?.flyToArea(id);
    setList(false);
  };
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      <div className="overflow-hidden rounded-xl bg-white p-1 shadow-[0_3px_0_0_rgba(0,0,0,0.3)]">
        <canvas ref={ref} onPointerDown={onTap} style={{ aspectRatio: `${W} / ${H}` }} className="block w-[118px] cursor-pointer md:w-[172px]" aria-label={t("map.minimap")} />
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
