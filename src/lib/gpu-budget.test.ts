import { describe, expect, it } from "vitest";
import { isLightDevice, LIGHT_MEMORY_GB, textureBudget, textureBytes, TILE_FILE, type DeviceInfo } from "./gpu-budget";

const desktop: DeviceInfo = { low: false, deviceMemory: 8, maxTextureSize: 16384, maxAnisotropy: 16, width: 1440 };

describe("texture budget", () => {
  it("a strong device keeps the ground pictures whole, with the filtering it had", () => {
    expect(textureBudget(desktop)).toEqual({ tile: 2048, aniso: 8, shadowMap: 4096, light: false });
    // a phone in portrait always had the 2048 shadow map
    expect(textureBudget({ ...desktop, width: 390 }).shadowMap).toBe(2048);
  });

  it("browsers that don't tell their memory (Safari, Firefox) are treated as strong, as before", () => {
    expect(isLightDevice({ low: false, deviceMemory: undefined, maxTextureSize: 8192 })).toBe(false);
  });

  it("4 GB or less takes the ground pictures at half the width: a quarter of the memory", () => {
    for (const gb of [0.5, 1, 2, LIGHT_MEMORY_GB]) {
      const b = textureBudget({ ...desktop, deviceMemory: gb, width: 390 });
      expect(b).toMatchObject({ tile: 1024, aniso: 4, shadowMap: 2048, light: true });
    }
    // six tiles with their mipmaps: 128 MB against 32 MB
    expect(Math.round((6 * textureBytes(TILE_FILE)) / 2 ** 20)).toBe(128);
    expect(Math.round((6 * textureBytes(1024)) / 2 ** 20)).toBe(32);
  });

  it("a light tablet in landscape no longer gets the 4096 px shadow map", () => {
    expect(textureBudget({ ...desktop, deviceMemory: 4, width: 1000 }).shadowMap).toBe(2048);
  });

  it("low graphics is the lightest, whatever the device", () => {
    expect(textureBudget({ ...desktop, low: true })).toMatchObject({ tile: 1024, shadowMap: 1024, light: true });
  });

  it("a card that takes only small textures never gets a bigger one than it takes", () => {
    expect(textureBudget({ ...desktop, deviceMemory: 8, maxTextureSize: 2048 })).toMatchObject({ tile: 1024, light: true });
    expect(textureBudget({ ...desktop, maxTextureSize: 512 }).tile).toBe(512);
  });
});
