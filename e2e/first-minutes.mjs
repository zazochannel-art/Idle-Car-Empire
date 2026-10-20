// A brand-new player's first minutes, end to end: the production build (out/) in a phone-sized
// browser, against a fake Supabase answered here (nothing reaches the real project).
//
//   the welcome page → name, email, password → "check your email" → the game →
//   the tutorial's buttons → the factory makes its first body → the first cloud save.
//
// It fails on a page error, a step that doesn't happen, or a save that doesn't reach the cloud.
// Build first with the fake project's address (see .github/workflows/ci.yml):
//   NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-public-key npm run build
//   node e2e/first-minutes.mjs            (screenshots and a log go to e2e-results/)
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const RESULTS = join(ROOT, "e2e-results");
const SUPABASE = "https://e2e.supabase.test";
/** How long the factory may take to make its first body (it takes about a minute). */
const PRODUCTION_WAIT = 4 * 60_000;
mkdirSync(RESULTS, { recursive: true });

// ---- the build, served as the app's web view would load it
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

// ---- the fake Supabase: a project that confirms emails by link, like the real one
const UID = "0e2e0e2e-1111-4222-8333-444455556666";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp, role: "authenticated", aud: "authenticated", is_anonymous: true })}.e2e`;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "", is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: {}, created_at: new Date().toISOString() };
const server_ = { profile: null, saves: [], steps: [], calls: [] };

async function fakeSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  const body = (() => {
    try {
      return JSON.parse(req.postData() || "null");
    } catch {
      return null;
    }
  })();
  server_.calls.push(`${req.method()} ${path}`);
  // a guest account first (signInAnonymously), the same id then gets the email
  if (path === "/auth/v1/signup") return json({ access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "e2e-refresh", user });
  if (path === "/auth/v1/user" && req.method() === "PUT") {
    // the email waits for its confirmation link: the account keeps no email until then
    if (body?.email) return json({ ...user, new_email: body.email, email_change_sent_at: new Date().toISOString() });
    return json(user);
  }
  if (path === "/auth/v1/user") return json(user);
  if (path === "/auth/v1/token") return json({ access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "e2e-refresh", user });
  if (path.startsWith("/auth/v1/")) return json({});
  if (path === "/rest/v1/profiles") {
    if (req.method() === "PATCH") {
      server_.profile = { id: UID, avatar: "🙂", listed: true, ...server_.profile, ...body };
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    const row = server_.profile;
    return json((req.headers().accept || "").includes("vnd.pgrst.object") ? row : row ? [row] : []);
  }
  const fn = path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : "";
  switch (fn) {
    case "track_step":
      server_.steps.push(body?.p_step);
      return json("ok");
    case "ensure_profile":
      server_.profile ??= { id: UID, username: "Player1234", avatar: "🙂", listed: true };
      return json([server_.profile]);
    case "load_game": {
      const last = server_.saves.at(-1);
      return json(last ? [{ data: last.p_data, save_version: last.p_save_version, revision: server_.saves.length, updated_at: new Date().toISOString(), server_now: new Date().toISOString() }] : []);
    }
    case "save_game":
      server_.saves.push(body);
      return json([{ ok: true, revision: server_.saves.length, updated_at: new Date().toISOString() }]);
    case "leaderboard":
    case "list_alliances":
      return json([]);
    default:
      return json(null);
  }
}

// ---- the player
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "en-US" });
await ctx.route(`${SUPABASE}/**`, fakeSupabase);
const page = await ctx.newPage();
page.setDefaultTimeout(30_000);
const errors = [];
page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
const notFound = [];
page.on("response", (r) => {
  if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`);
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
});

const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};
let shots = 0;
// file names that every file system (and CI's artifact upload) takes: letters, digits and dashes
const shot = (name) => page.screenshot({ path: join(RESULTS, `${String(++shots).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "")}.png`) }).catch(() => {});
const failed = [];
/** The tutorial's card (its buttons share names with the screens they open). */
const tutorial = page.getByTestId("tutorial");
/** One step of the first minutes: logged, screenshotted, and a failure stops the run. */
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    say(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await shot(name);
  } catch (e) {
    say(`FAIL  ${name}: ${e.message.split("\n")[0]}`);
    failed.push(name);
    await shot(`${name}-failed`);
    throw e;
  }
}
try {
  await step("the welcome page", async () => {
    await page.goto(BASE, { timeout: 120_000 });
    await page.getByText("Welcome to Idle Car Empire!").waitFor({ timeout: 120_000 });
  });

  await step("create the account", async () => {
    await page.getByLabel("Player name").fill("E2E Driver");
    await page.getByLabel("Email").fill("new.player@example.com");
    await page.getByLabel("Password").fill("First-minutes-2026");
    await page.getByRole("button", { name: "Create account and play" }).click();
    await page.getByText("Check your email").waitFor();
    if (server_.profile?.username !== "E2E Driver") throw new Error(`the server got the name ${JSON.stringify(server_.profile?.username)}`);
  });

  await step("enter the game", async () => {
    await page.getByRole("button", { name: "Enter the game" }).click();
    await page.getByText("Start with your factory").waitFor({ timeout: 60_000 });
  });

  await step("tutorial: open the factory", async () => {
    await tutorial.getByRole("button", { name: "Open factory" }).click();
    await page.getByText("Watch production").waitFor();
  });

  await step("tutorial: the factory floor", async () => {
    await tutorial.getByRole("button", { name: "Show factory floor" }).click();
    await page.getByText("Keep it supplied").waitFor();
  });

  await step("tutorial: buy materials", async () => {
    await tutorial.getByRole("button", { name: "Buy materials" }).click();
    await page.getByText("Build your next factory").waitFor();
  });

  await step("tutorial: the build menu", async () => {
    await tutorial.getByRole("button", { name: "Open Build" }).click();
    await page.getByText("Grow the empire").waitFor();
  });

  await step("tutorial: the map, then the end", async () => {
    await tutorial.getByRole("button", { name: "Show the map" }).click();
    await page.getByText("Race when you're ready").waitFor();
    await tutorial.getByRole("button", { name: "Start my empire" }).click();
    await tutorial.waitFor({ state: "detached" });
  });

  await step("the factory makes its first body", async () => {
    // the funnel reports it (every 30 s): the game's own count of the first body
    const until = Date.now() + PRODUCTION_WAIT;
    while (!server_.steps.includes("firstBody")) {
      if (Date.now() > until) throw new Error(`no first body in ${PRODUCTION_WAIT / 60_000} min; steps sent: ${server_.steps.join(", ")}`);
      await page.waitForTimeout(2_000);
    }
  });

  await step("the game saves to the cloud", async () => {
    // the game groups its saves: the one with the first body may come a little after the funnel's report
    const bodies = (save) => save?.p_data?.lifetime?.parts?.body ?? 0;
    const until = Date.now() + 90_000;
    while (!server_.saves.some((x) => bodies(x) >= 1)) {
      if (Date.now() > until) throw new Error(`no cloud save with the first body in 90 s (${server_.saves.length} saves, bodies ${server_.saves.map(bodies).join(", ")})`);
      await page.waitForTimeout(2_000);
    }
    for (const x of server_.saves) if (typeof x?.p_data !== "object" || !x.p_data?.city) throw new Error("a save had no game in it");
  });

  await step("the funnel saw a new player", async () => {
    for (const s of ["gate", "start", "firstBody"]) if (!server_.steps.includes(s)) throw new Error(`step "${s}" not sent (sent: ${server_.steps.join(", ")})`);
  });
} catch {
  // the failed step is in the log
}

say(`funnel steps sent: ${server_.steps.join(", ") || "none"}`);
say(`cloud saves: ${server_.saves.length}`);
const unexpected = errors.filter((e) => !/Failed to load resource/.test(e));
if (unexpected.length) say(`page errors:\n  ${unexpected.join("\n  ")}`);
writeFileSync(join(RESULTS, "log.txt"), log.join("\n") + "\n\nfailed requests:\n" + notFound.join("\n") + "\n\nSupabase requests:\n" + server_.calls.join("\n") + "\n");
await browser.close();
server.close();
if (failed.length || unexpected.length) {
  console.error(`\nfirst minutes FAILED: ${[...failed, ...(unexpected.length ? ["page errors"] : [])].join(", ")}`);
  process.exit(1);
}
console.log("\nfirst minutes passed");
