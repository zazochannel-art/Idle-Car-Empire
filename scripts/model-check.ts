// Builds every 3D model the game renders, with every variant it can ask for,
// and reports any geometry with NaN or Infinity vertices.
// Usage: npx tsx scripts/model-check.ts
import * as THREE from "three";
import * as cars from "../src/components/three/car-models";
import * as buildings from "../src/components/three/building-models";
import * as homes from "../src/components/three/home-models";
import * as industrial from "../src/components/three/industrial-models";
import * as interior from "../src/components/three/interior-models";
import { RECIPES } from "../src/components/plant/interior/layout";
import { PLANT_TYPES } from "../src/game/config/chain";

// canvas textures only need something to draw on: a no-op 2D context
const noop: unknown = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };

const T = THREE;
const bad = new Set<string>();
function check(label: string, g: THREE.Object3D) {
  g.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const pos = geo?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.array.length; i++)
      if (!Number.isFinite(pos.array[i])) {
        bad.add(`${label}: ${geo.type}`);
        return;
      }
  });
}
const tryBuild = (label: string, f: () => THREE.Object3D) => {
  try {
    check(label, f());
  } catch (e) {
    bad.add(`${label}: threw ${(e as Error).message}`);
  }
};

async function main() {
  await cars.loadShapes();
  const kit = cars.materialKit(T);
  const models = Object.keys(cars.CAR_SPECS) as cars.BodyModel[];
  for (const model of models)
    for (const st of [-1, 0, 1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9])
      for (const spin of [0, 1.3]) tryBuild(`car ${model} st${st}`, () => cars.buildCar(T, kit, { model, color: "#c0392b", finish: "metallic", steer: 0.3, spin, stage: { station: st } }));
  for (const kind of ["van", "truck", "semi", "trailer"] as const)
    for (const empty of [true, false]) tryBuild(`truck ${kind}`, () => cars.buildTruck(T, kit, { kind, cargo: "#888888", empty }));
  for (let n = 0; n <= 8; n++) tryBuild(`carrier ${n}`, () => cars.buildCarrier(T, kit, models.slice(0, n).map((model) => ({ model, color: "#fff" }))));
  for (const type of PLANT_TYPES)
    for (let level = 0; level <= 25; level++)
      for (const big of [false, true])
        for (const dockFront of [false, true])
          tryBuild(`plant ${type} L${level}`, () => buildings.buildPlant(T, kit, { type, level, big, dockFront, wall: "#ccc", roof: "#555", accent: "#f00" }, big ? 3 : 2, big ? 3 : 2));
  for (let tier = 0; tier <= 8; tier++) for (const w of [1, 1.5, 2, 3]) tryBuild(`dealer ${tier} ${w}`, () => buildings.buildDealer(T, kit, { tier, brand: "#2563eb" }, w, w));
  for (let level = 0; level <= 25; level++) for (const w of [1, 1.5, 2, 3]) tryBuild(`garage ${level} ${w}`, () => buildings.buildGarage(T, kit, level, "#2563eb", w, w));
  for (const [W, D] of [[1, 1], [1, 2], [2, 1], [1.5, 1.5], [2, 2], [3, 2], [2, 3], [3, 3]])
    for (let q = 1 / 24; q < 1; q += 1 / 12) {
      tryBuild(`house ${q} ${W}x${D}`, () => homes.buildHouseLot(T, kit, W, D, q, q > 0.5));
      tryBuild(`villa ${q} ${W}x${D}`, () => homes.buildVillaLot(T, kit, W, D, q, "#fff"));
      for (const zone of [1, 1.4]) tryBuild(`apt ${q} ${W}x${D}`, () => homes.buildApartmentLot(T, kit, W, D, q, (44 + Math.floor(q * 4) * 8) * zone));
      for (const tall of [0.85, 1.1, 1.4, 1.75])
        for (const twin of [false, true]) {
          const h = (70 + Math.floor(q * 6) * 14) * tall;
          const towers = twin ? [{ x: 0.15, z: 0.15, w: 1, d: 1, h }, { x: 1.35, z: 1.25, w: 0.9, d: 0.9, h: h * 0.65 }] : [{ x: 0.35, z: 0.35, w: 1.6, d: 1.5, h }];
          tryBuild(`office ${q} ${W}x${D} h${h}`, () => homes.buildOfficeLot(T, kit, W, D, q, { towers, tint: "#9fc4e8", helipad: tall > 1.5 && h > 150, mast: !twin }));
        }
      tryBuild(`shop ${q} ${W}x${D}`, () => homes.buildShopLot(T, kit, W, D, q, ["#ef4444", "#22c55e"], ["#fff", "#000", "#f00"]));
    }
  for (const pose of [-5, -1, 0, 0.5, 1, 2, 3, 4, 5, 6, 7]) {
    for (const tool of ["torch", "gripper", "suction", "spray"] as const) tryBuild(`robot ${tool} ${pose}`, () => industrial.buildRobot(T, kit, pose, "#f59e0b", tool));
    for (const kind of new Set(Object.values(industrial.STATION_MACHINES).flat())) tryBuild(`machine ${kind} ${pose}`, () => industrial.buildMachine(T, kit, kind, pose, "#f00"));
  }
  for (const [rid, defs] of Object.entries(RECIPES))
    for (const d of defs)
      for (const pose of [-3, -1, 0, 0.5, 1, 2, 3, 7])
        for (const robots of [false, true])
          for (const part of ["back", "front"] as const) {
            tryBuild(`station ${rid}/${d.machine}/${d.variant ?? ""}`, () => interior.buildStation(T, kit, d.machine, pose, "#f00", robots, part, d.variant ?? "", "#94a3b8"));
            if (d.part !== "car") tryBuild(`part ${d.part}`, () => interior.buildPart(T, d.part as never, "#94a3b8"));
            for (const pr of d.props ?? []) tryBuild(`prop ${pr}`, () => interior.buildProp(T, pr, "#f00", "#94a3b8"));
          }
  for (const role of ["worker", "welder", "inspector", "driver", "supervisor", "manager"] as const)
    for (const pose of [-1, 0, 1, 2, 3]) tryBuild(`worker ${role}`, () => interior.buildWorker(T, role, pose, pose));
  for (const loaded of [false, true]) {
    tryBuild("forklift", () => interior.buildForklift(T, kit, 1, loaded, "coil"));
    tryBuild("agv", () => interior.buildAGV(T, 1, loaded, "coil"));
  }
  console.log(bad.size ? [...bad].join("\n") : "all models finite");
  process.exit(bad.size ? 1 : 0);
}
main();
