// Nordheim, drawn by hand: the shape of the island (land masses, fjords,
// bays, skerries), its mountains, lakes and the seed points of its districts
// and territories. Everything else (roads, lots, scenery, pictures) is built
// from this. Units are the game's map units (about 10 m), x to the east, y to
// the south, the origin at the centre of the map.
import type { P } from "./noise";

/** Map size (the same frame as the first map, so the renderer's constants hold). */
export const SIZE: P = [302.6, 201.8];
export const GRID: P = [601, 401];
export const SEED = 1906;

export interface Ellipse {
  c: P;
  r: P;
  /** Turn in radians. */
  a?: number;
}

/** Land masses, joined smoothly. */
export const LAND: Ellipse[] = [
  { c: [-12, 30], r: [86, 44], a: 0.04 },
  { c: [62, 16], r: [52, 40], a: -0.12 },
  { c: [-32, -44], r: [56, 36], a: 0.18 },
  { c: [48, -36], r: [44, 28], a: -0.28 },
  { c: [-92, 40], r: [40, 30], a: 0.28 },
  { c: [-100, -36], r: [40, 30], a: -0.18 },
  { c: [112, -12], r: [27, 17], a: 0.42 },
  { c: [106, 44], r: [28, 19], a: -0.32 },
  { c: [-56, 0], r: [30, 24], a: 0 },
  { c: [10, -12], r: [40, 28], a: 0 },
  // the north coast, cut by the fjords
  { c: [10, -70], r: [34, 18], a: 0.05 },
  { c: [-64, -68], r: [30, 18], a: 0.1 },
];

/** Islands of their own (never melted into the main island). */
export const ISLANDS: Ellipse[] = [
  // the fishing port's island, off the north-east coast (a bridge across)
  { c: [101, -75], r: [20, 11], a: 0.2 },
  // skerries
  { c: [-138, -62], r: [5, 3.2], a: 0.5 },
  { c: [-126, -74], r: [3.4, 2.2], a: -0.3 },
  { c: [-142, 58], r: [4.5, 3], a: 0.2 },
  { c: [-62, 86], r: [5, 2.6], a: 0.1 },
  { c: [-24, 88], r: [3.2, 2.1], a: -0.4 },
  { c: [78, 86], r: [5.5, 3], a: 0.3 },
  { c: [138, 80], r: [4, 2.6], a: 0 },
  { c: [140, -48], r: [4.2, 3.4], a: 0.6 },
  { c: [-82, -86], r: [6, 3.4], a: -0.2 },
  { c: [32, -90], r: [4, 2.5], a: 0.4 },
  { c: [-142, 8], r: [3, 2], a: 0 },
];

export interface Channel {
  pts: P[];
  /** Width at the first and last point. */
  w: [number, number];
}

/** Fjords and channels cut into the land. */
export const FJORDS: Channel[] = [
  // Vestfjord: from the west coast to the industrial harbour at its head
  { pts: [[-162, -6], [-134, -4], [-110, 2], [-90, 7], [-74, 11], [-65, 12]], w: [12, 6] },
  // Nordfjord: from the north coast deep between the mountains
  { pts: [[6, -112], [2, -90], [6, -72], [12, -58], [15, -50]], w: [11, 5.5] },
  // Isfjord: a narrow arm into the mountains west of the ski resort
  { pts: [[-70, -110], [-68, -86], [-62, -70], [-57, -58]], w: [9, 4] },
  // a small fjord on the east coast, south of the global peninsula
  { pts: [[160, 4], [140, 6], [128, 10], [119, 12]], w: [8, 4.5] },
  // the bay north of the airport
  { pts: [[166, 26], [138, 25], [124, 22]], w: [10, 7] },
];

/** Bays cut out of the coast. */
export const BAYS: Ellipse[] = [
  // the boulevard's bay on the south coast
  { c: [30, 86], r: [21, 15], a: 0 },
  // a cove west of the town
  { c: [-66, 70], r: [10, 8], a: 0.3 },
];

export interface Massif {
  c: P;
  r: P;
  a?: number;
  /** Highest peak (metres). */
  h: number;
}

