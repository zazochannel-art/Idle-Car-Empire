// A friend's invite code from the store link that brought this install (Google Play's install
// referrer, android/.../InstallReferrerPlugin.java). A player's shared card or clip links to the
// store with their code in it (share-card.ts shareUrl); the new player's game reads it once and
// uses the code for them, so they get the welcome gift without typing anything.
import { registerPlugin } from "@capacitor/core";
import { platform } from "./platform";

interface InstallReferrerPlugin {
  get(): Promise<{ referrer: string }>;
}

const DONE_KEY = "idle-car-empire:referrer-done";

/** The invite code in a Play referrer string ("utm_source=invite&…&utm_content=AB23CD"), or null. */
export function referrerCode(referrer: string): string | null {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(referrer);
  } catch {
    return null;
  }
  if (p.get("utm_source") !== "invite") return null;
  const code = (p.get("utm_content") ?? "").toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}

/** True once this phone's referrer was read and settled (used, or nothing to use). */
function done(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}
function markDone() {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // storage off: read again next time, the server answers "already"
  }
}

/**
 * Uses the code from the install's link, once per phone (the app only). `redeem` is the game's own
 * (store redeemInvite: the server checks the code, the game pays the gift); a network failure
 * leaves it for the next start.
 */
export async function redeemFromInstall(redeem: (code: string) => Promise<string>): Promise<void> {
  if (platform() !== "android" || done()) return;
  let referrer = "";
  try {
    referrer = (await registerPlugin<InstallReferrerPlugin>("InstallReferrer").get()).referrer ?? "";
  } catch {
    // an older app without the plugin
    markDone();
    return;
  }
  const code = referrerCode(referrer);
  if (!code) {
    markDone();
    return;
  }
  const res = await redeem(code).catch(() => "network");
  if (res !== "network") markDone();
}
