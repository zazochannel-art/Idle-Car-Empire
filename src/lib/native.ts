// The app's link to the phone (loaded only inside the app, see
// components/game/native-app.tsx): the system Back button (Android), and the
// app going to the background and coming back.
import { App } from "@capacitor/app";
import { cancelAway, scheduleAway } from "./notify";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/** A dialog on screen (one already closing doesn't count: a second Back acts on what is under it). */
const openDialog = () => document.querySelector('[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"])');

/** The game's screens over the map, in the order Back looks at them (the race viewer first). */
const SCREENS = ["race", "view", "plot", "zone", "garage", "floor", "preview", "showcase", "celebrate"] as const;

/** What the Back button would close: a dialog, or one of the game's screens over the map (null: nothing). */
function onTop(): string | null {
  if (openDialog()) return "dialog";
  const u = useUi.getState();
  return SCREENS.find((k) => !!u[k]) ?? null;
}

/**
 * Back closes what is on top, the same way Escape does on a keyboard (every dialog,
 * sheet, card, factory floor and the garage already answers it); the race viewer has
 * only its close button, so Back does what that does. With nothing open, Back puts the
 * app in the background like the Home button: the company keeps running and the game
 * is where it was when the player returns.
 */
function back() {
  const top = onTop();
  // a debug build's console reaches logcat: scripts/android-device-check.mjs reads what each Back did
  console.info(`Back: ${top ? `close ${top}` : "minimize"}`);
  if (top === "race") {
    useUi.getState().setRace(null);
    return;
  }
  if (!top) {
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
  // With notifications on, the phone is told when something will be waiting (a building
  // finished, the offline limit reached); back in the game, those are taken back.
  await App.addListener("pause", () => {
    const g = useGame.getState();
    g.suspend();
    if (g.state.settings.notify) void scheduleAway(g.awayNotes());
  });
  await App.addListener("resume", () => {
    void cancelAway();
    useGame.getState().resume();
  });
  void cancelAway();
  // rewarded ads, always the player's choice: the consent first, then an ad kept ready
  void import("./native-ads").then((m) => m.startAds()).catch(() => {});
}
