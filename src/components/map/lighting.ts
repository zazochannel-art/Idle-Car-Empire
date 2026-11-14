// Time of day for the map: calculated directly from the device's real local time.
// 07:00 - 18:00 -> Day
// 18:00 - 21:00 -> Sunset / Evening
// 21:00 - 05:00 -> Night
// 05:00 - 07:00 -> Dawn / Sunrise
import { mix } from "./iso";

export type TimeMode = "auto" | "day" | "evening" | "night";
export const TIME_MODES: TimeMode[] = ["auto", "day", "evening", "night"];

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

/** Calculates the real-time dark value (0: day, 0.5: sunset/dawn, 1: night) based on device clock. */
export function realTimeDark(): number {
  const d = new Date();
  const hours = d.getHours() + d.getMinutes() / 60;
  if (hours >= 7 && hours < 18) return 0;
  if (hours >= 18 && hours < 21) return (hours - 18) / 3;
  if (hours >= 21 || hours < 5) return 1;
  return 1 - (hours - 5) / 2;
}

export function skyAt(_mode?: TimeMode, _t?: number): Sky {
  const dark = realTimeDark();
  return { dark, tint: tintFor(dark) };
}

/** The sun's height at its highest (noon) and as it rises and sets, in radians. */
const SUN_HIGH = (45 * Math.PI) / 180;
const SUN_LOW = (8 * Math.PI) / 180;
export const MOON = { el: (60 * Math.PI) / 180, turn: -0.25 };

export function sunAt(_mode?: TimeMode, _t?: number): { el: number; turn: number; moon: number } {
  const dark = realTimeDark();
  if (dark <= 0.2) return { el: SUN_HIGH, turn: 0, moon: 0 };
  if (dark <= 0.7) return { el: SUN_LOW, turn: 0.8, moon: 0.2 };
  return { el: MOON.el, turn: MOON.turn, moon: 1 };
}

export function dawnMist(_mode?: TimeMode, _t?: number): number {
  const dark = realTimeDark();
  return dark > 0.3 && dark < 0.7 ? 0.4 : 0;
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
