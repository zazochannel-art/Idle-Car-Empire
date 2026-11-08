import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/game/config/achievements";
import { PLAY_GAMES_ACHIEVEMENTS } from "@/game/config/play-games";
import { createInitialState } from "@/game/engine/state";
import { carsScore, pendingUnlocks } from "./play-games";

describe("play games", () => {
  it("only maps achievements the game has, each to one Play Games id", () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const k of Object.keys(PLAY_GAMES_ACHIEVEMENTS)) expect(ids.has(k), k).toBe(true);
    const play = Object.values(PLAY_GAMES_ACHIEVEMENTS);
    expect(new Set(play).size).toBe(play.length);
  });

  it("sends the achievements it knows and has not sent yet", () => {
    const map = { first_car: "CgkIA", tycoon: "CgkIB" };
    expect(pendingUnlocks(["first_car", "tycoon", "unmapped"], new Set(), map)).toEqual([
      { game: "first_car", play: "CgkIA" },
      { game: "tycoon", play: "CgkIB" },
    ]);
    expect(pendingUnlocks(["first_car", "tycoon"], new Set(["first_car"]), map)).toEqual([{ game: "tycoon", play: "CgkIB" }]);
    expect(pendingUnlocks(["first_car"], new Set(), {})).toEqual([]);
  });

  it("scores the cars built as a whole number", () => {
    const s = createInitialState(Date.UTC(2026, 10, 8));
    expect(carsScore(s)).toBe(0);
    s.lifetime.carsProduced = 42.9;
    expect(carsScore(s)).toBe(42);
    s.lifetime.carsProduced = Number.NaN;
    expect(carsScore(s)).toBe(0);
  });
});
