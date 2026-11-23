// When a guest is asked to add an email and a password (components/game/save-account.tsx): what is
// remembered on the phone, and the rule. A guest is asked about once a day, three times at most.

const KEY = "idle-car-empire:save-account-asked";
/** A guest is asked this many times at most, a day apart. */
export const SAVE_ACCOUNT_MAX_ASKS = 3;
export const SAVE_ACCOUNT_GAP_MS = 24 * 60 * 60_000;
/** Seconds of play after which a guest is asked even before the first car. */
export const SAVE_ACCOUNT_PLAY_SECONDS = 20 * 60;

export interface Asked {
  at: number;
  n: number;
}

export function readAsked(): Asked {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Asked> | null;
    if (v && typeof v.at === "number" && typeof v.n === "number") return { at: v.at, n: v.n };
  } catch {
    // unreadable: as if never asked
  }
  return { at: 0, n: 0 };
}

export function markAsked(now: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: now, n: readAsked().n + 1 }));
  } catch {
    // blocked storage: asked again next time, nothing worse
  }
}

/** Whether a guest is due the question now (pure, for the tests). */
export function saveAccountDue(c: { guest: boolean; pendingEmail: boolean; ready: boolean; playTime: number; carsProduced: number; now: number; asked: Asked }): boolean {
  if (!c.guest || c.pendingEmail || !c.ready) return false;
  if (c.playTime < SAVE_ACCOUNT_PLAY_SECONDS && c.carsProduced < 1) return false;
  if (c.asked.n >= SAVE_ACCOUNT_MAX_ASKS) return false;
  return c.asked.n === 0 || c.now - c.asked.at >= SAVE_ACCOUNT_GAP_MS;
}


/** The player added an email: never asked again. */
export function stopAskingToSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), n: SAVE_ACCOUNT_MAX_ASKS }));
  } catch {
    // blocked storage: the account itself (not a guest any more) stops it
  }
}
