import type { CarId, ItemId } from "@/game/types";

/** Fire-and-forget UI effects (floating cash, toasts). Not part of game state. */
export type UiEvent =
  | { type: "sale"; plot: string; item: ItemId; count: number; amount: number }
  | { type: "firstCar"; plot: string; car: CarId }
  | { type: "toast"; tone: "success" | "gold" | "info" | "warn"; title: string; body?: string; icon?: string }
  | { type: "prestige"; points: number; stars?: boolean };

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
