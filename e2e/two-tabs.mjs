// The game open twice in one browser (two tabs of one profile): only the newest copy saves
// (lib/tabs.ts). The older one stops and says the game is open elsewhere; its "Play here" makes
// it the newest again, and the other one stops in turn. Each page counts its own writes of the
// save (localStorage), so the check knows which copy wrote what.
//
// Built with the cloud (the fake project of ci.yml), the account is signed in already and the
// fake save_game refuses a save that doesn't build on the latest revision, as the real one does:
// a newer copy that read the save before the older one's last cloud save would be refused.
//
//   npm run build                    (or the fake project's build, see .github/workflows/ci.yml)
//   node e2e/two-tabs.mjs            (screenshots and a log go to e2e-results/two-tabs/)
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const RESULTS = join(ROOT, "e2e-results", "two-tabs");
const SUPABASE = "https://e2e.supabase.test";
/** The notice of a copy that stopped (en.ts "elsewhere.title"). */
const NOTICE = "The game is open in another tab or window";
/** How long a copy is watched for saves: the game saves every 5 s (the cloud at once the first time). */
const WATCH_MS = 12_000;
mkdirSync(RESULTS, { recursive: true });

// ---- the build, served as the browser would load it from the site
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".ico": "image/x-icon", ".txt": "text/plain", ".mp3": "audio/mpeg" };
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(OUT, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;
/** The build talks to the fake project: the game saves to its cloud too. */
const CHUNKS = join(OUT, "_next", "static", "chunks");
const CLOUD = readdirSync(CHUNKS).some((f) => f.endsWith(".js") && readFileSync(join(CHUNKS, f), "utf8").includes(SUPABASE));

// ---- the fake Supabase: a registered player, signed in on this browser already
const UID = "0e2e0e2e-2222-4333-8444-555566667777";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp, role: "authenticated", aud: "authenticated" })}.e2e`;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "two.tabs@example.com", is_anonymous: false, app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "e2e-refresh", user };
const profile = { id: UID, username: "Two Tabs", avatar: "🙂", listed: true };
/** The cloud's saves (revision n is saves[n - 1]), and the ones it refused. */
const cloud = { saves: [], refused: [] };
/** Which copy sent a request (by its page). */
const names = new Map();

async function fakeSupabase(route) {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  const body = (() => {
    try {
      return JSON.parse(req.postData() || "null");
    } catch {
      return null;
    }
  })();
  if (path.startsWith("/auth/v1/")) return json(path === "/auth/v1/user" ? user : session);
  if (path === "/rest/v1/profiles") return json((req.headers().accept || "").includes("vnd.pgrst.object") ? profile : [profile]);
  const fn = path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : "";
  const now = new Date().toISOString();
  if (fn === "load_game") {
    const last = cloud.saves.at(-1);
    return json(last ? [{ data: last.data, save_version: last.version, revision: cloud.saves.length, updated_at: last.at, server_now: now }] : []);
  }
  if (fn === "save_game") {
    let by = "?";
    try {
      by = names.get(req.frame().page()) ?? by;
    } catch {
      // not from a page
    }
    const save = { by, base: Number(body?.p_base_revision), data: body?.p_data, version: body?.p_save_version, at: now };
    // the server's revision check: a save builds on the latest one, or it is refused
    if (save.base !== cloud.saves.length) {
      cloud.refused.push(save);
      return json([{ ok: false, revision: cloud.saves.length, updated_at: cloud.saves.at(-1)?.at ?? null }]);
    }
    cloud.saves.push(save);
    return json([{ ok: true, revision: cloud.saves.length, updated_at: now }]);
  }
  if (fn === "ensure_profile") return json([profile]);
  if (fn === "track_step") return json("ok");
  if (fn === "leaderboard" || fn === "list_alliances") return json([]);
  return json(null);
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "en-US" });
await ctx.route(`${SUPABASE}/**`, fakeSupabase);
await ctx.addInitScript(
  ({ key, session }) => {
    // the player is signed in on this browser (the cloud build only reads it)
    if (!localStorage.getItem(key)) localStorage.setItem(key, session);
    // every write of the save, per page: when, what the company had earned, and which company it is
    const set = Storage.prototype.setItem;
    window.__saves = [];
    Storage.prototype.setItem = function (k, value) {
      if (/^idle-car-empire:save:(v1|u:)/.test(k)) {
        const copy = JSON.parse(value);
        window.__saves.push({ at: copy.savedAt, earned: copy.state.lifetime.moneyEarned, company: copy.state.createdAt });
      }
      return set.call(this, k, value);
    };
  },
  { key: "sb-e2e-auth-token", session: JSON.stringify(session) },
);

const errors = [];
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};
async function open(name) {
  const page = await ctx.newPage();
  names.set(page, name);
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (e) => errors.push(`${name}: page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${name}: console: ${m.text().slice(0, 300)}`);
  });
  return page;
}
/** This page's writes of the save, since it last loaded. */
const writes = (page) => page.evaluate(() => window.__saves.slice());
/** The save on this device as it is now ({ state, savedAt }), and this page's last write of it, read at the same moment. */
const stored = (page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^idle-car-empire:save:(v1|u:)/.test(k));
    return { save: key ? JSON.parse(localStorage.getItem(key)) : null, last: window.__saves.at(-1) };
  });
