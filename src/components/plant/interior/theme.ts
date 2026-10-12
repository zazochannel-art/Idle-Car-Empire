// How a plant's hall looks. Two things decide it: the plant's era, which
// grows with its level (a brick workshop, then a modern factory, then a
// bright high-tech plant), and its trade (a foundry glows, a cleanroom is
// white, a paint shop is splashed with colour, a tyre plant is dark with
// rubber). Pure data, so every plant and level can be checked in tests.
import { mix } from "../../map/iso";
import type { PartKind } from "./layout";
import type { SkinId } from "@/game/config/collection";

export type HallEra = "workshop" | "factory" | "hightech";

/** The plant level from which each era begins. */
export const ERA_LEVELS: Record<HallEra, number> = { workshop: 1, factory: 5, hightech: 10 };

export function hallEra(level: number): HallEra {
  return level >= ERA_LEVELS.hightech ? "hightech" : level >= ERA_LEVELS.factory ? "factory" : "workshop";
}

/** What a trade brings to its hall, whatever the era. */
export interface PlantTheme {
  /** The floor between the bays (concrete, rubber, resin…). */
  floor: string;
  /** The bays' floor, light at the back and darker in front. */
  bay: [string, string];
  /** Paint of the walkways (rgba). */
  walkway: string;
  /** Marks on the floor (oil, rubber, paint, dust) and how many. */
  stains: string[];
  stainCount: number;
  /** A tint over the whole hall: the heat of a foundry, the cool light of a cleanroom (rgba). */
  haze?: string;
  /** Stock stacked along the walls: what the plant works with. */
  decor: PartKind[];
}

const OIL = ["rgba(48,44,40,0.07)", "rgba(40,38,36,0.1)"];

export const PLANT_THEMES: Record<string, PlantTheme> = {
  bodyWorks: { floor: "#a0a6ac", bay: ["#98a1ab", "#838c96"], walkway: "rgba(34,197,94,0.32)", stains: OIL, stainCount: 22, decor: ["coil", "panel"] },
  engineFactory: { floor: "#9b9790", bay: ["#99968f", "#85817a"], walkway: "rgba(34,197,94,0.3)", stains: ["rgba(36,30,24,0.12)", "rgba(60,40,24,0.08)"], stainCount: 34, haze: "rgba(255,138,61,0.05)", decor: ["block", "engine"] },
  tireFactory: { floor: "#6f7378", bay: ["#6c7177", "#5d6268"], walkway: "rgba(250,204,21,0.22)", stains: ["rgba(10,10,12,0.16)", "rgba(20,20,24,0.12)"], stainCount: 40, haze: "rgba(20,20,26,0.06)", decor: ["tire", "greenTire"] },
  interiorFactory: { floor: "#b5aa9c", bay: ["#b3a899", "#a0957f"], walkway: "rgba(59,130,246,0.22)", stains: ["rgba(120,90,60,0.07)"], stainCount: 14, haze: "rgba(255,214,170,0.04)", decor: ["roll", "seat"] },
  suspensionFactory: { floor: "#9da1a5", bay: ["#99a0a7", "#868c93"], walkway: "rgba(34,197,94,0.3)", stains: OIL, stainCount: 26, haze: "rgba(255,150,80,0.035)", decor: ["spring", "strut"] },
  glassFactory: { floor: "#b6c4cd", bay: ["#c3d0d8", "#a9b8c2"], walkway: "rgba(56,189,248,0.24)", stains: ["rgba(120,150,170,0.06)"], stainCount: 10, haze: "rgba(186,230,253,0.06)", decor: ["glassSheet", "windshield"] },
  paintFactory: {
    floor: "#a9a6a1",
    bay: ["#a7a5a1", "#94918c"],
    walkway: "rgba(34,197,94,0.28)",
    stains: ["rgba(236,72,153,0.16)", "rgba(59,130,246,0.15)", "rgba(250,204,21,0.18)", "rgba(34,197,94,0.14)", "rgba(249,115,22,0.15)"],
    stainCount: 44,
    decor: ["drum", "can"],
  },
  electronicsFactory: { floor: "#d0d8de", bay: ["#d6dde3", "#c3ccd4"], walkway: "rgba(59,130,246,0.26)", stains: [], stainCount: 0, haze: "rgba(191,219,254,0.05)", decor: ["reel", "pcb"] },
  softwareStudio: { floor: "#d3d7e2", bay: ["#d9dde8", "#c3c9d8"], walkway: "rgba(99,102,241,0.24)", stains: ["rgba(60,70,90,0.04)"], stainCount: 4, haze: "rgba(165,180,252,0.05)", decor: ["module", "reel"] },
  batteryFactory: { floor: "#c6cdd2", bay: ["#cdd4d9", "#b7c0c7"], walkway: "rgba(20,184,166,0.26)", stains: ["rgba(60,70,80,0.05)"], stainCount: 6, haze: "rgba(167,243,208,0.04)", decor: ["pack", "cell"] },
  transmissionFactory: { floor: "#98a0a8", bay: ["#97a0a9", "#838c96"], walkway: "rgba(34,197,94,0.3)", stains: ["rgba(30,34,40,0.11)", "rgba(80,60,30,0.07)"], stainCount: 30, decor: ["bar", "block"] },
  wheelFactory: { floor: "#a5a8ab", bay: ["#a3a8ad", "#8f959b"], walkway: "rgba(34,197,94,0.3)", stains: OIL, stainCount: 22, haze: "rgba(255,170,90,0.03)", decor: ["casting", "tire"] },
  brakeFactory: { floor: "#8f9296", bay: ["#8e9297", "#7b8086"], walkway: "rgba(239,68,68,0.22)", stains: ["rgba(90,60,40,0.1)", "rgba(40,40,44,0.1)"], stainCount: 34, haze: "rgba(120,80,60,0.04)", decor: ["casting", "arm"] },
  assemblyPlant: { floor: "#a7adb3", bay: ["#a1aab3", "#8d969f"], walkway: "rgba(34,197,94,0.3)", stains: OIL, stainCount: 16, decor: ["tire", "engine"] },
};

