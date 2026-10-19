// Google Play's in-app update (the Play app only): when Play has a newer version of the game, the
// player is offered it inside the game, and Update opens Play's own update screen. A new version
// is offered once as soon as Play knows it, then again every PLAY_UPDATE.remindDays; Later is
// always there. The test app (CI's test build, installed from a file) has its own offer
// (lib/test-update.ts), and the web game none.
import { isNativeApp, platform } from "./platform";

const OFFERED_KEY = "idle-car-empire:play-update-offered";
const DAY = 86_400_000;

export const PLAY_UPDATE = {
  /** Days before the same version is offered again. */
  remindDays: 3,
};

/** The version last offered on this device, and when. */
export interface Offered {
  code: string;
  at: number;
}

/** True when the version Play has (its version code) should be offered now. */
export function updateOfferDue(code: string, now: number, last: Offered | null): boolean {
  if (!code) return false;
  if (!last || last.code !== code) return true;
  return now - last.at >= PLAY_UPDATE.remindDays * DAY;
}

/** Reads what this device last offered (null: never, or storage unavailable). */
export function lastOffered(raw: string | null): Offered | null {
  try {
    const o = JSON.parse(raw ?? "null") as Partial<Offered> | null;
    return o && typeof o.code === "string" && typeof o.at === "number" ? { code: o.code, at: o.at } : null;
  } catch {
    return null;
  }
}

const playApp = () => isNativeApp() && platform() === "android" && !process.env.NEXT_PUBLIC_TEST_BUILD;

/**
 * The version code of a newer version Play has, if it is due to be offered (and marks it offered);
 * null otherwise: none, not installed from Play, offline, not the Play app.
 */
export async function playUpdateToOffer(now = Date.now()): Promise<string | null> {
  if (!playApp()) return null;
  try {
    const { AppUpdate, AppUpdateAvailability } = await import("@capawesome/capacitor-app-update");
    const info = await AppUpdate.getAppUpdateInfo();
    // an update the player started and left (the app closed during Play's screen) is offered too
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE && info.updateAvailability !== AppUpdateAvailability.UPDATE_IN_PROGRESS) return null;
    const code = info.availableVersionCode || "?";
    if (!updateOfferDue(code, now, lastOffered(window.localStorage.getItem(OFFERED_KEY)))) return null;
    window.localStorage.setItem(OFFERED_KEY, JSON.stringify({ code, at: now } satisfies Offered));
    return code;
  } catch {
    // not installed from Play (a file, an emulator), no Play services, storage unavailable
    return null;
  }
}

/** Play's update screen (it downloads, installs and restarts the game); the store's page if Play won't show it here. */
export async function installPlayUpdate(): Promise<void> {
  try {
    const { AppUpdate, AppUpdateResultCode } = await import("@capawesome/capacitor-app-update");
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.immediateUpdateAllowed) {
      const { code } = await AppUpdate.performImmediateUpdate();
      // the player closed Play's screen: that is their answer
      if (code === AppUpdateResultCode.OK || code === AppUpdateResultCode.CANCELED) return;
    }
    await AppUpdate.openAppStore();
  } catch {
    // Play unavailable: the player can update from the store as usual
  }
}
