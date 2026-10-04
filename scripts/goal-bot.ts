// A "new player" that only does what the What's-next goals suggest.
// Run: npx tsx scripts/goal-bot.ts [hours] [q = quiet] [race] [full] [sessions] [audit] [save.json]
//   full: also uses every system a player would (research, sponsors, event
//         objectives, marketing, prestige) and lives on the real clock (events)
//   sessions: plays 1 h, then is away 7 h (offline simulation), repeatedly
import { writeFileSync } from "node:fs";
import * as Ch from "../src/game/engine/chain";
import { buildStructure, unlockZone } from "../src/game/engine/city";
import { snapshot } from "../src/game/engine/economy";
import { buyPlan, restockPlan } from "../src/game/engine/materials";
import { createInitialState } from "../src/game/engine/state";
import { tick } from "../src/game/engine/tick";
import { buyDealer, hireManager, upgradeDealer } from "../src/game/engine/actions";
import { freePlot, nextGoals, restockLow } from "../src/game/engine/insights";
import { formatMoney } from "../src/game/format";
import { checkInvariants } from "./invariants";
import * as Rc from "../src/game/engine/racing";
import { RACING_DISTRICT } from "../src/game/config/racing";
import { CAR_BY_ID } from "../src/game/config/cars";
import { RESTOCK_UNITS } from "../src/game/config/economy";
import { RESEARCH } from "../src/game/config/research";
import { SPONSORS } from "../src/game/config/racing";
import { doResearch } from "../src/game/engine/actions";
import { claimEventGoal } from "../src/game/engine/events";
import { campaignCost, startCampaign } from "../src/game/engine/showroom";
import { canPrestige, pendingPoints, prestige } from "../src/game/engine/prestige";
import { collectOffline, settleOffline } from "../src/game/engine/offline";
import { brandScore } from "../src/game/engine/brand";

