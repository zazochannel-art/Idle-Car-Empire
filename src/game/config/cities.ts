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
  /**
   * How the city is opened (none: the company starts in it): once every territory of `after` is
   * open, paid with `cash` from that city's wallet.
   */
  opens?: { after: CityId; cash: number };
  /** Snowstorms on its roads hold up deliveries (a map bonus to clear: engine/map-bonus.ts). */
  snowstorms: boolean;
  /** Designs with the Nordic option sell for more here (engine/design.ts). */
  nordic: boolean;
}

export const CITY_IDS: readonly CityId[] = ["home", "north"];

/** Opening Nordheim: every territory of the first city open, and this much from its wallet. */
const NORTH_OPENS_CASH = 10e9;

/** The city every company starts in: it keeps the racing team and the company's own records. */
export const HOME_CITY: CityId = CITY_IDS[0];

/** Nordheim's island is made by scripts/island-gen (its map data and its 3D map's files). */
export const CITIES: Record<CityId, CityConfig> = {
  home: { id: "home", assets: "/world", lotPrefix: "", landmarks: true, emoji: "🏙️", snowstorms: false, nordic: false },
  north: { id: "north", assets: "/world-north", lotPrefix: "n:", landmarks: true, emoji: "🏔️", opens: { after: "home", cash: NORTH_OPENS_CASH }, snowstorms: true, nordic: true },
};

/** The cities that can be opened, in order. */
export const OPENABLE_CITIES: readonly CityId[] = CITY_IDS.filter((id) => !!CITIES[id].opens);

/**
 * The trade route: with two cities, a convoy runs between them every few hours and
 * brings the city being played this many seconds of the company's income (both cities').
 */
export const TRADE_ROUTE = { cooldownHours: 6, incomeSeconds: 1_200 };

export const CITY_RULES = {
  /** What opening Nordheim costs (CITIES.north.opens). */
  unlockCash: NORTH_OPENS_CASH,
  /** Share of its steady income a city brings in while the company is busy in another one. */
  passiveShare: 0.75,
  /** Nordheim's own starting capital. */
  startCash: START_CASH,
};
