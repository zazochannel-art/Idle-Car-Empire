"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { NOTICE_ICON, NOTICE_KINDS } from "@/game/config/notices";
import { formatDuration } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useInbox } from "@/store/inbox";
import { useUi } from "@/store/ui-store";
import { ViewHeader } from "./section-title";

/** The notification center: which kinds of notices show on screen, and the last day's notices. */
export function InboxView() {
  const items = useInbox((i) => i.items);
  const clear = useInbox((i) => i.clear);
  const off = useGame((g) => g.state.settings.toastsOff);
  const setToastOff = useGame((g) => g.setToastOff);
  const { t } = useT();
  // opened: everything here has been seen
  useEffect(() => useInbox.getState().markRead(), [items.length]);
  // the game's clock (it moves with every tick)
  const now = useGame((g) => g.view.state.lastActiveAt);

  return (
    <div className="space-y-4">
      <ViewHeader icon="🔔" title={t("nav.inbox")} subtitle={t("inbox.subtitle")} />

      <div className="space-y-2 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
        <div className="text-sm font-bold">{t("inbox.onScreen")}</div>
        <div className="text-[11px] leading-snug text-white/50">{t("inbox.onScreenHint")}</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {NOTICE_KINDS.map((k) => {
            const on = !off.includes(k);
            return (
              <button
                key={k}
                role="switch"
                aria-checked={on}
                onClick={() => setToastOff(k, on)}
                className={cn("flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold ring-1 transition", on ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/40" : "bg-white/[0.03] text-white/45 ring-white/10")}
              >
                <span className="text-base leading-none">{NOTICE_ICON[k]}</span>
                <span className="min-w-0 flex-1 truncate">{t(`inbox.kind.${k}`)}</span>
                <span className={cn("size-2 shrink-0 rounded-full", on ? "bg-emerald-400" : "bg-white/20")} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">{t("inbox.recent")}</div>
          {items.length > 0 && (
            <Button size="sm" variant="secondary" onClick={clear}>
              {t("inbox.clear")}
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.03] p-4 text-center text-xs text-white/50 ring-1 ring-white/[0.07]">{t("inbox.empty")}</div>
        ) : (
          [...items].reverse().map((n) => (
            <div key={n.id} className={cn("flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-2.5 ring-1", n.tone === "warn" ? "ring-amber-400/30" : n.tone === "gold" ? "ring-gold/25" : "ring-white/[0.07]")}>
              <span className="shrink-0 text-xl">{n.icon ?? NOTICE_ICON[n.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[13px] font-semibold leading-tight", n.tone === "gold" && "text-gold")}>{n.title}</div>
                {n.body && <div className="text-[11px] leading-snug text-white/55">{n.body}</div>}
                <div className="mt-0.5 text-[10px] text-white/35">{t("account.ago", { time: formatDuration(Math.max(1, (now - n.at) / 1000)) })}</div>
              </div>
              {n.action && (
                <button
                  type="button"
                  className="shrink-0 rounded-xl bg-gold/90 px-3 py-1.5 text-xs font-bold text-black hover:bg-gold"
                  onClick={() => {
                    const a = n.action!;
                    if (a.view) useUi.getState().setView(a.view);
                    else if (a.plot) useUi.getState().selectPlot(a.plot);
                  }}
                >
                  {n.action.label}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
