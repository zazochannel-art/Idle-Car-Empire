// World geometry of the Empire Map, derived once from config/city.ts.
//
// The world is a square of tiles. Roads run along every ROAD_STEP-th tile row
// and column; between them sit 6×6-tile blocks, each split into 2×2 cells of
// 3×3 tiles. WORLD_BLOCKS says which district (or which scenery: sea,
// forest, farmland, hills) each block belongs to, so districts have organic
// shapes. A river follows one node column. Pure data — shared by the engine
// (plot rules) and the renderer.
import { BIG_LOTS, DEALER_LOTS, DEPOT_CELL, LEGACY_OFFSET, MARKET_CELL, RACING_PADDOCK_BLOCK, RIVER_LINE, STARTER_CELL, TERRITORIES, WORLD_BLOCKS, ZONES, type TerritoryId } from "../config/city";
import type { DealerId, ZoneId } from "../types";

export const ROAD_STEP = 7;
export const CELL = 3;
export const BLOCKS = WORLD_BLOCKS.length;
export const NODES = BLOCKS + 1;
export const WORLD = BLOCKS * ROAD_STEP + 1;
export const RIVER = RIVER_LINE;

/** Plot ids of the Parts Market, the Materials Depot and the Racing District's paddock. */
export const MARKET = "m:market";
export const DEPOT = "s:depot";
export const RACING = "r:paddock";

export type PlotKind = "plot" | "dealer" | "market" | "depot" | "racing";

export interface Entry {
  /** Point on the road centre line in front of the plot. */
  x: number;
  y: number;
  /** The road is a horizontal line (along x) at node row `line`. */
  line: number;
  /** Node columns at either end of that road segment. */
  i0: number;
  i1: number;
  /** +1 if the plot lies in +y from the road, -1 if in -y. */
  inward: 1 | -1;
}

export interface Plot {
  id: string;
  zone: ZoneId;
  kind: PlotKind;
  /** Tile rectangle. */
  x: number;
  y: number;
  w: number;
  d: number;
  dealer?: DealerId;
  starter?: boolean;
  /** A whole-block industrial lot. */
  big?: boolean;
  entry: Entry;
}

export type DecorKind = "house" | "apartment" | "office" | "shop" | "industry" | "park";
export type SceneryKind = "forest" | "farm" | "hills" | "mountains";
/** Landmark areas of the territories (config/city.ts TERRITORIES). */
export type LandmarkKind = "testFacility" | "port" | "railyard" | "raw" | "suburbs" | "boulevard" | "skyline" | "airport" | "campus" | "racingAnnex";
export type BlockKind = ZoneId | SceneryKind | LandmarkKind | "sea" | "lake" | "racing" | "road";
/** What a block belongs to for unlocking: a district or a territory. */
export type AreaId = ZoneId | TerritoryId;

export interface Decor {
  kind: DecorKind;
  zone: ZoneId;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Stable pseudo-random number for variety. */
  seed: number;
}

/** A territory's landmark block (drawn by the map as port, airport, test facility...). */
export interface Landmark {
  kind: LandmarkKind;
  territory: TerritoryId;
  bx: number;
  by: number;
  x: number;
  y: number;
  seed: number;
}

export interface Scenery {
  kind: SceneryKind;
  bx: number;
  by: number;
  x: number;
  y: number;
  seed: number;
}

const DECOR: Record<string, DecorKind> = { h: "house", a: "apartment", o: "office", s: "shop", i: "industry", t: "park" };
const SCENERY: Record<string, SceneryKind | "sea" | "lake"> = { w: "sea", l: "lake", f: "forest", a: "farm", h: "hills", m: "mountains" };
const LANDMARK: Record<string, LandmarkKind | "racing" | "road"> = {
  K: "testFacility", P: "port", Y: "railyard", Q: "raw", U: "suburbs", V: "boulevard", O: "skyline", X: "airport", C: "campus", R: "racing", Z: "racingAnnex",
  k: "road", p: "road", q: "road", u: "road", v: "road", z: "road",
};
/** Landmarks whose blocks hold one big thing (a runway, a circuit, test roads): no streets between their blocks. */
const SOLID: ReadonlySet<BlockKind> = new Set<BlockKind>(["testFacility", "airport", "racing", "racingAnnex"]);

/** Tile coordinate where cell `c` (global cell index) starts. */
export const cellOrigin = (c: number) => ROAD_STEP * (c >> 1) + 1 + CELL * (c & 1);

export function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Length of a driveway, from the road centre into the lot (tiles). */
export const DRIVEWAY = 1.25;

export interface RoadRoute {
  /** Total length on the roads, driveways included (tiles). */
  length: number;
  /** Junctions where the route leaves the first road and joins the last one (columns on each entry's line), or null when both lots share a road segment. */
  from: number | null;
  to: number | null;
}

