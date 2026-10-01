/**
 * Balance simulator: a greedy bot plays the real engine and logs when it hits
 * each milestone. Used to tune config/ so the early game is fast and the late
 * game slows down. Run: npm run simulate -- [hours]
 */
import { CARS } from "../src/game/config/cars";
import { DEALERS } from "../src/game/config/dealerships";
import { FACTORIES } from "../src/game/config/factories";
import { MANAGERS } from "../src/game/config/managers";
import { RESEARCH } from "../src/game/config/research";
import { UPGRADE_IDS } from "../src/game/config/upgrades";
import * as A from "../src/game/engine/actions";
import {
  carModelCost,
  dealerUpgradeCost,
  levelPurchase,
  lineCost,
  managerUpgradeCost,
  snapshot,
  unlockedCarIds,
  upgradeCost,
} from "../src/game/engine/economy";
import { canPrestige, pendingPoints, prestige } from "../src/game/engine/prestige";
import { checkAchievements, claimMilestone, openMilestones } from "../src/game/engine/progress";
import { cloneState, createInitialState } from "../src/game/engine/state";
import { tick } from "../src/game/engine/tick";
import { formatDuration, formatMoney } from "../src/game/format";
import type { GameState } from "../src/game/types";

const hours = Number(process.argv[2] ?? 6);
const STEP = 2;
const s = createInitialState(0);
let t = 0;
const seen = new Set<string>();
const log = (msg: string) => console.log(`${formatDuration(t).padStart(8)}  ${msg}`);

type Option = { label: string; cost: number; act: (g: GameState) => unknown };

function options(g: GameState): Option[] {
  const out: Option[] = [];
  for (const f of FACTORIES) {
    const st = g.factories[f.id];
    if (!st.owned) {
      out.push({ label: `buy ${f.name}`, cost: f.cost, act: (x) => A.buyFactory(x, f.id) });
      continue;
    }
    out.push({ label: `level ${f.id}`, cost: levelPurchase(g, f.id, 1).cost, act: (x) => A.buyLevels(x, f.id, 1) });
    const lc = lineCost(g, f.id);
    if (lc !== null) out.push({ label: `line ${f.id}`, cost: lc, act: (x) => A.buyLine(x, f.id) });
    for (const u of UPGRADE_IDS) {
      const c = upgradeCost(g, f.id, u);
      if (c !== null) out.push({ label: `${u} ${f.id}`, cost: c, act: (x) => A.buyUpgrade(x, f.id, u) });
    }
  }
  for (const d of DEALERS) {
    if (!g.dealers[d.id].owned) out.push({ label: `dealer ${d.id}`, cost: d.cost, act: (x) => A.buyDealer(x, d.id) });
    else out.push({ label: `dealer+ ${d.id}`, cost: dealerUpgradeCost(g, d.id), act: (x) => A.upgradeDealer(x, d.id) });
  }
  const free = FACTORIES.filter((f) => g.factories[f.id].owned && !MANAGERS.some((m) => g.managers[m.id].assignedTo === f.id));
  for (const m of MANAGERS) {
    const st = g.managers[m.id];
    if (!st.hired && A.isManagerUnlocked(g, m.id) && free.length) {
      const target = free[free.length - 1].id;
      out.push({ label: `hire ${m.name}`, cost: m.cost, act: (x) => A.hireManager(x, m.id, target) });
    } else if (st.hired) {
      const c = managerUpgradeCost(g, m.id);
      if (c !== null) out.push({ label: `mgr+ ${m.name}`, cost: c, act: (x) => A.upgradeManager(x, m.id) });
    }
  }
  const unlocked = unlockedCarIds(g, snapshot(g).gm);
  for (const c of CARS) {
    if (!unlocked.has(c.id)) continue;
    const cost = carModelCost(g, c.id);
    if (cost !== null) out.push({ label: `model ${c.id}`, cost, act: (x) => A.upgradeCarModel(x, c.id) });
  }
  return out;
}

function income(g: GameState) {
  const snap = snapshot(g);
  return snap.incomePerSec;
}

