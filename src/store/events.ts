import type { CarId, FactoryId } from "@/game/types";

/** Fire-and-forget UI effects (floating cash, toasts). Not part of game state. */
export type UiEvent =
  | { type: "sale"; factory: FactoryId; car: CarId; count: number; amount: number; premium: boolean }
  | { type: "toast"; tone: "success" | "gold" | "info"; title: string; body?: string; icon?: string }
  | { type: "levelUp"; factory: FactoryId; levels: number }
  | { type: "prestige"; points: number };

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
