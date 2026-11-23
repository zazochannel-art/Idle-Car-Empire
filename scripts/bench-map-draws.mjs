// What the 3D map asks of the GPU: draw calls and triangles per frame, close up and far out, by
// quality tier (map/quality.ts). Counts come from three.js's own `renderer.info`, so they do not
// depend on the machine (frame times in a container without a GPU say nothing about a phone's).
//
//   NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-public-key npx next dev -p 3100
//   DUMP=/tmp/late.json npx tsx scripts/simulate.ts 12        (a late-game save; optional)
//   node scripts/bench-map-draws.mjs http://localhost:3100 [/tmp/late.json]
//
// Needs the dev server: it exposes the engine as `window.__map` (empire-map.tsx).
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const SAVE = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : null;
const SUPABASE = "https://e2e.supabase.test";
const UID = "0e2e0e2e-1111-4222-8333-444455556666";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp, role: "authenticated", aud: "authenticated", is_anonymous: true })}.e2e`;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "", is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: {}, created_at: new Date().toISOString() };
let profile = null;

async function fake(route) {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  let body = null;
  try {
    body = JSON.parse(req.postData() || "null");
  } catch {}
  if (path === "/auth/v1/signup" || path === "/auth/v1/token") return json({ access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "e2e-refresh", user });
  if (path === "/auth/v1/user" && req.method() === "PUT") return json(body?.email ? { ...user, new_email: body.email, email_change_sent_at: new Date().toISOString() } : user);
  if (path === "/auth/v1/user") return json(user);
  if (path.startsWith("/auth/v1/")) return json({});
  if (path === "/rest/v1/profiles") {
    if (req.method() === "PATCH") {
      profile = { id: UID, avatar: "🙂", listed: true, ...profile, ...body };
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    return json((req.headers().accept || "").includes("vnd.pgrst.object") ? profile : profile ? [profile] : []);
  }
  switch (path.startsWith("/rest/v1/rpc/") ? path.slice(13) : "") {
    case "track_step":
      return json("ok");
    case "ensure_profile":
      profile ??= { id: UID, username: "Player1234", avatar: "🙂", listed: true };
      return json([profile]);
    case "load_game":
      return json(SAVE ? [{ data: SAVE.state ?? SAVE, save_version: 4, revision: 1, updated_at: new Date().toISOString(), server_now: new Date().toISOString() }] : []);
    case "save_game":
      return json([{ ok: true, revision: 2, updated_at: new Date().toISOString() }]);
    case "leaderboard":
    case "list_alliances":
      return json([]);
    default:
      return json(null);
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "en-US" });
await ctx.route(`${SUPABASE}/**`, fake);
const page = await ctx.newPage();
page.setDefaultTimeout(120_000);
page.on("pageerror", (e) => console.log("page error:", e.message));
page.on("crash", () => console.log("the page crashed"));
if (process.env.VERBOSE) page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
await page.goto(BASE, { timeout: 240_000 });
await page.getByText("Welcome to Idle Car Empire!").waitFor({ timeout: 240_000 });
// the dev build hydrates late: fill until the values stick
for (let i = 0; i < 20; i++) {
  await page.getByLabel("Email").fill("bench@example.com");
  await page.getByLabel("Password").fill("Quartz-lantern-4082");
  if ((await page.getByLabel("Email").inputValue()) === "bench@example.com" && (await page.getByRole("button", { name: "Create account and play" }).isEnabled())) break;
  await page.waitForTimeout(3000);
}
console.log("filled", await page.getByLabel("Email").inputValue());
await page.getByRole("button", { name: "Create account and play" }).click();
console.log("clicked");
await page.getByText("Check your email").waitFor();
console.log("check your email");
if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT + ".a.png" });
await page.getByRole("button", { name: "Enter the game" }).click();
console.log("entered");
if (process.env.DEBUG_SHOT) {
  page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 200)));
  await page.waitForTimeout(20_000);
  await page.screenshot({ path: process.env.DEBUG_SHOT });
  console.log("map?", await page.evaluate(() => typeof window.__map));
}
await page.waitForFunction(() => !!window.__map && !!window.__map.renderer, null, { timeout: 240_000 });
await page.waitForTimeout(8000);

const rows = process.env.LIVE_ONLY || process.env.PARTS_ONLY ? [] : await page.evaluate(async (LEVELS) => {
  const m = window.__map;
  const info = m.renderer.info;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // the loop is stopped and frames are drawn by hand, so every step is measured over the same number of
  // frames (a multiple of the shadow rhythms, 2 and 4) whatever the software GL's speed
  m.stop();
  const FRAMES = 8;
  const z0 = m.cam.zoom;
  const out = [];
  const views = [["play", z0], ["wide", z0 * 0.55], ["far", 0]];
  const steps = m.qualitySteps ?? 1;
  const only = LEVELS;
  for (let level = 0; level < steps; level++) {
    if (only && !only.includes(level)) continue;
    m.setQualityLevel?.(level);
    // ten seconds of game time at the play view, so the traffic and crowd settle to the tier's share
    m.cam.zoom = z0;
    m.cameraDirty = true;
    for (let i = 0; i < 30; i++) m.render(0.3);
    for (const [name, zoom] of views) {
      m.cam.zoom = zoom || m.cam.minZoom;
      m.cameraDirty = true;
      // (the vehicles hardly move in 2 ms, so the steps are measured on the same traffic)
      for (let i = 0; i < 4; i++) m.render(0.002); // settle: the sun's frame, shadow map, vehicles' level of detail
      const calls = [];
      const tris = [];
      for (let i = 0; i < FRAMES; i++) {
        m.render(0.002);
        calls.push(info.render.calls);
        tris.push(info.render.triangles);
      }
      const mean = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
      out.push({ step: level, tier: m.steps?.[level]?.tier, dpr: m.steps?.[level]?.dpr, view: `${name} (dist ${m.cam.dist.toFixed(0)})`, calls: mean(calls), peak: Math.max(...calls), low: Math.min(...calls), tris: mean(tris) });
      await wait(50);
    }
  }
  m.setQualityLevel?.(0);
  return out;
}, process.env.LEVELS ? process.env.LEVELS.split(",").map(Number) : null);
console.table(rows);

// where the draws come from: visible, in-view meshes by the top-level group they hang from (per pass)
const parts = process.env.LIVE_ONLY ? [] : await page.evaluate(async (FAR) => {
  const m = window.__map;
  m.setQualityLevel?.(0);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  m.cam.zoom = FAR ? m.cam.minZoom : 0.86;
  m.cameraDirty = true;
  for (let i = 0; i < 4; i++) m.render(0.05);
  const scene = m.scene;
  const cam = m.camera;
  // frustum planes from projection × view (Gribb/Hartmann), no three.js import needed
  const P = cam.projectionMatrix.elements;
  const V = cam.matrixWorldInverse.elements;
  const M = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) M[c * 4 + r] += P[k * 4 + r] * V[c * 4 + k];
  const row = (i) => [M[i], M[4 + i], M[8 + i], M[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const planes = [r0, r1, r2].flatMap((r) => [r3.map((v, i) => v + r[i]), r3.map((v, i) => v - r[i])]);
  const inView = (cx, cy, cz, rad) => planes.every((p) => (p[0] * cx + p[1] * cy + p[2] * cz + p[3]) / Math.hypot(p[0], p[1], p[2]) >= -rad);
  const rows = {};
  const label = (o) => {
    let top = o;
    while (top.parent && top.parent !== scene) top = top.parent;
    return top.name || top.constructor.name + "#" + scene.children.indexOf(top);
  };
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
    let v = true;
    for (let p = o; p; p = p.parent) if (!p.visible) v = false;
    if (!v) return;
    if (o.frustumCulled && o.geometry) {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const e = o.matrixWorld.elements;
      const c = o.geometry.boundingSphere.center;
      const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      const rad = o.geometry.boundingSphere.radius * sc * (o.isInstancedMesh ? 1e9 : 1);
      if (!o.isInstancedMesh && !inView(e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12], e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13], e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14], rad)) return;
    }
    const k = label(o);
    const r = (rows[k] ??= { top: k, meshes: 0, instanced: 0, draws: 0, shadowCasters: 0, tris: 0 });
    const mats = Array.isArray(o.material) ? o.material.length : 1;
    const groups = o.geometry?.groups?.length ? Math.min(o.geometry.groups.length, mats) : 1;
    r.meshes++;
    if (o.isInstancedMesh) r.instanced++;
    r.draws += groups;
    if (o.castShadow) r.shadowCasters += groups;
    const idx = o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0;
    r.tris += Math.round((idx / 3) * (o.isInstancedMesh ? o.count : 1));
  });
  return Object.values(rows).sort((a, b) => b.draws - a.draws).slice(0, 14);
}, !!process.env.FAR);
console.table(parts);
console.log("(the part table is for step 0)");

// the live loop: the frame watcher on its own, from the fullest step (software GL is slow, so it should step down)
if (process.env.LIVE) {
  // (only the live loop is wanted here)
  const live = await page.evaluate(async (secs) => {
    const m = window.__map;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    m.cam.zoom = 0.86;
    m.setQualityLevel(0);
    m.start();
    const seen = [];
    for (let s = 0; s <= secs; s += 10) {
      seen.push(`${s}s: step ${m.qualityLevel}/${m.qualitySteps - 1} (frames ${m.frames})`);
      await wait(10_000);
    }
    return seen;
  }, Number(process.env.LIVE));
  console.log(live.join("\n"));
}
await browser.close();
