// Time of day for the map: a tint over the whole scene (multiply) and glows
// for lamps, windows and headlights (additive). Cheap: one full-view fill
// plus one pre-rendered sprite per light.
import { mix } from "./iso";

export type TimeMode = "auto" | "day" | "evening" | "night";
export const TIME_MODES: TimeMode[] = ["auto", "day", "evening", "night"];

/** One full day/night cycle in auto mode, in seconds. */
const CYCLE = 480;

/**
 * The clock the day/night cycle runs on. The map and the factory interiors
 * both move it forward while they show, so the time of day carries over
 * from one to the other.
 */
export const worldClock = { t: 0 };

export interface Sky {
  /** 0 = noon … 0.5 = golden hour … 1 = night. */
  dark: number;
  /** Colour the scene is multiplied by. */
  tint: string;
}

function tintFor(dark: number): string {
  if (dark <= 0.5) return mix("#ffffff", "#ffc48f", dark / 0.5);
  return mix("#ffc48f", "#4f5f9e", (dark - 0.5) / 0.5);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function skyAt(mode: TimeMode, t: number): Sky {
  let dark: number;
  if (mode === "day") dark = 0;
  else if (mode === "evening") dark = 0.5;
  else if (mode === "night") dark = 1;
  else {
    // long day, golden evening, night, then dawn
    const ph = (t / CYCLE + 0.15) % 1;
    if (ph < 0.5) dark = 0;
    else if (ph < 0.62) dark = smooth(0.5, 0.62, ph) * 0.5;
    else if (ph < 0.7) dark = 0.5 + smooth(0.62, 0.7, ph) * 0.5;
    else if (ph < 0.88) dark = 1;
    else dark = 1 - smooth(0.88, 1, ph);
  }
  return { dark, tint: tintFor(dark) };
}

/** The sun's height at its highest (noon) and as it rises and sets, in radians. */
const SUN_HIGH = (45 * Math.PI) / 180;
const SUN_LOW = (8 * Math.PI) / 180;
/** The moon: how high it stands, and how far round (as `turn` below). */
export const MOON = { el: (60 * Math.PI) / 180, turn: -0.25 };

/**
 * Where the sun is at this time of day, for the 3D map's shadows: how high it stands (radians over
 * the horizon) and how far round it has come (−1 at sunrise, 0 at noon, 1 at sunset). It rises at
 * dawn, stands high through the day, then sinks in the golden hour, its shadows growing long.
 * `moon` (0–1) is how far the night has handed the light over to the moon (MOON).
 */
export function sunAt(mode: TimeMode, t: number): { el: number; turn: number; moon: number } {
  if (mode === "day") return { el: (45 * Math.PI) / 180, turn: 0, moon: 0 };
  if (mode === "evening") return { el: (20 * Math.PI) / 180, turn: 0.8, moon: 0 };
  if (mode === "night") return { el: MOON.el, turn: MOON.turn, moon: 1 };
  const ph = (t / CYCLE + 0.15) % 1;
  // up from the start of dawn (0.88) round to the end of dusk (0.7): sunrise to sunset
  const u = Math.min(1, ((ph - 0.88 + 1) % 1) / 0.82);
  const moon = smooth(0.75, 0.95, skyAt(mode, t).dark);
  return { el: SUN_LOW + (SUN_HIGH - SUN_LOW) * Math.sin(Math.PI * u), turn: 2 * u - 1, moon };
}

/** Morning mist (0–1): it lies over the land for a while at dawn (the automatic cycle only). */
export function dawnMist(mode: TimeMode, t: number): number {
  if (mode !== "auto") return 0;
  const ph = (t / CYCLE + 0.15) % 1;
  const d = Math.min(Math.abs(ph - 0.97), 1 - Math.abs(ph - 0.97));
  return 1 - smooth(0.025, 0.09, d);
}

const sprites = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let s = sprites.get(color);
  if (!s) {
    s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, color + "aa");
    grad.addColorStop(1, color + "00");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    sprites.set(color, s);
  }
  return s;
}

/**
 * Darkens the drawn scene and adds the collected lights. Call in world
 * coordinates; `view` is the visible world rectangle.
 */
export function applyLighting(
  ctx: CanvasRenderingContext2D,
  sky: Sky,
  lights: { x: number; y: number; r: number; color: string; a: number }[],
  view: [number, number, number, number],
) {
  if (sky.dark < 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = sky.tint;
  ctx.fillRect(view[0] - 10, view[1] - 10, view[2] - view[0] + 20, view[3] - view[1] + 20);
  ctx.globalCompositeOperation = "lighter";
  const k = Math.min(1, sky.dark * 1.25);
  for (const l of lights) {
    if (l.x < view[0] - l.r || l.x > view[2] + l.r || l.y < view[1] - l.r || l.y > view[3] + l.r) continue;
    ctx.globalAlpha = Math.min(1, l.a * k);
    ctx.drawImage(glow(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.restore();
}
