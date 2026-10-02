/**
 * Balance simulator: a greedy bot plays the real engine and logs when it hits
 * each milestone of the supply chain. Used to tune config/ so the first
 * factory comes quickly and the empire takes hours. Run: npm run simulate -- [hours]
 */
import { CARS } from "../src/game/config/cars";
import { PLANTS } from "../src/game/config/chain";
import { DEALERS } from "../src/game/config/dealerships";
import { MANAGERS } from "../src/game/config/managers";
import { RESEARCH } from "../src/game/config/research";
import { ZONE_BY_ID } from "../src/game/config/city";
import * as A from "../src/game/engine/actions";
import * as Ch from "../src/game/engine/chain";
import * as C from "../src/game/engine/city";
import { carModelCost, dealerUpgradeCost, snapshot } from "../src/game/engine/economy";
import { freePlot } from "../src/game/engine/insights";
import { checkAchievements, claimMilestone, openMilestones } from "../src/game/engine/progress";
import { cloneState, createInitialState } from "../src/game/engine/state";
import { tick } from "../src/game/engine/tick";
import { formatDuration, formatMoney, formatNumber } from "../src/game/format";
import type { GameState } from "../src/game/types";

const hours = Number(process.argv[2] ?? 8);
const STEP = 1;
let s = createInitialState(0);
let t = 0;
const seen = new Set<string>();
const log = (msg: string) => console.log(`${formatDuration(t).padStart(8)}  ${msg}`);

type Option = { label: string; cost: number; act: (g: GameState) => unknown; weight?: number };

function options(g: GameState): Option[] {
  const out: Option[] = [];
  const gm = snapshot(g).gm;
  for (const p of PLANTS) {
    if (Ch.plantLock(g, p.id)) continue;
    const plot = freePlot(g);
    const count = Ch.plantCount(g, p.id);
    // build each type once, later a second assembly feeder line
    if (count >= (p.id === "bodyWorks" ? 2 : 1)) continue;
    if (plot) out.push({ label: `build ${p.id}`, cost: Ch.plantBuildCost(g, p.id), act: (x) => C.buildStructure(x, plot, p.id), weight: 0.5 });
  }
  if (!freePlot(g)) {
    const z = C.nextZone(g);
    if (z && !C.zoneBlocker(g, z.id)) out.push({ label: `zone ${z.id}`, cost: ZONE_BY_ID[z.id].cost, act: (x) => C.unlockZone(x, z.id) });
  }
  for (const [id, b] of Ch.plantsOf(g)) {
    const push = (label: string, cost: number | null, act: (x: GameState) => unknown, weight = 1) => {
      if (cost !== null) out.push({ label: `${label} ${b.type}`, cost, act, weight });
    };
    push("level", Ch.levelCost(b, gm), (x) => Ch.upgradePlantLevel(x, id, snapshot(x).gm));
    push("speed", Ch.speedCost(b, gm), (x) => Ch.upgradePlantSpeed(x, id, snapshot(x).gm));
    push("auto", Ch.automationCost(b, gm), (x) => Ch.upgradeAutomation(x, id, snapshot(x).gm));
    // grades that unlock the next car model come first
    const nextCar = CARS.find((c) => Ch.carLock(g, c, gm) !== null);
    const needed = nextCar && Ch.hasPlant(g, "assemblyPlant") && b.plant.grade < nextCar.grade;
    push("grade", Ch.gradeCost(b, gm), (x) => Ch.upgradeGrade(x, id, snapshot(x).gm), needed ? 0.3 : 3);
  }
  for (const d of DEALERS) {
    if (!g.dealers[d.id].owned && A.canOpenDealers(g)) out.push({ label: `dealer ${d.id}`, cost: d.cost, act: (x) => A.buyDealer(x, d.id), weight: 0.3 });
    else if (g.dealers[d.id].owned) out.push({ label: `dealerUp ${d.id}`, cost: dealerUpgradeCost(g, d.id), act: (x) => A.upgradeDealer(x, d.id), weight: 3 });
  }
  for (const m of MANAGERS) {
    if (!g.managers[m.id].hired && A.isManagerUnlocked(g, m.id)) {
      const target = Ch.plantsOf(g).find(([id]) => !Object.values(g.managers).some((mm) => mm.assignedTo === id))?.[0];
      out.push({ label: `hire ${m.id}`, cost: m.cost, act: (x) => A.hireManager(x, m.id, target), weight: 2 });
    }
  }
  for (const c of CARS) {
    const cost = Ch.carLock(g, c, gm) === null ? carModelCost(g, c.id, gm) : null;
    if (cost !== null) out.push({ label: `refine ${c.id}`, cost, act: (x) => A.upgradeCarModel(x, c.id), weight: 2 });
  }
  return out;
}

