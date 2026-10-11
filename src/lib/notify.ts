// Notifications while the game is in the background (another tab, the
// phone's home screen): a machine down, a decision on the desk, a building
// finished. Only with the player's consent, never while they are looking,
// and at most one per kind a minute.

const last = new Map<string, number>();

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;

/** Asks the browser for permission (on a tap). True once notifications are allowed. */
export async function askNotify(): Promise<boolean> {
  if (!notifySupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Shows a notification if the game is hidden and the player allowed them. */
export async function notifyAway(n: { title: string; body?: string; tag: string }) {
  if (!notifySupported() || Notification.permission !== "granted" || !document.hidden) return;
  const now = Date.now();
  if (now - (last.get(n.tag) ?? 0) < 60_000) return;
  last.set(n.tag, now);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const opts: NotificationOptions = { body: n.body, tag: n.tag, icon: `${base}/icon-192.png`, badge: `${base}/icon-192.png` };
  try {
    // phones only show them through the service worker
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(n.title, opts);
      return;
    }
    const note = new Notification(n.title, opts);
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // not allowed here (a private window, an old browser): stay quiet
  }
}