/**
 * The shortest way by road from one lot to another: out of the driveway, to
 * the junction on the side that leads toward the destination, along the
 * grid, and into the other driveway. The engine times deliveries with its
 * length and the map drives trucks along it, so both always agree.
 */
export function roadRoute(a: Entry, b: Entry): RoadRoute {
  if (a.line === b.line && a.i0 === b.i0) return { length: 2 * DRIVEWAY + Math.abs(a.x - b.x), from: null, to: null };
  const nx = (i: number) => i * ROAD_STEP + 0.5;
  let best: RoadRoute = { length: Infinity, from: a.i0, to: b.i0 };
  for (const n1 of [a.i0, a.i1])
    for (const n2 of [b.i0, b.i1]) {
      const length = 2 * DRIVEWAY + Math.abs(a.x - nx(n1)) + Math.abs(nx(n1) - nx(n2)) + Math.abs(a.line - b.line) * ROAD_STEP + Math.abs(nx(n2) - b.x);
      if (length < best.length - 1e-9) best = { length, from: n1, to: n2 };
    }
  return best;
}

function cellEntry(gcx: number, gcy: number): Entry {
  const bx = gcx >> 1;
  const by = gcy >> 1;
  const subY = gcy & 1;
  const line = by + subY;
  return { x: cellOrigin(gcx) + CELL / 2, y: line * ROAD_STEP + 0.5, line, i0: bx, i1: bx + 1, inward: subY === 0 ? 1 : -1 };
}

export interface World {
  plots: Plot[];
  plotById: Record<string, Plot>;
  decor: Decor[];
  scenery: Scenery[];
  /** What each block is, indexed [by][bx]. */
  blocks: BlockKind[][];
  /** District of each block, indexed [by][bx]; null for scenery and sea. */
  blockZone: (ZoneId | null)[][];
  /** Blocks of each district. */
  zoneBlocks: Record<ZoneId, [number, number][]>;
  /** Territory of each block, indexed [by][bx]; null for districts and open country. */
  blockTerritory: (TerritoryId | null)[][];
  /** Blocks of each territory. */
  territoryBlocks: Record<TerritoryId, [number, number][]>;
  landmarks: Landmark[];
}