const marks: [string, (g: GameState) => boolean][] = [
  ["first body", (g) => g.lifetime.parts.body >= 1],
  ["first sale", (g) => g.lifetime.moneyEarned > 0],
  ["100 bodies", (g) => g.lifetime.parts.body >= 100],
  ...PLANTS.map((p) => [`${p.id} built`, (g: GameState) => Ch.hasPlant(g, p.id)] as [string, (g: GameState) => boolean]),
  ["FIRST CAR", (g) => g.lifetime.carsProduced >= 1],
  ["dealership", (g) => DEALERS.some((d) => g.dealers[d.id].owned)],
  ["first car sold", (g) => g.lifetime.carsSold >= 1],
  ["100 cars sold", (g) => g.lifetime.carsSold >= 100],
  ...CARS.map((c) => [`model ${c.id}`, (g: GameState) => g.lifetime.carsByType[c.id] > 0] as [string, (g: GameState) => boolean]),
  ["$1M earned", (g) => g.lifetime.moneyEarned >= 1e6],
  ["$1B earned", (g) => g.lifetime.moneyEarned >= 1e9],
];

const end = hours * 3600;
let nextReport = 600;
while (t < end) {
  tick(s, STEP);
  t += STEP;
  checkAchievements(s);
  for (const m of openMilestones(s, 3)) claimMilestone(s, m.id);
  for (const r of RESEARCH) if (A.canResearch(s, r.id) && s.rp >= r.cost) A.doResearch(s, r.id);
  // buy the cheapest affordable thing (weighted), a few per second
  for (let i = 0; i < 5; i++) {
    const opts = options(s).filter((o) => o.cost <= s.cash).sort((a, b) => a.cost * (a.weight ?? 1) - b.cost * (b.weight ?? 1));
    if (!opts.length) break;
    const g = cloneState(s);
    if (opts[0].act(g)) s = g;
    else break;
  }
  for (const [label, test] of marks) {
    if (!seen.has(label) && test(s)) {
      seen.add(label);
      log(`${label.padEnd(26)} cash ${formatMoney(s.cash).padStart(9)}  rate ${formatMoney(s.chain.rate)}/s`);
    }
  }
  if (t >= nextReport) {
    nextReport += 1800;
    const plants = Ch.plantsOf(s).map(([, b]) => `${b.type.replace(/Factory|Works|Plant/, "")}${b.level}/${b.plant.speed}/${b.plant.grade}`).join(" ");
    log(`· earned ${formatMoney(s.lifetime.moneyEarned)} rate ${formatMoney(s.chain.rate)}/s trucks ${s.chain.shipments.length} cars ${formatNumber(s.lifetime.carsProduced)} | ${plants}`);
  }
}
if (process.env.DEBUG) {
  const opts = options(s).sort((a, b) => a.cost - b.cost);
  console.log("free plot:", freePlot(s), "zones:", s.city.zones.join(","), "cash", formatMoney(s.cash));
  console.log(opts.filter((o) => /build|zone/.test(o.label)).map((o) => `${o.label} ${formatMoney(o.cost)}`).join("\n"));
  console.log("dealers", JSON.stringify(s.chain.dealers));
}
