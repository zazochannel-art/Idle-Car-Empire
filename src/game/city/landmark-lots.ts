// The lots of the landmark works (config/landmarks.ts): one in each territory,
// found once on free land by a road inside it (no lot, road, railway or
// landmark in the way; the ground under them is levelled on the map, and the
// few scenery buildings they stand on make way). Same fields as the lots in
// world-data.json, plus the territory, the works it is zoned for and the
// district whose prices it follows.
import type { TerritoryId } from "../config/city";
import type { PlantType, ZoneId } from "../types";

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