const hours = Number(process.argv[2] ?? 3);
const quiet = ["q", "race", "full", "sessions"].includes(process.argv[3]);
const full = process.argv.includes("full");
const sessions = process.argv.includes("sessions");
const racing = process.argv.includes("race") || full;
const audit = process.argv.includes("audit");
/** Where to write the final save: the first argument after the hours that is a file name, not a flag. */
const savePath = process.argv.slice(4).find((a) => !["q", "race", "audit", "full", "sessions"].includes(a));
const problems = new Map<string, string>();
const s = createInitialState(0);
s.tips = ["start", "engine", "market", "dealers"];
const fmtT = (t: number) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}m${String(t % 60).padStart(2, "0")}`;
let snap = snapshot(s);
let lastKey = "";
let idleSince = 0;
let rescues = 0;
let maxOwed = 0;
let prev: Record<string, number> = { ...s.chain.ledger.run };
/** A player who races whenever an event is open (the most racing can bring). */
function raceStep(t: number) {
  const R = s.racing;
  if (!R.unlocked) {
    if (Rc.racingBlocker(s) === null && s.cash > RACING_DISTRICT.cost * 3) Rc.unlockRacing(s);
    return;
  }
  const best = Rc.orderableCars(s).sort((a, b) => CAR_BY_ID[b].tier - CAR_BY_ID[a].tier)[0];
  const rc = Rc.raceCar(s, R.selected);
  // trade up to a better platform when one is built
  if (best && (!rc || CAR_BY_ID[best].tier > CAR_BY_ID[rc.car].tier) && !R.orders.length && !R.arrivals.length) {
    if (rc && Rc.racingFleet(s) >= Rc.garageLevel(s).slots) Rc.retireRaceCar(s, rc.id);
    Rc.orderRaceCar(s, best);
  }
  if (R.cars.length && R.selected !== R.cars[R.cars.length - 1].id) R.selected = R.cars[R.cars.length - 1].id;
  const car = Rc.raceCar(s, R.selected);
  if (!car) return;
  const gc = Rc.garageUpgradeCost(s);
  if (gc !== null && s.cash > gc * 6) Rc.upgradeGarage(s);
  if (Rc.condition(car) < 0.6) Rc.repairCar(s, car.id);
  for (const u of ["engine", "tires", "transmission", "suspension", "brakes", "aero"] as const) {
    const c = Rc.raceUpgradeCost(s, car, u);
    if (c && s.cash > c.money * 8 && !Rc.upgradeRaceCar(s, car.id, u, R.parts >= c.racingParts)) Rc.upgradeRaceCar(s, car.id, u);
  }
  if (!R.live) {
    const ev = Rc.bestEventFor(s, car);
    if (ev) Rc.enterRace(s, ev.id);
  }
  void t;
}
/** The rest of a player's toolbox (full mode): research, sponsors, event objectives, marketing, prestige. */
/** FULL_SKIP=research,sponsor,event,campaign,prestige switches parts of the full player off (to measure each). */
const skip = new Set((process.env.FULL_SKIP ?? "").split(",").filter(Boolean));
function fullStep(t: number) {
  // research: the cheapest node open
  const node = RESEARCH.filter((r) => !s.research.includes(r.id) && r.requires.every((q) => s.research.includes(q)) && r.cost <= s.rp).sort((a, b) => a.cost - b.cost)[0];
  if (node && !skip.has("research") && doResearch(s, node.id)) counts.research = (counts.research ?? 0) + 1;
  // the best sponsor it can sign
  const sp = [...SPONSORS].reverse().find((x) => s.racing.rep >= x.minRep);
  if (sp && !skip.has("sponsor") && s.racing.sponsor !== sp.id && s.racing.unlocked && Rc.signSponsor(s, sp.id)) counts.sponsor = (counts.sponsor ?? 0) + 1;
  if (!skip.has("event") && claimEventGoal(s, s.lastActiveAt) !== null) counts.eventGoal = (counts.eventGoal ?? 0) + 1;
  // marketing when it is cheap next to the cash
  if (!skip.has("campaign") && s.cash > campaignCost(s) * 20 && startCampaign(s)) counts.campaign = (counts.campaign ?? 0) + 1;
  // a new region once it brings a good handful of points
  if (!skip.has("prestige") && canPrestige(s) && pendingPoints(s) >= Math.max(3, s.empirePointsEarned)) {
    const pts = prestige(s, s.lastActiveAt);
    console.log(`>> prestige at ${fmtT(t)}: +${pts} points`);
    counts.prestige = (counts.prestige ?? 0) + 1;
  }
}

/** Horizons the economy is checked at. */
const CHECKPOINTS = [15 * 60, 3600, 3 * 3600, 10 * 3600, 24 * 3600, 72 * 3600, 168 * 3600];
function checkpoint(t: number) {
  const sn = snapshot(s);
  console.log(
    `@@ ${fmtT(t).padEnd(10)} earned ${formatMoney(s.lifetime.moneyEarned).padStart(9)} cash ${formatMoney(s.cash).padStart(9)} steady ${formatMoney(Math.max(0, s.chain.steady ?? s.chain.rate)).padStart(8)}/s` +
      ` cars ${String(Math.floor(s.lifetime.carsProduced)).padStart(6)} plants ${Ch.plantsOf(s).length} research ${s.research.length} rp/s ${sn.rpPerSec.toFixed(1)} prestige ${s.prestigeCount}` +
      ` race ${s.racing.stats.races}/${s.racing.stats.wins} rep ${Math.round(s.racing.rep)} brand ${brandScore(s)} owed ${formatMoney(s.chain.owed)}`,
  );
}

const counts: Record<string, number> = {};
for (let t = 0; t < hours * 3600; t++) {
  if (full) s.lastActiveAt = t * 1000;
  if (CHECKPOINTS.includes(t)) checkpoint(t);
  // away 7 h after every hour of play
  if (sessions && t > 0 && t % (8 * 3600) === 3600) {
    const back = (t + 7 * 3600) * 1000;
    s.lastActiveAt = t * 1000;
    const rep = settleOffline(s, back);
    const got = collectOffline(s);
    const led = rep?.ledger ? Object.entries(rep.ledger).filter(([, v]) => Math.abs(v) > 1).map(([k, v]) => `${k} ${formatMoney(v)}`).join(", ") : "";
    console.log(`   .. away 7h at ${fmtT(t)}: +${formatMoney(got)} (${rep?.cars ?? 0} cars; races ${rep?.racing?.races ?? 0} prize ${formatMoney(rep?.racing?.prize ?? 0)}) ${led}`);
    for (const c of CHECKPOINTS) if (c > t && c <= t + 7 * 3600) checkpoint(c);
    t += 7 * 3600;
    snap = snapshot(s);
    if (full) s.lastActiveAt = t * 1000;
  }
  if (t % 5 === 0) snap = snapshot(s);
  const before = s.cash;
  const owedBefore = s.chain.owed;
  const hadCar = s.chain.firstCar;
  const hadAsm = Ch.hasPlant(s, "assemblyPlant");
  tick(s, 1, snap);
  if (!hadAsm && Ch.hasPlant(s, "assemblyPlant")) console.log(`>> assembly plant at ${fmtT(t)}`);
  if (!hadCar && s.chain.firstCar) console.log(`>> first car at ${fmtT(t)}`);
  if (owedBefore > 0 && s.chain.owed === 0 && s.cash > before + 40 && s.cash < 1000) rescues++;
  maxOwed = Math.max(maxOwed, s.chain.owed);
  if (t % 600 === 0 && t > 0) {
    const L = s.chain.ledger.run;
    const d = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, Math.round((v - (prev[k] ?? 0)) / 600)]));
    prev = { ...L };
    const st = Ch.plantsOf(s).map(([, b]) => `${b.type.slice(0, 4)}:${b.plant.status}${b.type === "assemblyPlant" ? "/" + Math.floor(b.plant.out) : ""}`).join(" ");
    const dl = Object.entries(s.chain.dealers).map(([k, v]) => `${k}:${Math.floor(v?.cars ?? 0)}`).join(",");
    console.log(`   ~ ${fmtT(t)} per s: ${JSON.stringify(d)} | ${st} | dealers ${dl} | sold ${s.lifetime.carsSold}${racing ? ` | rep ${Math.round(s.racing.rep)} races ${s.racing.stats.races} wins ${s.racing.stats.wins} car ${Rc.raceCar(s, s.racing.selected)?.car ?? "-"}` : ""}`);
  }
  if (audit && t % 5 === 0)
    for (const pr of checkInvariants(s)) {
      const key = pr.replace(/[-0-9.e]+/g, "#");
      if (!problems.has(key)) {
        problems.set(key, `${fmtT(t)} ${pr}`);
        console.log(`!! INVARIANT ${fmtT(t)} ${pr}`);
      }
    }
  if (t % 10 !== 0) continue;
  const goals = nextGoals(s, snap, 2);
  const key = goals.map((g) => g.kind + ("plant" in g && typeof g.plant === "string" ? ":" + g.plant : "") + ("what" in g && g.what ? ":" + g.what : "")).join(" | ");
  if (key !== lastKey) {
    if (!quiet) console.log(`${fmtT(t)}  cash ${formatMoney(s.cash).padStart(8)} owed ${formatMoney(s.chain.owed).padStart(6)} rate ${formatMoney(s.chain.rate)}/s  goals: ${key}`);
    lastKey = key;
  }
  let acted = false;
  // a focused player: the top goal, or the second one while the first only needs waiting
  for (const g of goals.filter((g, i) => i === 0 || goals[0].kind === "made" || ("cost" in goals[0] && (goals[0].cost ?? 0) > s.cash && g.kind !== "upgrade"))) {
    const cost = ("cost" in g && g.cost !== undefined ? g.cost : 0) + (g.kind === "plant" ? g.reserve : 0);
    if (cost > s.cash) continue;
    const gm = snap.gm;
    switch (g.kind) {
      case "plant": { const p = freePlot(s); acted = !!p && buildStructure(s, p, g.plant); break; }
      case "upgrade": case "shortage": if ("what" in g && g.what) acted = g.what === "speed" ? Ch.upgradePlantSpeed(s, g.plot, gm) : Ch.upgradePlantLevel(s, g.plot, gm); break;
      case "materials": { const st = snap.chain.plants[g.plot]; acted = restockLow(s, snap) > 0 || (!!st && buyPlan(s, g.plot, restockPlan(s, g.plot, st.need, RESTOCK_UNITS))); break; }
      case "dealer": acted = buyDealer(s, g.dealer); break;
      case "dealerFull": acted = g.open ? buyDealer(s, g.dealer) : upgradeDealer(s, g.dealer); break;
      case "car": if (g.plot && g.cost !== undefined) acted = Ch.upgradeGrade(s, g.plot, gm); break;
      case "autoBuy": for (const p of g.plots) Ch.setAutoBuy(s, p, true); acted = true; break;
      case "warehouse": acted = Ch.upgradeWarehouse(s, g.plot, gm); break;
      case "zone": acted = unlockZone(s, g.zone); break;
      case "manager": acted = hireManager(s, g.manager); break;
    }
    if (acted) { counts[g.kind] = (counts[g.kind] ?? 0) + 1; break; }
  }
  if (racing) raceStep(t);
  if (full) fullStep(t);
  if (acted) idleSince = t;
  else if (t - idleSince === 1800) console.log(`${fmtT(t)}  !! 30 min with nothing the goals let me do (cash ${formatMoney(s.cash)})`);
}
checkpoint(hours * 3600);
console.log("\nactions:", counts, "rescues:", rescues, "max owed:", formatMoney(maxOwed));
console.log("rp", Math.round(s.rp), "rp/s", snapshot(s).rpPerSec.toFixed(3));
console.log("cars made", Math.floor(s.lifetime.carsProduced), "sold", s.lifetime.carsSold, "earned", formatMoney(s.lifetime.moneyEarned), "cash", formatMoney(s.cash));
for (const [id, b] of Ch.plantsOf(s)) console.log(" ", id, b.type, "L" + b.level, "spd" + b.plant.speed, b.plant.status, JSON.stringify(b.plant.stock));
{
  const sn = snapshot(s);
  for (const d of Object.values(sn.chain.dealers)) if (d) console.log("dealer", d.id, "cap", d.stockCap, "stock", s.chain.dealers[d.id]?.cars, JSON.stringify(Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === "number"))));
  for (const [id, b] of Ch.plantsOf(s)) if (b.type === "assemblyPlant") { const st = sn.chain.plants[id]; console.log("asm", "out", b.plant.out, "outCap", st?.outCap, "fleet", b.plant.fleet, "load", st?.load, "status", b.plant.status, "ships", s.chain.shipments.filter((x) => x.from === id).length); }
}
// optional: write the end state as a save file (to load it in the browser)
if (savePath) {
  s.lastActiveAt = Date.now();
  writeFileSync(savePath, JSON.stringify({ version: 1, savedAt: Date.now(), state: s }));
}
