// The company's cities. Each one is an island map of its own with its own
// lots, buildings, production chain, dealers and wallet; the company (Stars,
// research, managers, designs, the racing team, the stock) is shared. The
// city being played is simulated in full; the others run on autopilot and
// bring in part of their steady income, into their own wallet.
import type { CityId } from "../types";
import { START_CASH } from "./economy";

export interface CityConfig {
  id: CityId;
  /** Folder of its 3D map's files (heights, ground tiles, scenery, minimap). */
  assets: string;
  /** Put in front of its lots' ids, so no two cities share a lot's name (the market, the depot, the paddock and the dealers keep theirs). */
  lotPrefix: string;
  /** Its territories hold the landmark works (config/landmarks.ts). */
  landmarks: boolean;
  emoji: string;
}

export const CITY_IDS: readonly CityId[] = ["home", "north"];

/** Nordheim's island is made by scripts/island-gen (its map data and its 3D map's files). */
export const CITIES: Record<CityId, CityConfig> = {
  home: { id: "home", assets: "/world", lotPrefix: "", landmarks: true, emoji: "🏙️" },
  north: { id: "north", assets: "/world-north", lotPrefix: "n:", landmarks: false, emoji: "🏔️" },
};

export const CITY_RULES = {
  /** Share of its steady income a city brings in while the company is busy in another one. */
  passiveShare: 0.75,
  /** Opening Nordheim: every territory of the first city open, and this much from its wallet. */
  unlockCash: 10e9,
  /** Nordheim's own starting capital. */
  startCash: START_CASH,
};
