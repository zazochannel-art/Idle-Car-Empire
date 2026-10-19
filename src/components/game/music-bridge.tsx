"use client";

// The background music (lib/music.ts) follows the game: on with its setting, once the player has
// touched the screen (phones play no sound before that), quieter inside a factory, and silent
// in the background, during an ad and with the battery saver. Nothing of it loads with the
// setting off.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAdStatus } from "@/lib/ads";
import { pauseAudio } from "@/lib/feedback";
import { isSaving, onSaverChange } from "@/lib/power";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import type { Music } from "@/lib/music";

/** The music's level inside a factory, under the sound of the machines. */
const IN_FACTORY = 0.35;

const hidden = () => document.hidden;
const onVisibility = (fn: () => void) => {
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
};

export function MusicBridge() {
  const on = useGame((g) => g.ready && g.state.settings.music);
  const inFactory = useUi((u) => !!u.floor);
  const ad = useAdStatus().showing;
  const away = useSyncExternalStore(onVisibility, hidden, () => true);
  const saver = useSyncExternalStore(onSaverChange, isSaving, () => false);
  // the first touch, click or key (the browser may know of one already)
  const [touched, setTouched] = useState(() => typeof navigator !== "undefined" && !!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive);
  const [music, setMusic] = useState<Music | null>(null);

  useEffect(() => {
    if (touched) return;
    const go = () => setTouched(true);
    const opts = { once: true, capture: true } as const;
    window.addEventListener("pointerdown", go, opts);
    window.addEventListener("keydown", go, opts);
    return () => {
      window.removeEventListener("pointerdown", go, opts);
      window.removeEventListener("keydown", go, opts);
    };
  }, [touched]);

  // the background: all audio pauses (the factory's sounds too), and comes back with the game
  useEffect(() => pauseAudio(away), [away]);

  const level = on && touched && !away && !ad && !saver ? (inFactory ? IN_FACTORY : 1) : 0;
  useEffect(() => {
    if (level > 0 && !music) {
      let gone = false;
      void import("@/lib/music").then((m) => !gone && setMusic(new m.Music()), () => {});
      return () => {
        gone = true;
      };
    }
    music?.set(level);
  }, [level, music]);
  useEffect(() => () => music?.set(0), [music]);
  return null;
}
