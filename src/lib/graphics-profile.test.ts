import { describe, expect, it } from "vitest";
import { readStoredProfile, resolveProfile } from "./graphics-profile";
import { textureBudget } from "./gpu-budget";

const store = (v: string | null) => ({ getItem: () => v });

describe("the device's graphics profile", () => {
  it("reads a stored profile, and nothing else", () => {
    for (const p of ["low", "medium", "high", "ultra"]) expect(readStoredProfile(store(p))).toBe(p);
    expect(readStoredProfile(store("max"))).toBeNull();
    expect(readStoredProfile(store(null))).toBeNull();
    expect(readStoredProfile(null)).toBeNull();
    expect(readStoredProfile({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
  });
  it("with nothing chosen on this device, an older save's low-graphics switch decides: nobody's picture changes", () => {
    expect(resolveProfile(null, true)).toBe("low");
    expect(resolveProfile(null, false)).toBe("high");
  });
  it("a choice made on this device wins over what the save says (the account's other phone is not followed)", () => {
    expect(resolveProfile("ultra", true)).toBe("ultra");
    expect(resolveProfile("medium", false)).toBe("medium");
  });
});

describe("the shadow map and the ultra profile", () => {
  const base = { low: false, maxTextureSize: 8192, maxAnisotropy: 16, deviceMemory: 8 };
  it("ultra lets a narrow screen on a strong device have the big shadow map", () => {
    expect(textureBudget({ ...base, width: 400 }).shadowMap).toBe(2048);
    expect(textureBudget({ ...base, width: 400, ultra: true }).shadowMap).toBe(4096);
  });
  it("a weak device keeps its limits whatever the profile", () => {
    expect(textureBudget({ ...base, deviceMemory: 2, width: 400, ultra: true }).shadowMap).toBe(2048);
    expect(textureBudget({ ...base, low: true, width: 400, ultra: true }).shadowMap).toBe(1024);
  });
});
