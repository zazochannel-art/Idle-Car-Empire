// Loads an old save into the new economy and runs it for a while (dev check).
import fs from "fs";
import { decodeSave } from "../src/game/save/serialize";
import { tick } from "../src/game/engine/tick";
import * as Ch from "../src/game/engine/chain";
const raw = fs.readFileSync(process.argv[2], "utf8");
const parsed = JSON.parse(raw);
const s = decodeSave(JSON.stringify(parsed.state ?? parsed), Date.now());
console.log("cash", Math.round(s.cash), "plants", Ch.plantsOf(s).length);
for (let t = 0; t < 1800; t++) tick(s, 1);
console.log("after 30 min: cash", Math.round(s.cash), "owed", Math.round(s.chain.owed));
for (const [id, b] of Ch.plantsOf(s)) console.log(id, b.type, b.level, b.plant.status, b.plant.short ?? "", JSON.stringify(b.plant.stock));
console.log(Object.fromEntries(Object.entries(s.chain.ledger.run).map(([k, v]) => [k, Math.round(v)])));