function build(): World {
  const plots: Plot[] = [];
  const decor: Decor[] = [];
  const scenery: Scenery[] = [];
  const byLetter = new Map(ZONES.map((z) => [z.letter, z]));
  const zoneBlocks = Object.fromEntries(ZONES.map((z) => [z.id, [] as [number, number][]])) as Record<ZoneId, [number, number][]>;

  const terrByLetter = new Map(TERRITORIES.flatMap((t) => [...t.letters].map((l) => [l, t.id] as const)));
  const territoryBlocks = Object.fromEntries(TERRITORIES.map((t) => [t.id, [] as [number, number][]])) as Record<TerritoryId, [number, number][]>;
  const landmarks: Landmark[] = [];
  const blockTerritory: (TerritoryId | null)[][] = [];
  const blocks: BlockKind[][] = WORLD_BLOCKS.map((row, by) => {
    blockTerritory[by] = [];
    return [...row].map((ch, bx) => {
      blockTerritory[by][bx] = terrByLetter.get(ch) ?? null;
      const z = byLetter.get(ch);
      if (z) {
        zoneBlocks[z.id].push([bx, by]);
        return z.id;
      }
      const seed = hash(bx * 7 + 3, by * 13 + 5);
      const lm = LANDMARK[ch];
      if (lm) {
        const t = terrByLetter.get(ch)!;
        territoryBlocks[t].push([bx, by]);
        if (lm !== "racing" && lm !== "road") landmarks.push({ kind: lm, territory: t, bx, by, x: bx * ROAD_STEP + 1, y: by * ROAD_STEP + 1, seed });
        return lm;
      }
      const s = SCENERY[ch] ?? "sea";
      if (s !== "sea" && s !== "lake") scenery.push({ kind: s, bx, by, x: bx * ROAD_STEP + 1, y: by * ROAD_STEP + 1, seed });
      return s;
    });
  });
  const blockZone = blocks.map((row) => row.map((k) => (ZONES.some((z) => z.id === k) ? (k as ZoneId) : null)));

  // Special lots first, so the fill below skips their cells.
  const taken = new Set<string>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const zoneAt = (cx: number, cy: number) => blockZone[cy >> 1]?.[cx >> 1] ?? null;

  for (const [kind, [cx, cy]] of [["market", MARKET_CELL], ["depot", DEPOT_CELL]] as const) {
    const zone = zoneAt(cx, cy);
    if (!zone) throw new Error(`${kind} lot is not in a district`);
    plots.push({ id: kind === "market" ? MARKET : DEPOT, zone, kind, x: cellOrigin(cx), y: cellOrigin(cy), w: CELL, d: CELL, entry: cellEntry(cx, cy) });
    taken.add(key(cx, cy));
  }
  for (const [cx, cy] of BIG_LOTS) {
    const zone = zoneAt(cx, cy);
    if (!zone) throw new Error(`industrial lot ${cx},${cy} is not in a district`);
    // A big lot fills its whole block; enter from the road in front (+y).
    const bx = cx >> 1;
    const by = cy >> 1;
    const x = bx * ROAD_STEP + 1;
    const y = by * ROAD_STEP + 1;
    plots.push({ id: `b:${bx}:${by}`, zone, kind: "plot", big: true, x, y, w: CELL * 2, d: CELL * 2, entry: { x: x + CELL, y: (by + 1) * ROAD_STEP + 0.5, line: by + 1, i0: bx, i1: bx + 1, inward: -1 } });
    for (const dx of [0, 1]) for (const dy of [0, 1]) taken.add(key(bx * 2 + dx, by * 2 + dy));
  }
  for (const [id, [cx, cy]] of Object.entries(DEALER_LOTS) as [DealerId, [number, number]][]) {
    const zone = zoneAt(cx, cy);
    if (!zone) throw new Error(`dealer lot ${id} is not in a district`);
    plots.push({ id: `d:${id}`, zone, kind: "dealer", dealer: id, x: cellOrigin(cx), y: cellOrigin(cy), w: CELL, d: CELL, entry: cellEntry(cx, cy) });
    taken.add(key(cx, cy));
  }

  // The Racing District: one lot (the paddock), entered from the road below it.
  {
    const [bx, by] = RACING_PADDOCK_BLOCK;
    const x = bx * ROAD_STEP + 1;
    const y = by * ROAD_STEP + 1;
    if (blocks[by]?.[bx] !== "racing") throw new Error("the racing paddock must be a racing block");
    plots.push({ id: RACING, zone: "town", kind: "racing", x, y, w: CELL * 2, d: CELL * 2, entry: { x: x + CELL, y: (by + 1) * ROAD_STEP + 0.5, line: by + 1, i0: bx, i1: bx + 1, inward: -1 } });
  }

  // Every other district cell: a plot or scenery from the district's mix.
  for (const z of ZONES) {
    let plotsHere = 0;
    let cells = 0;
    for (const [bx, by] of zoneBlocks[z.id]) {
      for (const dy of [0, 1])
        for (const dx of [0, 1]) {
          const cx = bx * 2 + dx;
          const cy = by * 2 + dy;
          if (taken.has(key(cx, cy))) continue;
          const x = cellOrigin(cx);
          const y = cellOrigin(cy);
          // seeded by the first map's cell coordinates, so the middle of the region is that map exactly
          const seed = hash(cx - LEGACY_OFFSET * 2, cy - LEGACY_OFFSET * 2);
          const starter = cx === STARTER_CELL[0] && cy === STARTER_CELL[1];
          cells++;
          // Keep at least ~40% of the district buildable.
          const ch = starter || plotsHere * 2.5 < cells - 1 ? "." : z.mix[Math.floor(seed * z.mix.length)];
          if (ch === ".") {
            plots.push({ id: `c:${cx}:${cy}`, zone: z.id, kind: "plot", x, y, w: CELL, d: CELL, starter, entry: cellEntry(cx, cy) });
            plotsHere++;
          } else {
            decor.push({ kind: DECOR[ch] ?? "park", zone: z.id, x, y, w: CELL, d: CELL, seed });
          }
        }
    }
  }

  const plotById = Object.fromEntries(plots.map((p) => [p.id, p]));
  return { plots, plotById, decor, scenery, blocks, blockZone, zoneBlocks, blockTerritory, territoryBlocks, landmarks };
}

export const WORLD_MAP: World = build();

export const STARTER_PLOT = `c:${STARTER_CELL[0]}:${STARTER_CELL[1]}`;

export function plotOf(id: string): Plot | undefined {
  return WORLD_MAP.plotById[id];
}

export function dealerPlot(id: DealerId): Plot | undefined {
  return WORLD_MAP.plotById[`d:${id}`];
}

export function zoneOfBlock(bx: number, by: number): ZoneId | null {
  if (bx < 0 || by < 0 || bx >= BLOCKS || by >= BLOCKS) return null;
  return WORLD_MAP.blockZone[by][bx];
}

export function territoryOfBlock(bx: number, by: number): TerritoryId | null {
  if (bx < 0 || by < 0 || bx >= BLOCKS || by >= BLOCKS) return null;
  return WORLD_MAP.blockTerritory[by][bx];
}

/** District or territory a block belongs to (what unlocks it). */
export const areaOfBlock = (bx: number, by: number): AreaId | null => zoneOfBlock(bx, by) ?? territoryOfBlock(bx, by);

