import type { DealerId } from "../types";

export interface DealerConfig {
  id: DealerId;
  name: string;
  emoji: string;
  cost: number;
  /** Customers per minute at Level 1. */
  customers: number;
  /** Extra selling price on cars sold here. 0.25 = +25%. */
  markup: number;
  upgradeCost: number;
  upgradeGrowth: number;
  description: string;
}

/** Each dealer level adds this much markup. */
export const DEALER_MARKUP_PER_LEVEL = 0.02;

export const DEALERS: DealerConfig[] = [
  { id: "local", name: "Local Dealer", emoji: "🏪", cost: 0, customers: 4, markup: 0, upgradeCost: 8e6, upgradeGrowth: 1.6, description: "A forecourt and a handshake." },
  { id: "city", name: "City Dealer", emoji: "🏬", cost: 1e9, customers: 6, markup: 0.1, upgradeCost: 4e8, upgradeGrowth: 1.6, description: "Downtown glass showroom." },
  { id: "premium", name: "Premium Dealer", emoji: "🏢", cost: 1e11, customers: 8, markup: 0.25, upgradeCost: 4e10, upgradeGrowth: 1.65, description: "Espresso while you sign." },
  { id: "luxury", name: "Luxury Dealer", emoji: "🏛️", cost: 1e13, customers: 10, markup: 0.5, upgradeCost: 4e12, upgradeGrowth: 1.7, description: "Appointment only." },
  { id: "supercar", name: "Supercar Dealer", emoji: "🏟️", cost: 1e15, customers: 12, markup: 1, upgradeCost: 4e14, upgradeGrowth: 1.75, description: "Allocation lists and launch events." },
  { id: "global", name: "Global Dealer", emoji: "🌍", cost: 1e17, customers: 20, markup: 2, upgradeCost: 4e16, upgradeGrowth: 1.8, description: "Every market, every continent." },
];

export const DEALER_BY_ID: Record<DealerId, DealerConfig> = Object.fromEntries(DEALERS.map((d) => [d.id, d])) as Record<DealerId, DealerConfig>;

export const DEALER_IDS = DEALERS.map((d) => d.id);
