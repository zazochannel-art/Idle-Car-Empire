import { describe, expect, it } from "vitest";
import { BARS_PER_PHRASE, BEATS_PER_BAR, barNotes, phrase, PROGRESSIONS, voicing } from "./music-score";

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const RANGE = { pad: [57, 69], bass: [36, 47], keys: [60, 83], bell: [72, 95] } as const;

describe("the background music", () => {
  it("writes the same song for the same seed, and another for another", () => {
    expect(barNotes(7, 37)).toEqual(barNotes(7, 37));
    const a = Array.from({ length: 32 }, (_, i) => barNotes(1, i));
    const b = Array.from({ length: 32 }, (_, i) => barNotes(2, i));
    expect(a).not.toEqual(b);
  });

  it("stays in C major, in each instrument's range, inside the bar", () => {
    for (let bar = 0; bar < 400; bar++) {
      for (const n of barNotes(42, bar)) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(BEATS_PER_BAR);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
        if (n.voice === "kick" || n.voice === "hat") continue;
        expect(C_MAJOR.has(n.midi % 12)).toBe(true);
        const [lo, hi] = RANGE[n.voice];
        expect(n.midi).toBeGreaterThanOrEqual(lo);
        expect(n.midi).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("plays each chord as a close voicing and puts its root in the bass", () => {
    for (let bar = 0; bar < 64; bar++) {
      const notes = barNotes(3, bar);
      const pad = notes.filter((n) => n.voice === "pad").map((n) => n.midi);
      expect(pad).toHaveLength(4);
      expect(Math.max(...pad) - Math.min(...pad)).toBeLessThan(12);
      const chord = phrase(3, Math.floor(bar / BARS_PER_PHRASE)).chords[bar % BARS_PER_PHRASE];
      expect(pad).toEqual(voicing(chord, 57));
      for (const b of notes.filter((n) => n.voice === "bass" && n.beat === 0)) expect(b.midi % 12).toBe(chord.root);
    }
  });

  it("builds up from the pad alone, and never plays the same progression twice running", () => {
    const voices = (bar: number) => new Set(barNotes(5, bar).map((n) => n.voice));
    expect([...voices(0)].sort()).toEqual(expect.arrayContaining(["pad"]));
    expect(voices(0).has("bass") || voices(0).has("kick") || voices(0).has("keys")).toBe(false);
    expect(voices(3 * BARS_PER_PHRASE).has("kick")).toBe(true);
    expect(phrase(5, 0).chords).toBe(PROGRESSIONS[0]);
    for (let p = 1; p < 500; p++) expect(phrase(5, p).chords).not.toBe(phrase(5, p - 1).chords);
    // every progression comes back within a few phrases
    const seen = new Set(Array.from({ length: 8 }, (_, p) => phrase(5, p).chords));
    expect(seen.size).toBe(PROGRESSIONS.length);
  });

  it("can play for hours: a late bar costs the same as an early one", () => {
    const t0 = performance.now();
    for (let bar = 100_000; bar < 100_200; bar++) barNotes(9, bar);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
