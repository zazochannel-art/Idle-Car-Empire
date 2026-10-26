// Nordheim's roads, drawn by hand: the junctions and the roads between them
// (with the points they pass through), what kind of road each one is, and
// which ones have lots along them. The lots themselves are placed by
// roads.ts wherever they fit.
import type { P } from "./noise";

export type RoadClass = "hw" | "main" | "street" | "lane";

export const WIDTH: Record<RoadClass, number> = { hw: 1.084, main: 0.985, street: 0.887, lane: 0.788 };

export const NODES: Record<string, P> = {
  // the coast highway, west to east
  H_SUB: [-98, 36],
  H_IND: [-73, 33],
  T_N: [-40, 30],
  H_RAC: [-20, 28],
  H_DT: [-2, 24],
  H_AUT: [22, 20],
  H_LUX: [46, 24],
  H_SUP: [72, 20],
  H_AIR: [98, 30],
  // the town
  T_W: [-62, 46],
  T_C: [-41, 44],
  T_E: [-20, 44],
  T_S: [-42, 63],
  T_SW: [-61, 61],
  // the industrial harbour at the head of the Vestfjord
  I_C: [-72, 23],
  I_H: [-91, 18],
  I_N: [-55, 22],
  // the suburbs and farms
  S_W: [-115, 26],
  S_S: [-98, 56],
  S_V: [-78, 52],
  // the mines north of the fjord
  R_E: [-55, 6],
  R_1: [-70, -13],
  R_M: [-96, -28],
  R_2: [-114, -40],
  R_B: [-90, -7],
  // downtown
  D_W: [-14, 40],
  D_C: [4, 38],
  D_E: [24, 36],
  D_S: [2, 56],
  // the campus and the road into the mountains
  C_C: [0, 10],
  C_W: [-12, 4],
  M_1: [-18, -14],
  M_SKI: [-30, -30],
  // automotive
  A_C: [26, 4],
  A_N: [30, -12],
  A_W: [8, 6],
  A_E: [46, 4],
  A_NW: [12, -12],
  // luxury and the boulevard
  L_W: [38, 40],
  L_C: [56, 42],
  L_E: [74, 40],
  L_S: [58, 54],
  B_1: [20, 66],
  B_2: [42, 63],
  // supercar
  S_C: [86, 12],
  S_N: [84, -4],
  S_E: [102, 10],
  SC_W: [66, 6],
  // the airport
  A_T: [108, 40],
  // the global peninsula
  G_W: [106, -2],
  G_C: [116, -12],
  G_E: [131, -22],
  G_N: [108, -27],
  // mega and the bridge to the fishing port
  M_C: [48, -28],
  M_E: [66, -38],
  M_N: [38, -44],
  P_B: [82, -54],
  P_I: [94, -70],
  P_V: [108, -77],
};

export interface LotSpec {
  /** Sides with lots: 1 left of the road (seen from its start), -1 right. */
  sides: (1 | -1)[];
  /** Big (6 × 6) lots at these distances from the road's start. */
  big?: { s: number; side: 1 | -1 }[];
  /** Keep this far from the ends (default 2.8). */
  margin?: number;
  /** Spacing between lot centres (default 4.1). */
  every?: number;
}

export interface RoadSpec {
  a: string;
  b: string;
  via?: P[];
  name: string;
  cls: RoadClass;
  urban: boolean;
  lots?: LotSpec;
}

const both: LotSpec = { sides: [1, -1] };

const near: LotSpec = { sides: [1, -1], margin: 3 };

