"use client";

// One popup at a time. The game's own popups (the report of the time away, a recall, a rival
// poaching an engineer, a new model, the daily reward, what's new, the company's name) each ask
// for the screen; the most important one waiting gets it, the others wait their turn. A decision
// that costs money comes before a reward, and a reward before a question that can wait.
import { useEffect } from "react";
import { create } from "zustand";

export type ModalSlot = "offline" | "recall" | "poach" | "staff" | "unlock" | "login" | "whatsNew" | "companyName";

/** First is shown first. */
export const MODAL_ORDER: ModalSlot[] = ["offline", "recall", "poach", "staff", "unlock", "login", "whatsNew", "companyName"];

export const useModalQueue = create<{ waiting: ModalSlot[] }>(() => ({ waiting: [] }));

/** The popup that has the screen now (null: none waiting). */
export function modalOnTop(waiting: ModalSlot[]): ModalSlot | null {
  return MODAL_ORDER.find((s) => waiting.includes(s)) ?? null;
}

/** Whether another popup than `slot` is waiting or showing. */
export function otherModalWaiting(slot: ModalSlot): boolean {
  return useModalQueue.getState().waiting.some((s) => s !== slot);
}

/**
 * A popup asks for the screen while `wants` holds; returns whether it may show now. When a more
 * important one comes up, this one steps back and comes again once that one is done.
 */
export function useModalSlot(slot: ModalSlot, wants: boolean): boolean {
  useEffect(() => {
    if (!wants) return;
    useModalQueue.setState((q) => (q.waiting.includes(slot) ? q : { waiting: [...q.waiting, slot] }));
    return () => useModalQueue.setState((q) => ({ waiting: q.waiting.filter((s) => s !== slot) }));
  }, [slot, wants]);
  return useModalQueue((q) => wants && modalOnTop(q.waiting) === slot);
}
