"use client";

import { useEffect } from "react";
import { cue, setFeedbackPrefs } from "@/lib/feedback";
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
