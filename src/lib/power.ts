// Battery saver for long sessions. An idle game is often left open on a
// phone for hours, so when the saver is on the map and the factory floors
// draw less often (and hardly at all while nobody touches the screen) and
// the simulation ticks less often (fewer React updates). The game itself
// runs the same: the engine works from real elapsed time, so nothing is
// lost, only fewer frames are drawn.
//
// The setting is "auto" (on when the battery is low and not charging, where
// the browser tells), "on" or "off".

export type SaverSetting = "auto" | "on" | "off";

export const POWER = {
  /** Auto: on at this battery level or below, when not charging. */
  lowBattery: 0.2,
  /** No touch, click, key or wheel for this long counts as idle (ms). */
  idleAfter: 20_000,
  /** Shortest time between frames (ms): the saver while playing, the saver while idle, low graphics. */
  frameSaver: 1000 / 30,
  frameSaverIdle: 1000 / 6,
  frameLow: 1000 / 30,
  /** Shortest time between simulation ticks (ms): normal, saver, saver while idle. */
  tick: 100,
  tickSaver: 250,
  tickSaverIdle: 1000,
};

/** Whether the saver is on, from the setting and what the browser says of the battery (null: unknown). */
export function saverActive(setting: SaverSetting, battery: { level: number; charging: boolean } | null): boolean {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return !!battery && !battery.charging && battery.level <= POWER.lowBattery;
}

/** The shortest time between two frames of a 3D view (0: every frame the browser offers). */
export function minFrameMs(saver: boolean, idle: boolean, low: boolean): number {
  if (saver) return idle ? POWER.frameSaverIdle : POWER.frameSaver;
  return low ? POWER.frameLow : 0;
}

/** The shortest time between two simulation ticks. */
export function minTickMs(saver: boolean, idle: boolean): number {
  if (!saver) return POWER.tick;
  return idle ? POWER.tickSaverIdle : POWER.tickSaver;
}

// ───────────────────────────── the browser side ─────────────────────────────

let setting: SaverSetting = "auto";
let battery: { level: number; charging: boolean } | null = null;
let lastInput = typeof performance !== "undefined" ? performance.now() : 0;
let started = false;
const listeners = new Set<(active: boolean) => void>();
const watchers = new Set<() => void>();
let wasActive = false;
let version = 0;

function changed() {
  version++;
  for (const fn of watchers) fn();
  const now = isSaving();
  if (now !== wasActive) {
    wasActive = now;
    for (const fn of listeners) fn(now);
  }
}

/** Starts watching input and the battery (once, in the browser). */
export function startPower() {
  if (started || typeof window === "undefined") return;
  started = true;
  const touch = () => {
    lastInput = performance.now();
  };
  for (const ev of ["pointerdown", "pointermove", "wheel", "keydown", "touchstart"]) window.addEventListener(ev, touch, { passive: true, capture: true });
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }> };
  nav
    .getBattery?.()
    .then((b) => {
      const read = () => {
        battery = { level: b.level, charging: b.charging };
        changed();
      };
      read();
      b.addEventListener("levelchange", read);
      b.addEventListener("chargingchange", read);
    })
    .catch(() => {});
}

export function setSaverSetting(s: SaverSetting) {
  setting = s;
  changed();
}

/** The battery saver is on now. */
export const isSaving = () => saverActive(setting, battery);

/** Nobody has touched the screen for a while. */
export const isIdle = (now = performance.now()) => now - lastInput > POWER.idleAfter;

/** The battery as the browser reports it (null: it doesn't). */
export const batteryState = () => battery;

/** Called when the saver turns on or off (by the setting or the battery). Returns the unsubscribe. */
export function onSaverChange(fn: (active: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For a settings view: called on any change of the setting or the battery (useSyncExternalStore with `powerVersion`). */
export function watchPower(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

export const powerVersion = () => version;

/** For a 3D view's loop: whether to draw this frame (`last`: when it last drew). */
export function shouldDraw(now: number, last: number, low: boolean): boolean {
  const gap = minFrameMs(isSaving(), isIdle(now), low);
  // a little slack so a 60 Hz screen keeps an even 30 FPS
  return gap === 0 || now - last >= gap - 4;
}
