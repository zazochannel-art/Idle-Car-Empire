// Per-tick cost of the store's runTick work (engine only, no React), on a save.
// Usage: npx tsx scripts/bench-tick.ts <save.json> [ticks]
// (a save as the game keeps it in localStorage, or its "state"; bundle it with esbuild for
// numbers closer to the browser's, see docs/performance.md)
import fs from "node:fs";
import { migrate } from "@/game/save/serialize";
import { cloneState } from "@/game/engine/state";
import { tick as engineTick } from "@/game/engine/tick";
import { snapshot, unlockedCarIds } from "@/game/engine/economy";
import { checkAchievements, recordHistory, refreshDaily } from "@/game/engine/progress";
import * as Ch from "@/game/engine/chain";
import * as R from "@/game/engine/retention";
import * as K from "@/game/engine/contracts";
import * as Lv from "@/game/engine/live";
import * as Cl from "@/game/engine/classics";
import * as Ex from "@/game/engine/expansion";
import * as Ps from "@/game/engine/pass";
import * as Wt from "@/game/engine/winter";
import * as Cn from "@/game/engine/collection";
import * as Sy from "@/game/engine/story";
import * as Mk from "@/game/engine/market";
import { openPlantTypes } from "@/game/engine/unlocks";
import { activeEvent } from "@/game/engine/events";
import { encodeSave } from "@/game/save/serialize";

const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
let now = Date.now();
let state = migrate(raw.state ?? raw, now);
state.lastActiveAt = now;
let snap = snapshot(state);
const N = +(process.argv[3] ?? 600);
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
  const events = time("engineTick", () => engineTick(next, 0.1, snap));
  next.lastActiveAt = now;
  time("misc", () => {
    recordHistory(next, now, snap.incomePerSec);
    Ch.autoUpgrade(next, snap.gm);
    R.updateLogin(next, now);
    R.checkRivals(next, now);
    K.refreshContracts(next, now, snap);
    activeEvent(now);
    refreshDaily(next, now, snap);
    Lv.vipTick(next, now, snap);
    Lv.seasonTick(next, now);
    Cl.classicsTick(next, now);
    Ex.engineersTick(next, now, 0.1);
    Ps.passTick(next, snap, now);
    Wt.winterTick(next, snap, now);
    Ex.fleetOrderTick(next, now);
    const built = events.find((e) => e.type === "carBuilt");
    Cn.editionTick(next, built?.type === "carBuilt" ? built.car : null, now);
    Sy.storyTick(next, snap);
    Mk.trendOf(next);
    Mk.trendOf(prev);
  });
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
