"use client";

import { Home, Minus, Plus } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { STRUCTURE_BY_ID, ZONES } from "@/game/config/city";
import { WORLD, WORLD_MAP, zoneRect } from "@/game/city/layout";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import type { MapEngine } from "./map-engine";

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
      const unlocked = new Set(s.city.zones);
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
      poly(rect(0, 0, WORLD, WORLD), "#2b6f45");
      const lake = WORLD_MAP.decor.find((d) => d.zone === null);
      if (lake) poly(rect(lake.x, lake.y, lake.w, lake.d), "#0ea5e9");
      for (const z of ZONES) {
        const r = zoneRect(z);
        const open = unlocked.has(z.id);
        poly(rect(r.x + 0.5, r.y + 0.5, r.w - 1, r.d - 1), open ? z.ground : "#1f2937", open ? "rgba(255,255,255,0.25)" : "rgba(251,191,36,0.4)");
        if (!open) {
          const [cx, cy] = mm(r.x + r.w / 2, r.y + r.d / 2);
          ctx.font = "8px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🔒", cx, cy);
        }
      }
      for (const p of WORLD_MAP.plots) {
        if (!unlocked.has(p.zone)) continue;
        const b = s.city.buildings[p.id];
        let color: string | null = null;
        if (p.kind === "factory" && s.factories[p.factory!].owned) color = "#fb923c";
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

  const btn = "flex size-8 items-center justify-center rounded-lg border border-white/10 bg-ink/75 text-white/70 backdrop-blur-xl transition hover:text-white";
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-ink/70 p-0.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)] backdrop-blur-xl">
        <canvas ref={ref} onPointerDown={onTap} style={{ aspectRatio: `${W} / ${H}` }} className="block w-[118px] cursor-pointer md:w-[172px]" aria-label={t("map.minimap")} />
      </div>
      <div className="flex gap-1.5">
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
    </div>
  );
}
