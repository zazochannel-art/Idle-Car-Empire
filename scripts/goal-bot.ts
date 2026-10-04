// A "new player" that only does what the What's-next goals suggest.
// Run: npx tsx scripts/goal-bot.ts [hours] [q = quiet] [save.json]
import { writeFileSync } from "node:fs";
import * as Ch from "../src/game/engine/chain";
import { buildStructure, unlockZone } from "../src/game/engine/city";
import { snapshot } from "../src/game/engine/economy";
import { buyPlan, restockPlan } from "../src/game/engine/materials";
import { createInitialState } from "../src/game/engine/state";
import { tick } from "../src/game/engine/tick";
import { buyDealer, hireManager, upgradeDealer } from "../src/game/engine/actions";
import { freePlot, nextGoals } from "../src/game/engine/insights";
import { formatMoney } from "../src/game/format";
import { RESTOCK_UNITS } from "../src/game/config/economy";

const hours = Number(process.argv[2] ?? 3);
const quiet = process.argv[3] === "q";
const s = createInitialState(0);
s.tips = ["start", "engine", "market", "dealers"];
const fmtT = (t: number) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}m${String(t % 60).padStart(2, "0")}`;
let snap = snapshot(s);
let lastKey = "";
let idleSince = 0;
let rescues = 0;
let maxOwed = 0;
let prev: Record<string, number> = { ...s.chain.ledger.run };
const counts: Record<string, number> = {};
for (let t = 0; t < hours * 3600; t++) {
  if (t % 5 === 0) snap = snapshot(s);
  const before = s.cash;
  const owedBefore = s.chain.owed;
  tick(s, 1, snap);
  if (owedBefore > 0 && s.chain.owed === 0 && s.cash > before + 40 && s.cash < 1000) rescues++;
  maxOwed = Math.max(maxOwed, s.chain.owed);
  if (t % 600 === 0 && t > 0) {
    const L = s.chain.ledger.run;
    const d = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, Math.round((v - (prev[k] ?? 0)) / 600)]));
    prev = { ...L };
    const st = Ch.plantsOf(s).map(([, b]) => `${b.type.slice(0, 4)}:${b.plant.status}${b.type === "assemblyPlant" ? "/" + Math.floor(b.plant.out) : ""}`).join(" ");
    const dl = Object.entries(s.chain.dealers).map(([k, v]) => `${k}:${Math.floor(v?.cars ?? 0)}`).join(",");
    console.log(`   ~ ${fmtT(t)} per s: ${JSON.stringify(d)} | ${st} | dealers ${dl} | sold ${s.lifetime.carsSold}`);
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
      case "materials": { const st = snap.chain.plants[g.plot]; if (st) acted = buyPlan(s, g.plot, restockPlan(s, g.plot, st.need, RESTOCK_UNITS)); break; }
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
  if (acted) idleSince = t;
  else if (t - idleSince === 1800) console.log(`${fmtT(t)}  !! 30 min with nothing the goals let me do (cash ${formatMoney(s.cash)})`);
}
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
if (process.argv[4]) {
  s.lastActiveAt = Date.now();
  writeFileSync(process.argv[4], JSON.stringify({ version: 1, savedAt: Date.now(), state: s }));
}
