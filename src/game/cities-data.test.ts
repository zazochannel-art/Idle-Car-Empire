// The cities are data (config/cities.ts): the engine, the saves and the store name no city of
// their own, so a third one is a new entry there (with its map, landmarks and lots), not a hunt
// through the code.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CITIES, CITY_IDS, HOME_CITY, OPENABLE_CITIES } from "./config/cities";
import { landmarksOf } from "./config/landmarks";
import { landmarkLotsOf } from "./city/landmark-lots";

const SRC = join(__dirname, "..");
const code = (dir: string) =>
  readdirSync(join(SRC, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(SRC, dir, f), "utf8") }));

describe("cities as data", () => {
  it("the engine, the saves and the store name no city", () => {
    // (the HUD's "home" button in ui-store is not a city)
    const named = [...code("game/engine"), ...code("game/save"), ...code("store")].filter((f) => CITY_IDS.some((id) => f.text.replaceAll('kind: "home"', "").includes(`"${id}"`)));
    expect(named.map((f) => f.file)).toEqual([]);
  });

  it("every city has what a city needs, and every one but the first opens after an owned one", () => {
    expect(HOME_CITY).toBe(CITY_IDS[0]);
    expect(CITIES[HOME_CITY].opens).toBeUndefined();
    for (const id of CITY_IDS) {
      expect(CITIES[id].id).toBe(id);
      if (CITIES[id].landmarks) {
        expect(landmarksOf(id).length).toBeGreaterThan(0);
        expect(landmarkLotsOf(id).length).toBe(landmarksOf(id).length);
      }
    }
    for (const id of OPENABLE_CITIES) expect(CITY_IDS.indexOf(CITIES[id].opens!.after)).toBeLessThan(CITY_IDS.indexOf(id));
  });
});
