// How the settlement of an absence changes with the number of steps it is played in: time and result
// against the current setting (20,000 steps). Fewer steps are faster, but the result moves by more than
// rounding: see "Settling an absence" in docs/performance.md.
// Usage: npx tsx scripts/bench-offline-steps.ts <save.json> [hours,...] [steps,...]
//   e.g. npx tsx scripts/bench-offline-steps.ts late.json 1,8,20,72 20000,16000,12000,8000
//   (a late-game save: DUMP=late.json npx tsx scripts/simulate.ts 12)
import fs from "node:fs";
import { migrate } from "@/game/save/serialize";
import { settleOffline } from "@/game/engine/offline";
import { plantsOf } from "@/game/engine/chain";
import { stockTotal } from "@/game/engine/materials";

const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const list = (arg: string | undefined, def: number[]) => (arg ? arg.split(",").map(Number) : def);
const hoursList = list(process.argv[3], [1, 8, 20, 72]);
const stepsList = list(process.argv[4], [20_000, 16_000, 12_000, 8_000]);
const NOW = 1_800_000_000_000; // fixed, so the market calendar is the same in every run
const pct = (a: number, b: number) => (b === 0 ? "   -  " : `${(((a - b) / b) * 100).toFixed(1).padStart(6)}%`);

for (const hours of hoursList) {
  let base: { money: number; cars: number; comps: number; stock: number } | null = null;
  console.log(`\n${hours} h away`);
  console.log("steps".padStart(7), "ms".padStart(7), "money".padStart(14), "vs now".padStart(8), "cars".padStart(7), "vs now".padStart(8), "parts".padStart(9), "vs now".padStart(8), "stock".padStart(9), "vs now".padStart(8));
  for (const steps of stepsList) {
    let best = Infinity;
    let r = { money: 0, cars: 0, comps: 0, stock: 0 };
    for (let rep = 0; rep < 3; rep++) {
      const s = migrate(raw.state ?? raw, NOW);
      s.lastActiveAt = NOW - hours * 3600_000;
      const t = performance.now();
      const report = settleOffline(s, NOW, steps);
      best = Math.min(best, performance.now() - t);
      if (rep === 0) {
        let stock = 0;
        for (const [, b] of plantsOf(s)) stock += stockTotal(b.plant.stock);
        r = { money: report?.money ?? 0, cars: report?.carsSold ?? 0, comps: report?.components ?? 0, stock };
      }
    }
    base ??= r;
    console.log(String(steps).padStart(7), best.toFixed(0).padStart(7), r.money.toExponential(3).padStart(14), pct(r.money, base.money).padStart(8), String(r.cars).padStart(7), pct(r.cars, base.cars).padStart(8), String(r.comps).padStart(9), pct(r.comps, base.comps).padStart(8), String(r.stock).padStart(9), pct(r.stock, base.stock).padStart(8));
  }
}
