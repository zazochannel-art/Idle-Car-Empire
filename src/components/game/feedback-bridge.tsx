"use client";

import { useEffect } from "react";
import { cue, setFeedbackPrefs } from "@/lib/feedback";
import { notifyAway } from "@/lib/notify";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";

/** Turns game events into sounds and haptics, following the player's settings. */
export function FeedbackBridge() {
  const sound = useGame((g) => g.state.settings.sound);
  const haptics = useGame((g) => g.state.settings.haptics);
  useEffect(() => setFeedbackPrefs({ sound, haptics }), [sound, haptics]);
  useEffect(
    () =>
      uiEvents.on((e) => {
        if (e.type === "sale" && e.item === "car") cue("coin");
        else if (e.type === "firstCar" || e.type === "prestige") cue("fanfare");
      }),
    [],
  );
  return null;
}

/**
 * While the game is in the background, the toasts that ask for the player
 * (a machine down, a decision, a building done, a limited edition) also
 * come as notifications, if the player turned them on.
 */
export function AwayNotifier() {
  const on = useGame((g) => g.state.settings.notify);
  useEffect(() => {
    if (!on) return;
    return uiEvents.on((e) => {
      if (e.type !== "toast" || !e.action) return;
      void notifyAway({ title: `${e.icon ? `${e.icon} ` : ""}${e.title}`, body: e.body, tag: e.action.view ?? e.action.plot ?? e.title });
    });
  }, [on]);
  return null;
}
