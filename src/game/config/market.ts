// Market dynamics: trends that change every few minutes, build quality
// against quantity, and the reputation that recalls protect or ruin.
import type { CarClass } from "./cars";
import type { QualityMode } from "../types";

/** A new market trend every this many seconds of market time. */
export const TREND_SEC = 15 * 60;
/** The car class in fashion: dealers sell it for more, and faster. */
export const HOT_CLASS = { price: 0.2, demand: 1.5 };
/** One material swings: a shortage (dearer) or a glut (cheaper). */
export const MATERIAL_SWING = { shortage: 1.3, glut: 0.75 };
export const TREND_CLASSES: CarClass[] = ["economy", "sport", "premium", "luxury", "supercar", "hypercar"];

export interface QualityConfig {
  emoji: string;
  /** Production speed multiplier. */
  speed: number;
  /** Value of what it makes. */
  value: number;
  /** Share of cars that leave with a defect (assembly) or that a part adds to the car (parts plants). */
  defects: number;
  /** Reputation points per 100 cars sold (premium builds a name). */
  rep: number;
}

export const QUALITY_MODES: Record<QualityMode, QualityConfig> = {
  fast: { emoji: "⚡", speed: 1.25, value: 0.92, defects: 0.05, rep: -1 },
  balanced: { emoji: "⚖️", speed: 1, value: 1, defects: 0.01, rep: 0 },
  premium: { emoji: "💎", speed: 0.8, value: 1.12, defects: 0, rep: 2 },
};
export const QUALITY_MODE_IDS = Object.keys(QUALITY_MODES) as QualityMode[];

/** Reputation 0–100 (50 neutral): every point above or below moves car prices by this much. */
export const REP_PRICE_PER_POINT = 0.002;
/** Reputation drifts back towards neutral by this many points per minute. */
export const REP_DRIFT_PER_MIN = 0.05;

export const RECALL = {
  /** A recall comes once this many defective cars have been sold. */
  threshold: 6,
  /** Fixing one car costs this share of its value. */
  costShare: 0.25,
  /** Reputation for doing the right thing. */
  repPaid: 6,
  /** Ignoring it: the chance it becomes a scandal, what it costs in reputation, and the price cut while it lasts. */
  scandalChance: 0.5,
  repScandal: -15,
  scandalPrice: 0.2,
  scandalSec: 10 * 60,
  /** Ignoring without a scandal still costs a little trust. */
  repIgnored: -3,
};
