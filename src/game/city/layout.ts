// World geometry of the Empire Map, derived once from config/city.ts.
//
// The world is a square of tiles. Roads run along every ROAD_STEP-th tile row
// and column; between them sit 6×6-tile blocks, each split into 2×2 cells of
// 3×3 tiles. Zones are 3×3 blocks on a 3×3 grid. Pure data — shared by the
// engine (plot rules) and the renderer.
import { DEALER_LOT, FACTORY_LOT, NATURE, ZONES, type ZoneConfig } from "../config/city";
import type { DealerId, FactoryId, ZoneId } from "../types";

export const ROAD_STEP = 7;
export const CELL = 3;
export const ZONE_BLOCKS = 3;
export const BLOCKS = ZONE_BLOCKS * 3;
export const NODES = BLOCKS + 1;
export const WORLD = BLOCKS * ROAD_STEP + 1;
export const ZONE_TILES = ZONE_BLOCKS * ROAD_STEP;

export type PlotKind = "plot" | "factory" | "dealer";

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
  factory?: FactoryId;
  dealer?: DealerId;
  starter?: boolean;
  entry: Entry;
}

export type DecorKind = "house" | "apartment" | "office" | "shop" | "industry" | "park" | "water";

export interface Decor {
  kind: DecorKind;
  zone: ZoneId | null;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Stable pseudo-random number for variety. */
  seed: number;
}

const DECOR: Record<string, DecorKind> = { h: "house", a: "apartment", o: "office", s: "shop", i: "industry", t: "park", w: "water" };

/** Tile coordinate where cell `c` (global cell index) starts. */
export const cellOrigin = (c: number) => ROAD_STEP * (c >> 1) + 1 + CELL * (c & 1);

function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
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
  /** Zone of each block, indexed [by][bx]; null = the nature corner. */
  blockZone: (ZoneId | null)[][];
}

function build(): World {
  const plots: Plot[] = [];
  const decor: Decor[] = [];
  const blockZone: (ZoneId | null)[][] = Array.from({ length: BLOCKS }, () => Array<ZoneId | null>(BLOCKS).fill(null));

  const byPos = new Map<string, ZoneConfig>();
  for (const z of ZONES) byPos.set(`${z.gx},${z.gy}`, z);

  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const z = byPos.get(`${Math.floor(bx / ZONE_BLOCKS)},${Math.floor(by / ZONE_BLOCKS)}`);
      blockZone[by][bx] = z?.id ?? null;
    }

  for (const z of ZONES) {
    const factoriesSeen = new Set<string>();
    z.layout.forEach((row, ly) => {
      [...row].forEach((ch, lx) => {
        const gcx = z.gx * ZONE_BLOCKS * 2 + lx;
        const gcy = z.gy * ZONE_BLOCKS * 2 + ly;
        const x = cellOrigin(gcx);
        const y = cellOrigin(gcy);
        const seed = hash(gcx, gcy);
        if (ch === "." || ch === "G") {
          plots.push({ id: `${z.id}:${lx}:${ly}`, zone: z.id, kind: "plot", x, y, w: CELL, d: CELL, starter: ch === "G", entry: cellEntry(gcx, gcy) });
        } else if (DEALER_LOT[ch]) {
          plots.push({ id: `d:${DEALER_LOT[ch]}`, zone: z.id, kind: "dealer", dealer: DEALER_LOT[ch], x, y, w: CELL, d: CELL, entry: cellEntry(gcx, gcy) });
        } else if (ch === "0") {
          plots.push({ id: "f:garage", zone: z.id, kind: "factory", factory: "garage", x, y, w: CELL, d: CELL, entry: cellEntry(gcx, gcy) });
        } else if (FACTORY_LOT[ch]) {
          if (factoriesSeen.has(ch)) return;
          factoriesSeen.add(ch);
          // A factory fills its whole block; enter from the road in front (+y).
          const bx = gcx >> 1;
          const by = gcy >> 1;
          const bxT = bx * ROAD_STEP + 1;
          const byT = by * ROAD_STEP + 1;
          const id = FACTORY_LOT[ch];
          plots.push({
            id: `f:${id}`, zone: z.id, kind: "factory", factory: id, x: bxT, y: byT, w: CELL * 2, d: CELL * 2,
            entry: { x: bxT + CELL, y: (by + 1) * ROAD_STEP + 0.5, line: by + 1, i0: bx, i1: bx + 1, inward: -1 },
          });
        } else if (DECOR[ch]) {
          decor.push({ kind: DECOR[ch], zone: z.id, x, y, w: CELL, d: CELL, seed });
        }
      });
    });
  }

  // The nature corner: a lake ringed by woods.
  const nx = NATURE.gx * ZONE_TILES;
  const ny = NATURE.gy * ZONE_TILES;
  decor.push({ kind: "water", zone: null, x: nx + 3, y: ny + 3, w: ZONE_TILES - 5, d: ZONE_TILES - 5, seed: 0.5 });

  const plotById = Object.fromEntries(plots.map((p) => [p.id, p]));
  return { plots, plotById, decor, blockZone };
}

export const WORLD_MAP: World = build();

export const STARTER_PLOT = WORLD_MAP.plots.find((p) => p.starter)!.id;

export function plotOf(id: string): Plot | undefined {
  return WORLD_MAP.plotById[id];
}

export function factoryPlot(id: FactoryId): Plot | undefined {
  return WORLD_MAP.plotById[`f:${id}`];
}

export function dealerPlot(id: DealerId): Plot | undefined {
  return WORLD_MAP.plotById[`d:${id}`];
}

export function zoneOfBlock(bx: number, by: number): ZoneId | null {
  if (bx < 0 || by < 0 || bx >= BLOCKS || by >= BLOCKS) return null;
  return WORLD_MAP.blockZone[by][bx];
}

/** Tile rectangle covered by a zone (including its border roads). */
export function zoneRect(z: ZoneConfig) {
  return { x: z.gx * ZONE_TILES, y: z.gy * ZONE_TILES, w: ZONE_TILES + 1, d: ZONE_TILES + 1 };
}

/**
 * A road segment between two neighbouring nodes is open to traffic when a
 * block on either side belongs to an unlocked zone.
 * axis "x": horizontal road at node row `line`, between columns k and k+1.
 * axis "y": vertical road at node column `line`, between rows k and k+1.
 */
export function segmentOpen(axis: "x" | "y", line: number, k: number, unlocked: ReadonlySet<ZoneId>): boolean {
  const sides = axis === "x" ? [zoneOfBlock(k, line - 1), zoneOfBlock(k, line)] : [zoneOfBlock(line - 1, k), zoneOfBlock(line, k)];
  return sides.some((z) => z !== null && unlocked.has(z));
}
