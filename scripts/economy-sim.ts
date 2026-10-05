// Plays the economy with a simple, sensible bot and reports how fast a
// player progresses: when each plant is built, the first car, money
// milestones, and income over time. Run: npx tsx scripts/economy-sim.ts [hours]
import { PLANTS } from "../src/game/config/chain";
import { ZONES } from "../src/game/config/city";
import { WORLD_MAP } from "../src/game/city/layout";
import * as Ch from "../src/game/engine/chain";
import { buildStructure, unlockZone } from "../src/game/engine/city";
import { freePlotFor } from "../src/game/engine/construction";
import { snapshot } from "../src/game/engine/economy";
import { buyMaterial, maxOrder, shortfall, stockTotal, warehouseCap } from "../src/game/engine/materials";
import { createInitialState } from "../src/game/engine/state";
import { tick } from "../src/game/engine/tick";
import { upgradeDealer } from "../src/game/engine/actions";
import { dealerUpgradeCost } from "../src/game/engine/economy";
import { formatMoney } from "../src/game/format";
import type { MaterialId } from "../src/game/config/economy";
import type { PlantType, StructureType } from "../src/game/types";

const hours = Number(process.argv[2] ?? 8);
const s = createInitialState(0);
s.tips = ["start", "engine", "market", "dealers"];
const log: string[] = [];
const seen = new Set<string>();
const mark = (key: string, t: number, extra = "") => {
  if (seen.has(key)) return;
  seen.add(key);
  log.push(`${fmtT(t).padStart(8)}  ${key}${extra ? "  " + extra : ""}  cash ${formatMoney(s.cash)}`);
};
const fmtT = (t: number) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}m`;

const order: PlantType[] = PLANTS.map((p) => p.id).filter((id) => id !== "batteryFactory");
let snap = snapshot(s);
const freePlot = (type: StructureType) => freePlotFor(s, type) ?? undefined;
let lastIncome = 0;
let prev = { ...s.chain.ledger.run };
for (let t = 0; t < hours * 3600; t++) {
  if (t % 5 === 0) snap = snapshot(s);
  tick(s, 1, snap);
  // every 20 s the "player" looks at the factories
  if (t % 20 !== 0) continue;
  for (const [id, b] of Ch.plantsOf(s)) {
    const st = snap.chain.plants[id];
    if (!st || !PLANTS.find((p) => p.id === b.type)?.item) continue;
    // keep materials for a while of production in stock
    const units = Math.max(4, Math.floor((warehouseCap(b.plant) / Math.max(1, stockTotal(st.need))) * 0.8));
    const want = shortfall(b.plant, st.need, units);
    const coming = s.chain.shipments.some((sh) => !sh.back && sh.to === id && sh.materials);
    // buy evenly what the cash allows (the scarcest material first)
    if (!coming)
      for (const [m, n] of Object.entries(want) as [MaterialId, number][]) {
        const q = Math.min(n, maxOrder(s, id, m));
        if (q >= 1) buyMaterial(s, id, m, q);
      }
  }
  // build the next plant in the chain when affordable
  for (const type of order) {
    if (Ch.hasPlant(s, type)) continue;
    if (Ch.plantLock(s, type) || Object.values(s.city.sites).some((st) => st.type === type)) break;
    let plot = freePlot(type);
    if (!plot) {
      const z = ZONES.find((z) => !s.city.zones.includes(z.id));
      if (z && s.cash > z.cost * 1.2) unlockZone(s, z.id);
      plot = freePlot(type);
    }
    const cost = Ch.plantBuildCost(s, type);
    if (plot && s.cash > cost * 1.15 && buildStructure(s, plot, type)) mark(`built ${type}`, t, formatMoney(cost));
    break;
  }
  // cheapest upgrade if it costs at most 30% of the cash
  let best: { c: number; f: () => boolean } | null = null;
  for (const [id, b] of Ch.plantsOf(s)) {
    const gm = snap.gm;
    for (const [c, f] of [
      [Ch.levelCost(b, gm), () => Ch.upgradePlantLevel(s, id, gm)],
      [Ch.speedCost(b, gm), () => Ch.upgradePlantSpeed(s, id, gm)],
    ] as [number | null, () => boolean][])
      if (c !== null && (!best || c < best.c)) best = { c, f };
  }
  if (s.dealers.local.owned) {
    const c = dealerUpgradeCost(s, "local");
    if (!best || c < best.c) best = { c, f: () => upgradeDealer(s, "local") };
  }
  if (best && best.c < s.cash * 0.3) best.f();
  if (s.lifetime.carsProduced >= 1) mark("first car", t);
  if (s.lifetime.carsSold >= 1) mark("first car sold", t);
  for (const m of [5e4, 1e5, 5e5, 1e6, 1e7, 1e8]) if (s.lifetime.moneyEarned >= m) mark(`earned ${formatMoney(m)}`, t);
  if (t % 3600 === 0 && t > 0) {
    const inc = snap.incomePerSec;
    const L = s.chain.ledger.run;
    const d = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v - (prev as Record<string, number>)[k]])) as Record<string, number>;
    const rev = d.carSales + d.partSales;
    const cost = d.materials + d.labor + d.energy + d.maintenance + d.logistics + d.dealerFees + d.tax;
    prev = { ...L };
    const lv = Ch.plantsOf(s).map(([, b]) => `${b.type.slice(0, 4)}${b.level}/${b.plant.speed}`).join(" ");
    log.push(`${fmtT(t).padStart(8)}  -- net ${formatMoney((rev - cost) / 3600)}/s · margin ${((100 * (rev - cost)) / Math.max(1, rev)).toFixed(0)}% · mat ${((100 * d.materials) / Math.max(1, rev)).toFixed(0)}% · cash ${formatMoney(s.cash)} · cars ${Math.floor(s.lifetime.carsProduced)} · ${lv}`);
    lastIncome = inc;
  }
}
void lastIncome;
console.log(log.join("\n"));
const L = s.chain.ledger.run;
console.log("\nledger (run):", Object.fromEntries(Object.entries(L).map(([k, v]) => [k, Math.round(v)])));
for (const [id, b] of Ch.plantsOf(s)) {
  const st = snapshot(s).chain.plants[id];
  console.log(id, b.type, "L", b.level, b.plant.status, b.plant.short, "stock", JSON.stringify(b.plant.stock), "out", b.plant.out, "need", JSON.stringify(st?.need), "cap", warehouseCap(b.plant), "ship", s.chain.shipments.filter((x) => x.to === id || x.from === id).map((x) => `${x.item}:${x.qty}:${x.back}`).join(","));
}
