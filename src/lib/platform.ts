// Where the game runs: the Android or iOS app (Capacitor), or a development
// browser (next dev, the tests). The game's own pages live inside the app; the
// only public pages are the legal ones on the game's site (site/ in the repo).

/** The game's public site: the privacy policy, account deletion, and where account emails lead back to. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zazochannel-art.github.io/Idle-Car-Empire/";
export const PRIVACY_URL = `${SITE_URL}privacy/`;
/** What players agree to when they create an account (names, reports, fair play): site/terms/. */
export const TERMS_URL = `${SITE_URL}terms/`;
/** Where a password reset email's link leads: the page that sets the new password (site/reset-password/). */
export const RESET_PASSWORD_URL = `${SITE_URL}reset-password/`;
/** A legal page opened at the player's language: each page has a section per game language (#ro, #de…). */
export const legalUrl = (url: string, lang: string) => (lang === "en" ? url : `${url}#${lang}`);
/** Players' help address (the store listing's and the legal pages'). */
export const CONTACT_EMAIL = "idlecarempire@gmail.com";

/**
 * Reset emails need an email sender for every address (custom SMTP in Supabase: the built-in one
 * only writes to the project's team), so the game sends them only once the build is told it is set
 * up (the PASSWORD_RESET repository variable, docs/cloud-save.md); until then it shows the contact.
 */
export const PASSWORD_RESET_BY_EMAIL = ["on", "1", "true"].includes((process.env.NEXT_PUBLIC_PASSWORD_RESET ?? "").toLowerCase());

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
