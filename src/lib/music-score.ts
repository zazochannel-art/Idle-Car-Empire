// The game's background music, as notes: a calm loop written by the code itself (no recording,
// nothing licensed). Four-bar phrases on a handful of warm chord progressions in C major; the
// layers come and go phrase by phrase (a pad alone, then the bass, the electric piano, a soft
// beat, a bell melody now and then), so it never quite repeats. lib/music.ts plays it.
// Pure: the same seed and bar always give the same notes.

export const BPM = 84;
export const BEATS_PER_BAR = 4;
export const BAR_SECONDS = (60 / BPM) * BEATS_PER_BAR;
export const BARS_PER_PHRASE = 4;

export type Voice = "pad" | "bass" | "keys" | "bell" | "kick" | "hat";

/** One note: when in the bar (beats), how long (beats), the pitch (MIDI; drums 0) and how loud (0–1). */
export interface NoteEvent {
  voice: Voice;
  beat: number;
  len: number;
  midi: number;
  vel: number;
}

/** A chord: its root (pitch class, C = 0) and its notes above the root (semitones). */
interface Chord {
  root: number;
  tones: number[];
}

const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const SIX = [0, 4, 7, 9];
const C = { root: 0, tones: MAJ7 };
const Dm = { root: 2, tones: MIN7 };
const Em = { root: 4, tones: MIN7 };
const F = { root: 5, tones: MAJ7 };
const G = { root: 7, tones: SIX };
const Am = { root: 9, tones: MIN7 };

/** The progressions a phrase can take (one chord a bar). */
export const PROGRESSIONS: Chord[][] = [
  [F, G, Em, Am],
  [Am, F, C, G],
  [Dm, G, C, Am],
  [F, Em, Dm, C],
];

/** C major pentatonic: the bell's notes. */
const PENTATONIC = [0, 2, 4, 7, 9];

/**
 * Which layers play in a phrase, by its place in the song: 1 the pad and a bell, 2 with the
 * bass, 3 with the electric piano, 4 with the beat. It builds up, holds, and breathes out.
 */
const INTENSITY = [1, 2, 3, 4, 4, 3, 4, 2];

/** A small seeded random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pitch of a pitch class nearest above `low` (MIDI). */
const above = (pc: number, low: number) => low + ((((pc - low) % 12) + 12) % 12);

/** The chord's notes, each placed in one octave from `low` up: close voicings that move little from chord to chord. */
export function voicing(chord: Chord, low: number): number[] {
  return chord.tones.map((t) => above((chord.root + t) % 12, low)).sort((a, b) => a - b);
}

/** The progressions of a block of phrases, in a shuffled order (block 0: in order). */
function shuffled(seed: number, block: number): number[] {
  const order = PROGRESSIONS.map((_, i) => i);
  if (block === 0) return order;
  const r = rng(seed * 7919 + block * 104729);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The progression and intensity of a phrase: every progression once a block, never the same twice running. */
export function phrase(seed: number, index: number): { chords: Chord[]; intensity: number } {
  const n = PROGRESSIONS.length;
  const block = Math.floor(index / n);
  const order = shuffled(seed, block);
  // the block's first phrase can't repeat the last one before it (a swap of the first two leaves the last in place)
  if (block > 0 && order[0] === shuffled(seed, block - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return { chords: PROGRESSIONS[order[index % n]], intensity: INTENSITY[index % INTENSITY.length] };
}

/** The notes of one bar of the song (bar 0 is the first). */
export function barNotes(seed: number, bar: number): NoteEvent[] {
  const p = Math.floor(bar / BARS_PER_PHRASE);
  const inPhrase = bar % BARS_PER_PHRASE;
  const { chords, intensity } = phrase(seed, p);
  const chord = chords[inPhrase];
  // patterns are drawn once a phrase, so its four bars share a rhythm
  const pr = rng(seed * 31 + p * 977);
  const keysSteps = Array.from({ length: 8 }, (_, i) => i === 0 || pr() < 0.42);
  const bellSteps = Array.from({ length: 4 }, (_, i) => (i === 0 ? pr() < 0.8 : pr() < 0.35));
  const r = rng(seed * 131 + bar * 7907);
  const out: NoteEvent[] = [];

  // the pad: the whole chord, held through the bar
  for (const midi of voicing(chord, 57)) out.push({ voice: "pad", beat: 0, len: BEATS_PER_BAR, midi, vel: 0.55 });

  // the bass: the root on the first and third beats, a pickup now and then
  if (intensity >= 2) {
    const root = above(chord.root, 36);
    out.push({ voice: "bass", beat: 0, len: 1.6, midi: root, vel: 0.8 });
    out.push({ voice: "bass", beat: 2, len: 1.2, midi: root, vel: 0.6 });
    if (r() < 0.3) out.push({ voice: "bass", beat: 3.5, len: 0.4, midi: above((chord.root + chord.tones[2]) % 12, 36), vel: 0.45 });
  }

  // the electric piano: the chord's notes going up, on the phrase's eighth notes
  if (intensity >= 3) {
    const tones = voicing(chord, 60);
    const arp = [...tones, tones[0] + 12, tones[1] + 12];
    let k = 0;
    keysSteps.forEach((on, i) => {
      if (!on) return;
      out.push({ voice: "keys", beat: i / 2, len: 0.9, midi: arp[k++ % arp.length], vel: i % 2 ? 0.45 : 0.6 });
    });
  }

  // the beat: a soft kick, and a closed hat on the off-beats
  if (intensity >= 4) {
    out.push({ voice: "kick", beat: 0, len: 0.3, midi: 0, vel: 0.8 });
    out.push({ voice: "kick", beat: 2, len: 0.3, midi: 0, vel: 0.65 });
    if (r() < 0.25) out.push({ voice: "kick", beat: 2.5, len: 0.3, midi: 0, vel: 0.4 });
    for (let i = 0; i < 4; i++) out.push({ voice: "hat", beat: i + 0.5, len: 0.1, midi: 0, vel: 0.35 + r() * 0.25 });
  }

  // the bell: a few pentatonic notes, chord notes on the strong beats; quiet in the busiest phrases
  if (intensity !== 3) {
    const chordPcs = chord.tones.map((t) => (chord.root + t) % 12);
    let degree = Math.floor(r() * PENTATONIC.length);
    bellSteps.forEach((on, i) => {
      if (!on) return;
      degree = Math.max(0, Math.min(PENTATONIC.length * 2 - 1, degree + Math.floor(r() * 5) - 2));
      let pc = PENTATONIC[degree % PENTATONIC.length];
      const octave = degree >= PENTATONIC.length ? 12 : 0;
      if (i % 2 === 0 && !chordPcs.includes(pc)) pc = chordPcs[Math.floor(r() * chordPcs.length)];
      out.push({ voice: "bell", beat: i, len: 1.5, midi: above(pc, 72) + octave, vel: intensity === 4 ? 0.35 : 0.5 });
    });
  }
  return out;
}
