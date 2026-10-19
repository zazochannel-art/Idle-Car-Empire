// The Google Play listing (fastlane/metadata/android, uploaded by play-publish.yml or pasted in
// Play Console): within Google Play's limits, with release notes for the version being built,
// and still telling the truth about the game's counts when they change.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARS } from "./game/config/cars";
import { PLANTS } from "./game/config/chain";

const ROOT = join(__dirname, "..");
const LISTING = join(ROOT, "fastlane/metadata/android");
const LOCALES = ["en-US", "ro", "ru-RU"];
const read = (...p: string[]) => readFileSync(join(LISTING, ...p), "utf8");
const versionCode = Number(/versionCode=(\d+)/.exec(readFileSync(join(ROOT, "android/version.properties"), "utf8"))?.[1]);

describe("the Google Play listing", () => {
  it("has the game's three languages and nothing else", () => {
    expect(readdirSync(LISTING).sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of LOCALES) {
    it(`${locale}: title, short and full description within Google Play's limits`, () => {
      const title = read(locale, "title.txt");
      const short = read(locale, "short_description.txt");
      const full = read(locale, "full_description.txt");
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(30);
      expect(short.length).toBeGreaterThan(20);
      expect(short.length).toBeLessThanOrEqual(80);
      expect(full.length).toBeLessThanOrEqual(4000);
      // no placeholders or stray markup
      expect(full).not.toMatch(/TODO|\{|\}|<[a-z]/i);
    });

    it(`${locale}: release notes for this version (android/version.properties)`, () => {
      const notes = join(LISTING, locale, "changelogs", `${versionCode}.txt`);
      expect(existsSync(notes), notes).toBe(true);
      const text = readFileSync(notes, "utf8");
      expect(text.length).toBeGreaterThan(10);
      expect(text.length).toBeLessThanOrEqual(500);
    });

    it(`${locale}: the counts it promises are the game's`, () => {
      const full = read(locale, "full_description.txt");
      expect(full).toContain(`${PLANTS.length} `);
      expect(full).toContain(`${CARS.length} `);
    });

    it(`${locale}: 2 to 8 phone screenshots, 1080×1920`, () => {
      const dir = join(LISTING, locale, "images", "phoneScreenshots");
      const shots = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/.test(f));
      expect(shots.length).toBeGreaterThanOrEqual(2);
      expect(shots.length).toBeLessThanOrEqual(8);
      for (const f of shots) expect(imageSize(join(dir, f)), f).toEqual([1080, 1920]);
    });
  }

  it("tablet screenshots: 7-inch 1920×1080 and 10-inch 2560×1440, up to 8 each", () => {
    for (const [kind, size] of [
      ["sevenInchScreenshots", [1920, 1080]],
      ["tenInchScreenshots", [2560, 1440]],
    ] as const) {
      const dir = join(LISTING, "en-US", "images", kind);
      const shots = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/.test(f));
      expect(shots.length).toBeGreaterThan(0);
      expect(shots.length).toBeLessThanOrEqual(8);
      for (const f of shots) expect(imageSize(join(dir, f)), f).toEqual(size);
    }
  });
});

/** A JPEG's or PNG's width and height, read from its header. */
function imageSize(file: string): [number, number] {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  // JPEG: walk the segments to the frame header (SOF0…SOF15, not DHT, JPG or DAC)
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error(`no image size in ${file}`);
}
