// Short sounds (synthesised, no audio files) and haptics for game feedback.
// Both follow the player's settings and stay silent until the first tap,
// since browsers only allow audio after a user gesture.

export type Cue = "buy" | "coin" | "fanfare" | "error";

const prefs = { sound: true, haptics: true };
export function setFeedbackPrefs(p: { sound: boolean; haptics: boolean }) {
  Object.assign(prefs, p);
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

const NOTES: Record<Cue, [number, number, number][]> = {
  // [frequency, offset s, duration s]
  buy: [[660, 0, 0.08], [990, 0.05, 0.1]],
  coin: [[1320, 0, 0.06], [1760, 0.05, 0.12]],
  fanfare: [[523, 0, 0.18], [659, 0.12, 0.18], [784, 0.24, 0.18], [1047, 0.36, 0.4]],
  error: [[220, 0, 0.12]],
};
const HAPTIC: Record<Cue, number | number[]> = { buy: 12, coin: 0, fanfare: [30, 60, 30, 60, 60], error: [20, 40, 20] };

let lastCoin = 0;

/** Plays a cue. Coins (sales) are throttled so a busy empire doesn't buzz. */
export function cue(c: Cue) {
  const now = performance.now();
  if (c === "coin") {
    if (now - lastCoin < 450) return;
    lastCoin = now;
  }
  if (prefs.sound) {
    const a = audio();
    if (a) {
      const t0 = a.currentTime + 0.01;
      const vol = c === "coin" ? 0.04 : 0.08;
      for (const [f, off, d] of NOTES[c]) tone(a, f, t0 + off, d, vol, c === "error" ? "square" : "triangle");
    }
  }
  if (prefs.haptics && HAPTIC[c]) haptic(HAPTIC[c]);
}

/**
 * Android vibrates through the Vibration API. iPhone Safari has none, but
 * toggling a native switch control (iOS 18+) gives a light system haptic.
 */
let iosSwitch: HTMLLabelElement | null = null;
function haptic(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
    return;
  }
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}
