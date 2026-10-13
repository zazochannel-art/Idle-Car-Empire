// Checks the installed Android app on a phone or an emulator, over adb:
//
//   node scripts/android-device-check.mjs <app-debug.apk> [--reboot] [--out dir]
//
// It installs the APK (a debug build: the only kind whose WebView can be inspected),
// opens the game and drives it through what a phone does to an app:
//   - the game itself starts (not a blank or placeholder page);
//   - the Back button closes a dialog, and with nothing open puts the app in the background;
//   - leaving the app saves the game (the save on the phone is fresh);
//   - the game survives the app being killed, an app update (reinstall over it) and,
//     with --reboot, the phone restarting: same company, same settings.
// Screenshots go to the output folder (default android-check/). Needs adb on the PATH
// (Android SDK platform-tools) and Node 22+. Exits non-zero if a check fails.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const apk = args.find((a) => a.endsWith(".apk"));
const reboot = args.includes("--reboot");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : "android-check";
if (!apk) {
  console.error("usage: node scripts/android-device-check.mjs <app-debug.apk> [--reboot] [--out dir]");
  process.exit(2);
}
const PKG = process.env.APP_ID ?? "com.zazochannel.idlecarempire.debug";
const ACTIVITY = "com.zazochannel.idlecarempire.MainActivity";
const SAVE = "idle-car-empire:save:v1";
const PORT = 9333;
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync("adb", a, { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] }).trim();
const results = [];
function check(ok, what, detail = "") {
  results.push({ ok, what, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
}

// ─── the WebView, over the Chrome DevTools protocol ───

let ws = null;
let nextId = 1;
const pending = new Map();

async function connect(timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const pid = adb("shell", "pidof", PKG);
      const sockets = adb("shell", "cat", "/proc/net/unix");
      const name = `webview_devtools_remote_${pid}`;
      if (pid && sockets.includes(name)) {
        try {
          adb("forward", "--remove", `tcp:${PORT}`);
        } catch {
          // nothing forwarded yet
        }
        adb("forward", `tcp:${PORT}`, `localabstract:${name}`);
        const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        const games = pages.filter((p) => p.type === "page" && p.url.startsWith("https://localhost"));
        const page = games[0];
        if (page) {
          // (one game page per app: more would mean two copies of the game running)
          console.log(`      devtools: ${pages.length} target(s): ${pages.map((p) => `${p.type} ${p.url} ${p.id.slice(0, 8)}`).join(" | ")}`);
          ws?.close();
          ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => {
            ws.onopen = res;
            ws.onerror = rej;
          });
          ws.onmessage = (m) => {
            const msg = JSON.parse(m.data);
            pending.get(msg.id)?.(msg);
            pending.delete(msg.id);
          };
          return page.url;
        }
      }
    } catch {
      // the app is still starting
    }
    await sleep(1000);
  }
  throw new Error("the app's WebView never became inspectable");
}

// (generous: on an emulator without a GPU the first 3D frames keep the page busy for a while)
async function evaluate(expression, timeoutMs = 120_000) {
  const id = nextId++;
  const reply = new Promise((res) => pending.set(id, res));
  ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  const msg = await Promise.race([reply, sleep(timeoutMs).then(() => ({ error: { message: `no answer from the page in ${timeoutMs / 1000} s` } }))]);
  if (msg.error) throw new Error(msg.error.message);
  if (msg.result.exceptionDetails) throw new Error(msg.result.exceptionDetails.text);
  return msg.result.result.value;
}

async function waitFor(expression, timeoutMs, what) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // a reload in progress
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// the game screen is up: the HUD's cash counter is on screen
const GAME_UP = `(document.querySelector("header .race-type")?.getBoundingClientRect().width ?? 0) > 0`;
// (a dialog already closing doesn't count, as for the app's own Back button)
const DIALOG_OPEN = `!!document.querySelector('[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"])')`;
const SAVED = `(() => { const r = localStorage.getItem(${JSON.stringify(SAVE)}); if (!r) return null; const d = JSON.parse(r); return { createdAt: d.state.createdAt, lang: d.state.settings.lang, savedAt: d.savedAt }; })()`;

