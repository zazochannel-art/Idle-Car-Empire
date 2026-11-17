import { describe, expect, it } from "vitest";
import { CITIES, CITY_IDS } from "@/game/config/cities";
import { eaves, spiral } from "./world/festive";

describe("the New Year city", () => {
  it("is Nordheim, and only Nordheim", () => {
    expect(CITY_IDS.filter((id) => CITIES[id].festive)).toEqual(["north"]);
    expect(CITIES.north.emoji).toBe("🎄");
  });

  it("winds a fir's lights from its foot to its top, narrowing as they climb", () => {
    const pts = spiral(10, 2, -5, 3, 1, 20, 3);
    expect(pts).toHaveLength(20);
    expect(pts[0][1]).toBeLessThan(pts[19][1]);
    expect(pts[19][1]).toBeLessThanOrEqual(2 + 3);
    const r = (p: number[]) => Math.hypot(p[0] - 10, p[2] + 5);
    expect(r(pts[0])).toBeGreaterThan(r(pts[19]));
  });

  it("strings lights round a house's eaves, at the eaves' height, just outside its walls", () => {
    const pts = eaves(0, 0, 2, 1, 0, 3, 0.2);
    expect(pts.length).toBeGreaterThanOrEqual(14);
    for (const [x, y, z] of pts) {
      expect(y).toBe(3);
      expect(Math.abs(x) <= 1.05 && Math.abs(z) <= 0.55).toBe(true);
      expect(Math.abs(x) > 1 || Math.abs(z) > 0.5).toBe(true);
    }
  });
});
