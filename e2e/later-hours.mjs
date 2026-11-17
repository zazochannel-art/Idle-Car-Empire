// Later in the game, end to end: the production build (out/) in a phone-sized browser, against a
// fake Supabase answered here. A new account loads the saves of a company after 1 hour and after
// 3 hours of play (e2e/fixtures/, made by scripts/goal-bot.ts), and goes everywhere a player would:
//
//   the popups that come with the save (one at a time, answered like a player) → the five tabs of
//   the dock → every screen the Empire menu has open → the next save.
//
// It fails on a page error, a screen that shows its "something went wrong" card, a tab or menu
// screen that doesn't open, or two popups on screen at once. Build first (see e2e/first-minutes.mjs):
//   NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-public-key npm run build
//   node e2e/later-hours.mjs              (screenshots and a log go to e2e-results/later-hours/)
// To refresh the saves after a big change to the economy:
//   npx tsx scripts/goal-bot.ts 1 q e2e/fixtures/save-1h.json && npx tsx scripts/goal-bot.ts 3 q e2e/fixtures/save-3h.json
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const RESULTS = join(ROOT, "e2e-results", "later-hours");
const SAVES = [
  ["1h", join(ROOT, "e2e", "fixtures", "save-1h.json")],
  ["3h", join(ROOT, "e2e", "fixtures", "save-3h.json")],
];
const SUPABASE = "https://e2e.supabase.test";
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
// CHROMIUM_PATH: a Chromium already on the machine (else the one playwright-core installed)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
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
    await page.getByText("This is your factory").waitFor({ timeout: 60_000 });
  });

  await step("tutorial: open the factory", async () => {
    await tutorial.getByRole("button", { name: "Open factory" }).click();
    await page.getByText("Give it materials").waitFor();
  });

  await step("tutorial: buy materials", async () => {
    await tutorial.getByRole("button", { name: "Buy materials" }).click();
    await page.getByText("Build more factories").waitFor();
  });

  await step("tutorial: the build menu", async () => {
    await tutorial.getByRole("button", { name: "Open Build" }).click();
    await page.getByText("Follow it on the map").waitFor();
  });

  await step("tutorial: the map, then the end", async () => {
    await tutorial.getByRole("button", { name: "Show the map" }).click();
    await tutorial.waitFor({ state: "detached" });
  });

  /** The game's popups now on screen (their first line). */
  const popupsOnScreen = async () => {
    const out = [];
    const d = page.getByRole("dialog");
    for (let k = 0; k < (await d.count()); k++) {
      const one = d.nth(k);
      if (await one.isVisible().catch(() => false)) out.push(((await one.innerText().catch(() => "")).split("\n").find((l) => l.trim().length > 2) ?? "").slice(0, 60));
    }
    return out;
  };
  /** Answers the popups like a player (the cheap answer: ignore, later, collect, close), checking they come one at a time. */
  const answerPopups = async (tag) => {
    let quiet = 0;
    for (let i = 0; i < 60 && quiet < 3; i++) {
      const up = await popupsOnScreen();
      if (up.length > 1) throw new Error(`two popups at once: ${up.join(" | ")}`);
      if (!up.length) {
        quiet++;
        await page.waitForTimeout(500);
        continue;
      }
      quiet = 0;
      say(`   popup [${tag}]: ${up[0]}`);
      await shot(`${tag}-popup`);
      const top = page.getByRole("dialog").last();
      const b = top.getByRole("button", { name: /^(ignore|later|collect|claim|got it|ok|continue|close)\b/i }).first();
      if (await b.isVisible().catch(() => false)) await b.click({ timeout: 4000 }).catch(() => {});
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
  };
  /** A screen showed its "something went wrong" card. */
  const failedScreen = async () => (await page.locator("[data-screen-failed]").count()) > 0;
  /** Closes the sheet or dialog on top (the round × button). */
  const closeTop = async () => {
    for (let i = 0; i < 3; i++) {
      const x = page.getByRole("button", { name: "Close" }).last();
      if (!(await x.isVisible().catch(() => false))) return;
      // (a toast can lie over it for a moment: then Escape, which every sheet answers)
      await x.click({ timeout: 2000 }).catch(() => page.keyboard.press("Escape"));
      await page.waitForTimeout(400);
    }
  };
  const dock = (name) => page.getByRole("button", { name: new RegExp("^" + name, "i") }).last();

  for (const [tag, file] of SAVES) {
    await step(`load the ${tag} save`, async () => {
      const state = JSON.stringify(JSON.parse(readFileSync(file, "utf8")).state);
      await closeTop();
      await dock("Menu").click();
      await page.getByRole("button", { name: /Settings/ }).last().click();
      await page.locator("textarea").first().fill(state);
      await page.getByRole("button", { name: /import save/i }).click();
      await page.getByText("Save imported.").waitFor({ timeout: 10_000 });
      await page.keyboard.press("Escape");
      await closeTop();
    });

    await step(`${tag}: popups one at a time`, () => answerPopups(tag));

    for (const tab of ["Build", "Upgrade", "Missions", "Staff", "Menu"]) {
      await step(`${tag}: the ${tab} tab`, async () => {
        await answerPopups(tag);
        await closeTop();
        await dock(tab).click();
        await page.waitForTimeout(1200);
        if (await failedScreen()) throw new Error(`the ${tab} tab failed`);
        if (tab !== "Menu") await closeTop();
      });
    }

    // every screen the Empire menu has open (the menu is open after the last tab)
    const tiles = await page.locator(".grid-cols-4 > button").allInnerTexts();
    const names = tiles.map((x) => x.split("\n").filter(Boolean).pop()).filter((x) => x && x !== "Settings");
    say(`   ${tag} menu: ${names.join(", ")}`);
    for (const name of names) {
      await step(`${tag}: menu → ${name}`, async () => {
        await answerPopups(tag);
        await page.locator(".grid-cols-4 > button").filter({ hasText: name }).first().click();
        await page.waitForTimeout(1000);
        if (await failedScreen()) throw new Error(`${name} failed`);
        await closeTop();
        await answerPopups(tag);
        await dock("Menu").click();
        await page.waitForTimeout(500);
      });
    }
    await closeTop();
  }
} catch {
  // the failed step is in the log
}

const unexpected = errors.filter((e) => !/Failed to load resource/.test(e));
if (unexpected.length) say(`page errors:\n  ${unexpected.join("\n  ")}`);
writeFileSync(join(RESULTS, "log.txt"), log.join("\n") + "\n\nfailed requests:\n" + notFound.join("\n") + "\n\nSupabase requests:\n" + server_.calls.join("\n") + "\n");
await browser.close();
server.close();
if (failed.length || unexpected.length) {
  console.error(`\nlater hours FAILED: ${[...failed, ...(unexpected.length ? ["page errors"] : [])].join(", ")}`);
  process.exit(1);
}
console.log("\nlater hours passed");
