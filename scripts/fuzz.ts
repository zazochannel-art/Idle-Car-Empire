// Chaos test: thousands of random player actions across every system, the
// clock jumping forward, offline gaps, saves reloaded — checking after each
// step that nothing throws and the state stays sound.
// Run: npx tsx scripts/fuzz.ts [steps] [seed]
import { CARS } from "../src/game/config/cars";
import { PLANTS } from "../src/game/config/chain";
import { FACILITIES, SPECS, STRUCTURES, ZONES } from "../src/game/config/city";
import { DEALERS } from "../src/game/config/dealerships";
import { STAR_UPGRADES } from "../src/game/config/imperium";
import { LOGISTICS } from "../src/game/config/logistics";
import { MANAGERS } from "../src/game/config/managers";
import { RESEARCH } from "../src/game/config/research";
import { RACE_EVENTS, RACE_UPGRADES, SPECIAL_EVENTS, SPONSORS } from "../src/game/config/racing";
import { DESIGN_OPTIONS } from "../src/game/config/cars";
import { MATERIAL_IDS } from "../src/game/config/economy";
import { WORLD_MAP } from "../src/game/city/layout";
import * as A from "../src/game/engine/actions";
import * as Ch from "../src/game/engine/chain";
import * as C from "../src/game/engine/city";
import * as D from "../src/game/engine/design";
import * as K from "../src/game/engine/contracts";
import * as L from "../src/game/engine/logistics";
import * as M from "../src/game/engine/materials";
import * as P from "../src/game/engine/prestige";
import * as I from "../src/game/engine/imperium";
import * as Pr from "../src/game/engine/progress";
import * as Rc from "../src/game/engine/racing";
import * as Rt from "../src/game/engine/retention";
import { carBaseValue } from "../src/game/engine/chain";
import { snapshot } from "../src/game/engine/economy";
import { nextGoals } from "../src/game/engine/insights";
import { collectOffline, settleOffline } from "../src/game/engine/offline";
import { createInitialState } from "../src/game/engine/state";
import { tick } from "../src/game/engine/tick";
import { migrate } from "../src/game/save/serialize";
import { checkInvariants } from "./invariants";
import type { GameState } from "../src/game/types";

const steps = Number(process.argv[2] ?? 20_000);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

let now = Date.UTC(2026, 5, 1, 10);
let s: GameState = createInitialState(now);
s.tips = ["start", "engine", "market", "dealers"];
const issues = new Map<string, string>();
const report = (kind: string, msg: string, step: number) => {
  const key = `${kind}: ${msg.replace(/[-0-9.e]+/g, "#")}`;
  if (!issues.has(key)) {
    issues.set(key, `step ${step}: ${msg}`);
    console.log(`!! ${kind} step ${step}: ${msg}`);
  }
};

const plots = () => WORLD_MAP.plots.filter((p) => p.kind === "plot").map((p) => p.id);
const built = () => Object.keys(s.city.buildings);
const plantPlots = () => Object.entries(s.city.buildings).filter(([, b]) => b.plant).map(([id]) => id);
const garagePlots = () => Object.entries(s.city.buildings).filter(([, b]) => b.garage).map(([id]) => id);

