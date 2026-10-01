import type { Effect } from "../types";

export const PRESTIGE = {
  /** Run earnings required before Global Expansion is allowed. */
  minRunEarnings: 1e9,
  /** Total points ever = floor(scale × cbrt(lifetime earned / divisor)). */
  scale: 10,
  divisor: 1e9,
  /** Each Empire Point held: +2% global income. */
  incomePerPoint: 0.02,
};

export interface EmpirePerk {
  points: number;
  name: string;
  description: string;
  effects: Effect[];
  /** Start-of-run bonuses applied by engine/prestige.ts. */
  startCash?: number;
  startAutomation?: boolean;
  startFactory?: "local" | "european";
}

/** Permanent perks unlocked by how many Empire Points you hold. */
export const EMPIRE_PERKS: EmpirePerk[] = [
  { points: 1, name: "Seed Capital", description: "Start every run with $1,000.", effects: [], startCash: 1_000 },
  { points: 5, name: "Turnkey Garage", description: "Your garage starts automated.", effects: [], startAutomation: true },
  { points: 15, name: "Investor Network", description: "Start with $25,000 and +25% speed.", effects: [{ kind: "speed", mult: 1.25 }], startCash: 25_000 },
  { points: 40, name: "Night Shift", description: "+4h offline limit, +25% offline income.", effects: [{ kind: "offlineCap", hours: 4 }, { kind: "offline", add: 0.25 }] },
  { points: 100, name: "Franchise", description: "Start with a Local Factory. Research +50%.", effects: [{ kind: "rp", mult: 1.5 }], startFactory: "local" },
  { points: 250, name: "Brand Power", description: "×2 car value.", effects: [{ kind: "value", mult: 2 }] },
  { points: 600, name: "Continental", description: "Start with a European Factory and $10M.", effects: [], startFactory: "european", startCash: 1e7 },
  { points: 1_500, name: "Legacy", description: "×2 speed, +8h offline limit.", effects: [{ kind: "speed", mult: 2 }, { kind: "offlineCap", hours: 8 }] },
  { points: 5_000, name: "Icon", description: "×3 global income.", effects: [{ kind: "income", mult: 3 }] },
];

export const OFFLINE = {
  /** Base offline limit in hours. */
  baseCapHours: 12,
  /** Share of normal production earned while away (before bonuses). */
  baseEfficiency: 0.6,
  /** Away times shorter than this are simulated silently, without a popup. */
  minReportSeconds: 60,
};
