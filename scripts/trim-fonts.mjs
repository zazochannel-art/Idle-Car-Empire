// Takes out of the build (out/) the font files the game never asks for. Run by build-app.mjs
// after `next build`, so the apps carry fewer bytes; the website build keeps them (a browser
// downloads only the files its text needs, so there the extra files cost nothing).
//
// next/font/google writes an @font-face rule per unicode-range subset of every weight, whichever
// subsets the code asked for. The Fira Sans fonts (src/app/layout.tsx) are there only to give
// Russian its Cyrillic letters: Barlow draws every Latin letter before Fira is tried, so Fira's
// Latin, Latin-extended, Greek and Vietnamese files (and, in the apps, its Cyrillic-extended one:
// letters of Ukrainian, Kazakh... that Russian text does not use) are never fetched.
//
//   node scripts/trim-fonts.mjs [out-dir]
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "out");
const CHUNKS = path.join(OUT, "_next/static/chunks");
const MEDIA = path.join(OUT, "_next/static/media");

/** The Cyrillic subset: its unicode-range holds U+0400-045F (Cyrillic-extended starts at U+0460). */
const KEEP = /U\+400-45F/i;
const FAMILY = /^["']?Fira Sans/;

const rule = /@font-face\{[^}]*\}/g;
let removed = 0;
let bytes = 0;
const candidates = new Set();
const kept = new Set();

for (const name of fs.readdirSync(CHUNKS).filter((f) => f.endsWith(".css"))) {
  const file = path.join(CHUNKS, name);
  const css = fs.readFileSync(file, "utf8");
  const next = css.replace(rule, (block) => {
    const family = /font-family:\s*([^;}]+)/.exec(block)?.[1] ?? "";
    const url = /url\(([^)]+)\)/.exec(block)?.[1]?.replace(/["']/g, "");
    if (!url || !FAMILY.test(family)) {
      if (url) kept.add(path.basename(url));
      return block;
    }
    if (KEEP.test(block)) {
      kept.add(path.basename(url));
      return block;
    }
    candidates.add(path.basename(url));
    removed++;
    return "";
  });
  if (next !== css) fs.writeFileSync(file, next);
}

if (!removed) {
  console.warn("trim-fonts: no Fira Sans @font-face rule to take out (did next/font change?): nothing trimmed");
  process.exit(0);
}

// A file goes only when no kept rule uses it and no page or script names it (a preload link).
const named = (file) => {
  const stack = [OUT];
  while (stack.length) {
    for (const e of fs.readdirSync(stack.pop(), { withFileTypes: true })) {
      const p = path.join(e.parentPath, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.(html|css|js|txt)$/.test(e.name) && fs.readFileSync(p, "utf8").includes(file)) return true;
    }
  }
  return false;
};
for (const file of candidates) {
  if (kept.has(file) || named(file)) continue;
  const p = path.join(MEDIA, file);
  if (!fs.existsSync(p)) continue;
  bytes += fs.statSync(p).size;
  fs.rmSync(p);
}
console.log(`trim-fonts: ${removed} @font-face rules taken out, ${(bytes / 1024).toFixed(0)} KB of font files not shipped`);
