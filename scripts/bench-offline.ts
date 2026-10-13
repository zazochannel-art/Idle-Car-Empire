// How long the settlement of an absence takes (it runs before the game shows, on load).
// Usage: npx tsx scripts/bench-offline.ts <save.json>
import fs from "node:fs";
import { migrate } from "@/game/save/serialize";
import { settleOffline } from "@/game/engine/offline";
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const hours of [1, 8, 20]) {
  let best = Infinity;
  for (let rep = 0; rep < 4; rep++) {
    const now = Date.now();
    const s = migrate(raw.state ?? raw, now);
    s.lastActiveAt = now - hours * 3600_000;
    const t = performance.now();
    settleOffline(s, now);
    best = Math.min(best, performance.now() - t);
  }
  console.log(`${hours} h away: settleOffline ${best.toFixed(1)} ms (best of 4)`);
}
