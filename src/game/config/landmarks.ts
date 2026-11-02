// The landmark works: an old works in every territory of the map, on its own
// lot (city/landmark-lots.ts). Restored, it makes the part its territory's car
// line needs (config/chain.ts, config/cars.ts); the line's first car pays a
// reward, and the cars built on it raise the territory's level (1–5), which
// makes the line sell for more to the territory's buyers and grows the
// territory's specialty. engine/landmarks.ts runs it.
import type { CarId, CityId, PlantType } from "../types";
import type { TerritoryId } from "./city";

export interface LandmarkConfig {
  territory: TerritoryId;
  works: PlantType;
  car: CarId;
}

export const LANDMARKS: LandmarkConfig[] = [
  { territory: "raw", works: "frameWorks", car: "pickup" },
  { territory: "suburbs", works: "familyWorks", car: "minivan" },
  { territory: "mountain", works: "trailWorks", car: "offroad" },
  { territory: "boulevard", works: "coachWorks", car: "estate" },
  { territory: "port", works: "harbourWorks", car: "hotHatch" },
  { territory: "airport", works: "mobilityHub", car: "shuttle" },
];

/** Nordheim's own landmark works: the same works in its territories, each with a Nordic line. */
export const LANDMARKS_NORTH: LandmarkConfig[] = [
  { territory: "raw", works: "frameWorks", car: "oreHauler" },
  { territory: "suburbs", works: "familyWorks", car: "fjordWagon" },
  { territory: "mountain", works: "trailWorks", car: "snowCrawler" },
  { territory: "boulevard", works: "coachWorks", car: "auroraGt" },
  { territory: "port", works: "harbourWorks", car: "iceRally" },
  { territory: "airport", works: "mobilityHub", car: "polarShuttle" },
];

/** A city's landmark works (none in a city whose territories hold none). */
export const landmarksOf = (city: CityId): LandmarkConfig[] => (city === "north" ? LANDMARKS_NORTH : LANDMARKS);

/** A city's landmark works in a territory. */
export const landmarkIn = (city: CityId, t: TerritoryId): LandmarkConfig | undefined => landmarksOf(city).find((l) => l.territory === t);

export const LANDMARK = {
  /** Cars of the line built in total (lifetime) for levels 2, 3, 4 and 5; level 1 comes with the restoration. */
  levels: [25, 150, 600, 2_500],
  maxLevel: 5,
  /** Local buyers: the line's car sells for this much more per level. */
  localPerLevel: 0.06,
  /** The line's first car: this many seconds of steady income (at least `minCash`), and Stars. */
  firstCar: { incomeSeconds: 600, minCash: 10_000, stars: 1 },
  /** Specialties, per level. */
  raw: { materials: 0.04 },
  /** A share of each line car's price paid back as rent over about `seconds`. */
  suburbs: { lease: 0.05, seconds: 600 },
  mountain: { race: 0.05 },
  /** Limited editions come this much sooner. */
  boulevard: { editions: 0.1 },
  port: { exports: 0.03 },
  /** Shuttles kept on the road (per level), each earning this share of its price an hour. */
  airport: { fleetPerLevel: 6, earn: 0.04 },
};

export const LANDMARK_BY_TERRITORY = Object.fromEntries(LANDMARKS.map((l) => [l.territory, l])) as Partial<Record<TerritoryId, LandmarkConfig>>;
export const LANDMARK_BY_CAR = Object.fromEntries([...LANDMARKS, ...LANDMARKS_NORTH].map((l) => [l.car, l])) as Partial<Record<CarId, LandmarkConfig>>;
