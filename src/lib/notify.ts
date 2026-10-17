// Notifications while the game is closed: as the app goes to the background it
// asks the phone to notify the player when something will be waiting for them
// (a building finished, the offline limit reached), and takes those back when
// the player returns. Only with the player's consent. The plugin is loaded only
// inside the app; in a development browser there are none.
import { isNativeApp } from "./platform";

type Plugin = typeof import("@capacitor/local-notifications").LocalNotifications;

const plugin = (): Promise<Plugin | null> => (isNativeApp() ? import("@capacitor/local-notifications").then((m) => m.LocalNotifications, () => null) : Promise.resolve(null));

export const notifySupported = () => isNativeApp();

/** Asks the phone for permission (on a tap). True once notifications are allowed. */
export async function askNotify(): Promise<boolean> {
  const n = await plugin();
  if (!n) return false;
  try {
    let p = await n.checkPermissions();
    if (p.display !== "granted" && p.display !== "denied") p = await n.requestPermissions();
    return p.display === "granted";
  } catch {
    return false;
  }
}

export interface AwayNote {
  at: number;
  title: string;
  body: string;
}

/** Ids of the notifications this app schedules (each trip to the background replaces them). */
const FIRST_ID = 1000;

/** Takes back what was scheduled for the time away. */
export async function cancelAway() {
  const n = await plugin();
  if (!n) return;
  try {
    const { notifications } = await n.getPending();
    const mine = notifications.filter((x) => x.id >= FIRST_ID && x.id < FIRST_ID + 100);
    if (mine.length) await n.cancel({ notifications: mine.map((x) => ({ id: x.id })) });
  } catch {
    // nothing scheduled, or no permission: nothing to take back
  }
}

/** Schedules the notes for the time away (only if the player allowed notifications). */
export async function scheduleAway(notes: AwayNote[]) {
  const n = await plugin();
  if (!n || !notes.length) return;
  try {
    if ((await n.checkPermissions()).display !== "granted") return;
    await cancelAway();
    await n.schedule({
      notifications: notes.map((x, i) => ({
        id: FIRST_ID + i,
        title: x.title,
        body: x.body,
        // no exact alarm: a minute late is fine, and the app asks for no special permission
        schedule: { at: new Date(x.at), allowWhileIdle: true },
        isExactNotification: false,
      })),
    });
  } catch {
    // the phone refused: the game simply doesn't notify
  }
}
