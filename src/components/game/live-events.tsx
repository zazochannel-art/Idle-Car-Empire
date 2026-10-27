"use client";

// Brings the events the game's owner scheduled (lib/live-events.ts): once the game has started,
// every half hour, and when the app comes back to the screen (at most once a minute). An
// announcement from the owner shows once on this device, then stays in the notification center.
import { useEffect } from "react";
import { useGame } from "@/store/game-store";
import { uiEvents } from "@/store/events";

const EVERY = 30 * 60_000;

export function LiveEvents() {
  const ready = useGame((g) => g.ready);
  useEffect(() => {
    if (!ready) return;
    let last = 0;
    const look = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      void import("@/lib/live-events")
        .then(async (m) => {
          await m.refreshLiveEvents();
          m.showNewAnnouncements(useGame.getState().state.settings.lang, (icon, title, body) =>
            uiEvents.emit({ type: "toast", kind: "events", tone: "info", icon, title, body: body || undefined }),
          );
        })
        .catch(() => {});
    };
    look();
    const timer = setInterval(look, EVERY);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [ready]);
  return null;
}
