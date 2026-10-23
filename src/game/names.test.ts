import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOLD_FROM, FOLD_TO, NAME_PARTS, NAME_WORDS, foldName, isCleanName } from "./engine/names";

const sql = readFileSync(join(__dirname, "../../supabase/migrations/0008_player_safety.sql"), "utf8");

/** The words of a `select array['a', 'b'];` in the SQL function `name`. */
function sqlArray(name: string): string[] {
  const body = new RegExp(`function public\\.${name}\\(\\)[\\s\\S]*?select array\\[([^\\]]*)\\]`).exec(sql)?.[1] ?? "";
  return [...body.matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

describe("player names", () => {
  it("the server checks names with the game's own lists and folding", () => {
    expect(sqlArray("name_parts")).toEqual([...NAME_PARTS]);
    expect(sqlArray("name_words")).toEqual([...NAME_WORDS]);
    const fold = /translate\(lower\(coalesce\(p, ''\)\), '([^']*)', '([^']*)'\)/.exec(sql);
    expect(fold?.[1]).toBe(FOLD_FROM);
    expect(fold?.[2]).toBe(FOLD_TO);
  });

  it("folds one character for one", () => {
    expect([...FOLD_FROM]).toHaveLength([...FOLD_TO].length);
    expect(new Set(FOLD_FROM).size).toBe([...FOLD_FROM].length);
    expect(foldName("ȘtĂ 0rNIC Ёж")).toBe("sta ornic еж");
  });

  it("every listed word is already folded, letters only (else it could never match)", () => {
    for (const w of [...NAME_PARTS, ...NAME_WORDS]) {
      expect(foldName(w), w).toBe(w);
      expect(w, w).toMatch(/^[a-zа-я]+$/);
    }
  });

  it("lets ordinary names through, also those with a listed stem inside a word", () => {
    for (const name of [
      "Zazo Motors",
      "Class Act",
      "Scunthorpe Cars",
      "Essex Auto",
      "Future Motors",
      "Swanky Wheels",
      "Rebate Garage",
      "Команда Скорости",
      "Populare SRL",
      "Dickson",
      "Hitchcock",
      "Grape Racing",
      "Bonus Cars",
      "Nazira",
      "Ștefan Auto",
      "Player-1a2b3c4d5e6f",
      "Turbo42",
      "Ионел",
    ])
      expect(isCleanName(name), name).toBe(true);
  });

  it("stops obscenities, slurs and staff names, however they are spelled", () => {
    for (const name of ["F.U.C.K Motors", "Sh1tCars", "ХУЙ", "Pizda Motors", "admin", "Ass", "a$$", "Muie PSD", "PULĂ", "блять", "big bitches", "Модератор", "XUY", "N1gga"])
      expect(isCleanName(name), name).toBe(false);
  });
});
