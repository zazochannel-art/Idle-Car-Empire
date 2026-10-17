// Where the game runs: the Android or iOS app (Capacitor), or a development
// browser (next dev, the tests). The game's own pages live inside the app; the
// only public pages are the legal ones on the game's site (site/ in the repo).

/** The game's public site: the privacy policy, account deletion, and where account emails lead back to. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zazochannel-art.github.io/Idle-Car-Empire/";
export const PRIVACY_URL = `${SITE_URL}privacy/`;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

const capacitor = () => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor);

/** True inside the Android or iOS app: Capacitor's bridge is on the page before the game's scripts. */
export function isNativeApp(): boolean {
  return !!capacitor()?.isNativePlatform?.();
}

/** "android" or "ios" inside the app, "web" in a development browser. */
export function platform(): "android" | "ios" | "web" {
  const p = capacitor()?.getPlatform?.();
  return p === "android" || p === "ios" ? p : "web";
}
