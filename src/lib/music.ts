// The background music (lib/music-score.ts) played with Web Audio: synthesised instruments (a
// warm pad, a round bass, an electric piano, a soft bell, a light beat), a gentle echo and a
// limiter, no audio files. Notes are scheduled a second ahead on the audio clock, so a busy
// frame never makes it stumble. It plays only while it is wanted (components/game/music-bridge):
// at 0 it fades out and its nodes are let go, and the song carries on from there next time.
import { audio } from "./feedback";
import { BAR_SECONDS, BEATS_PER_BAR, barNotes, type NoteEvent, type Voice } from "./music-score";

export const MUSIC = {
  /** The whole mix's level: a little under the game's own sounds (its cues play at about 0.08). */
  volume: 0.35,
  /** Fades, in seconds. */
  fadeIn: 2.5,
  fadeOut: 0.6,
  /** How far ahead notes are scheduled (s). */
  lookahead: 1.2,
};

const BEAT = BAR_SECONDS / BEATS_PER_BAR;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The mixer: one input per instrument, an echo for the piano and the bell, a limiter, the output level. */
export interface MusicGraph {
  out: GainNode;
  bus: Record<Voice, AudioNode>;
  /** The instruments' tones, each one oscillator (cheaper than layering several). */
  wave: { pad: PeriodicWave; bass: PeriodicWave; keys: PeriodicWave };
  /** Bright noise for the hat, filtered once here rather than at every hit. */
  noise: AudioBuffer;
}

/** A tone from its harmonics' levels (the first is the fundamental). */
function tone(a: BaseAudioContext, harmonics: number[]): PeriodicWave {
  const imag = new Float32Array([0, ...harmonics]);
  return a.createPeriodicWave(new Float32Array(imag.length), imag);
}

export function buildGraph(a: BaseAudioContext, dest: AudioNode): MusicGraph {
  const out = a.createGain();
  out.gain.value = 0;
  out.connect(dest);
  const limiter = a.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 12;
  limiter.ratio.value = 3;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;
  limiter.connect(out);
  // the echo: a dotted eighth, each repeat darker
  const echo = a.createDelay(2);
  echo.delayTime.value = BEAT * 0.75;
  const back = a.createGain();
  back.gain.value = 0.3;
  const dark = a.createBiquadFilter();
  dark.type = "lowpass";
  dark.frequency.value = 2200;
  echo.connect(dark).connect(back).connect(echo);
  const wet = a.createGain();
  wet.gain.value = 0.5;
  dark.connect(wet).connect(limiter);
  const bus = (send: number) => {
    const b = a.createGain();
    b.connect(limiter);
    if (send > 0) {
      const s = a.createGain();
      s.gain.value = send;
      b.connect(s).connect(echo);
    }
    return b;
  };
  // white noise, high-passed twice (a first difference): only the hiss of a hat is left
  const noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.5), a.sampleRate);
  const d = noise.getChannelData(0);
  let w1 = 0;
  let w2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (w - 2 * w1 + w2) / 4;
    w2 = w1;
    w1 = w;
  }
  return {
    out,
    noise,
    // a soft sawtooth (its upper harmonics fading fast), a round bass, a sine with a touch of its octave
    wave: {
      pad: tone(a, Array.from({ length: 14 }, (_, i) => Math.exp(-i / 4.5) / (i + 1))),
      bass: tone(a, [1, 0.55, 0.35, 0.18, 0.08]),
      keys: tone(a, [1, 0.4, 0.15, 0.06]),
    },
    bus: { pad: bus(0.15), bass: bus(0), keys: bus(0.3), bell: bus(0.45), kick: bus(0), hat: bus(0.1) },
  };
}

