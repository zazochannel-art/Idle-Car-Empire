// The AdMob ids of a build for players (play-publish.yml, docs/android/ads.md). Without its ids a
// build falls back to Google's sample ones without a word: test ads, which pay nothing. So a release
// stops when any of them is unset, malformed, Google's sample, or from another AdMob account than
// the app id.
//
//   node scripts/check-admob-ids.mjs                 the ids in the environment (ADMOB_APP_ID, ADMOB_REWARDED_ID,
//                                                    ADMOB_INTERSTITIAL_ID, ADMOB_APP_OPEN_ID)
//   node scripts/check-admob-ids.mjs --built <dir>   and the built game in <dir> carries the three units
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Google's public sample ids (test ads): its publisher number. */
export const SAMPLE_PUBLISHER = "3940256099942544";

export const IDS = [
  { name: "ADMOB_APP_ID", kind: "app", what: "the AdMob app id (ca-app-pub-…~…, AdMob → Apps → App settings)" },
  { name: "ADMOB_REWARDED_ID", kind: "unit", what: "the Rewarded ad unit id (ca-app-pub-…/…)" },
  { name: "ADMOB_INTERSTITIAL_ID", kind: "unit", what: "the Interstitial ad unit id (ca-app-pub-…/…)" },
  { name: "ADMOB_APP_OPEN_ID", kind: "unit", what: "the App open ad unit id (ca-app-pub-…/…)" },
];

const FORMAT = { app: /^ca-app-pub-(\d+)~\d+$/, unit: /^ca-app-pub-(\d+)\/\d+$/ };

/** What is wrong with these ids (empty: a build for players may use them). */
export function idProblems(env) {
  const problems = [];
  const publisher = {};
  for (const id of IDS) {
    const value = (env[id.name] ?? "").trim();
    if (!value) {
      problems.push(`${id.name} is not set: it must be ${id.what} (GitHub → Settings → Secrets and variables → Actions → Variables)`);
      continue;
    }
    const m = FORMAT[id.kind].exec(value);
    if (!m) {
      const hint = id.kind === "app" && value.includes("/") ? " (that is an ad unit id: the app id has a ~)" : id.kind === "unit" && value.includes("~") ? " (that is the app id: a unit id has a /)" : "";
      problems.push(`${id.name} is '${value}', not ${id.what}${hint}`);
      continue;
    }
    if (m[1] === SAMPLE_PUBLISHER) {
      problems.push(`${id.name} is Google's sample id: it shows test ads, which pay nothing`);
      continue;
    }
    publisher[id.name] = m[1];
  }
  const app = publisher.ADMOB_APP_ID;
  if (app) {
    for (const id of IDS) {
      if (id.kind === "unit" && publisher[id.name] && publisher[id.name] !== app) {
        problems.push(`${id.name} belongs to the AdMob account pub-${publisher[id.name]}, the app id to pub-${app}: units of another account fail every request`);
      }
    }
  }
  return problems;
}

/** The units missing from the built game in `dir` (its scripts). */
export function missingFromBuild(env, dir) {
  const texts = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".js")) texts.push(readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return IDS.filter((id) => id.kind === "unit")
    .map((id) => ({ name: id.name, value: (env[id.name] ?? "").trim() }))
    .filter(({ value }) => !value || !texts.some((t) => t.includes(value)))
    .map(({ name }) => name);
}

function main() {
  const at = process.argv.indexOf("--built");
  const problems = at === -1 ? idProblems(process.env) : missingFromBuild(process.env, process.argv[at + 1]).map((n) => `the built game doesn't carry ${n}: the build didn't get the variable`);
  if (!problems.length) {
    console.log(at === -1 ? "AdMob ids: the app id and the three ad units are the account's own" : "AdMob ids: the built game carries the three ad units");
    return;
  }
  for (const p of problems) console.log(`::error::${p} (docs/android/ads.md)`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
