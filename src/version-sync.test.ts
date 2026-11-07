// One version for every app (scripts/sync-version.mjs): after a change to android/version.properties,
// `node scripts/sync-version.mjs` (or any `npm run build:app`) brings the others along.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PBXPROJ, readVersion, withVersion } from "../scripts/sync-version.mjs";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("one version for Android, iOS and package.json", () => {
  const v = readVersion(read("android/version.properties"));

  it("the iOS project has Android's version (run node scripts/sync-version.mjs)", () => {
    const ios = read(PBXPROJ);
    expect(withVersion(ios, v)).toBe(ios);
    expect(ios).toContain(`MARKETING_VERSION = ${v.name};`);
  });

  it("package.json and its lockfile have it too", () => {
    expect(JSON.parse(read("package.json")).version).toBe(v.name);
    expect(JSON.parse(read("package-lock.json")).packages[""].version).toBe(v.name);
  });
});
