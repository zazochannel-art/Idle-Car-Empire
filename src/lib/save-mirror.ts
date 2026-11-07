// A copy of the game's saves in the app's own storage (Capacitor Preferences: Android's
// SharedPreferences, iOS's UserDefaults), next to the WebView's localStorage. The WebView's
// storage can be cleared without the app being uninstalled (iOS frees it when the phone runs
// low on space; a WebView update or "clear cache" on some Android phones): the copy brings the
// save back at the next start. Only the saves are copied (game/save/local.ts), never the
// sign-in, and a save the game removed (sign out, a deleted account) is removed here at once.
import { Preferences } from "@capacitor/preferences";
import { SAVE_KEY_PREFIX, setSaveMirror } from "@/game/save/local";

/** How long a save waits before its copy is written (ms): a save every few seconds is copied about twice a minute. */
const WRITE_EVERY_MS = 20_000;

const waiting = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Writes the copies waiting (leaving the app, or the timer). */
export async function flushSaveMirror(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const batch = [...waiting];
  waiting.clear();
  await Promise.all(batch.map(([key, value]) => Preferences.set({ key, value }).catch(() => {})));
}

/** From now on every save is copied too. */
export function startSaveMirror() {
  setSaveMirror((key, value) => {
    if (value === null) {
      // a removal is never delayed: a save brought back after it was removed would be a surprise
      waiting.delete(key);
      void Preferences.remove({ key }).catch(() => {});
      return;
    }
    waiting.set(key, value);
    timer ??= setTimeout(() => void flushSaveMirror(), WRITE_EVERY_MS);
  });
}

/** Puts back every save the WebView lost (one it still has stays as it is); how many came back. */
export async function restoreSaveMirror(storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): Promise<number> {
  const { keys } = await Preferences.keys();
  let back = 0;
  for (const key of keys) {
    if (!key.startsWith(SAVE_KEY_PREFIX) || storage.getItem(key) !== null) continue;
    const { value } = await Preferences.get({ key });
    if (!value) continue;
    try {
      storage.setItem(key, value);
      back++;
    } catch {
      // the WebView's storage is full: the copy stays for the next start
    }
  }
  return back;
}