function botStep() {
  // Early game: keep the manual garage busy, as a player would.
  A.startProduction(s, "garage");
  for (let i = 0; i < 4; i++) A.rush(s, "garage", 0.05);

  for (const r of RESEARCH.slice().sort((a, b) => a.cost - b.cost)) A.doResearch(s, r.id);
  for (const m of openMilestones(s, 25)) claimMilestone(s, m.id);

  for (let guard = 0; guard < 200; guard++) {
    const base = income(s);
    let best: { o: Option; score: number } | null = null;
    for (const o of options(s)) {
      if (!(o.cost > 0) || !Number.isFinite(o.cost)) continue;
      const trial = cloneState(s);
      trial.cash = o.cost + 1;
      if (!o.act(trial)) continue;
      const gain = income(trial) - base;
      // Payback time, with a small preference for things you can afford now.
      const wait = Math.max(0, (o.cost - s.cash) / Math.max(base, 1));
      const score = gain <= 0 ? -Infinity : gain / o.cost / (1 + wait / Number(process.env.PATIENCE ?? 600));
      if (!best || score > best.score) best = { o, score };
    }
    if (!best || best.score === -Infinity || s.cash < best.o.cost) break;
    best.o.act(s);
    if (process.env.TRACE) log(`  ${best.o.label} cost ${formatMoney(best.o.cost)} -> ${formatMoney(income(s))}/s cash ${formatMoney(s.cash)}`);
    const key = best.o.label;
    if (/^(buy|hire|dealer )/.test(key) && !seen.has(key)) {
      seen.add(key);
      log(`${key.padEnd(24)}| income ${formatMoney(income(s))}/s`);
    }
  }
}

const end = hours * 3600;
let lastReport = 0;
while (t < end) {
  botStep();
  tick(s, STEP);
  checkAchievements(s);
  t += STEP;

  for (const c of CARS) {
    const k = `car ${c.id}`;
    if (!seen.has(k) && s.lifetime.carsByType[c.id] > 0) {
      seen.add(k);
      log(`first ${c.name}`);
    }
  }
  for (const r of s.research) {
    if (!seen.has(r)) {
      seen.add(r);
      log(`research ${r}`);
    }
  }
  // Prestige once it at least doubles the points held.
  if (canPrestige(s) && pendingPoints(s) >= Math.max(3, s.empirePoints)) {
    log(`PRESTIGE +${pendingPoints(s)} EP (run earned ${formatMoney(s.run.moneyEarned)})`);
    prestige(s, t * 1000);
    for (const k of [...seen]) if (k.startsWith("buy") || k.startsWith("dealer")) seen.delete(k);
  }
  if (process.env.DUMP && t === Number(process.env.DUMP)) {
    const snap = snapshot(s);
    for (const f of FACTORIES) {
      const st = s.factories[f.id];
      if (!st.owned) continue;
      const fs = snap.factories[f.id]!;
      console.log(f.id, "L", st.level, "lines", st.lines, JSON.stringify(st.upgrades), fs.car.id, "value", formatMoney(fs.valuePerCar), "cycle", fs.cycleTime.toFixed(2), "inc", formatMoney(fs.incomeBeforeDealers));
    }
    console.log("models", JSON.stringify(s.carModels), "mgr", JSON.stringify(Object.fromEntries(Object.entries(s.managers).filter(([, m]) => m.hired).map(([k, m]) => [k, m.level + "@" + m.assignedTo]))));
    console.log("gm speed", snap.gm.speed, "income", snap.gm.income, "value", snap.gm.value.map((v) => v.toFixed(2)).join(","), "dealer", snap.dealers.multiplier.toFixed(2), "research", s.research.join(","));
  }
  if (t - lastReport >= Number(process.env.REPORT ?? 300)) {
    lastReport = t;
    log(`--- cash ${formatMoney(s.cash)}  income ${formatMoney(income(s))}/s  RP ${Math.floor(s.rp)}  EP ${s.empirePoints}  achievements ${s.achievements.length}`);
  }
}
