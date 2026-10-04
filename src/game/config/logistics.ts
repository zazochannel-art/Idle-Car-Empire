// The Logistics Center: company-wide upgrades for every truck and warehouse,
// and the transport ladder Truck → Train → Port → Export.

export type LogisticsUpgrade = "speed" | "capacity" | "loading" | "warehouse" | "fleet";

export interface LogisticsConfig {
  id: LogisticsUpgrade;
  emoji: string;
  /** Effect per level (see engine/logistics.ts). */
  step: number;
  max: number;
  cost: number;
  growth: number;
}

export const LOGISTICS: LogisticsConfig[] = [
  { id: "speed", emoji: "🛣️", step: 0.1, max: 10, cost: 2_000, growth: 2.2 }, // +10% delivery rate (bigger loads, faster docks)
  { id: "capacity", emoji: "📦", step: 0.15, max: 10, cost: 5_000, growth: 2.3 }, // +15% per trip
  { id: "loading", emoji: "🏗️", step: 0.1, max: 7, cost: 3_000, growth: 2.2 }, // −10% dock and waiting time
  { id: "warehouse", emoji: "🏬", step: 0.2, max: 10, cost: 4_000, growth: 2.3 }, // +20% storage
  { id: "fleet", emoji: "🚚", step: 1, max: 4, cost: 50_000, growth: 8 }, // +1 truck at every plant
];
export const LOGISTICS_BY_ID = Object.fromEntries(LOGISTICS.map((l) => [l.id, l])) as Record<LogisticsUpgrade, LogisticsConfig>;

export interface TransportTier {
  id: "truck" | "train" | "port" | "export";
  emoji: string;
  cost: number;
  /** Multipliers for every load: speed and capacity. */
  speed: number;
  capacity: number;
  /** Extra price at the Parts Market (components) and for every car sold. */
  market: number;
  cars: number;
}

/** Each tier replaces the one before (its numbers already include them). */
export const TRANSPORT_TIERS: TransportTier[] = [
  { id: "truck", emoji: "🚚", cost: 0, speed: 1, capacity: 1, market: 0, cars: 0 },
  { id: "train", emoji: "🚆", cost: 2_000_000, speed: 1.3, capacity: 1.5, market: 0, cars: 0 },
  { id: "port", emoji: "🚢", cost: 15_000_000, speed: 1.4, capacity: 2, market: 0.03, cars: 0 },
  { id: "export", emoji: "✈️", cost: 80_000_000, speed: 1.6, capacity: 2.5, market: 0.04, cars: 0.04 },
];
