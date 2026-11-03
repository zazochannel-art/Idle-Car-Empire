// Every car model side by side: profit per car, per second of assembly, against the
// dealers' demand for its class, and per part (to compare a city's lines with the rest).
// Run: npx tsx scripts/car-table.ts
import { CARS } from "../src/game/config/cars";
import { carListPrice, carStdCost, assemblyTime } from "../src/game/engine/costs";
import { recipe } from "../src/game/engine/chain";
import { DEALER_FEE, SALES_TAX, CLASS_DEMAND } from "../src/game/config/economy";
for (const c of [...CARS].sort((a,b)=>a.tier-b.tier)) {
  const r = recipe(c); const cost = carStdCost(c, r); const list = carListPrice(c, r);
  const net = list*(1-DEALER_FEE-SALES_TAX); const t = assemblyTime(c); const p = net-cost;
  console.log(`${c.id.padEnd(15)} t${String(c.tier).padEnd(2)} g${c.grade} ${c.class.padEnd(9)} ${(c.city??"").padEnd(5)} parts ${String(r.length).padStart(2)} profit ${p.toFixed(0).padStart(7)} /asm-s ${(p/t).toFixed(0).padStart(5)} xdemand ${(p*CLASS_DEMAND[c.class]/1000).toFixed(1).padStart(6)}k /part ${(p/r.length).toFixed(0).padStart(6)} rp ${c.rp}`);
}
