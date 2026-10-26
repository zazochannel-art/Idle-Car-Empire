// Generates Nordheim, the second city's island: the game's map data
// (src/game/city/world-north.json) and the 3D map's files (public/world-north:
// heights, ground textures, scenery, areas raster, minimap). Deterministic: the
// same design gives the same files.
// Run: npx tsx scripts/island-gen/index.ts [--preview <png>] [--write] [--out <dir>]
// (--out: write everything there instead of the game's folders)
// (ISLAND_FINE=2 for a quick, coarser land while designing)
import path from "node:path";
import { CABLE_CAR, QUAYS, RAIL, RUNWAY, circuit as makeCircuit } from "./features";
import { buildLand } from "./land";
import { heightsBin, roadsJson, worldData, write } from "./output";
import { paint } from "./paint";
import { preview } from "./preview";
import { buildRoads, placeLots } from "./roads";
import { buildScenery } from "./scenery";
import { finishTerrain } from "./terrain";
import { GRID, SIZE } from "./design";
import type { P } from "./noise";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ROOT = path.resolve(__dirname, "../..");

function line(a: P, b: P, step = 0.5): P[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / step));
  return Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as P);
}

async function main() {
  const t0 = Date.now();
  const lap = (what: string) => console.log(`${what} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const land = buildLand();
  lap("land");
  const roads = buildRoads(land);
  const circuit = makeCircuit();
  const runway = line(RUNWAY.a, RUNWAY.b);
  const { lots, report } = placeLots(land, roads, [
    { pts: circuit, r: 3.2 },
    { pts: runway, r: 4.5 },
    { pts: RAIL, r: 2 },
    { pts: line(CABLE_CAR.a, CABLE_CAR.b), r: 1.5 },
  ]);
  for (const l of report) console.log(l);
  console.log(`roads ${roads.length}, lots ${lots.length}, bridges ${roads.filter((r) => r.decks.length).map((r) => r.spec.name).join(", ")}`);
  finishTerrain(land, roads, lots, [
    { pts: circuit, core: 1.1, fall: 3.2 },
    { pts: runway, core: 1.9, fall: 4.5 },
  ]);
  lap("terrain");
  const scenery = buildScenery(land, roads, lots, circuit);
  lap("scenery");
  console.log(`buildings ${scenery.cladiri.length}, trees ${scenery.copaci.length}, bushes ${scenery.tufe.length}, props ${Object.entries(scenery.props).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
  const file = opt("--preview");
  if (file) {
    await preview(land, file, {
      roads: roads.map((r) => ({ pts: r.pts, w: r.w })),
      lots,
      lines: [
        { pts: circuit, c: "#7f1d1d", w: 1 },
        { pts: runway, c: "#555", w: 2.4 },
        { pts: RAIL, c: "#6b4423", w: 0.5 },
        { pts: line(CABLE_CAR.a, CABLE_CAR.b), c: "#f00", w: 0.3 },
      ],
      points: [
        ...scenery.cladiri.map((b) => ({ x: b.x, y: b.z, c: "#7c2d12", r: 1.2 })),
        ...QUAYS.map(([x, y]) => ({ x, y, c: "#f0f", r: 3 })),
      ],
      trees: scenery.copaci.map((t) => [t[0], t[1], t[4]]),
    });
    lap("preview");
  }
  const dir = opt("--out");
  if (args.includes("--write") || dir) {
    const data = worldData(land, roads, lots, circuit);
    write(dir ? path.join(dir, "world-north.json") : path.join(ROOT, "src/game/city/world-north.json"), JSON.stringify(data));
    const out = dir ?? path.join(ROOT, "public/world-north");
    write(path.join(out, "heights.bin"), heightsBin(land));
    const world = {
      grid: GRID,
      panza: [3072, 2048],
      size: SIZE,
      cladiri: scenery.cladiri,
      copaci: scenery.copaci,
      tufe: scenery.tufe,
      parcate: scenery.parcate,
      props: scenery.props,
      vii: [],
      drumuri: { ...roadsJson(roads), parcari: scenery.parcari },
      linie: RAIL,
      pista: RUNWAY,
      cheiuri: QUAYS,
    };
    write(path.join(out, "world.json"), JSON.stringify(world));
    lap("data");
    await paint(land, roads, lots, circuit, scenery, out);
    lap("paint");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
