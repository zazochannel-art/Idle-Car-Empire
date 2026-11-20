import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FILES, MARKER, PATCHED_VERSION, patchText } from "../../scripts/patch-admob.mjs";

// The App Open fix lives in the AdMob plugin's native code (scripts/patch-admob.mjs, run by
// `npm install`): without it a load answers with a kept, unshown ad and an expired one can be shown.
const PLUGIN = join(__dirname, "../../node_modules/@capacitor-community/admob");
const read = (p: string) => readFileSync(join(PLUGIN, p), "utf8");

describe("the AdMob plugin's App Open patch", () => {
  it("is for the plugin version installed", () => {
    expect(JSON.parse(read("package.json")).version).toBe(PATCHED_VERSION);
  });

  it.each(FILES.map((f) => f.path))("is in %s: a load replaces an unshown ad, and none is shown past 4 hours", (path) => {
    const text = read(path);
    expect(text).toContain(MARKER);
    expect(text).toMatch(/if \(?appOpenAd != nil && !isShowingAd\)? \{? ?appOpenAd = nil|if \(appOpenAd != null && !isShowingAd\) appOpenAd = null/);
    expect(text).toMatch(/isExpired/);
  });

  it("leaves a patched file as it is, and stops on code it doesn't know", () => {
    const f = FILES[0];
    const patched = read(f.path);
    expect(patchText(patched, f.edits, f.path)).toBe(patched);
    expect(() => patchText("class Something {}", f.edits, f.path)).toThrow(/expected the plugin's code once/);
  });
});
