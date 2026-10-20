// A check that the player isn't a robot (Cloudflare Turnstile, free) before the server makes an
// account, signs one in or sends a password reset email. Only once the owner has turned CAPTCHA
// on in Supabase and the build has the widget's site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY,
// docs/captcha.md); without the key nothing loads and the sign-in calls go as before.
//
// The widget stays invisible unless Cloudflare wants a tap: then it shows over the game until it
// is solved. A token is good once, so every call renders a new widget and removes it after.

export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** True in a build made with the widget's site key. */
export const captchaOn = () => CAPTCHA_SITE_KEY.length > 0;

/** The check couldn't be done, or the server turned its token away. */
export class CaptchaError extends Error {
  name = "CaptchaError";
}

/** True for a failed check: ours, or Supabase's answer to a missing or bad token. */
export function captchaFailed(e: unknown): boolean {
  const x = e as { name?: string; code?: string; message?: string } | null;
  return x?.name === "CaptchaError" || x?.code === "captcha_failed" || /captcha/i.test(x?.message ?? "");
}

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

let script: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const w = window as unknown as { turnstile?: Turnstile };
    if (w.turnstile) return resolve(w.turnstile);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new CaptchaError("no turnstile")));
    s.onerror = () => {
      // no connection: the next try loads it again
      script = null;
      reject(new CaptchaError("turnstile didn't load"));
    };
    document.head.appendChild(s);
  });
  return script;
}

/** Turnstile's name for the game's language. */
const turnstileLang = (lang: string) => (lang === "pt" ? "pt-br" : ["en", "ro", "ru", "es", "de"].includes(lang) ? lang : "auto");

/** A one-time token for the server ("signup", "login", "reset"); throws CaptchaError when the check can't be done. */
export async function captchaToken(action: string, lang: string, waitMs = 90_000): Promise<string> {
  const turnstile = await loadTurnstile();
  const box = document.createElement("div");
  // above everything, near the bottom, where a thumb reaches it
  box.style.cssText = "position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647";
  document.body.appendChild(box);
  let id = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new CaptchaError("timed out")), waitMs);
      const fail = () => {
        clearTimeout(timer);
        reject(new CaptchaError("failed"));
      };
      id = turnstile.render(box, {
        sitekey: CAPTCHA_SITE_KEY,
        action,
        language: turnstileLang(lang),
        theme: "dark",
        appearance: "interaction-only",
        callback: (token: string) => {
          clearTimeout(timer);
          resolve(token);
        },
        "error-callback": fail,
        "expired-callback": fail,
        "timeout-callback": fail,
      });
    });
  } finally {
    if (id) turnstile.remove(id);
    box.remove();
  }
}