/** What an era brings: walls, windows, lamps and the paint on the floor. */
export interface EraLook {
  /** Back wall, side wall, the painted lower wall (back, side) and its cap. */
  wall: [string, string];
  dado: [string, string];
  /** Brick walls (the workshop) instead of cladding. */
  brick: boolean;
  /** Small-paned windows, a band of windows, or a glass curtain wall. */
  windows: "small" | "band" | "curtain";
  /** Bare bulbs on cables, high-bay domes, or long LED panels. */
  lamps: "bulb" | "highbay" | "led";
  /** Colour and strength of the lamps' pools of light. */
  lampColor: string;
  lampStrength: number;
  /** Floor markings and the steel columns. */
  lines: string;
  column: [string, string];
  /** A polished floor that mirrors the lamps. */
  glossy: boolean;
  /** Bays of wooden planks (workbenches, before the resin floors). */
  planks: boolean;
}

export const ERAS: Record<HallEra, EraLook> = {
  workshop: {
    wall: ["#b4664b", "#a65c43"],
    dado: ["#6e4b3a", "#7a5443"],
    brick: true,
    windows: "small",
    lamps: "bulb",
    lampColor: "#ffd9a0",
    lampStrength: 0.38,
    lines: "#e3c25a",
    column: ["#8a4a36", "#a35a42"],
    glossy: false,
    planks: true,
  },
  factory: {
    wall: ["#cfd6de", "#dde3ea"],
    dado: ["#7d8896", "#8a95a2"],
    brick: false,
    windows: "band",
    lamps: "highbay",
    lampColor: "#fff4dc",
    lampStrength: 0.32,
    lines: "#facc15",
    column: ["#64748b", "#94a3b8"],
    glossy: false,
    planks: false,
  },
  hightech: {
    wall: ["#e8edf2", "#f1f4f8"],
    dado: ["#cfd8e1", "#d9e1e9"],
    brick: false,
    windows: "curtain",
    lamps: "led",
    lampColor: "#e3f0ff",
    lampStrength: 0.3,
    lines: "#22d3ee",
    column: ["#cbd5e1", "#e2e8f0"],
    glossy: true,
    planks: false,
  },
};

/** The resolved look of one hall: its era, and its trade adapted to that era. */
export interface HallLook extends PlantTheme, EraLook {
  era: HallEra;
}

/** The styles a player can pick on top of the eras: each starts from an era and repaints it. */
const STYLES: Partial<Record<SkinId, { era: HallEra; look: Partial<EraLook>; floor: string; k: number; haze: string; walkway: string; stains: number }>> = {
  // a dark hall lit by violet LED strips, magenta lines on a black mirror floor
  neon: {
    era: "hightech",
    look: { wall: ["#1e1b3a", "#26224a"], dado: ["#141127", "#1b1733"], lampColor: "#c4b5fd", lampStrength: 0.5, lines: "#e879f9", column: ["#312e81", "#4338ca"] },
    floor: "#16142c",
    k: 0.8,
    haze: "rgba(168,85,247,0.09)",
    walkway: "rgba(34,211,238,0.36)",
    stains: 0,
  },
  // heavy industry: soot-dark walls, rust-red steel, sodium lamps over a grimy floor
  industrial: {
    era: "factory",
    look: { wall: ["#5b5249", "#665c52"], dado: ["#3a332d", "#423a33"], lampColor: "#ffb347", lampStrength: 0.44, lines: "#f59e0b", column: ["#7c2d12", "#9a3412"] },
    floor: "#4a4440",
    k: 0.45,
    haze: "rgba(255,140,40,0.06)",
    walkway: "rgba(245,158,11,0.3)",
    stains: 1.8,
  },
};

const SKIN_ERA: Partial<Record<SkinId, HallEra>> = { retro: "workshop", modern: "factory", hightech: "hightech" };

export function hallLook(type: string, level: number, skin: SkinId = "auto"): HallLook {
  const style = STYLES[skin];
  const era = style?.era ?? SKIN_ERA[skin] ?? hallEra(level);
  const t = PLANT_THEMES[type] ?? PLANT_THEMES.bodyWorks;
  if (style) {
    const e = { ...ERAS[era], ...style.look };
    return {
      ...t,
      ...e,
      era,
      floor: mix(t.floor, style.floor, style.k),
      bay: [mix(t.bay[0], style.floor, style.k), mix(t.bay[1], style.floor, style.k * 1.05)],
      walkway: style.walkway,
      haze: style.haze,
      stainCount: Math.round(t.stainCount * style.stains),
    };
  }
  const e = ERAS[era];
  // the workshop is older and dirtier; the high-tech plant light and spotless
  const old = era === "workshop";
  const tint = old ? "#8b7a64" : "#eef2f6";
  // (lightly: a tyre plant stays dark and a cleanroom white, whatever the era)
  const k = old ? 0.25 : era === "hightech" ? 0.25 : 0;
  return {
    ...t,
    ...e,
    era,
    floor: k ? mix(t.floor, tint, k) : t.floor,
    bay: k ? [mix(t.bay[0], tint, k), mix(t.bay[1], tint, k)] : t.bay,
    stainCount: Math.round(t.stainCount * (old ? 1.5 : era === "hightech" ? 0.25 : 1)),
  };
}
