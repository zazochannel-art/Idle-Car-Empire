"use client";

// Brings the events the game's owner scheduled (lib/live-events.ts): once the game has started,
// every half hour, and when the app comes back to the screen (at most once a minute).
import { useEffect } from "react";
import { useGame } from "@/store/game-store";

const EVERY = 30 * 60_000;

export function LiveEvents() {
  const ready = useGame((g) => g.ready);
  useEffect(() => {
    if (!ready) return;
    let last = 0;
    const look = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      void import("@/lib/live-events").then((m) => m.refreshLiveEvents()).catch(() => {});
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
