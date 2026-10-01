import type { DealerId } from "../types";

export interface DealerConfig {
  id: DealerId;
  name: string;
  emoji: string;
  cost: number;
  /** Cars per second this dealer can sell at full price (level 1). */
  capacity: number;
  /** Extra selling price on cars sold here. 0.25 = +25%. */
  markup: number;
  upgradeCost: number;
  upgradeGrowth: number;
  description: string;
}

/** Cars nobody can sell at retail go to wholesale at this fraction of value. */
export const WHOLESALE_RATE = 0.5;
/** Each dealer level adds this share of base capacity. */
export const DEALER_CAP_PER_LEVEL = 0.25;
/** Each dealer level adds this much markup. */
export const DEALER_MARKUP_PER_LEVEL = 0.02;

export const DEALERS: DealerConfig[] = [
  { id: "local", name: "Local Dealer", emoji: "🏪", cost: 0, capacity: 0.4, markup: 0, upgradeCost: 150, upgradeGrowth: 1.6, description: "A forecourt and a handshake." },
  { id: "city", name: "City Dealer", emoji: "🏬", cost: 3_000, capacity: 1.2, markup: 0.1, upgradeCost: 2_000, upgradeGrowth: 1.6, description: "Downtown glass showroom." },
  { id: "premium", name: "Premium Dealer", emoji: "🏢", cost: 400_000, capacity: 3, markup: 0.25, upgradeCost: 150_000, upgradeGrowth: 1.65, description: "Espresso while you sign." },
  { id: "luxury", name: "Luxury Dealer", emoji: "🏛️", cost: 1.5e8, capacity: 8, markup: 0.5, upgradeCost: 6e7, upgradeGrowth: 1.7, description: "Appointment only." },
  { id: "supercar", name: "Supercar Dealer", emoji: "🏟️", cost: 8e10, capacity: 20, markup: 1, upgradeCost: 3e10, upgradeGrowth: 1.75, description: "Allocation lists and launch events." },
  { id: "global", name: "Global Dealer", emoji: "🌍", cost: 5e13, capacity: 60, markup: 2, upgradeCost: 2e13, upgradeGrowth: 1.8, description: "Every market, every continent." },
];

export const DEALER_BY_ID: Record<DealerId, DealerConfig> = Object.fromEntries(
  DEALERS.map((d) => [d.id, d]),
) as Record<DealerId, DealerConfig>;

export const DEALER_IDS = DEALERS.map((d) => d.id);
