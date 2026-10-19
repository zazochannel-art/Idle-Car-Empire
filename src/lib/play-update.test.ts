import { describe, expect, it } from "vitest";
import { lastOffered, PLAY_UPDATE, playUpdateToOffer, updateOfferDue } from "./play-update";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 19);

describe("offering a Google Play update", () => {
  it("offers a new version at once, and the same one again only after the gap", () => {
    expect(updateOfferDue("12", NOW, null)).toBe(true);
    expect(updateOfferDue("12", NOW, { code: "12", at: NOW - DAY })).toBe(false);
    expect(updateOfferDue("12", NOW, { code: "12", at: NOW - PLAY_UPDATE.remindDays * DAY })).toBe(true);
    // a newer version than the one offered yesterday
    expect(updateOfferDue("13", NOW, { code: "12", at: NOW - DAY })).toBe(true);
    expect(updateOfferDue("", NOW, null)).toBe(false);
  });

  it("reads what the device stored, and nothing from a damaged value", () => {
    expect(lastOffered(JSON.stringify({ code: "12", at: NOW }))).toEqual({ code: "12", at: NOW });
    expect(lastOffered(null)).toBeNull();
    expect(lastOffered("{")).toBeNull();
    expect(lastOffered(JSON.stringify({ code: 12, at: "x" }))).toBeNull();
  });

  it("never looks outside the Android app", async () => {
    expect(await playUpdateToOffer(NOW)).toBeNull();
  });
});