export const ROADS: RoadSpec[] = [
  // ── Kystveien, the coast highway
  { a: "H_SUB", b: "H_IND", via: [[-86, 33]], name: "Kystveien", cls: "hw", urban: false },
  { a: "H_IND", b: "T_N", via: [[-56, 30]], name: "Kystveien", cls: "hw", urban: false, lots: near },
  { a: "T_N", b: "H_RAC", name: "Kystveien", cls: "hw", urban: true },
  { a: "H_RAC", b: "H_DT", name: "Kystveien", cls: "hw", urban: true },
  { a: "H_DT", b: "H_AUT", via: [[10, 21]], name: "Kystveien", cls: "hw", urban: true },
  { a: "H_AUT", b: "H_LUX", via: [[34, 21]], name: "Kystveien", cls: "hw", urban: false },
  { a: "H_LUX", b: "H_SUP", via: [[60, 23]], name: "Kystveien", cls: "hw", urban: false },
  { a: "H_SUP", b: "H_AIR", via: [[86, 26]], name: "Kystveien", cls: "hw", urban: false },
  // ── the town
  { a: "T_W", b: "T_C", name: "Storgata", cls: "main", urban: true, lots: both },
  { a: "T_C", b: "T_E", name: "Storgata", cls: "main", urban: true, lots: both },
  { a: "T_N", b: "T_C", name: "Torggata", cls: "street", urban: true, lots: both },
  { a: "T_C", b: "T_S", name: "Bryggegata", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 12, side: 1 }] } },
  { a: "T_W", b: "T_SW", name: "Fiskergata", cls: "lane", urban: true, lots: { sides: [-1] } },
  { a: "T_SW", b: "T_S", name: "Strandgata", cls: "lane", urban: true, lots: { sides: [1] } },
  { a: "T_W", b: "I_N", via: [[-60, 34]], name: "Verftsveien", cls: "street", urban: true, lots: both },
  // ── the industrial harbour
  { a: "H_IND", b: "I_C", name: "Havneveien", cls: "main", urban: true, lots: both },
  { a: "I_C", b: "I_H", name: "Kaigata", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 6, side: -1 }] } },
  { a: "I_C", b: "I_N", name: "Smiegata", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 6.5, side: 1 }] } },
  // ── the suburbs and farms
  { a: "H_SUB", b: "S_W", via: [[-108, 31]], name: "Gårdsveien", cls: "lane", urban: false },
  { a: "H_SUB", b: "S_S", via: [[-99, 46]], name: "Sørveien", cls: "lane", urban: false },
  { a: "S_S", b: "S_V", via: [[-88, 56]], name: "Kystveien Sør", cls: "lane", urban: false },
  { a: "S_V", b: "T_SW", via: [[-68, 56]], name: "Kystveien Sør", cls: "lane", urban: false },
  // ── the mines, round the fjord's head and over its bridge
  { a: "I_N", b: "R_E", via: [[-56, 14]], name: "Gruveveien", cls: "main", urban: false },
  { a: "R_E", b: "R_1", via: [[-62, -4]], name: "Gruveveien", cls: "main", urban: false },
  { a: "R_1", b: "R_M", via: [[-84, -22]], name: "Gruveveien", cls: "main", urban: false },
  { a: "R_M", b: "R_2", via: [[-106, -34]], name: "Gruveveien", cls: "lane", urban: false },
  { a: "R_M", b: "R_B", name: "Fjordveien", cls: "main", urban: false },
  { a: "R_B", b: "I_H", name: "Fjordbrua", cls: "main", urban: false },
  // ── downtown
  { a: "T_E", b: "D_W", name: "Kongens gate", cls: "main", urban: true, lots: both },
  { a: "D_W", b: "D_C", name: "Kongens gate", cls: "main", urban: true, lots: both },
  { a: "D_C", b: "D_E", name: "Kongens gate", cls: "main", urban: true, lots: { sides: [1, -1], big: [{ s: 10, side: 1 }] } },
  { a: "H_DT", b: "D_C", name: "Rådhusgata", cls: "street", urban: true, lots: both },
  { a: "D_C", b: "D_S", name: "Rådhusgata", cls: "street", urban: true, lots: both },
  { a: "H_RAC", b: "D_W", name: "Parkveien", cls: "lane", urban: true },
  // ── the campus and the mountain road
  { a: "H_DT", b: "C_C", name: "Forskningsveien", cls: "street", urban: true },
  { a: "C_C", b: "A_W", name: "Forskningsveien", cls: "street", urban: true },
  { a: "C_C", b: "C_W", name: "Dalveien", cls: "lane", urban: true },
  { a: "C_W", b: "M_1", via: [[-14, -5]], name: "Fjellveien", cls: "main", urban: false },
  { a: "M_1", b: "M_SKI", via: [[-26, -20]], name: "Fjellveien", cls: "main", urban: false },
  // ── automotive
  { a: "H_AUT", b: "A_C", name: "Motorgata", cls: "main", urban: true, lots: both },
  { a: "A_C", b: "A_N", name: "Motorgata", cls: "main", urban: true, lots: { sides: [1, -1], big: [{ s: 8, side: -1 }] } },
  { a: "A_W", b: "A_C", name: "Verkstedgata", cls: "street", urban: true, lots: both },
  { a: "A_C", b: "A_E", name: "Verkstedgata", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 10, side: 1 }] } },
  { a: "A_E", b: "H_LUX", via: [[47, 14]], name: "Industriveien", cls: "street", urban: true, lots: both },
  { a: "A_W", b: "A_NW", via: [[9, -3]], name: "Fabrikkgata", cls: "street", urban: true, lots: both },
  { a: "A_NW", b: "A_N", via: [[21, -13]], name: "Fabrikkgata", cls: "street", urban: true, lots: both },
  // ── luxury and the boulevard
  { a: "D_E", b: "L_W", name: "Slottsveien", cls: "street", urban: true },
  { a: "L_W", b: "L_C", name: "Slottsveien", cls: "main", urban: true, lots: both },
  { a: "L_C", b: "L_E", name: "Slottsveien", cls: "main", urban: true, lots: { sides: [1, -1], big: [{ s: 9, side: -1 }] } },
  { a: "H_LUX", b: "L_C", name: "Villaveien", cls: "street", urban: true, lots: both },
  { a: "L_C", b: "L_S", name: "Villaveien", cls: "street", urban: true, lots: both },
  { a: "D_S", b: "B_1", via: [[10, 63]], name: "Strandpromenaden", cls: "street", urban: true },
  { a: "B_1", b: "B_2", via: [[31, 67]], name: "Strandpromenaden", cls: "street", urban: true },
  { a: "B_2", b: "L_S", via: [[51, 60]], name: "Strandpromenaden", cls: "street", urban: true },
  // ── supercar and the airport
  { a: "H_SUP", b: "S_C", name: "Hurtigveien", cls: "main", urban: true, lots: both },
  { a: "S_C", b: "S_E", name: "Hurtigveien", cls: "main", urban: true, lots: { sides: [1, -1], big: [{ s: 7, side: 1 }] } },
  { a: "S_C", b: "S_N", name: "Testbaneveien", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 9, side: -1 }] } },
  { a: "SC_W", b: "S_C", via: [[76, 8]], name: "Turbogata", cls: "street", urban: true, lots: both },
  { a: "S_E", b: "H_AIR", via: [[101, 20]], name: "Flyplassveien", cls: "main", urban: false, lots: near },
  { a: "H_AIR", b: "A_T", name: "Flyplassveien", cls: "main", urban: true },
  { a: "A_E", b: "SC_W", name: "Nordre ringvei", cls: "street", urban: false, lots: near },
  { a: "SC_W", b: "S_N", via: [[74, -2]], name: "Nordre ringvei", cls: "street", urban: false, lots: near },
  // ── the global peninsula
  { a: "S_E", b: "G_W", via: [[104, 4]], name: "Nesveien", cls: "main", urban: false, lots: near },
  { a: "G_W", b: "G_C", name: "Nesveien", cls: "main", urban: true, lots: { sides: [1, -1], big: [{ s: 5, side: 1 }] } },
  { a: "G_C", b: "G_E", name: "Nesveien", cls: "main", urban: true, lots: both },
  { a: "G_C", b: "G_N", name: "Kappveien", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 6, side: -1 }] } },
  // ── mega, and over the sound to the fishing port
  { a: "A_N", b: "M_C", via: [[38, -20]], name: "Nordveien", cls: "main", urban: true, lots: both },
  { a: "M_C", b: "M_E", via: [[57, -34]], name: "Nordveien", cls: "main", urban: true, lots: { sides: [1, -1], big: [{ s: 10, side: -1 }] } },
  { a: "M_C", b: "M_N", name: "Åsveien", cls: "street", urban: true, lots: { sides: [1, -1], big: [{ s: 10, side: -1 }] } },
  { a: "M_E", b: "G_N", via: [[88, -31]], name: "Østre ringvei", cls: "main", urban: false, lots: near },
  { a: "M_E", b: "P_B", via: [[74, -48]], name: "Havnebrua", cls: "main", urban: false },
  { a: "P_B", b: "P_I", name: "Havnebrua", cls: "main", urban: false },
  { a: "P_I", b: "P_V", via: [[101, -75]], name: "Fiskeværet", cls: "lane", urban: true },
];

