import type { ManagerId } from "../types";

/**
 * What a manager improves. "factory" scope only affects the plant the manager
 * is assigned to; "global" applies everywhere while the manager is assigned.
 * Strength grows linearly with the manager's level: pct × level.
 */
export type ManagerBonus =
  | { stat: "speed"; pct: number }
  | { stat: "value"; pct: number; minTier?: number }
  | { stat: "delivery"; pct: number }
  | { stat: "offline"; pct: number }
  | { stat: "rp"; pct: number }
  | { stat: "income"; pct: number }
  | { stat: "dealerCap"; pct: number }
  /** Engineer: every upgrade and building costs less. */
  | { stat: "cost"; pct: number }
  /** Designer: every car is worth more. */
  | { stat: "carValue"; pct: number };

/** What kind of manager it is, and how rare: better managers cost more. */
export type ManagerCategory = "production" | "logistics" | "sales" | "engineer" | "designer" | "quality";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITY_COLOR: Record<Rarity, string> = { common: "#94a3b8", rare: "#38bdf8", epic: "#a78bfa", legendary: "#facc15" };
export const CATEGORY_ICON: Record<ManagerCategory, string> = { production: "👨‍🔧", logistics: "🚚", sales: "💰", engineer: "🔬", designer: "🎨", quality: "⭐" };

export interface ManagerConfig {
  id: ManagerId;
  name: string;
  role: string;
  avatar: string;
  scope: "factory" | "global";
  bonus: ManagerBonus;
  cost: number;
  /** Lifetime-of-run earnings required before the manager can be hired. */
  unlockAt: number;
  upgradeGrowth: number;
  maxLevel: number;
  category: ManagerCategory;
  rarity: Rarity;
}

export const MANAGERS: ManagerConfig[] = [
  { id: "mike", name: "Mike", role: "Production Manager", avatar: "👨‍🔧", scope: "factory", bonus: { stat: "speed", pct: 0.1 }, cost: 2_000, unlockAt: 0, upgradeGrowth: 3, maxLevel: 20, category: "production", rarity: "common" },
  { id: "sarah", name: "Sarah", role: "Sales Manager", avatar: "👩‍💼", scope: "factory", bonus: { stat: "value", pct: 0.15 }, cost: 15_000, unlockAt: 20_000, upgradeGrowth: 3, maxLevel: 20, category: "sales", rarity: "common" },
  { id: "nina", name: "Nina", role: "Engineer", avatar: "👩‍🔬", scope: "global", bonus: { stat: "cost", pct: 0.03 }, cost: 150_000, unlockAt: 300_000, upgradeGrowth: 3.3, maxLevel: 10, category: "engineer", rarity: "rare" },
  { id: "leo", name: "Leo", role: "Car Designer", avatar: "🧑‍🎨", scope: "global", bonus: { stat: "carValue", pct: 0.1 }, cost: 2_000_000, unlockAt: 4_000_000, upgradeGrowth: 3.3, maxLevel: 20, category: "designer", rarity: "epic" },
  { id: "alex", name: "Alex", role: "Technology Manager", avatar: "👨‍💻", scope: "global", bonus: { stat: "rp", pct: 0.1 }, cost: 60_000, unlockAt: 100_000, upgradeGrowth: 3.2, maxLevel: 20, category: "engineer", rarity: "rare" },
  { id: "daniel", name: "Daniel", role: "CEO", avatar: "👨‍💼", scope: "global", bonus: { stat: "income", pct: 0.05 }, cost: 400_000, unlockAt: 1_000_000, upgradeGrowth: 3.5, maxLevel: 20, category: "sales", rarity: "epic" },
  { id: "elena", name: "Elena", role: "Quality Director", avatar: "👩‍🔬", scope: "factory", bonus: { stat: "value", pct: 0.12 }, cost: 1_000_000, unlockAt: 3_000_000, upgradeGrowth: 3.2, maxLevel: 20, category: "quality", rarity: "rare" },
  { id: "marco", name: "Marco", role: "Logistics Chief", avatar: "🧑‍✈️", scope: "factory", bonus: { stat: "delivery", pct: 0.2 }, cost: 4_000_000, unlockAt: 10_000_000, upgradeGrowth: 3.2, maxLevel: 20, category: "logistics", rarity: "epic" },
  { id: "priya", name: "Priya", role: "Dealer Network Director", avatar: "👩‍💻", scope: "global", bonus: { stat: "dealerCap", pct: 0.15 }, cost: 8_000_000, unlockAt: 25_000_000, upgradeGrowth: 3.3, maxLevel: 20, category: "sales", rarity: "epic" },
  { id: "hiro", name: "Hiro", role: "Automation Engineer", avatar: "🧑‍🏭", scope: "factory", bonus: { stat: "offline", pct: 0.1 }, cost: 15_000_000, unlockAt: 60_000_000, upgradeGrowth: 3.3, maxLevel: 20, category: "production", rarity: "rare" },
  { id: "viktor", name: "Viktor", role: "Supercar Specialist", avatar: "🧔", scope: "factory", bonus: { stat: "value", pct: 0.25, minTier: 5 }, cost: 40_000_000, unlockAt: 150_000_000, upgradeGrowth: 3.4, maxLevel: 20, category: "sales", rarity: "legendary" },
  { id: "lena", name: "Lena", role: "Chief Operating Officer", avatar: "👩‍✈️", scope: "global", bonus: { stat: "speed", pct: 0.08 }, cost: 100_000_000, unlockAt: 400_000_000, upgradeGrowth: 3.5, maxLevel: 20, category: "production", rarity: "legendary" },
];

export const MANAGER_BY_ID: Record<ManagerId, ManagerConfig> = Object.fromEntries(
  MANAGERS.map((m) => [m.id, m]),
) as Record<ManagerId, ManagerConfig>;

export const MANAGER_IDS = MANAGERS.map((m) => m.id);
