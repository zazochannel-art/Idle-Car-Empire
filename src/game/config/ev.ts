// The electric and self-driving late game (research: Charging Network,
// Fast Charging, Over-the-Air Updates): charging stations at the dealers and
// software subscriptions. All balance numbers live here; engine/ev.ts runs them.
import type { CarId } from "../types";

/** Cars that charge: they sell faster where there are stations, and their drivers pay to charge. */
export const EV_CARS: CarId[] = ["electric", "autonomous"];

export const CHARGING = {
  /** A station at a dealer grows to this level. */
  maxLevel: 5,
  /** Price of level 1 at any dealer; each level after costs `growth` times the one before. */
  cost: 5_000_000,
  growth: 2.4,
  /** Electric cars on the road each station level serves (×2 with Fast Charging). */
  carsPerLevel: 40,
  fastMult: 2,
  /** What a car charging pays per second (× the empire's income bonuses). */
  fee: 25,
  /** Electric cars sell this much faster per station level in the network, up to `demandMax`. */
  demandPerLevel: 0.03,
  demandMax: 0.6,
};

export const SUBSCRIPTION = {
  /** Autonomous cars on the road each Software Studio level keeps updated. */
  perStudioLevel: 25,
  /** What one subscription pays per second (× the empire's income bonuses). */
  fee: 60,
};
