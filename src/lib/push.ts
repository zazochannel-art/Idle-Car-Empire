// Notifications from the server (supabase/migrations/0016_push.sql, supabase/functions/push): a
// gift, a friend who used the player's invite code, the weekly cup's end, an event. Only in an
// Android build made with Firebase (NEXT_PUBLIC_PUSH, docs/push.md), and only while the player
// has notifications on: the phone's token goes to the server with the game's language, and is
// forgotten when they turn notifications off or sign out. Without Firebase in the build the
// plugin is never asked for anything (its registration would fail there).
import { isNativeApp, platform } from "./platform";

type Module = typeof import("@capacitor/push-notifications");

export type PushKind = "gift" | "invite" | "cup" | "event";
const KINDS: PushKind[] = ["gift", "invite", "cup", "event"];

/** True in an Android build made with Firebase (the build's NEXT_PUBLIC_PUSH=1). */
export const pushSupported = () => process.env.NEXT_PUBLIC_PUSH === "1" && isNativeApp() && platform() === "android";

// as in notify.ts: the promise carries the module, never the plugin (a plugin answers "then")
const load = (): Promise<Module | null> => (pushSupported() ? import("@capacitor/push-notifications").catch(() => null) : Promise.resolve(null));

export interface PushHandlers {
  /** The phone's token: at each start, and whenever Firebase changes it. */
  token: (token: string) => void;
  /** The player tapped a notification. */
  open: (kind: PushKind) => void;
  /** A notification came while the game is open (Android doesn't show it then). */
  shown: (title: string, body: string) => void;
}

let handlers: PushHandlers | null = null;
let listening = false;
let token: string | null = null;

/** This phone's token, once Firebase gave it. */
export const pushToken = () => token;

/** Registers the phone for notifications from the server (notifications must be allowed already). */
export async function startPush(h: PushHandlers): Promise<boolean> {
  handlers = h;
  const p = (await load())?.PushNotifications;
  if (!p) return false;
  try {
    if (!listening) {
      listening = true;
      await p.addListener("registration", (t) => {
        token = t.value;
        handlers?.token(t.value);
      });
      await p.addListener("pushNotificationActionPerformed", (a) => {
        const kind = a.notification.data?.kind;
        if (KINDS.includes(kind)) handlers?.open(kind);
      });
      await p.addListener("pushNotificationReceived", (n) => {
        if (n.title) handlers?.shown(n.title, n.body ?? "");
      });
    }
    if ((await p.checkPermissions()).receive !== "granted") return false;
    // the channel the server's notes name (supabase/functions/push/lib.ts)
    await p.createChannel({ id: "game", name: "Idle Car Empire", importance: 3 }).catch(() => {});
    await p.register();
    return true;
  } catch {
    return false;
  }
}
