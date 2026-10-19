// Anonymous error reports (supabase/migrations/0009): when the game hits an error on a
// player's phone, what went wrong and where goes to the project's report_error(), so it
// can be fixed. Only the public key goes with it, never the player's session: the
// report holds the error's message (emails, web addresses and long numbers taken out),
// the screen and the top lines of the stack, the app version, the platform and the
// Android/iOS and web engine versions. Off when the player switched "Anonymous
// statistics" off, or the browser asks not to be tracked; only from real builds.
import { browserOptOut } from "@/game/save/funnel";
import { platform } from "./platform";

export type ErrorKind = "error" | "rejection" | "screen";

/** Reports a session sends at most (a loop of errors sends a few, not thousands). */
export const MAX_PER_SESSION = 8;

/** The app's version and build (next.config.ts: android/version.properties and the commit). */
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

/** What is sent: kept short, without anything that could name the player. */
export interface ErrorReport {
  kind: ErrorKind;
  message: string;
  place: string;
}

/** Takes out what could be personal or unique to a player: emails, web addresses, ids, long numbers. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/\b(https?|capacitor|file):\/\/[^\s)'"]+/g, "<url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, "<token>")
    .replace(/\d{5,}/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Where it happened: the top few frames of the stack, each as the file's name and its
 * position (`3axubyg9.js:1:16728`), the page's address and folders taken out.
 */
export function placeOf(stack: string | undefined, frames = 4): string {
  if (!stack) return "";
  const out: string[] = [];
  for (const line of stack.split("\n")) {
    const m = /([\w.-]+\.(?:js|mjs|ts|tsx)):(\d+):(\d+)/.exec(line);
    if (!m) continue;
    const fn = /^\s*at\s+([\w$.<>]+)\s+\(/.exec(line)?.[1] ?? /^([\w$.<>]+)@/.exec(line.trim())?.[1];
    out.push(`${fn ? `${fn} ` : ""}${m[1]}:${m[2]}:${m[3]}`);
    if (out.length >= frames) break;
  }
  return out.join(" < ").slice(0, 560);
}

/** The phone's system and web engine, from its user agent: "Android 14 · Chrome 129". */
export function engineOf(ua: string): string {
  const android = /Android ([\d.]+)/.exec(ua)?.[1];
  const ios = /(?:iPhone|CPU) OS ([\d_]+)/.exec(ua)?.[1]?.replace(/_/g, ".");
  const chrome = /Chrome\/(\d+)/.exec(ua)?.[1];
  const safari = /Version\/([\d.]+).*Safari/.exec(ua)?.[1];
  const os = android ? `Android ${android}` : ios ? `iOS ${ios}` : "";
  const web = chrome ? `Chrome ${chrome}` : safari ? `Safari ${safari}` : "";
  return [os, web].filter(Boolean).join(" · ").slice(0, 64);
}

/** Errors that say nothing about the game: a script from elsewhere, a browser quirk. */
function noise(message: string): boolean {
  return message === "Script error." || /ResizeObserver loop/.test(message) || message === "";
}

type Sent = ErrorReport & { version: string; platform: string; engine: string };

interface Options {
  /** The player allows anonymous statistics (Settings); null while that isn't known yet (the save not loaded). */
  allowed: () => boolean | null;
  /** The screen open now ("research", "map"…). */
  screen: () => string;
  send?: (report: Sent) => Promise<void>;
}

/** Sends reports through the project's public API (the same way as the funnel's steps). */
async function post(body: Sent) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || typeof fetch === "undefined") return;
  await fetch(`${url}/rest/v1/rpc/report_error`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_kind: body.kind, p_message: body.message, p_place: body.place, p_version: body.version, p_platform: body.platform, p_engine: body.engine }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * The reporter of this session: each different error once, at most MAX_PER_SESSION. Errors from
 * before the player's choice is known (the start) wait for it: sent once it allows them, dropped
 * if it doesn't, never sent if the game doesn't get that far.
 */
export function createReporter(o: Options) {
  const seen = new Set<string>();
  let held: Sent[] = [];
  const send = o.send ?? post;
  const allowed = (): boolean | null => {
    try {
      return browserOptOut() ? false : o.allowed();
    } catch {
      return false;
    }
  };
  const flush = () => {
    const ok = allowed();
    if (ok === null) return;
    const out = held;
    held = [];
    if (ok) for (const r of out) void send(r).catch(() => {});
  };
  const report = (error: unknown, kind: ErrorKind) => {
    const e = error as { message?: unknown; stack?: unknown; name?: unknown } | null;
    const raw = typeof e?.message === "string" ? e.message : typeof error === "string" ? error : String(error ?? "");
    if (noise(raw)) return;
    const ok = allowed();
    if (ok === false) return;
    const name = typeof e?.name === "string" && e.name !== "Error" ? `${e.name}: ` : "";
    const message = scrub(name + raw);
    const screen = o.screen();
    const place = [screen && `[${screen}]`, placeOf(typeof e?.stack === "string" ? e.stack : undefined)].filter(Boolean).join(" ");
    const id = `${kind}|${message}|${place}`;
    if (seen.has(id) || seen.size >= MAX_PER_SESSION) return;
    seen.add(id);
    held.push({ kind, message, place, version: VERSION, platform: platform(), engine: typeof navigator === "undefined" ? "" : engineOf(navigator.userAgent) });
    flush();
  };
  return { report, flush };
}

let reporter: ReturnType<typeof createReporter> | null = null;

/** Reports an error caught by the game itself (a screen that failed). */
export function reportError(error: unknown, kind: ErrorKind = "error") {
  reporter?.report(error, kind);
}

/** The player's choice may be known now (the save loaded): the errors held until then go, or are dropped. */
export function flushErrorReports() {
  reporter?.flush();
}

/** Listens for the errors nothing caught. Once, at the start, in real builds with the cloud set up. */
export function installErrorReports(o: Options) {
  if (reporter || typeof window === "undefined" || process.env.NODE_ENV !== "production" || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const r = createReporter(o);
  reporter = r;
  window.addEventListener("error", (ev) => {
    // a picture or a script that didn't load fires here too, without an error: not a bug
    if (!ev.error && !ev.message) return;
    r.report(ev.error ?? ev.message, "error");
  });
  window.addEventListener("unhandledrejection", (ev) => r.report(ev.reason, "rejection"));
}
