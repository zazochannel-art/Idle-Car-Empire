// The app's link to the phone (loaded only inside the app, see
// components/game/native-app.tsx): the system Back button (Android), and the
// app going to the background and coming back.
import { App } from "@capacitor/app";
import { adNeeds, appPaused, appResumed, maybeShowAppOpen, setAdFree, setAdNeeds } from "./ads";
import { reportError } from "./errors";
import { iapConfigured } from "./iap";
import { cancelAway, scheduleAway } from "./notify";
// a dialog on screen (one already closing doesn't count: a second Back acts on what is under it)
import { openDialog } from "./open-dialog";
import { platform } from "./platform";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";


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

/** A tour or a race is on screen: no App Open ad over it. */
const appOpenBusy = () => {
  const u = useUi.getState();
  return u.tutorial || !!u.race;
};

let started = false;

/**
 * Whether the company last played had the ad-free rewards purchase, kept on the phone: before the
 * save is loaded, a rewarded ad can then be requested at once (an offline report's ×2 offer has one
 * ready sooner), never for a player who bought them. Unknown (a first start): requested.
 */
const AD_FREE_KEY = "ice.adFree";
function lastAdFree(): boolean {
  try {
    return localStorage.getItem(AD_FREE_KEY) === "1";
  } catch {
    return false;
  }
}
function keepAdFree(on: boolean) {
  try {
    localStorage.setItem(AD_FREE_KEY, on ? "1" : "0");
  } catch {
    // no storage: the next start waits for the save, as before
  }
}

export async function startNative() {
  if (started) return;
  started = true;
  await App.addListener("backButton", back);
  // Leaving the app (Home, another app, the screen turning off): save now and stop
  // ticking, since Android may close a background app at any moment and a stopped
  // game uses no battery. Coming back settles the time away like any absence.
  // With notifications on, the phone is told when something will be waiting (a building
  // finished, the offline limit reached); back in the game, those are taken back.
  // (the time away, for the App Open ad as the game comes back: lib/ads.ts appPaused; the game going
  // under one of its own full-screen ads is no time away)
  await App.addListener("pause", () => {
    appPaused();
    const g = useGame.getState();
    g.suspend();
    // the save suspend() just wrote, copied to the app's storage too (lib/save-mirror.ts)
    void import("./save-mirror").then((m) => m.flushSaveMirror()).catch(() => {});
    if (g.state.settings.notify) void scheduleAway(g.awayNotes());
  });
  await App.addListener("resume", () => {
    void cancelAway();
    useGame.getState().resume();
    // back after a while: an App Open ad, if the rules in lib/ads.ts allow (the report of the time away waits under it)
    const away = appResumed();
    if (away !== null) void maybeShowAppOpen(useGame.getState().state.lifetime.playTime, useGame.getState().state.chain.firstCar, away, appOpenBusy).catch(() => {});
  });
  void cancelAway();
  // ad-free rewards, for the company that bought them (also on a phone or a build that sells nothing).
  // Before the opening ad below: when the game becomes ready the store tells its subscribers in the
  // order they joined, and the opening ad must not be decided before this one knows the purchase.
  const adFree = () => setAdFree(useGame.getState().ready && useGame.getState().state.iap.owned.includes("adFree"));
  useGame.subscribe(adFree);
  adFree();
  // which ads may be requested at all (lib/ads.ts adNeeds): none with ad-free rewards, the full-screen
  // ones only once the company nears the age they may show at. Before the save is loaded, the rewarded
  // ad only, unless the company last played had ad-free rewards (the phone remembers it).
  let remembered = lastAdFree();
  const needs = () => {
    const g = useGame.getState();
    if (!g.ready) {
      setAdNeeds({ rewarded: !remembered, fullScreen: false });
      return;
    }
    const owned = g.state.iap.owned.includes("adFree");
    if (owned !== remembered) keepAdFree((remembered = owned));
    setAdNeeds(adNeeds(owned, g.state.lifetime.playTime, g.state.chain.firstCar));
  };
  useGame.subscribe(needs);
  needs();
  // rewarded ads, always the player's choice: the consent first, then an ad kept ready. (No App Open
  // ad as the game opens: the game is on screen at once, and an ad arriving seconds later would land
  // on a screen in use. They show when the player comes back to the game: "resume" above.)
  void import("./native-ads").then((m) => m.startAds()).catch((e) => reportError(e, "rejection"));
  // Google Play Games (achievements, a leaderboard): Android only, and only when the build has its project id
  if (platform() === "android") void import("./native-play-games").then((m) => m.startPlayGames()).catch((e) => reportError(e, "rejection"));
  // in-app purchases: Google Play only, and only once the build has its products (docs/android/iap.md)
  // a store that fails to start sells nothing: the anonymous error reports say so
  if (platform() === "android" && iapConfigured()) void import("./native-iap").then((m) => m.startIap()).catch((e) => reportError(e, "rejection"));
}