/** Until the page has saved at least `n` times since it loaded. */
async function savedTimes(page, n) {
  await page.waitForFunction((k) => window.__saves.length >= k, n, { timeout: 90_000 });
}
/** The cloud saves a copy sent. */
const cloudSaves = (page) => cloud.saves.filter((s) => s.by === names.get(page)).length;
let shots = 0;
const shot = (page, name) => page.screenshot({ path: join(RESULTS, `${String(++shots).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}.png`) }).catch(() => {});
const failed = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    say(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    say(`FAIL  ${name}: ${e.message.split("\n")[0]}`);
    failed.push(name);
    throw e;
  }
}
const expect = (ok, what) => {
  if (!ok) throw new Error(what);
};

/**
 * Watches the two pages for WATCH_MS: `live` keeps saving and the save is always its own, `stopped`
 * writes nothing at all (nor sends anything to the cloud).
 */
async function onlyOneSaves(live, stopped) {
  const [l0, s0, c0] = [(await writes(live)).length, (await writes(stopped)).length, cloudSaves(stopped)];
  await live.waitForTimeout(WATCH_MS);
  const [l1, s1] = [await writes(live), await writes(stopped)];
  expect(s1.length === s0, `the stopped copy saved ${s1.length - s0} more time(s)`);
  expect(cloudSaves(stopped) === c0, `the stopped copy saved to the cloud ${cloudSaves(stopped) - c0} more time(s)`);
  expect(l1.length >= l0 + 2, `the live copy saved only ${l1.length - l0} time(s) in ${WATCH_MS / 1000} s`);
  const { save, last } = await stored(live);
  expect(save?.savedAt === last.at, `the save (savedAt ${save?.savedAt}) is not the live copy's last (${last.at})`);
  if (CLOUD) expect(cloud.saves.at(-1)?.by === names.get(live), `the cloud's last save came from ${cloud.saves.at(-1)?.by}`);
}

/** The older copy's last save came before the newer one's first, and the newer one carries on its company. */
async function handedOver(older, newer) {
  const [last, first] = [(await writes(older)).at(-1), (await writes(newer))[0]];
  expect(last.at <= first.at, `the older copy saved after the newer one began to (${last.at} > ${first.at})`);
  expect(first.company === last.company, "the newer copy started a new company");
  expect(first.earned >= last.earned, `the newer copy's company had earned less (${first.earned}) than the older one's last save (${last.earned})`);
}

say(CLOUD ? "a build with the (fake) cloud: saves go there too" : "a build without the cloud: saves stay on this device");
let a, b;
try {
  a = await open("A");
  await step("tab A plays and saves", async () => {
    await a.goto(BASE, { timeout: 120_000 });
    await savedTimes(a, 2);
    await shot(a, "A playing");
  });

  b = await open("B");
  await step("tab B opens: A stops, B carries on A's company from its last save", async () => {
    await b.goto(BASE, { timeout: 120_000 });
    await a.getByText(NOTICE).waitFor();
    await savedTimes(b, 1);
    await handedOver(a, b);
    expect(!(await b.getByText(NOTICE).isVisible()), "B shows the notice too");
    await shot(a, "A stopped");
    await shot(b, "B playing");
  });

  await step("only B saves", async () => {
    await onlyOneSaves(b, a);
  });

  await step("Play here in A: A takes over and B stops", async () => {
    await a.getByRole("button", { name: "Play here" }).click();
    await b.getByText(NOTICE).waitFor();
    await a.getByText(NOTICE).waitFor({ state: "detached" });
    await savedTimes(a, 1);
    await handedOver(b, a);
    await shot(a, "A playing again");
    await shot(b, "B stopped");
  });

  await step("only A saves now", async () => {
    await onlyOneSaves(a, b);
  });

  if (CLOUD)
    await step("the cloud refused no save (no copy saved over a newer one)", async () => {
      expect(cloud.saves.length >= 2, `only ${cloud.saves.length} cloud save(s)`);
      expect(!cloud.refused.length, `refused: ${cloud.refused.map((s) => `${s.by} on revision ${s.base}`).join(", ")}`);
    });
} catch {
  // the failed step is in the log
}

if (CLOUD) say(`cloud saves: ${cloud.saves.map((s) => s.by).join(" ") || "none"}; refused: ${cloud.refused.length}`);
const unexpected = errors.filter((e) => !/Failed to load resource/.test(e));
if (unexpected.length) say(`page errors:\n  ${unexpected.join("\n  ")}`);
writeFileSync(join(RESULTS, "log.txt"), log.join("\n") + "\n");
await browser.close();
server.close();
if (failed.length || unexpected.length) {
  console.error(`\ntwo tabs FAILED: ${[...failed, ...(unexpected.length ? ["page errors"] : [])].join(", ")}`);
  process.exit(1);
}
console.log("\ntwo tabs passed");