/** Mountains and hills. */
export const MASSIFS: Massif[] = [
  // the high mountains north of the town: the ski resort
  { c: [-34, -52], r: [40, 26], a: 0.15, h: 125 },
  { c: [-4, -40], r: [16, 14], h: 60 },
  // the north-west massif: the mines
  { c: [-104, -40], r: [32, 22], a: -0.2, h: 85 },
  // hills of the north-east
  { c: [52, -44], r: [30, 18], a: -0.3, h: 30 },
  // the west hills over the fjord
  { c: [-120, 14], r: [16, 10], h: 22 },
  // the port island's crag
  { c: [106, -78], r: [9, 6], h: 18 },
];

export interface Lake {
  c: P;
  r: P;
  a?: number;
  /** Frozen over (drawn icy white-blue). */
  ice?: boolean;
}

export const LAKES: Lake[] = [
  { c: [-52, -30], r: [5, 3], a: 0.4, ice: true },
  { c: [-14, -24], r: [3.5, 2.2], a: -0.2, ice: true },
  { c: [-110, -18], r: [4, 2.4], a: 0.2, ice: true },
  { c: [70, -18], r: [3.2, 2], a: 0.6 },
  { c: [-78, 32], r: [3, 2], a: 0 },
];

export type AreaId =
  | "town"
  | "industrial"
  | "downtown"
  | "automotive"
  | "luxury"
  | "supercar"
  | "mega"
  | "global"
  | "mountain"
  | "port"
  | "raw"
  | "suburbs"
  | "boulevard"
  | "airport"
  | "campus"
  | "racing";

/** How wooded each area is (forests over 0.18 in scenery and paint; blended across borders). */
export const FOREST_BIAS: Partial<Record<AreaId, number>> = { mountain: 0.45, raw: 0.3, suburbs: 0.02, mega: 0.0, port: 0.1, racing: -0.1, campus: 0.05, boulevard: 0.0, airport: -0.05, town: -0.15, industrial: -0.15, downtown: -0.25, automotive: -0.15, luxury: -0.1, supercar: -0.15, global: -0.2 };

/** In the order of the areas raster (value = index + 1), as the renderer reads it. */
export const AREA_IDS: AreaId[] = ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global", "mountain", "port", "raw", "suburbs", "boulevard", "airport", "campus", "racing"];
export const ZONE_IDS: AreaId[] = ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global"];

/** Seed points of each area: land goes to the nearest seed (borders warped by noise); `c` is where its name goes. */
export const AREAS: Record<AreaId, { c: P; seeds: P[]; weight?: number }> = {
  town: { c: [-38, 42], seeds: [[-38, 42], [-48, 54], [-28, 50]] },
  industrial: { c: [-70, 22], seeds: [[-70, 22], [-58, 18], [-82, 16]] },
  downtown: { c: [-4, 34], seeds: [[-4, 34], [8, 28], [-14, 42]] },
  automotive: { c: [26, 6], seeds: [[26, 6], [16, -2], [36, 14]] },
  luxury: { c: [56, 44], seeds: [[56, 44], [66, 36], [46, 52]] },
  supercar: { c: [84, 12], seeds: [[84, 12], [76, 0], [94, 22]] },
  mega: { c: [52, -30], seeds: [[52, -30], [38, -24], [66, -40]] },
  global: { c: [114, -10], seeds: [[114, -10], [104, -18], [124, -2]] },
  mountain: { c: [-32, -52], seeds: [[-32, -52], [-6, -46], [-56, -40], [-20, -66]] },
  port: { c: [100, -74], seeds: [[100, -74], [86, -58]], weight: 0.9 },
  raw: { c: [-100, -34], seeds: [[-100, -34], [-86, -22], [-116, -46]] },
  suburbs: { c: [-94, 46], seeds: [[-94, 46], [-80, 58], [-112, 32]] },
  boulevard: { c: [28, 66], seeds: [[28, 66], [42, 62], [14, 66]] },
  airport: { c: [110, 46], seeds: [[110, 46], [122, 38], [100, 54]] },
  campus: { c: [2, 10], seeds: [[2, 10]], weight: 0.85 },
  racing: { c: [-30, 14], seeds: [[-30, 14], [-22, 10]], weight: 0.9 },
};
