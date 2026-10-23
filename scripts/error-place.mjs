// Reads back where a player's error report happened (supabase/migrations/0009, docs/errors.md):
// the report's place names the game's built files ("0a1b2c3d.js:1:16728"); with the source maps
// of that build (the "source-maps" artifact of its GitHub Actions run) each one becomes the file
// and line of the game's code.
//
//   node scripts/error-place.mjs <source-maps folder> "<place>" ["<place>"…]
//
// e.g. node scripts/error-place.mjs ~/Downloads/source-maps "[map] upgradeCost 0a1b2c3d.js:1:16728 < onClick 0a1b2c3d.js:1:20301"
import fs from "node:fs";
import path from "node:path";
import { SourceMapConsumer } from "source-map-js";

const [dir, ...places] = process.argv.slice(2);
if (!dir || places.length === 0 || !fs.existsSync(dir)) {
  console.error('Usage: node scripts/error-place.mjs <source-maps folder> "<place>" ["<place>"…]');
  process.exit(1);
}

/** Every built script in the folder, by its name. */
const files = new Map();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.set(e.name, p);
  }
})(dir);

const maps = new Map();
/** The source map of a built script: the one its last line points to (Turbopack names them differently). */
function mapOf(name) {
  if (maps.has(name)) return maps.get(name);
  let consumer = null;
  const file = files.get(name);
  if (file) {
    const url = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(fs.readFileSync(file, "utf8"))?.[1];
    const map = url && !url.startsWith("data:") ? path.join(path.dirname(file), decodeURIComponent(url)) : null;
    if (map && fs.existsSync(map)) consumer = new SourceMapConsumer(JSON.parse(fs.readFileSync(map, "utf8")));
  }
  maps.set(name, consumer);
  return consumer;
}

const shortSource = (s) => s.replace(/^turbopack:\/\/\/\[project\]\//, "").replace(/^.*\/node_modules\//, "node_modules/");

for (const place of places) {
  console.log(place);
  const screen = /^\[([^\]]+)\]/.exec(place)?.[1];
  if (screen) console.log(`  screen: ${screen}`);
  for (const m of place.matchAll(/(?:([\w$.<>]+) )?([\w.-]+\.m?js):(\d+):(\d+)/g)) {
    const [, fn, name, line, column] = m;
    const consumer = mapOf(name);
    const at = `${fn ? `${fn} ` : ""}${name}:${line}:${column}`;
    if (!consumer) {
      console.log(`  ${at}  →  (no source map for ${name} in this folder: is it the same build as the report's version?)`);
      continue;
    }
    // stacks count columns from 1, source maps from 0
    const pos = consumer.originalPositionFor({ line: Number(line), column: Number(column) - 1 });
    console.log(pos.source ? `  ${at}  →  ${shortSource(pos.source)}:${pos.line}:${pos.column + 1}${pos.name ? ` (${pos.name})` : ""}` : `  ${at}  →  (not in the map)`);
  }
}
