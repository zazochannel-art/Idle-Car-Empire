import type { DealerId } from "../types";
import type { CarClass } from "./cars";

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
  /** Car classes this dealer specialises in: they sell for more and faster here. */
  classes: CarClass[];
}

/** A car of the dealer's speciality: +6% price, customers come 1.5× faster. */
export const DEALER_SPECIALTY = { price: 0.06, speed: 1.5 };

/** Each dealer level adds this much markup. */
export const DEALER_MARKUP_PER_LEVEL = 0.01;

export const DEALERS: DealerConfig[] = [
  { id: "local", name: "Economy Dealer", emoji: "🏪", cost: 0, customers: 2, markup: 0, upgradeCost: 5_000, upgradeGrowth: 1.8, description: "A forecourt and a handshake.", classes: ["economy"] },
  { id: "city", name: "Sport Dealer", emoji: "🏬", cost: 150_000, customers: 1.6, markup: 0.04, upgradeCost: 40_000, upgradeGrowth: 1.6, description: "Downtown glass showroom.", classes: ["sport"] },
  { id: "premium", name: "Premium Dealer", emoji: "🏢", cost: 800_000, customers: 1.4, markup: 0.06, upgradeCost: 200_000, upgradeGrowth: 1.65, description: "Espresso while you sign.", classes: ["premium"] },
  { id: "luxury", name: "Luxury Dealer", emoji: "🏛️", cost: 4_000_000, customers: 1.2, markup: 0.08, upgradeCost: 900_000, upgradeGrowth: 1.7, description: "Appointment only.", classes: ["luxury"] },
  { id: "supercar", name: "Supercar Dealer", emoji: "🏟️", cost: 15_000_000, customers: 1, markup: 0.1, upgradeCost: 4_000_000, upgradeGrowth: 1.75, description: "Allocation lists and launch events.", classes: ["supercar", "hypercar"] },
  { id: "global", name: "Global Dealer", emoji: "🌍", cost: 60_000_000, customers: 3, markup: 0.06, upgradeCost: 15_000_000, upgradeGrowth: 1.8, description: "Every market, every continent.", classes: ["economy", "sport", "premium", "luxury", "supercar", "hypercar"] },
];

export const DEALER_BY_ID: Record<DealerId, DealerConfig> = Object.fromEntries(DEALERS.map((d) => [d.id, d])) as Record<DealerId, DealerConfig>;

export const DEALER_IDS = DEALERS.map((d) => d.id);
