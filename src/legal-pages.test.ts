// The legal pages on the game's site (site/, GitHub Pages): a section in every language the game
// speaks, which the game's links open at (a player reading Spanish lands on the Spanish part).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS } from "./i18n";
import { legalUrl, PRIVACY_URL, TERMS_URL } from "./lib/platform";

const ROOT = join(__dirname, "..");
const page = (name: string) => readFileSync(join(ROOT, "site", name, "index.html"), "utf8");

describe("the legal pages", () => {
  for (const name of ["privacy", "terms", "delete-account"]) {
    it(`${name}: a section and a language button for every game language`, () => {
      const html = page(name);
      for (const { id } of LANGS) {
        expect(html, id).toContain(`<h1 id="${id}"`);
        expect(html, id).toContain(`<a href="#${id}">`);
      }
    });
  }

  it("the game's links open them at the player's language", () => {
    expect(legalUrl(PRIVACY_URL, "en")).toBe(PRIVACY_URL);
    expect(legalUrl(TERMS_URL, "de")).toBe(`${TERMS_URL}#de`);
    expect(legalUrl(PRIVACY_URL, "pt")).toBe(`${PRIVACY_URL}#pt`);
  });

  it("the password page and the site's front page speak every game language", () => {
    for (const html of [page("reset-password"), readFileSync(join(ROOT, "site/index.html"), "utf8")]) {
      for (const { id } of LANGS.filter((l) => l.id !== "en")) expect(html, id).toMatch(new RegExp(`\\n\\s+${id}: \\{`));
    }
  });
});
