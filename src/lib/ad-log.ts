// The ad diagnostics: one line per step of each ad (requested, loaded, failed, asked to show,
// shown, impression, closed), in logcat under the tag IDLE_CAR_ADMOB in every build (the native
// AdLog plugin, android/.../AdLogPlugin.java), and in the console of a debug build.
// In Android Studio: Logcat, filter "tag:IDLE_CAR_ADMOB".
import { registerPlugin } from "@capacitor/core";

export type AdEvent =
  | "AD_REQUEST_STARTED"
  | "AD_LOADED"
  | "AD_FAILED_TO_LOAD"
  | "AD_REQUEST_SKIPPED"
  | "AD_SHOW_REQUESTED"
  | "AD_SHOWED"
  | "AD_FAILED_TO_SHOW"
  | "AD_IMPRESSION_RECORDED"
  | "AD_REWARDED"
  | "AD_DISMISSED"
  | "AD_EXPIRED";

export type AdFormat = "rewarded" | "interstitial" | "appOpen";

export interface AdLogFields {
  /** The ad unit (only its last 4 characters are written). */
  unit?: string;
  /** Where in the game: the offer, the break, the resume… */
  place?: string;
  code?: number;
  message?: string;
  /** Anything else worth a word (why a request was skipped…). */
  note?: string;
}

interface AdLogPlugin {
  log(o: { line: string }): Promise<void>;
}

let native: AdLogPlugin | null = null;
/** Off outside the app (the web has no ads); turned on by native-ads.ts. */
let on = false;

export function enableAdLog() {
  if (on) return;
  on = true;
  try {
    native = registerPlugin<AdLogPlugin>("AdLog");
  } catch {
    native = null;
  }
}

/** A unit's last 4 characters ("…4348"): enough to tell the units apart, nothing more. */
export const maskUnit = (unit: string) => (unit ? `…${unit.slice(-4)}` : "");

/** The line written: the event, then the fields that are set (values with a space quoted). */
export function adLogLine(event: AdEvent, format: AdFormat, f: AdLogFields = {}, now = Date.now()): string {
  const parts: [string, string | number | undefined][] = [
    ["format", format],
    ["unit", f.unit ? maskUnit(f.unit) : undefined],
    ["place", f.place],
    ["code", f.code],
    ["message", f.message],
    ["note", f.note],
    ["t", new Date(now).toISOString()],
  ];
  const v = (x: string | number) => (typeof x === "string" && /[\s"]/.test(x) ? JSON.stringify(x.slice(0, 200)) : String(x));
  return [event, ...parts.filter(([, x]) => x !== undefined && x !== "").map(([k, x]) => `${k}=${v(x!)}`)].join(" ");
}

export function adLog(event: AdEvent, format: AdFormat, f: AdLogFields = {}) {
  if (!on) return;
  const line = adLogLine(event, format, f);
  if (process.env.NODE_ENV !== "production") console.info(`IDLE_CAR_ADMOB ${line}`);
  void native?.log({ line }).catch(() => {});
}