function osc(a: BaseAudioContext, shape: "sine" | PeriodicWave, freq: number, detune = 0) {
  const o = a.createOscillator();
  if (shape === "sine") o.type = "sine";
  else o.setPeriodicWave(shape);
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

/** Schedules one note at `t` (s on the audio clock). */
function play(a: BaseAudioContext, g: MusicGraph, n: NoteEvent, t: number) {
  const len = n.len * BEAT;
  const env = a.createGain();
  env.gain.setValueAtTime(0, t);
  env.connect(g.bus[n.voice]);
  const f = hz(n.midi);
  let src: AudioScheduledSourceNode;
  let end: number;
  switch (n.voice) {
    case "pad": {
      // the chord's notes a few cents apart (a light chorus), swelling in and fading out past the bar
      src = osc(a, g.wave.pad, f, n.midi % 2 ? 6 : -6);
      env.gain.linearRampToValueAtTime(n.vel * 0.06, t + 0.9);
      env.gain.setTargetAtTime(0, t + len, 0.4);
      end = t + len + 1.8;
      break;
    }
    case "bass": {
      src = osc(a, g.wave.bass, f);
      env.gain.linearRampToValueAtTime(n.vel * 0.1, t + 0.015);
      env.gain.exponentialRampToValueAtTime(n.vel * 0.05, t + 0.4);
      env.gain.setTargetAtTime(0, t + len, 0.08);
      end = t + len + 0.5;
      break;
    }
    case "keys": {
      src = osc(a, g.wave.keys, f);
      env.gain.linearRampToValueAtTime(n.vel * 0.12, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      end = t + 1.65;
      break;
    }
    case "bell": {
      // frequency modulation that fades: a bright strike settling into a pure tone
      const mod = osc(a, "sine", f * 3);
      const depth = a.createGain();
      depth.gain.setValueAtTime(f * 1.2, t);
      depth.gain.exponentialRampToValueAtTime(1, t + 0.7);
      src = osc(a, "sine", f);
      mod.connect(depth).connect((src as OscillatorNode).frequency);
      env.gain.linearRampToValueAtTime(n.vel * 0.09, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      end = t + 2.45;
      mod.start(t);
      mod.stop(end);
      break;
    }
    case "kick": {
      const o = osc(a, "sine", 105);
      o.frequency.setValueAtTime(105, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      src = o;
      env.gain.linearRampToValueAtTime(n.vel * 0.16, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      end = t + 0.35;
      break;
    }
    case "hat": {
      const s = a.createBufferSource();
      s.buffer = g.noise;
      s.connect(env);
      env.gain.linearRampToValueAtTime(n.vel * 0.14, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.start(t, Math.random() * 0.4);
      s.stop(t + 0.06);
      return;
    }
  }
  src.connect(env);
  src.start(t);
  src.stop(end);
}

/** Schedules a bar's notes from `t`. */
export function playBar(a: BaseAudioContext, g: MusicGraph, notes: NoteEvent[], t: number) {
  for (const n of notes) play(a, g, n, t + n.beat * BEAT);
}

/** The music as the game runs it. */
export class Music {
  private a: AudioContext | null = null;
  private g: MusicGraph | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private letGo: ReturnType<typeof setTimeout> | null = null;
  private nextAt = 0;
  private bar = 0;
  private readonly seed = Math.floor(Math.random() * 1e9);

  /** Plays at `level` (1 full, less under a factory's sounds); 0 fades out and frees the nodes. */
  set(level: number) {
    if (level > 0) {
      if (this.letGo) clearTimeout(this.letGo);
      this.letGo = null;
      if (!this.g) {
        const a = audio();
        if (!a) return;
        this.a = a;
        this.g = buildGraph(a, a.destination);
        this.nextAt = a.currentTime + 0.15;
      }
      this.g.out.gain.setTargetAtTime(level * MUSIC.volume, this.a!.currentTime, MUSIC.fadeIn / 3);
      this.timer ??= setInterval(() => this.pump(), 250);
      this.pump();
      return;
    }
    if (!this.g || !this.a) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.g.out.gain.setTargetAtTime(0, this.a.currentTime, MUSIC.fadeOut / 3);
    if (this.letGo) return;
    const g = this.g;
    this.letGo = setTimeout(() => {
      // the notes already scheduled end on their own; nothing is heard of them any more
      g.out.disconnect();
      if (this.g === g) this.g = null;
      this.letGo = null;
    }, MUSIC.fadeOut * 1000 + 400);
  }

  /** Schedules the bars that start within the look-ahead. */
  private pump() {
    const a = this.a;
    const g = this.g;
    if (!a || !g) return;
    // after a long pause of the timers (the app in the background): start again now, no catching up
    if (this.nextAt < a.currentTime - 0.5) this.nextAt = a.currentTime + 0.1;
    while (this.nextAt < a.currentTime + MUSIC.lookahead) {
      playBar(a, g, barNotes(this.seed, this.bar), this.nextAt);
      this.nextAt += BAR_SECONDS;
      this.bar++;
    }
  }
}
