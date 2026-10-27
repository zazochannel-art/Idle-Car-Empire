import { describe, expect, it } from "vitest";
import { WEATHER_BLOCK_MS, weatherAt, type WeatherKind } from "./weather";

const T0 = Date.UTC(2026, 9, 24, 12);

/** The weather of many blocks, counted by kind. */
function spread(season: Parameters<typeof weatherAt>[1]) {
  const n: Partial<Record<WeatherKind, number>> = {};
  for (let b = 0; b < 2000; b++) {
    const w = weatherAt(T0 + b * WEATHER_BLOCK_MS + WEATHER_BLOCK_MS / 2, season);
    n[w.kind] = (n[w.kind] ?? 0) + 1;
  }
  return n;
}

describe("map weather", () => {
  it("is the same for everyone at the same time", () => {
    expect(weatherAt(T0, null)).toEqual(weatherAt(T0, null));
  });

  it("follows the season", () => {
    const none = spread(null);
    expect(none.snow ?? 0).toBe(0);
    expect(none.petals ?? 0).toBe(0);
    expect(none.rain).toBeGreaterThan(300);
    expect(none.clear).toBeGreaterThan(1000);
    const winter = spread("winter");
    expect(winter.rain ?? 0).toBe(0);
    expect(winter.snow).toBeGreaterThan(900);
    expect(spread("spring").petals).toBeGreaterThan(700);
    expect(spread("summer").clear).toBeGreaterThan(1500);
  });

  it("comes and goes gently", () => {
    // find a rainy block that starts after a different one
    let b = Math.floor(T0 / WEATHER_BLOCK_MS);
    while (!(weatherAt(b * WEATHER_BLOCK_MS + 1000, null).kind === "rain" && weatherAt((b - 1) * WEATHER_BLOCK_MS + 1000, null).kind !== "rain")) b++;
    const start = b * WEATHER_BLOCK_MS;
    expect(weatherAt(start, null).k).toBe(0);
    expect(weatherAt(start + 10_000, null).k).toBeGreaterThan(0);
    expect(weatherAt(start + 10_000, null).k).toBeLessThan(0.5);
    expect(weatherAt(start + WEATHER_BLOCK_MS / 2, null).k).toBe(1);
  });

  it("keeps snow on the ground all through winter", () => {
    expect(weatherAt(T0, "winter").snowCover).toBeGreaterThanOrEqual(0.75);
    expect(weatherAt(T0, null).snowCover).toBe(0);
  });
});