/** The special lots, each in front of a road: [road index found by its ends, distance along, side]. */
export interface SpecialLot {
  id: string;
  kind: "dealer" | "market" | "depot" | "racing";
  road: [string, string];
  s: number;
  side: 1 | -1;
  dealer?: string;
  size?: number;
}

export const SPECIAL_LOTS: SpecialLot[] = [
  // the start, as close-knit as the first city's: on Storgata's north side the first plant with the engine
  // and assembly plants either side of it, the two first dealers across the street, the depot and the
  // market round the corner on Torggata
  { id: "d:city", kind: "dealer", dealer: "city", road: ["T_W", "T_C"], s: 11.5, side: 1 },
  { id: "d:local", kind: "dealer", dealer: "local", road: ["T_W", "T_C"], s: 15.5, side: 1 },
  { id: "s:depot", kind: "depot", road: ["T_N", "T_C"], s: 10.5, side: 1 },
  { id: "m:market", kind: "market", road: ["T_N", "T_C"], s: 4.5, side: 1 },
  { id: "d:premium", kind: "dealer", dealer: "premium", road: ["D_W", "D_C"], s: 9, side: -1 },
  { id: "d:luxury", kind: "dealer", dealer: "luxury", road: ["A_W", "A_C"], s: 5, side: 1 },
  { id: "d:supercar", kind: "dealer", dealer: "supercar", road: ["L_W", "L_C"], s: 6, side: 1 },
  { id: "d:global", kind: "dealer", dealer: "global", road: ["S_C", "S_E"], s: 4, side: -1 },
  { id: "r:paddock", kind: "racing", road: ["T_N", "H_RAC"], s: 9, side: 1, size: 4.5 },
];

/** The first plant: the town lot nearest these (the depot and the market). */
export const STARTER_NEAR: P = [-50.5, 42.2];

/** Lots wanted in each district (the generator reports what fits). */
export const LOT_TARGET: Record<string, { cells: number; big: number }> = {
  town: { cells: 16, big: 1 },
  industrial: { cells: 9, big: 2 },
  downtown: { cells: 13, big: 1 },
  automotive: { cells: 18, big: 2 },
  luxury: { cells: 11, big: 1 },
  supercar: { cells: 14, big: 2 },
  mega: { cells: 11, big: 2 },
  global: { cells: 9, big: 2 },
};
