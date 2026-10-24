import type { CarId, ItemId } from "@/game/types";
import type { View } from "./ui-store";

/** A toast's button: opens a plot's panel or a screen. */
export type UiToastAction = { label: string; plot?: string; view?: View };

/** Fire-and-forget UI effects (floating cash, toasts). Not part of game state. */
export type UiEvent =
  | { type: "sale"; plot: string; item: ItemId; count: number; amount: number }
  | { type: "firstCar"; plot: string; car: CarId }
  | { type: "toast"; tone: "success" | "gold" | "info" | "warn"; title: string; body?: string; icon?: string; action?: UiToastAction }
  | { type: "imperium"; stars: number }
  | { type: "race"; id: number }
  | { type: "unlock"; kind: "car" | "plant"; id: string }
  /** Fireworks over the map: over a plot, or over a district or territory ("t:port"); `big` for the biggest moments. */
  | { type: "fireworks"; plot?: string; area?: string; big?: boolean };

type Listener = (e: UiEvent) => void;
const listeners = new Set<Listener>();

export const uiEvents = {
  emit(e: UiEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
