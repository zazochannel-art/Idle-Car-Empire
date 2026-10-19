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
  }
});
