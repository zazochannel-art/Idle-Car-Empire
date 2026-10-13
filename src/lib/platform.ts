// Where the game runs: a browser tab / installed web app, or the Android app
// (Capacitor). The app's page lives at https://localhost inside the phone, so
// anything meant for another person or another device (email links, the save
// transfer link) points at the public web game instead.

/** The public web game (GitHub Pages). */
export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "https://zazochannel-art.github.io/Idle-Car-Empire/";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

/** True inside the Android (or a future iOS) app: Capacitor's bridge is on the page before the game's scripts. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** An address of this game that works from anywhere: this page on the web, the public game in the app. */
export function publicPageUrl(): string {
  return isNativeApp() ? WEB_URL : window.location.href.split("#")[0];
}
