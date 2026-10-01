import type { Continent, FactoryId } from "../types";

export interface FactoryConfig {
  id: FactoryId;
  name: string;
  city: string;
  continent: Continent;
  emoji: string;
  /** Purchase price. 0 = owned from the start. */
  cost: number;
  /** Lowest/highest car tier this factory can ever build. */
  baseTier: number;
  maxTier: number;
  baseLines: number;
  maxLines: number;
  /** Price of the first extra line; each further line costs lineGrowth× more. */
  lineCost: number;
  /** Price of level 2; each level costs LEVEL_GROWTH× the previous. */
  levelCost: number;
  /** Base price of level 1 of each upgrade category (see config/upgrades.ts). */
  upgradeBase: number;
  /** Factory-wide multipliers: better plants build faster and better. */
  speedMult: number;
  valueMult: number;
  /** Production starts by hand until automated (manager or Automation Lv 1). */
  manual?: boolean;
  requiresResearch?: string;
  accent: string;
}

export const LEVEL_GROWTH = 1.22;
export const LINE_GROWTH = 10;
/** Every level adds this fraction of base value (level 11 = 2× level 1). */
export const LEVEL_VALUE_STEP = 0.1;
/** Reaching these levels doubles build speed. */
export const LEVEL_MILESTONES = [25, 50, 75, 100, 150, 200, 300, 400, 500];

export const FACTORIES: FactoryConfig[] = [
  { id: "garage", name: "Small Garage", city: "Bucharest", continent: "Europe", emoji: "🔧", cost: 0, baseTier: 1, maxTier: 2, baseLines: 1, maxLines: 3, lineCost: 25_000, levelCost: 25, upgradeBase: 100, speedMult: 1, valueMult: 1, manual: true, accent: "#60a5fa" },
  { id: "local", name: "Local Factory", city: "Pitești", continent: "Europe", emoji: "🏭", cost: 100_000, baseTier: 2, maxTier: 3, baseLines: 2, maxLines: 4, lineCost: 2_000_000, levelCost: 4_000, upgradeBase: 20_000, speedMult: 1.1, valueMult: 3, accent: "#38bdf8" },
  { id: "european", name: "European Factory", city: "Stuttgart", continent: "Europe", emoji: "🇪🇺", cost: 1.5e7, baseTier: 3, maxTier: 4, baseLines: 2, maxLines: 5, lineCost: 2.5e8, levelCost: 5e5, upgradeBase: 2.5e6, speedMult: 1.2, valueMult: 8, accent: "#22d3ee" },
  { id: "american", name: "American Factory", city: "Detroit", continent: "North America", emoji: "🇺🇸", cost: 3e09, baseTier: 4, maxTier: 5, baseLines: 3, maxLines: 6, lineCost: 4.8e10, levelCost: 1e08, upgradeBase: 5e08, speedMult: 1.3, valueMult: 20, accent: "#818cf8" },
  { id: "asian", name: "Asian Factory", city: "Nagoya", continent: "Asia", emoji: "🏯", cost: 6e11, baseTier: 4, maxTier: 6, baseLines: 4, maxLines: 8, lineCost: 9.6e12, levelCost: 2e10, upgradeBase: 1e11, speedMult: 1.5, valueMult: 50, accent: "#f472b6" },
  { id: "luxury", name: "Luxury Factory", city: "Dubai", continent: "Asia", emoji: "👑", cost: 2e14, baseTier: 5, maxTier: 6, baseLines: 3, maxLines: 6, lineCost: 3.2e15, levelCost: 6.7e12, upgradeBase: 3.3e13, speedMult: 1.5, valueMult: 120, accent: "#facc15" },
  { id: "supercarFactory", name: "Supercar Factory", city: "São Paulo", continent: "South America", emoji: "🏁", cost: 1e17, baseTier: 5, maxTier: 7, baseLines: 4, maxLines: 8, lineCost: 1.6e18, levelCost: 3.3e15, upgradeBase: 1.7e16, speedMult: 1.7, valueMult: 300, accent: "#fb923c" },
  { id: "electricFactory", name: "Electric Factory", city: "Cape Town", continent: "Africa", emoji: "🔋", cost: 6e19, baseTier: 6, maxTier: 7, baseLines: 4, maxLines: 10, lineCost: 9.6e20, levelCost: 2e18, upgradeBase: 1e19, speedMult: 2, valueMult: 800, requiresResearch: "electric_motors", accent: "#a3e635" },
  { id: "hypercarFactory", name: "Hypercar Factory", city: "Melbourne", continent: "Oceania", emoji: "💎", cost: 5e22, baseTier: 6, maxTier: 8, baseLines: 5, maxLines: 10, lineCost: 8e23, levelCost: 1.7e21, upgradeBase: 8.3e21, speedMult: 2.2, valueMult: 2000, accent: "#e879f9" },
  { id: "mega", name: "Global Mega Factory", city: "Worldwide", continent: "Europe", emoji: "🌐", cost: 5e25, baseTier: 6, maxTier: 8, baseLines: 8, maxLines: 16, lineCost: 8e26, levelCost: 1.7e24, upgradeBase: 8.3e24, speedMult: 3, valueMult: 5000, accent: "#c084fc" },
];

export const FACTORY_BY_ID: Record<FactoryId, FactoryConfig> = Object.fromEntries(
  FACTORIES.map((f) => [f.id, f]),
) as Record<FactoryId, FactoryConfig>;

export const FACTORY_IDS = FACTORIES.map((f) => f.id);
