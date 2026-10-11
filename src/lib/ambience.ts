// The sound of a factory floor, synthesised (no audio files): a low hum of
// motors, the rattle of the belts, a clank or a hiss of air now and then,
// and an alarm while a machine is down. It follows the line: louder and
// busier when it runs, quicker under a boost, almost silent when it stands,
// and quiet when sound is off or the game is in the background.
import { audio, soundOn } from "./feedback";

export interface AmbienceState {
  running: boolean;
  boost: boolean;
  broken: boolean;
}

/** A buffer of noise: white, or brown (deeper, like distant machinery). */
function noise(a: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export class FactoryAmbience {
  private a: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: GainNode | null = null;
  private belt: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private white: AudioBuffer | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextClank = 0;
  private nextAlarm = 0;
  private state: AmbienceState = { running: false, boost: false, broken: false };

  start() {
    const a = audio();
    if (!a || this.a) return;
    this.a = a;
    const master = (this.master = a.createGain());
    master.gain.value = 0;
    master.connect(a.destination);
    // the motors: brown noise through a low-pass, and the mains hum under it
    const hum = (this.hum = a.createGain());
    hum.connect(master);
    const rumble = a.createBufferSource();
    rumble.buffer = noise(a, 3, true);
    rumble.loop = true;
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    rumble.connect(lp).connect(hum);
    const mains = a.createOscillator();
    mains.frequency.value = 50;
    const mg = a.createGain();
    mg.gain.value = 0.18;
    mains.connect(mg).connect(hum);
    // the belts: band-passed noise, beating at the rollers' pace
    this.white = noise(a, 2, false);
    const rattle = a.createBufferSource();
    rattle.buffer = this.white;
    rattle.loop = true;
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 1.6;
    const beat = a.createGain();
    beat.gain.value = 0.5;
    const lfo = (this.lfo = a.createOscillator());
    lfo.frequency.value = 7;
    const depth = a.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(beat.gain);
    const belt = (this.belt = a.createGain());
    rattle.connect(bp).connect(beat).connect(belt).connect(master);
    for (const src of [rumble, mains, rattle, lfo]) src.start();
    this.sources.push(rumble, mains, rattle, lfo);
    this.apply();
    this.timer = setInterval(() => this.step(), 120);
  }

  set(state: AmbienceState) {
    this.state = state;
    this.apply();
  }

  /** Levels for the line's state (eased, so nothing clicks). */
  private apply() {
    const a = this.a;
    if (!a || !this.master || !this.hum || !this.belt || !this.lfo) return;
    const t = a.currentTime;
    const { running, boost } = this.state;
    const on = soundOn() && typeof document !== "undefined" && !document.hidden;
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.25);
    this.hum.gain.setTargetAtTime(running ? 0.09 : 0.03, t, 0.6);
    this.belt.gain.setTargetAtTime(running ? (boost ? 0.03 : 0.018) : 0, t, 0.4);
    this.lfo.frequency.setTargetAtTime(boost ? 13 : 7, t, 0.5);
  }

  /** The machines' own noises, now and then; the alarm while one is down. */
  private step() {
    const a = this.a;
    if (!a || !this.master) return;
    this.apply();
    if (!soundOn() || document.hidden) return;
    const t = a.currentTime;
    const { running, boost, broken } = this.state;
    if (running && t >= this.nextClank) {
      if (Math.random() < 0.7) this.clank(t);
      else this.hiss(t);
      this.nextClank = t + (boost ? 0.35 : 0.7) + Math.random() * (boost ? 0.8 : 1.8);
    }
    if (broken && t >= this.nextAlarm) {
      this.beep(t, 880);
      this.beep(t + 0.22, 660);
      this.nextAlarm = t + 2.6;
    }
  }

  private burst(t: number, freq: number, q: number, vol: number, dur: number, type: BiquadFilterType = "bandpass") {
    const a = this.a!;
    const src = a.createBufferSource();
    src.buffer = this.white;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** A press or a tool coming down: a thud and a short metallic ring. */
  private clank(t: number) {
    const a = this.a!;
    this.burst(t, 180 + Math.random() * 220, 1.2, 0.09, 0.12);
    const o = a.createOscillator();
    o.type = "triangle";
    o.frequency.value = 900 + Math.random() * 1500;
    const g = a.createGain();
    g.gain.setValueAtTime(0.012, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.3);
  }

  /** A pneumatic tool letting off air. */
  private hiss(t: number) {
    this.burst(t, 3500, 0.7, 0.025, 0.35, "highpass");
  }

  private beep(t: number, freq: number) {
    const a = this.a!;
    const o = a.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.2);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const a = this.a;
    const master = this.master;
    if (a && master) {
      master.gain.setTargetAtTime(0, a.currentTime, 0.1);
      const sources = this.sources;
      setTimeout(() => {
        for (const s of sources) {
          try {
            s.stop();
          } catch {
            // already stopped
          }
        }
        master.disconnect();
      }, 400);
    }
    this.sources = [];
    this.a = null;
    this.master = null;
  }
}