/** What Android and the WebView said (the app's lifecycle, console errors, crashes), kept in the output folder. */
function dumpLogcat(name, tail) {
  try {
    const log = adb("logcat", "-d", "-v", "time")
      .split("\n")
      .filter((l) => /Capacitor|chromium|AndroidRuntime|idlecarempire|WebView/.test(l) && !/Handling local request|Loading app at|AppsFilter/.test(l));
    fs.writeFileSync(path.join(outDir, `${name}.txt`), log.join("\n"));
    console.log(`\n${name} (${log.length} lines, last ${tail}):\n${log.slice(-tail).join("\n")}\n`);
  } catch (e) {
    console.log(`${name}:`, e.message);
  }
}

const focus = () =>
  adb("shell", "dumpsys", "window")
    .split("\n")
    .filter((l) => /mCurrentFocus|mFocusedApp/.test(l))
    .map((l) => l.trim());
const inFront = () => focus().some((l) => l.includes(PKG));
const noDialog = () => evaluate(`!(${DIALOG_OPEN})`).catch(() => false);

/** Polls until the condition holds or the time is up, and returns its last value. On an emulator
 * without a GPU the page can be busy for many seconds, so what Back starts may finish late. */
async function until(fn, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let v = await fn();
  while (!v && Date.now() < end) {
    await sleep(1000);
    v = await fn();
  }
  return v;
}

/** The app's lifecycle as Android and Capacitor logged it (pauses, resumes, a WebView recreated). */
function lifecycle() {
  try {
    const lines = adb("logcat", "-d", "-v", "time")
      .split("\n")
      .filter((l) => /Starting BridgeActivity|App (started|restarted|resumed|paused|stopped|destroyed)|Notifying listeners for event|destroyed WebView/.test(l));
    console.log(`\nlifecycle (last 40 of ${lines.length}):\n${lines.slice(-40).join("\n")}\n`);
  } catch (e) {
    console.log("lifecycle:", e.message);
  }
}
const shot = (name) => fs.writeFileSync(path.join(outDir, `${name}.png`), execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 }));

/** Waits until the page answers quickly again (the map's first frames are heavy without a GPU). */
async function settle() {
  const end = Date.now() + 300_000;
  while (Date.now() < end) {
    const t = Date.now();
    await evaluate("1", 120_000).catch(() => {});
    if (Date.now() - t < 3000) return;
  }
}

