"use client";

// Full-screen ads without a reward (the app only; lib/ads.ts has the limits): offered only at a
// natural break, when the player closes a screen and is back on the map. Never over a tour, a
// race, a factory, the offline report or the shop (where the rewarded ads are), and a moment
// after the close so a tap never lands on the ad.
import { useEffect } from "react";
import { INTERSTITIAL, maybeShowInterstitial } from "@/lib/ads";
import { useGame } from "@/store/game-store";
import { useUi, type View } from "@/store/ui-store";

/** Screens whose closing is no break to put an ad on. */
const NO_AD_AFTER: View[] = ["shop", "build", "upgrade", "pass"];

export function InterstitialBridge() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useUi.subscribe((u, prev) => {
      if (!prev.view || u.view || NO_AD_AFTER.includes(prev.view)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ui = useUi.getState();
        const g = useGame.getState();
        // still on the map, nothing else going on
        if (!g.ready || ui.view || ui.tutorial || ui.race || ui.floor || ui.garage || ui.visit || ui.celebrate || g.state.pendingOffline) return;
        void maybeShowInterstitial(g.state.lifetime.playTime, g.state.chain.firstCar);
      }, INTERSTITIAL.delayMs);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);
  return null;
}
