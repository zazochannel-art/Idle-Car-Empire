"use client";

import { Camera, Lock, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SKINS } from "@/game/config/collection";
import { skinUnlocked } from "@/game/engine/collection";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cue } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { uiEvents } from "@/store/events";

/** The halls' styles: the level's own, the three eras, and the ones to unlock. */
export function SkinPicker({ plotId, onClose }: { plotId: string; onClose: () => void }) {
  const state = useGame((g) => g.state);
  const setSkin = useGame((g) => g.setPlantSkin);
  const { t } = useT();
  const current = state.city.buildings[plotId]?.plant?.skin ?? "auto";
  return (
    <div className="rounded-2xl bg-black/75 p-2 shadow-xl backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-black uppercase tracking-wide text-white/80">🎨 {t("skin.title")}</span>
        <button onClick={onClose} className="rounded-md p-1 text-white/60 hover:bg-white/10" aria-label={t("common.cancel")}>
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {SKINS.map((k) => {
          const open = skinUnlocked(state, k.id);
          const on = current === k.id;
          const u = k.unlock;
          return (
            <button
              key={k.id}
              disabled={!open}
              title={open ? t(`skin.${k.id}` as MessageKey) : u?.type === "achievements" ? t("skin.lockAch", { n: u.n }) : t("skin.lockChapter", { n: u?.n ?? 0 })}
              onClick={() => {
                if (setSkin(plotId, k.id)) cue("buy");
              }}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold ring-1 transition",
                on ? "bg-gold text-black ring-gold" : open ? "bg-white/[0.07] text-white ring-white/10 hover:bg-white/[0.12]" : "bg-white/[0.03] text-white/40 ring-white/5",
              )}
            >
              <span className="text-lg leading-none">{open ? k.icon : <Lock className="size-4" />}</span>
              <span className="leading-tight">{t(`skin.${k.id}` as MessageKey)}</span>
              {!open && u && <span className="text-[9px] font-semibold leading-tight text-white/45">{u.type === "achievements" ? t("skin.lockAch", { n: u.n }) : t("skin.lockChapter", { n: u.n })}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Photo filters: the same string drives the live preview (CSS) and the saved picture (canvas). */
export const PHOTO_FILTERS = {
  none: "none",
  vivid: "saturate(1.55) contrast(1.08)",
  warm: "sepia(0.28) saturate(1.3) brightness(1.04)",
  cool: "hue-rotate(-14deg) saturate(1.15) contrast(1.06)",
  vintage: "sepia(0.62) contrast(0.94) brightness(1.06) saturate(0.85)",
  noir: "grayscale(1) contrast(1.25)",
} as const;
export type PhotoFilter = keyof typeof PHOTO_FILTERS;

/** The picture: the hall as it is now, with its filter and a small signature in the corner. */
export async function takePhoto(canvas: HTMLCanvasElement, filter: PhotoFilter, title: string): Promise<Blob | null> {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext("2d");
  if (!c) return null;
  c.filter = PHOTO_FILTERS[filter];
  c.drawImage(canvas, 0, 0);
  c.filter = "none";
  // the signature: the plant's name over the game's
  const u = Math.max(1, Math.round(out.width / 640));
  const pad = 14 * u;
  const g = c.createLinearGradient(0, out.height - 70 * u, 0, out.height);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  c.fillStyle = g;
  c.fillRect(0, out.height - 70 * u, out.width, 70 * u);
  c.textBaseline = "alphabetic";
  c.shadowColor = "rgba(0,0,0,0.6)";
  c.shadowBlur = 4 * u;
  c.fillStyle = "#ffffff";
  c.font = `900 ${18 * u}px system-ui, sans-serif`;
  c.fillText(title, pad, out.height - pad - 16 * u);
  c.fillStyle = "#fbbf24";
  c.font = `800 ${12 * u}px system-ui, sans-serif`;
  c.fillText("🏁 IDLE CAR EMPIRE", pad, out.height - pad);
  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
}

/** Shares the picture where the device can (phones), or saves it as a file. */
async function sharePhoto(blob: Blob, name: string): Promise<"shared" | "saved"> {
  const file = new File([blob], `${name}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return "shared";
    } catch {
      // cancelled: save it instead
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}

/**
 * Photo mode: everything else is hidden, the hall can still be panned and
 * zoomed, a filter colours it, and the shutter saves or shares the picture.
 */
export function PhotoMode({ getCanvas, title, filter, onFilter, onClose }: { getCanvas: () => HTMLCanvasElement | null; title: string; filter: PhotoFilter; onFilter: (f: PhotoFilter) => void; onClose: () => void }) {
  const { t } = useT();
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const shoot = async () => {
    const canvas = getCanvas();
    if (!canvas || busy) return;
    setBusy(true);
    cue("coin");
    setFlash((n) => n + 1);
    try {
      const blob = await takePhoto(canvas, filter, title);
      if (!blob) return;
      const how = await sharePhoto(blob, title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "factory");
      uiEvents.emit({ type: "toast", tone: "success", icon: "📸", title: t(how === "shared" ? "photo.shared" : "photo.saved") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 z-10 animate-[photo-flash_0.45s_ease-out_forwards] bg-white" />}
      <style>{"@keyframes photo-flash{from{opacity:.85}to{opacity:0}}"}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="rounded-xl bg-black/50 px-2.5 py-1.5 text-xs font-black text-white/85 backdrop-blur">📷 {t("photo.title")}</div>
        <Button size="sm" variant="secondary" className="pointer-events-auto shadow-lg" onClick={onClose}>
          <X /> {t("photo.close")}
        </Button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-2xl bg-black/55 p-1.5 backdrop-blur">
          {(Object.keys(PHOTO_FILTERS) as PhotoFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => onFilter(f)}
              className={cn("shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition", filter === f ? "bg-gold text-black" : "text-white/80 hover:bg-white/10")}
            >
              {t(`photo.f.${f}` as MessageKey)}
            </button>
          ))}
        </div>
        <button
          onClick={shoot}
          disabled={busy}
          aria-label={t("photo.shoot")}
          className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-white text-black shadow-[0_0_0_4px_rgba(255,255,255,0.35),0_6px_18px_rgba(0,0,0,0.45)] transition active:scale-95 disabled:opacity-60"
        >
          <Camera className="size-7" />
        </button>
      </div>
    </>
  );
}
