"use client";

import { create } from "zustand";
import type { ZoneId } from "@/game/types";

/** Screens that open as a panel over the map. */
export type View =
  | "garages"
  | "empire"
  | "dealers"
  | "cars"
  | "research"
  | "managers"
  | "missions"
  | "achievements"
  | "stats"
  | "prestige"
  | "build"
  | "upgrade"
  | "menu";

/** Requests for the map camera, consumed by the map component. */
export type MapCommand =
  | { kind: "plot"; id: string; zoom?: number; n: number }
  | { kind: "zone"; id: ZoneId; n: number }
  | { kind: "home"; n: number }
  | { kind: "zoom"; f: number; n: number }
  | { kind: "look"; x: number; y: number; n: number };

interface UiStore {
  view: View | null;
  /** Selected plot on the map (opens its panel). */
  plot: string | null;
  zone: ZoneId | null;
  /** Plot id of the garage whose interior is open. */
  garage: string | null;
  command: MapCommand | null;
  setView: (v: View | null) => void;
  selectPlot: (id: string | null, focus?: boolean) => void;
  selectZone: (id: ZoneId | null, focus?: boolean) => void;
  enterGarage: (id: string) => void;
  exitGarage: () => void;
  closeAll: () => void;
  map: (cmd: DistributiveOmit<MapCommand, "n">) => void;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

let n = 0;
let enterTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiStore>((set) => ({
  view: null,
  plot: null,
  zone: null,
  garage: null,
  command: null,
  setView: (view) => set({ view, plot: null, zone: null }),
  selectPlot: (plot, focus = true) =>
    set(() => ({ plot, zone: null, view: null, ...(plot && focus ? { command: { kind: "plot" as const, id: plot, n: ++n } } : {}) })),
  selectZone: (zone, focus = true) =>
    set(() => ({ zone, plot: null, view: null, ...(zone && focus ? { command: { kind: "zone" as const, id: zone, n: ++n } } : {}) })),
  enterGarage: (garage) => {
    // Swoop the camera into the building, then open the interior.
    set({ view: null, zone: null, plot: null, command: { kind: "plot", id: garage, zoom: 2.4, n: ++n } });
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => set({ garage }), 380);
  },
  exitGarage: () => set({ garage: null }),
  closeAll: () => set({ view: null, plot: null, zone: null }),
  map: (cmd) => set({ command: { ...cmd, n: ++n } as MapCommand }),
}));
