// The tuning garage: a race car's paint, rims and spoiler. Rims and
// spoilers change how it drives (engine/racing.ts statsOf); paint is for the
// eye. Prices are shares of what the car is worth; changing back to a part
// already paid for once is free (engine/tuning.ts).

export type RimId = "standard" | "sport" | "forged" | "carbon";
export type SpoilerId = "none" | "lip" | "wing" | "gt";

export interface TuneEffect {
  handling?: number;
  accel?: number;
  aero?: number;
  speed?: number;
  /** Kilograms (negative: lighter). */
  weight?: number;
}

export interface TunePart {
  emoji: string;
  /** Price as a share of the car's worth (0: comes with the car). */
  cost: number;
  effect: TuneEffect;
}

export const RIM_IDS: RimId[] = ["standard", "sport", "forged", "carbon"];
export const SPOILER_IDS: SpoilerId[] = ["none", "lip", "wing", "gt"];

/** Lighter, stiffer wheels: grip and launch. */
export const RIMS: Record<RimId, TunePart> = {
  standard: { emoji: "⚪", cost: 0, effect: {} },
  sport: { emoji: "🔘", cost: 0.06, effect: { handling: 2, accel: 1, weight: -8 } },
  forged: { emoji: "⚙️", cost: 0.15, effect: { handling: 4, accel: 2, weight: -16 } },
  carbon: { emoji: "⚫", cost: 0.3, effect: { handling: 6, accel: 3, weight: -25 } },
};

/** Downforce for the corners, paid for with a little top speed. */
export const SPOILERS: Record<SpoilerId, TunePart> = {
  none: { emoji: "➖", cost: 0, effect: {} },
  lip: { emoji: "📐", cost: 0.05, effect: { aero: 3, handling: 1 } },
  wing: { emoji: "🪽", cost: 0.12, effect: { aero: 7, handling: 2, speed: -1 } },
  gt: { emoji: "🛫", cost: 0.25, effect: { aero: 12, handling: 4, speed: -3 } },
};

/** Paint colours on offer (a respray costs the same whatever the colour). */
export const PAINTS = ["#dc2626", "#f97316", "#facc15", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777", "#f8fafc", "#94a3b8", "#1f2937", "#0b0b0f"];
export const PAINT_COST = 0.02;