const actions: [string, () => unknown][] = [
  ["rich", () => (s.cash += 10 ** (3 + Math.floor(rnd() * 7)))],
  ["zone", () => C.unlockZone(s, pick(ZONES).id)],
  ["build", () => C.buildStructure(s, pick(plots()), pick([...STRUCTURES.map((x) => x.id), ...PLANTS.map((x) => x.id)]))],
  ["upgradeBuilding", () => built().length && C.upgradeBuilding(s, pick(built()))],
  ["plantLevel", () => plantPlots().length && Ch.upgradePlantLevel(s, pick(plantPlots()), snapshot(s).gm)],
  ["plantSpeed", () => plantPlots().length && Ch.upgradePlantSpeed(s, pick(plantPlots()), snapshot(s).gm)],
  ["automation", () => plantPlots().length && Ch.upgradeAutomation(s, pick(plantPlots()), snapshot(s).gm)],
  ["grade", () => plantPlots().length && Ch.upgradeGrade(s, pick(plantPlots()), snapshot(s).gm)],
  ["warehouse", () => plantPlots().length && Ch.upgradeWarehouse(s, pick(plantPlots()), snapshot(s).gm)],
  ["power", () => plantPlots().length && Ch.upgradePower(s, pick(plantPlots()), snapshot(s).gm)],
  ["autoBuy", () => plantPlots().length && Ch.setAutoBuy(s, pick(plantPlots()), rnd() < 0.7)],
  ["combine", () => plantPlots().length && Ch.setCombine(s, pick(plantPlots()), rnd() < 0.5)],
  ["plantCar", () => plantPlots().length && Ch.setPlantCar(s, pick(plantPlots()), rnd() < 0.2 ? null : pick(CARS).id, snapshot(s).gm)],
  ["buyMaterial", () => plantPlots().length && M.buyMaterial(s, pick(plantPlots()), pick(MATERIAL_IDS), Math.floor(rnd() * 3000))],
  ["restock", () => {
    const id = plantPlots().length ? pick(plantPlots()) : null;
    const st = id ? snapshot(s).chain.plants[id] : null;
    return id && st && M.buyPlan(s, id, M.restockPlan(s, id, st.need, 10));
  }],
  ["hire", () => A.hireManager(s, pick(MANAGERS).id, plantPlots().length ? pick(plantPlots()) : undefined)],
  ["upgradeManager", () => A.upgradeManager(s, pick(MANAGERS).id)],
  ["assignManager", () => A.assignManager(s, pick(MANAGERS).id, rnd() < 0.2 || !plantPlots().length ? null : pick(plantPlots()))],
  ["buyDealer", () => A.buyDealer(s, pick(DEALERS).id)],
  ["upgradeDealer", () => A.upgradeDealer(s, pick(DEALERS).id)],
  ["carModel", () => A.upgradeCarModel(s, pick(CARS).id)],
  ["research", () => {
    s.rp += rnd() < 0.1 ? 1e6 : 0;
    return A.doResearch(s, pick(RESEARCH).id);
  }],
  ["logistics", () => L.buyLogistics(s, pick(LOGISTICS).id)],
  ["tier", () => L.buyTier(s)],
  ["design", () => {
    const car = pick(CARS);
    const opt = pick(DESIGN_OPTIONS).id;
    return D.develop(s, car.id, opt, D.developCost(carBaseValue(s, car, snapshot(s).gm), s.designs[car.id], opt));
  }],
  ["rename", () => D.renameDesign(s, pick(CARS).id, rnd() < 0.1 ? "" : `Model ${Math.floor(rnd() * 99)}`)],
  ["color", () => D.setDesignColor(s, pick(CARS).id, pick(["#ff0000", "#00ff00", "", "nonsense"]))],
  ["facility", () => {
    const g = garagePlots();
    if (!g.length) return;
    const id = pick(g);
    return C.placeFacility(s, id, pick(FACILITIES).id, Math.floor(rnd() * 10), Math.floor(rnd() * 10), rnd() < 0.5 ? 0 : 1);
  }],
  ["removeFacility", () => {
    const g = garagePlots();
    if (!g.length) return;
    const id = pick(g);
    const f = s.city.buildings[id].garage!.facilities;
    return f.length && C.removeFacility(s, id, pick(f).uid);
  }],
  ["worker", () => garagePlots().length && C.hireWorker(s, pick(garagePlots()))],
  ["spec", () => garagePlots().length && C.setSpecialization(s, pick(garagePlots()), pick(SPECS).id)],
  ["contractAccept", () => K.acceptContract(s, now)],
  ["contractDecline", () => K.declineContract(s, now)],
  ["contractClaim", () => K.claimContract(s, now, snapshot(s))],
  ["daily", () => {
    Pr.refreshDaily(s, now, snapshot(s));
    return s.missions.daily.length && Pr.claimDaily(s, pick(s.missions.daily).id);
  }],
  ["milestone", () => {
    const m = Pr.openMilestones(s, 3);
    return m.length && Pr.claimMilestone(s, pick(m).id);
  }],
  ["login", () => {
    Rt.updateLogin(s, now);
    return Rt.claimLogin(s, snapshot(s));
  }],
  ["prestige", () => rnd() < 0.02 && P.prestige(s, now)],
  ["imperium", () => rnd() < 0.01 && I.imperium(s, now)],
  ["star", () => {
    s.stars += rnd() < 0.1 ? 50 : 0;
    return I.buyStarUpgrade(s, pick(STAR_UPGRADES).id);
  }],
  // racing
  ["racingUnlock", () => Rc.unlockRacing(s)],
  ["raceOrder", () => Rc.orderRaceCar(s, pick(CARS).id)],
  ["raceCancel", () => Rc.cancelOrder(s, pick(CARS).id)],
  ["raceArrive", () => s.racing.unlocked && rnd() < 0.3 && s.racing.arrivals.push(pick(CARS).id)],
  ["raceEnter", () => {
    if (rnd() < 0.2) s.racing.rep += 2000;
    return Rc.enterRace(s, pick(RACE_EVENTS).id, rnd() < 0.2 ? pick(SPECIAL_EVENTS).id : undefined);
  }],
  ["raceRepair", () => s.racing.cars.length && Rc.repairCar(s, pick(s.racing.cars).id)],
  ["raceUpgrade", () => s.racing.cars.length && Rc.upgradeRaceCar(s, pick(s.racing.cars).id, pick(RACE_UPGRADES), rnd() < 0.5)],
  ["raceSkin", () => s.racing.cars.length && Rc.setSkin(s, pick(s.racing.cars).id, pick(s.racing.skins))],
  ["raceRetire", () => s.racing.cars.length && rnd() < 0.2 && Rc.retireRaceCar(s, pick(s.racing.cars).id)],
  ["raceGarage", () => Rc.upgradeGarage(s)],
  ["sponsor", () => Rc.signSponsor(s, rnd() < 0.1 ? null : pick(SPONSORS).id)],
  ["auto", () => Rc.setAutoRacing(s, rnd() < 0.7)],
  ["select", () => s.racing.cars.length && (s.racing.selected = pick(s.racing.cars).id)],
  ["autoUpgrade", () => plantPlots().length && (s.city.buildings[pick(plantPlots())].plant!.auto = rnd() < 0.5)],
];