async function launch() {
  adb("shell", "am", "start", "-W", "-n", `${PKG}/${ACTIVITY}`);
  await connect();
  // a no-cloud build goes straight in; a cloud build shows the welcome page to a new player
  const end = Date.now() + 240_000;
  while (Date.now() < end) {
    if (await evaluate(GAME_UP).catch(() => false)) {
      await settle();
      const t = await evaluate("performance.timeOrigin").catch(() => 0);
      console.log(`      page started ${new Date(t).toISOString()}`);
      return;
    }
    const guest = await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => /without an account/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()`).catch(() => false);
    if (guest) console.log("      (welcome page: played without an account)");
    await sleep(1500);
  }
  throw new Error("the game never appeared");
}

try {
  console.log(
    `device: ${adb("shell", "getprop", "ro.product.model")} · Android ${adb("shell", "getprop", "ro.build.version.release")} · WebView ${adb("shell", "dumpsys", "webviewupdate").match(/Current WebView package \(name, version\): \((.*?)\)/)?.[1] ?? "?"}`,
  );
  try {
    adb("uninstall", PKG);
  } catch {
    // not installed yet
  }
  adb("install", apk);

  // 1. the real game starts
  const t0 = Date.now();
  await launch();
  const url = await evaluate("location.href");
  check(url.startsWith("https://localhost/"), "the app opens the game from its own files", `${url}, ${Math.round((Date.now() - t0) / 1000)} s to the game screen`);
  const title = await evaluate("document.title");
  check(/Idle Car Empire/.test(title), "the page is the game", title);
  await sleep(4000);
  shot("1-game");
  const first = await evaluate(SAVED);
  check(!!first?.createdAt, "a save exists on the phone", JSON.stringify(first));

  // 2. a setting changed through the game's own screen (Settings → Română)
  const opened = await evaluate(`(() => { const b = [...document.querySelectorAll("header button")].at(-1); b.click(); return true; })()`);
  await waitFor(DIALOG_OPEN, 15_000, "the Settings dialog");
  check(opened, "Settings opens");
  shot("2-settings");
  // 3. Back closes the dialog and the app stays open
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  const closed = await until(noDialog, 30_000);
  const stayed = inFront();
  check(closed && stayed, "Back closes the dialog (the app stays open)", closed ? (stayed ? "" : `the app left: ${focus().join(" · ")}`) : "the dialog is still open after 30 s");

  await evaluate(`[...document.querySelectorAll("header button")].at(-1).click()`);
  await waitFor(DIALOG_OPEN, 15_000, "the Settings dialog");
  await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => /Română/.test(b.textContent)).click()`);
  await waitFor(`(${SAVED})?.lang === "ro"`, 20_000, "the language in the save");
  // Back closes Settings (pressed again only if it is still open a while later)
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  for (let i = 0; i < 2 && !(await until(noDialog, 20_000)); i++) adb("shell", "input", "keyevent", "KEYCODE_BACK");

  // 4. Back with nothing open: the app goes to the background, and leaving saves the game
  await settle();
  const before = (await evaluate(SAVED)).savedAt;
  await sleep(1500);
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  const left = await until(() => !inFront(), 30_000);
  check(left, "Back with nothing open puts the app in the background", left ? "" : `still in front after 30 s: ${focus().join(" · ")}; dialog open: ${await evaluate(DIALOG_OPEN).catch(() => "?")}`);
  const after = await evaluate(SAVED);
  check(after.savedAt > before, "leaving the app saved the game at once", `${new Date(before).toISOString()} → ${new Date(after.savedAt).toISOString()}`);
  // while it plays, the game saves every 5 s; in the background, after the save of leaving (and
  // the page's own one when it is hidden), nothing more is written
  await sleep(4000);
  const quiet = await evaluate(SAVED);
  await sleep(12_000);
  const later = await evaluate(SAVED);
  check(
    later.savedAt === quiet.savedAt,
    "the game stops ticking in the background (no battery use)",
    later.savedAt === quiet.savedAt ? "no saves for 12 s" : `still saving: ${new Date(quiet.savedAt).toISOString()} → ${new Date(later.savedAt).toISOString()}`,
  );
  lifecycle();

  // 5. back to the app: it continues where it was
  adb("shell", "am", "start", "-W", "-n", `${PKG}/${ACTIVITY}`);
  await waitFor(GAME_UP, 60_000, "the game after coming back");
  check(inFront(), "the app comes back to the game");

  // 6. Android kills the app (low memory, swiped away): same company on the next start
  await sleep(6000); // the WebView writes storage to disk a few seconds after a change
  adb("shell", "am", "force-stop", PKG);
  await sleep(1000);
  await launch();
  const killed = await evaluate(SAVED);
  check(killed?.createdAt === first.createdAt && killed?.lang === "ro", "after the app is killed: same company, same settings", JSON.stringify(killed));
  shot("3-after-kill");

  // 7. an app update (installed over the old one): progress kept
  await sleep(6000);
  adb("install", "-r", apk);
  await launch();
  const updated = await evaluate(SAVED);
  check(updated?.createdAt === first.createdAt && updated?.lang === "ro", "after an app update: same company, same settings", JSON.stringify(updated));

  // 8. the phone restarts
  if (reboot) {
    dumpLogcat("logcat-before-reboot", 80);
    await sleep(6000);
    adb("shell", "input", "keyevent", "KEYCODE_HOME");
    await sleep(3000);
    adb("reboot");
    adb("wait-for-device");
    const end = Date.now() + 300_000;
    while (Date.now() < end && adb("shell", "getprop", "sys.boot_completed") !== "1") await sleep(3000);
    await sleep(10_000);
    await launch();
    const rebooted = await evaluate(SAVED);
    check(rebooted?.createdAt === first.createdAt && rebooted?.lang === "ro", "after the phone restarts: same company, same settings", JSON.stringify(rebooted));
    shot("4-after-reboot");
  }
} catch (e) {
  check(false, "the run finished", e.message);
  try {
    shot("error");
  } catch {
    // no device
  }
}
ws?.close();
dumpLogcat("logcat", 60);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
