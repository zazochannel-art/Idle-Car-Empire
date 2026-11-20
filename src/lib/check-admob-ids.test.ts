import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { idProblems, missingFromBuild } from "../../scripts/check-admob-ids.mjs";

// The release's guard (play-publish.yml): a build for players never ships Google's test ads.
const GOOD = {
  ADMOB_APP_ID: "ca-app-pub-1111111111111111~2222222222",
  ADMOB_REWARDED_ID: "ca-app-pub-1111111111111111/3333333333",
  ADMOB_INTERSTITIAL_ID: "ca-app-pub-1111111111111111/4444444444",
  ADMOB_APP_OPEN_ID: "ca-app-pub-1111111111111111/5555555555",
};

describe("the AdMob ids of a release", () => {
  it("the account's own app id and units pass", () => {
    expect(idProblems(GOOD)).toEqual([]);
  });

  it("an unset id stops it (the build would use Google's test ads without a word)", () => {
    const problems = idProblems({ ...GOOD, ADMOB_APP_ID: "", ADMOB_APP_OPEN_ID: undefined });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/ADMOB_APP_ID is not set/);
    expect(problems[1]).toMatch(/ADMOB_APP_OPEN_ID is not set/);
  });

  it("a unit id in the app id's place, or the other way round, says so", () => {
    expect(idProblems({ ...GOOD, ADMOB_APP_ID: GOOD.ADMOB_REWARDED_ID })[0]).toMatch(/that is an ad unit id/);
    expect(idProblems({ ...GOOD, ADMOB_REWARDED_ID: GOOD.ADMOB_APP_ID })[0]).toMatch(/that is the app id/);
  });

  it("Google's sample ids stop it", () => {
    const problems = idProblems({ ...GOOD, ADMOB_APP_ID: "ca-app-pub-3940256099942544~3347511713", ADMOB_REWARDED_ID: "ca-app-pub-3940256099942544/5224354917" });
    expect(problems).toHaveLength(2);
    for (const p of problems) expect(p).toMatch(/Google's sample id/);
  });

  it("units of another AdMob account than the app id stop it", () => {
    const problems = idProblems({ ...GOOD, ADMOB_INTERSTITIAL_ID: "ca-app-pub-9999999999999999/4444444444" });
    expect(problems).toEqual([expect.stringMatching(/ADMOB_INTERSTITIAL_ID belongs to the AdMob account pub-9999999999999999/)]);
  });

  it("the built game must carry the three units", () => {
    const dir = mkdtempSync(join(tmpdir(), "admob-ids-"));
    try {
      mkdirSync(join(dir, "_next"));
      writeFileSync(join(dir, "_next", "a.js"), `const u="${GOOD.ADMOB_REWARDED_ID}",i="${GOOD.ADMOB_INTERSTITIAL_ID}";`);
      expect(missingFromBuild(GOOD, dir)).toEqual(["ADMOB_APP_OPEN_ID"]);
      writeFileSync(join(dir, "b.js"), `const o="${GOOD.ADMOB_APP_OPEN_ID}";`);
      expect(missingFromBuild(GOOD, dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
