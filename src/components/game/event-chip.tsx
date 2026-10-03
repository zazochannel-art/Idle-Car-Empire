"use client";

import { activeEvent, nextEvent } from "@/game/engine/events";
import { formatDuration } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";

/** The running market event in the HUD, with the time it has left. */
export function EventChip() {
  // the store ticks ~10×/s, so this re-renders with the clock
  const now = useGame((g) => Math.floor(g.state.lastActiveAt / 1000) * 1000);
  const { t, lang } = useT();
  const n = useContent(lang);
  const w = activeEvent(now);
  if (!w) return null;
  return (
    <button
      onClick={() => uiEvents.emit({ type: "toast", tone: "gold", icon: w.event.emoji, title: n.event(w.event), body: n.eventDesc(w.event) })}
      className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-fuchsia-500/15 px-2 py-1 text-xs font-bold text-fuchsia-200 ring-1 ring-fuchsia-400/40 md:py-1.5"
    >
      <span>{w.event.emoji}</span>
      <span className="max-w-[9rem] truncate">{n.event(w.event)}</span>
      <span className="tabular-nums text-fuchsia-300/80">{t("event.left", { time: formatDuration((w.end - now) / 1000) })}</span>
    </button>
  );
}

/** Missions screen card: the event now, or the next one and when it starts. */
export function EventCard() {
  const now = useGame((g) => Math.floor(g.state.lastActiveAt / 1000) * 1000);
  const { t, lang } = useT();
  const n = useContent(lang);
  const w = activeEvent(now);
  const next = nextEvent(now);
  const e = w?.event ?? next.event;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-500/15 to-transparent p-3 ring-1 ring-fuchsia-400/30">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{e.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/80">{w ? t("event.now") : t("event.next", { time: formatDuration((next.start - now) / 1000) })}</div>
        <div className="truncate text-sm font-bold">{n.event(e)}</div>
        <div className="text-[11px] text-white/55">{n.eventDesc(e)}</div>
      </div>
      {w && <span className="shrink-0 text-xs font-bold tabular-nums text-fuchsia-200">{t("event.left", { time: formatDuration((w.end - now) / 1000) })}</span>}
    </div>
  );
}