for (let step = 0; step < steps; step++) {
  const [name, fn] = pick(actions);
  try {
    fn();
  } catch (e) {
    report("THROW", `${name}: ${(e as Error).message}\n${(e as Error).stack?.split("\n").slice(1, 4).join("\n")}`, step);
  }
  // time passes
  try {
    const r = rnd();
    if (r < 0.02) {
      // away for a while
      const gap = 60_000 * (5 + rnd() * 600);
      s.lastActiveAt = now;
      now += gap;
      settleOffline(s, now);
      if (rnd() < 0.8) collectOffline(s);
    } else {
      const dt = r < 0.7 ? 0.1 : r < 0.95 ? 2 : 30;
      const n = dt === 30 ? 15 : 1;
      for (let i = 0; i < n; i++) tick(s, dt / n);
      now += dt * 1000;
      s.lastActiveAt = now;
    }
    Ch.autoUpgrade(s, snapshot(s).gm);
    K.refreshContracts(s, now, snapshot(s));
    Pr.checkAchievements(s, snapshot(s));
    Rt.checkRivals(s, now);
    nextGoals(s, snapshot(s), 3);
  } catch (e) {
    report("THROW", `tick after ${name}: ${(e as Error).message}\n${(e as Error).stack?.split("\n").slice(1, 4).join("\n")}`, step);
  }
  for (const pr of checkInvariants(s)) report("INVARIANT", `after ${name}: ${pr}`, step);
  // reload the save now and then
  if (step % 500 === 499) {
    try {
      const back = migrate(JSON.parse(JSON.stringify(s)), now);
      const diffs: string[] = [];
      if (Math.abs(back.cash - s.cash) > 1e-6 * Math.max(1, s.cash)) diffs.push(`cash ${s.cash} → ${back.cash}`);
      if (Object.keys(back.city.buildings).length !== Object.keys(s.city.buildings).length) diffs.push("buildings");
      if (back.racing.cars.length !== s.racing.cars.length) diffs.push("race cars");
      if (back.chain.shipments.length !== s.chain.shipments.length) diffs.push(`shipments ${s.chain.shipments.length} → ${back.chain.shipments.length}`);
      if (JSON.stringify(back.racing.live?.id) !== JSON.stringify(s.racing.live?.id)) diffs.push("live race");
      if (back.research.length !== s.research.length) diffs.push("research");
      if (diffs.length) report("SAVE", diffs.join(", "), step);
      s = back;
    } catch (e) {
      report("SAVE", `throws: ${(e as Error).message}`, step);
    }
  }
}
console.log(`\n${steps} steps, ${issues.size} distinct issues. cash ${s.cash.toExponential(2)} buildings ${Object.keys(s.city.buildings).length} prestige ${s.prestigeCount} race cars ${s.racing.cars.length} races ${s.racing.stats.races}`);
