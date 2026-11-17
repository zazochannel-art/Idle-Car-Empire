// Own sources: the company buys into the mine, plantation or works a raw material comes from
// (an iron mine for steel, a rubber plantation, a lithium mine for battery cells…). Each level
// lowers that one material's market price for every plant in every city (engine/sources.ts).
// A late-game sink for big earnings: the player picks which material weighs most on their costs.
import type { MaterialId } from "./economy";

export const SOURCE_KIND: Record<MaterialId, { emoji: string }> = {
  steel: { emoji: "⛏️" },
  aluminum: { emoji: "🪨" },
  plastic: { emoji: "🛢️" },
  rubber: { emoji: "🌳" },
  glass: { emoji: "🏝️" },
  copper: { emoji: "🟤" },
  electronics: { emoji: "🔬" },
  fabric: { emoji: "🌾" },
  leather: { emoji: "🐄" },
  paint: { emoji: "🧪" },
  battery: { emoji: "🔋" },
  fluids: { emoji: "⛽" },
};

export const SOURCES = {
  /** Total earnings at which the first source can be bought. */
  unlockEarned: 250e6,
  /** Levels per material. */
  maxLevel: 5,
  /** What each level takes off that material's market price. */
  discountPerLevel: 0.06,
  /** The first level's price for a material at the reference price; × sqrt(price / refPrice). */
  baseCost: 50e6,
  refPrice: 25,
  /** Each level costs this many times the one before. */
  growth: 4,
};
