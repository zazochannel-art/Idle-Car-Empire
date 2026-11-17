"use client";

import { useEffect } from "react";

/**
 * A card that asks the player to choose (a recall, a rival poaching an engineer): Escape and
 * the phone's Back button leave it open, so nothing is chosen for the player, and they don't
 * reach a card under it (the unlock card would take its bonus and close, unseen). Mark the
 * card role="dialog" too: Back (lib/native.ts) and the other cards waiting for a free screen
 * (company-name.tsx) look for one.
 */
export function useChoiceCard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    // capture: before the listeners of the cards under it, which skip a used Escape
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
}
