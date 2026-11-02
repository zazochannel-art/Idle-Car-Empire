// The lots of the landmark works (config/landmarks.ts): one in each territory,
// found once on free land by a road inside it (no lot, road, railway or
// landmark in the way; the ground under them is levelled on the map, and the
// few scenery buildings they stand on make way). Same fields as the lots in
// world-data.json, plus the territory, the works it is zoned for and the
// district whose prices it follows.
import type { TerritoryId } from "../config/city";
import type { CityId, PlantType, ZoneId } from "../types";

export interface LandmarkLot {
  id: string;
  territory: TerritoryId;
  use: PlantType;
  zone: ZoneId;
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
  /** Ground height of the levelled lot (metres). */
  h: number;
  edge: number;
  s: number;
  drive: number;
}

export const LANDMARK_LOTS: LandmarkLot[] = [
  { id: "w:raw", territory: "raw", use: "frameWorks", zone: "industrial", x: -103.169, y: 13.388, w: 4, d: 4, rot: -0.9048, h: 12.6, edge: 56, s: 2, drive: 1.1 },
  { id: "w:suburbs", territory: "suburbs", use: "familyWorks", zone: "downtown", x: -18.063, y: 33.431, w: 5, d: 5, rot: -0.3931, h: 6, edge: 46, s: 26.5, drive: 1.1 },
  { id: "w:mountain", territory: "mountain", use: "trailWorks", zone: "town", x: 55.932, y: -69.912, w: 5, d: 5, rot: 0, h: 6.69, edge: 64, s: 26.5, drive: 1.1 },
  { id: "w:boulevard", territory: "boulevard", use: "coachWorks", zone: "luxury", x: 65.617, y: -8.085, w: 5, d: 5, rot: -1.9322, h: 5.9, edge: 30, s: 37, drive: 1.1 },
  { id: "w:port", territory: "port", use: "harbourWorks", zone: "town", x: -41.527, y: -15.398, w: 4, d: 4, rot: -3.0045, h: 6, edge: 0, s: 3, drive: 1.1 },
  { id: "w:airport", territory: "airport", use: "mobilityHub", zone: "global", x: 28.287, y: 15.69, w: 5, d: 5, rot: 1.8568, h: 6, edge: 24, s: 7, drive: 1.1 },
];

/** Nordheim's (its map, src/game/city/world-north.json): found the same way, with the city's lot prefix. */
export const LANDMARK_LOTS_NORTH: LandmarkLot[] = [
  { id: "n:w:raw", territory: "raw", use: "frameWorks", zone: "industrial", x: -87.002, y: -5.287, w: 4, d: 4, rot: -1.6406, h: 3.1, edge: 27, s: 1.5, drive: 1.1 },
  { id: "n:w:suburbs", territory: "suburbs", use: "familyWorks", zone: "downtown", x: -102.314, y: 41.567, w: 5, d: 5, rot: 1.4629, h: 8.3, edge: 19, s: 6, drive: 1.1 },
  { id: "n:w:mountain", territory: "mountain", use: "trailWorks", zone: "town", x: -25.872, y: -29.134, w: 5, d: 5, rot: -1.2528, h: 25.7, edge: 38, s: 18.75, drive: 1.1 },
  { id: "n:w:boulevard", territory: "boulevard", use: "coachWorks", zone: "luxury", x: 12.263, y: 67.774, w: 5, d: 5, rot: 2.8422, h: 2.5, edge: 51, s: 14.25, drive: 1.1 },
  { id: "n:w:port", territory: "port", use: "harbourWorks", zone: "town", x: 97.734, y: -76.676, w: 4, d: 4, rot: 0.5648, h: 7.1, edge: 72, s: 6.75, drive: 1.1 },
  { id: "n:w:airport", territory: "airport", use: "mobilityHub", zone: "global", x: 102.348, y: 39.44, w: 5, d: 5, rot: 2.3561, h: 7.8, edge: 59, s: 9.75, drive: 1.1 },
];

/** A city's landmark lots. */
export const landmarkLotsOf = (city: CityId): LandmarkLot[] => (city === "north" ? LANDMARK_LOTS_NORTH : LANDMARK_LOTS);

/** The lot of a city's landmark works in a territory. */
export const landmarkLotId = (city: CityId, t: TerritoryId) => landmarkLotsOf(city).find((l) => l.territory === t)?.id ?? `w:${t}`;
