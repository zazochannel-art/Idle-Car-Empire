// Per-tick cost of the store's runTick work (engine only, no React), on a save.
// Usage: npx tsx scripts/bench-tick.ts <save.json> [ticks]
// (a save as the game keeps it in localStorage, or its "state"; bundle it with esbuild for
// numbers closer to the browser's, see docs/performance.md)
import fs from "node:fs";
import { migrate } from "@/game/save/serialize";
import { cloneState } from "@/game/engine/state";
import { tick as engineTick } from "@/game/engine/tick";
import { snapshot, unlockedCarIds } from "@/game/engine/economy";
import { checkAchievements } from "@/game/engine/progress";
import { sessionTick } from "@/game/engine/session";
import { openPlantTypes } from "@/game/engine/unlocks";
import { encodeSave } from "@/game/save/serialize";

const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
let now = Date.now();
let state = migrate(raw.state ?? raw, now);
state.lastActiveAt = now;
let snap = snapshot(state);
const N = +(process.argv[3] ?? 600);
let autoMoney = 0;
const parts: Record<string, number> = {};
const time = <T>(k: string, f: () => T): T => {
  const t = performance.now();
  const r = f();
  parts[k] = (parts[k] ?? 0) + performance.now() - t;
  return r;
};
// warm up
for (let i = 0; i < 50; i++) {
  now += 100;
  const next = cloneState(state);
  engineTick(next, 0.1, snap);
  state = next;
  snap = snapshot(state);
}
for (const k of Object.keys(parts)) delete parts[k];
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  now += 100;
  const prev = state;
  const next = time("clone", () => cloneState(state));
  // the same step the store runs (engine/session.ts)
  time("session", () => (autoMoney = sessionTick(next, prev, 0.1, now, snap, { mapOnScreen: true, autoMoney }).autoMoney));
  // commit
  let s2 = time("snapshot", () => snapshot(next));
  const fresh = time("achievements", () => checkAchievements(next, s2));
  if (fresh.length) s2 = snapshot(next);
  time("unlocks", () => {
    unlockedCarIds(next, s2.gm);
    openPlantTypes(next);
  });
  state = next;
  snap = s2;
}
const total = performance.now() - t0;
const json = JSON.stringify(state);
const ts = performance.now();
for (let i = 0; i < 20; i++) JSON.stringify({ ...state, lastActiveAt: now });
const tSave = (performance.now() - ts) / 20;
const te = performance.now();
for (let i = 0; i < 20; i++) encodeSave(state);
const tEnc = (performance.now() - te) / 20;
console.log(`ticks ${N}: ${(total / N).toFixed(3)} ms/tick`);
for (const [k, v] of Object.entries(parts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${(v / N).toFixed(3)} ms`);
console.log(`state JSON ${(json.length / 1024).toFixed(0)} KB, stringify ${tSave.toFixed(2)} ms, encodeSave ${tEnc.toFixed(2)} ms`);