export function blockKind(bx: number, by: number): BlockKind {
  if (bx < 0 || by < 0 || bx >= BLOCKS || by >= BLOCKS) return "sea";
  return WORLD_MAP.blocks[by][bx];
}

/** Centre of a district in tiles (average of its blocks). */
export function zoneCenterTile(zone: ZoneId) {
  const list = WORLD_MAP.zoneBlocks[zone];
  const n = Math.max(1, list.length);
  const x = list.reduce((a, [bx]) => a + bx * ROAD_STEP + 4, 0) / n;
  const y = list.reduce((a, [, by]) => a + by * ROAD_STEP + 4, 0) / n;
  // snap to the nearest of its blocks so the label sits on the district
  let best = list[0];
  let bestD = Infinity;
  for (const b of list) {
    const d = Math.hypot(b[0] * ROAD_STEP + 4 - x, b[1] * ROAD_STEP + 4 - y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return { x: best[0] * ROAD_STEP + 4, y: best[1] * ROAD_STEP + 4 };
}

/** Is this segment the river (no road)? Vertical segments on RIVER's column. */
export const isRiver = (axis: "x" | "y", line: number) => axis === "y" && line === RIVER;

/**
 * Whether a road is built on a segment between two neighbouring nodes:
 * wherever a district or a territory's built-up land (or access road)
 * touches it; none along the river, between fields and woods, or inside a
 * landmark that is one big thing (a runway, a circuit, the test roads).
 * axis "x": horizontal road at node row `line`, between columns k and k+1.
 * axis "y": vertical road at node column `line`, between rows k and k+1.
 */
export function segmentSides(axis: "x" | "y", line: number, k: number): [AreaId | null, AreaId | null] {
  return axis === "x" ? [areaOfBlock(k, line - 1), areaOfBlock(k, line)] : [areaOfBlock(line - 1, k), areaOfBlock(line, k)];
}

const [PBX, PBY] = RACING_PADDOCK_BLOCK;
/** Does this block have streets around it? */
function bearsRoads(bx: number, by: number): boolean {
  const k = blockKind(bx, by);
  if (k === "racing") return bx === PBX && by === PBY;
  if (k === "racingAnnex") return false;
  return areaOfBlock(bx, by) !== null;
}

export function hasRoad(axis: "x" | "y", line: number, k: number): boolean {
  if (isRiver(axis, line)) return false;
  const [a, b] = axis === "x" ? [[k, line - 1], [k, line]] : [[line - 1, k], [line, k]];
  if (!bearsRoads(a[0], a[1]) && !bearsRoads(b[0], b[1])) return false;
  const ka = blockKind(a[0], a[1]);
  return !(ka === blockKind(b[0], b[1]) && SOLID.has(ka));
}

/** A road is open to traffic when a district or territory on either side is unlocked. */
export function segmentOpen(axis: "x" | "y", line: number, k: number, unlocked: ReadonlySet<string>): boolean {
  if (!hasRoad(axis, line, k)) return false;
  return segmentSides(axis, line, k).some((z) => z !== null && unlocked.has(z));
}

/** Centre of a territory in tiles (its block nearest to the average). */
export function territoryCenterTile(t: TerritoryId) {
  const list = WORLD_MAP.territoryBlocks[t].filter(([bx, by]) => blockKind(bx, by) !== "road");
  const n = Math.max(1, list.length);
  const x = list.reduce((a, [bx]) => a + bx * ROAD_STEP + 4, 0) / n;
  const y = list.reduce((a, [, by]) => a + by * ROAD_STEP + 4, 0) / n;
  return { x, y };
}

/** Tiles of the Racing District: the paddock block, and the circuit's blocks (no roads between them). */
export const RACING_AREA = (() => {
  const blocks: [number, number][] = [];
  WORLD_MAP.blocks.forEach((row, by) => row.forEach((k, bx) => k === "racing" && blocks.push([bx, by])));
  const [pbx, pby] = RACING_PADDOCK_BLOCK;
  const track = blocks.filter(([bx, by]) => bx !== pbx || by !== pby);
  const x0 = Math.min(...track.map(([bx]) => bx)) * ROAD_STEP + 1;
  const y0 = Math.min(...track.map(([, by]) => by)) * ROAD_STEP + 1;
  const x1 = (Math.max(...track.map(([bx]) => bx)) + 1) * ROAD_STEP;
  const y1 = (Math.max(...track.map(([, by]) => by)) + 1) * ROAD_STEP;
  return {
    blocks,
    paddock: { x: pbx * ROAD_STEP + 1, y: pby * ROAD_STEP + 1, w: ROAD_STEP - 1, d: ROAD_STEP - 1 },
    /** The circuit's land: between its outer roads (the roads inside are gone). */
    track: { x: x0, y: y0, w: x1 - x0, d: y1 - y0 },
  };
})();
