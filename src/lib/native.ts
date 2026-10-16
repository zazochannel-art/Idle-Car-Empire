// The Android app's link to the phone (loaded only inside the app, see
// components/game/native-app.tsx): the system Back button, and the app going
// to the background and coming back.
import { App } from "@capacitor/app";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/** A dialog on screen (one already closing doesn't count: a second Back acts on what is under it). */
const openDialog = () => document.querySelector('[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"])');

/** Something the Back button can close: a dialog, or one of the game's screens over the map. */
function somethingOpen(): boolean {
  if (openDialog()) return true;
  const u = useUi.getState();
  return !!(u.view || u.plot || u.zone || u.garage || u.floor || u.race || u.preview || u.showcase || u.celebrate);
}

/**
 * Back closes what is on top, the same way Escape does on a keyboard (every dialog,
 * sheet, card, factory floor and the garage already answers it); the race viewer has
 * only its close button, so Back does what that does. With nothing open, Back puts the
 * app in the background like the Home button: the company keeps running and the game
 * is where it was when the player returns.
 */
function back() {
  const u = useUi.getState();
  if (!openDialog() && u.race) {
    u.setRace(null);
    return;
  }
  if (!somethingOpen()) {
    void App.minimizeApp();
    return;
  }
  // Controlled Radix dialogs can miss a synthetic Escape when Android/WebView focus is stale.
  // Notify the active React dialog directly, then keep Escape as a fallback for sheets/overlays.
  window.dispatchEvent(new CustomEvent("idle-car-empire:native-back"));
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
}

let started = false;

export async function startNative() {
  if (started) return;
  started = true;
  await App.addListener("backButton", back);
  // Leaving the app (Home, another app, the screen turning off): save now and stop
  // ticking, since Android may close a background app at any moment and a stopped
  // game uses no battery. Coming back settles the time away like any absence.
  await App.addListener("pause", () => useGame.getState().suspend());
  await App.addListener("resume", () => useGame.getState().resume());
  // rewarded ads, always the player's choice: the consent first, then an ad kept ready
  void import("./native-ads").then((m) => m.startAds()).catch(() => {});
}
