// R&D TECHNOLOGIES: research that changes the cars physically. A car gets
// the technologies the company had when it left the line (a car built
// before carbon bodies stays steel), so they show up in its DNA, on the Test
// Track and on the circuit.
import type { RaceStat } from "./racing";

export type TechId = "direct_injection" | "dual_clutch" | "wind_tunnel" | "carbon_body" | "adaptive_dampers" | "regen_braking" | "ceramic_coatings";

export interface TechConfig {
  id: TechId;
  /** What it adds: hp and weight as shares, the rest as stat points. */
  effect: Partial<Record<RaceStat | "hp" | "weight", number>>;
}

export const CAR_TECH: Record<TechId, TechConfig> = {
  direct_injection: { id: "direct_injection", effect: { hp: 0.06 } },
  dual_clutch: { id: "dual_clutch", effect: { accel: 5 } },
  wind_tunnel: { id: "wind_tunnel", effect: { aero: 8 } },
  carbon_body: { id: "carbon_body", effect: { weight: -0.08 } },
  adaptive_dampers: { id: "adaptive_dampers", effect: { handling: 5 } },
  regen_braking: { id: "regen_braking", effect: { braking: 4, reliability: 2 } },
  ceramic_coatings: { id: "ceramic_coatings", effect: { reliability: 6 } },
};

export const TECH_IDS = Object.keys(CAR_TECH) as TechId[];
export const isTech = (x: unknown): x is TechId => typeof x === "string" && x in CAR_TECH;
