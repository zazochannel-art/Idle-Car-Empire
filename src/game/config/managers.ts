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
  | { stat: "dealerCap"; pct: number };

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
}

export const MANAGERS: ManagerConfig[] = [
  { id: "mike", name: "Mike", role: "Production Manager", avatar: "👨‍🔧", scope: "factory", bonus: { stat: "speed", pct: 0.1 }, cost: 300, unlockAt: 0, upgradeGrowth: 3, maxLevel: 20 },
  { id: "sarah", name: "Sarah", role: "Sales Manager", avatar: "👩‍💼", scope: "factory", bonus: { stat: "value", pct: 0.15 }, cost: 5_000, unlockAt: 2_000, upgradeGrowth: 3, maxLevel: 20 },
  { id: "alex", name: "Alex", role: "Technology Manager", avatar: "👨‍💻", scope: "global", bonus: { stat: "rp", pct: 0.1 }, cost: 40_000, unlockAt: 20_000, upgradeGrowth: 3.2, maxLevel: 20 },
  { id: "daniel", name: "Daniel", role: "CEO", avatar: "👨‍💼", scope: "global", bonus: { stat: "income", pct: 0.05 }, cost: 500_000, unlockAt: 200_000, upgradeGrowth: 3.5, maxLevel: 20 },
  { id: "elena", name: "Elena", role: "Quality Director", avatar: "👩‍🔬", scope: "factory", bonus: { stat: "value", pct: 0.12 }, cost: 3_000_000, unlockAt: 1_500_000, upgradeGrowth: 3.2, maxLevel: 20 },
  { id: "marco", name: "Marco", role: "Logistics Chief", avatar: "🧑‍✈️", scope: "factory", bonus: { stat: "delivery", pct: 0.2 }, cost: 2e7, unlockAt: 1e7, upgradeGrowth: 3.2, maxLevel: 20 },
  { id: "priya", name: "Priya", role: "Dealer Network Director", avatar: "👩‍💻", scope: "global", bonus: { stat: "dealerCap", pct: 0.15 }, cost: 1.5e8, unlockAt: 8e7, upgradeGrowth: 3.3, maxLevel: 20 },
  { id: "hiro", name: "Hiro", role: "Automation Engineer", avatar: "🧑‍🏭", scope: "factory", bonus: { stat: "offline", pct: 0.1 }, cost: 1e9, unlockAt: 5e8, upgradeGrowth: 3.3, maxLevel: 20 },
  { id: "viktor", name: "Viktor", role: "Supercar Specialist", avatar: "🧔", scope: "factory", bonus: { stat: "value", pct: 0.25, minTier: 5 }, cost: 2e10, unlockAt: 1e10, upgradeGrowth: 3.4, maxLevel: 20 },
  { id: "lena", name: "Lena", role: "Chief Operating Officer", avatar: "👩‍✈️", scope: "global", bonus: { stat: "speed", pct: 0.08 }, cost: 5e11, unlockAt: 2.5e11, upgradeGrowth: 3.5, maxLevel: 20 },
];

export const MANAGER_BY_ID: Record<ManagerId, ManagerConfig> = Object.fromEntries(
  MANAGERS.map((m) => [m.id, m]),
) as Record<ManagerId, ManagerConfig>;

export const MANAGER_IDS = MANAGERS.map((m) => m.id);

export function describeBonus(b: ManagerBonus, level: number): string {
  const pct = Math.round(b.pct * Math.max(1, level) * 100);
  switch (b.stat) {
    case "speed":
      return `+${pct}% production speed`;
    case "value":
      return b.minTier ? `+${pct}% value (tier ${b.minTier}+)` : `+${pct}% selling price`;
    case "delivery":
      return `+${pct}% delivery speed`;
    case "offline":
      return `+${pct}% offline output`;
    case "rp":
      return `+${pct}% research speed`;
    case "income":
      return `+${pct}% global income`;
    case "dealerCap":
      return `+${pct}% dealer capacity`;
  }
}
