import { describe, expect, it } from "vitest";
import { SKINS } from "./config/racing";
import { buyCosmetic, COSMETICS, migrateCosmetics, ownsCosmetic } from "./engine/cosmetics";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";
import { isFestive } from "@/components/map/world/festive";

describe("the shop's Style section", () => {
  it("has a paint scheme for every livery it sells", () => {
    for (const c of COSMETICS) if (c.skin) expect(SKINS[c.skin], c.id).toBeTruthy();
  });

  it("sells each look once, for Stars, and a livery joins the racing team's", () => {
    const s = createInitialState(0);
    s.stars = 5;
    expect(buyCosmetic(s, "skinTiger")).toBe(true);
    expect(s.stars).toBe(2);
    expect(s.racing.skins).toContain("tiger");
    expect(buyCosmetic(s, "skinTiger")).toBe(false);
    expect(buyCosmetic(s, "decorAllYear")).toBe(false);
    expect(ownsCosmetic(s, "skinTiger")).toBe(true);
  });

  it("dresses every city for the holidays all year with the decor", () => {
    const july = new Date(2026, 6, 1, 12).getTime();
    expect(isFestive("home", july)).toBe(false);
    expect(isFestive("home", july, true)).toBe(true);
  });

  it("keeps what was bought in the save, and only real looks", () => {
    const s = createInitialState(0);
    s.stars = 20;
    buyCosmetic(s, "decorAllYear");
    expect(decodeSave(encodeSave(s), 0).cosmetics).toEqual(["decorAllYear"]);
    expect(migrateCosmetics(["decorAllYear", "nope", "decorAllYear", 3])).toEqual(["decorAllYear"]);
  });
});
