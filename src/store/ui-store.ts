"use client";

import { create } from "zustand";
import type { CarId, StructureType, ZoneId } from "@/game/types";
import type { TimeMode } from "@/components/map/lighting";
import type { VehiclePick } from "@/components/map/map-types";

const TIME_KEY = "idle-car-empire:time";
function savedTime(): TimeMode {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(TIME_KEY) : null;
    return v === "day" || v === "evening" || v === "night" ? v : "auto";
  } catch {
    return "auto";
  }
}

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
  | "economy"
  | "racing"
  | "prestige"
  | "build"
  | "upgrade"
  | "logistics"
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
  /** Plot id of the plant whose factory floor is open. */
  floor: string | null;
  /** The FIRST CAR COMPLETED moment, while it plays. */
  celebrate: { plot: string; car: CarId } | null;
  command: MapCommand | null;
  /** Map lighting: automatic day/night cycle or a fixed time of day. */
  timeMode: TimeMode;
  /** A building shown translucent on a plot before it is bought. */
  preview: { plot: string; type: StructureType } | null;
  /** The vehicle in the 3D showcase (tapped on the map). */
  showcase: VehiclePick | null;
  /** The race viewer: preparing a race (event chosen, not started) or watching the live one. */
  race: { phase: "prep"; event: string; special?: string } | { phase: "watch" } | null;
  /** The first-company tour is on screen (the one-line tips wait until it is closed). */
  tutorial: boolean;
  setTutorial: (on: boolean) => void;
  setRace: (r: UiStore["race"]) => void;
  setShowcase: (v: VehiclePick | null) => void;
  setTimeMode: (m: TimeMode) => void;
  setPreview: (p: { plot: string; type: StructureType } | null) => void;
  setView: (v: View | null) => void;
  /** Every screen opened, newest last (the pillars reopen on the last one of theirs). */
  seen: View[];
  selectPlot: (id: string | null, focus?: boolean) => void;
  selectZone: (id: ZoneId | null, focus?: boolean) => void;
  enterGarage: (id: string) => void;
  exitGarage: () => void;
  openFloor: (id: string | null) => void;
  setCelebrate: (c: { plot: string; car: CarId } | null) => void;
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
  floor: null,
  celebrate: null,
  command: null,
  timeMode: savedTime(),
  preview: null,
  showcase: null,
  race: null,
  tutorial: false,
  setTutorial: (tutorial) => set({ tutorial }),
  setRace: (race) => set({ race }),
  setShowcase: (showcase) => set(showcase ? { showcase, view: null, plot: null, zone: null, preview: null } : { showcase }),
  setTimeMode: (timeMode) => {
    try {
      localStorage.setItem(TIME_KEY, timeMode);
    } catch {
      /* storage unavailable: keep it for this session */
    }
    set({ timeMode });
  },
  setPreview: (preview) => set({ preview }),
  seen: [],
  setView: (view) => set((u) => ({ view, plot: null, zone: null, preview: null, showcase: null, seen: view ? [...u.seen.filter((x) => x !== view), view] : u.seen })),
  selectPlot: (plot, focus = true) =>
    set(() => ({ plot, zone: null, view: null, preview: null, showcase: null, ...(plot && focus ? { command: { kind: "plot" as const, id: plot, n: ++n } } : {}) })),
  selectZone: (zone, focus = true) =>
    set(() => ({ zone, plot: null, view: null, ...(zone && focus ? { command: { kind: "zone" as const, id: zone, n: ++n } } : {}) })),
  enterGarage: (garage) => {
    // Swoop the camera into the building, then open the interior.
    set({ view: null, zone: null, plot: null, command: { kind: "plot", id: garage, zoom: 2.4, n: ++n } });
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => set({ garage }), 380);
  },
  // back out to the normal map zoom, centred on the garage we left
  exitGarage: () => set((s) => ({ garage: null, command: s.garage ? { kind: "plot", id: s.garage, zoom: -1, n: ++n } : s.command })),
  openFloor: (floor) => set({ floor }),
  setCelebrate: (celebrate) => set(celebrate ? { celebrate, view: null, plot: null, zone: null, floor: null } : { celebrate }),
  closeAll: () => set({ view: null, plot: null, zone: null, preview: null, showcase: null }),
  map: (cmd) => set({ command: { ...cmd, n: ++n } as MapCommand }),
}));
