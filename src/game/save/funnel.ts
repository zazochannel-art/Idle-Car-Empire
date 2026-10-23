// Sends one anonymous funnel step to the project's track_step() function
// (supabase/migrations/0006). Only the public key goes with it, never the
// player's session: the server can't tell who sent it, and stores only the
// step's name and the minutes of play. Off when the player switched it off,
// or when the browser asks not to be tracked.
import type { FunnelStep } from "../config/funnel";

const GATE_KEY = "idle-car-empire:funnel-gate";
/** Where the game keeps its saves in this browser (save/local.ts). */
const SAVE_PREFIX = "idle-car-empire:save";

/** The browser asks not to be tracked (Do Not Track, Global Privacy Control). */
export function browserOptOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return n.doNotTrack === "1" || n.msDoNotTrack === "1" || n.globalPrivacyControl === true;
}

/** Sends a step; true once the server took it ("ok"), or turned it away for good ("unknown"). */
export async function sendStep(step: FunnelStep | "ping", minutes: number): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || typeof fetch === "undefined") return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/track_step`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_step: step, p_minutes: Math.max(0, Math.floor(minutes)) }),
      keepalive: true,
    });
    if (!r.ok) return false;
    const answer = await r.json().catch(() => null);
    return answer === "ok" || answer === "unknown";
  } catch {
    return false;
  }
}

/** A game is already saved in this browser (a player from before accounts: not a new visitor). */
function hasLocalSave(): boolean {
  for (let i = 0; i < (localStorage.length ?? 0); i++) if (localStorage.key(i)?.startsWith(SAVE_PREFIX)) return true;
  return false;
}

/** The welcome page was shown to a new visitor: counted once per browser (there is no company yet). */
export function trackGate() {
  if (browserOptOut()) return;
  try {
    if (localStorage.getItem(GATE_KEY) || hasLocalSave()) return;
    localStorage.setItem(GATE_KEY, "1");
  } catch {
    return;
  }
  void sendStep("gate", 0);
}
