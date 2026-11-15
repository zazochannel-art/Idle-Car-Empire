// How big the 3D map's textures may be on this device.
//
// The six ground tiles are 2048 px pictures: small files (WebP), but on the graphics card each one is
// 16 MB of pixels (21 MB with its mipmaps), 128 MB for the island. Phones with 4 GB of memory or less
// share that memory with everything else, so the browser starts swapping textures and the frames stutter.
// Drawn at the zoom a phone plays at, the painted ground is already stretched several times over
// (the close-up grain comes from a repeating detail texture), so half the width is hard to tell apart
// and takes a quarter of the memory. Pure functions, so the rules are tested (gpu-budget.test.ts).

export interface DeviceInfo {
  /** The graphics setting "low graphics" (Settings). */
  low: boolean;
  /** `navigator.deviceMemory`: GB, rounded down to a power of two and capped at 8; undefined where the browser doesn't tell (Safari, Firefox). */
  deviceMemory?: number;
  /** The largest texture the graphics card takes (`renderer.capabilities.maxTextureSize`). */
  maxTextureSize: number;
  /** The largest anisotropy the card offers. */
  maxAnisotropy: number;
  /** Width of the window (CSS px): phones in portrait are under 700. */
  width: number;
  /** The "ultra" graphics profile: the biggest shadow map the device's budget allows, narrow screens included. */
  ultra?: boolean;
}

export interface TextureBudget {
  /** Width of a ground tile on the card (px, a power of two; the file is 2048). */
  tile: number;
  /** Anisotropic filtering for the ground, roads and facades. */
  aniso: number;
  /** Width of the sun's shadow map (px). */
  shadowMap: number;
  /** Whether this is the lighter budget. */
  light: boolean;
}

/** The size of the ground pictures in the files. */
export const TILE_FILE = 2048;
/** Devices with this much memory (GB) or less get the lighter budget. */
export const LIGHT_MEMORY_GB = 4;

/** Whether the device is one of the weak ones: low graphics, little memory, or a card that takes only small textures. */
export function isLightDevice(d: Pick<DeviceInfo, "low" | "deviceMemory" | "maxTextureSize">): boolean {
  if (d.low) return true;
  if (d.maxTextureSize < 4096) return true;
  return d.deviceMemory !== undefined && d.deviceMemory <= LIGHT_MEMORY_GB;
}

export function textureBudget(d: DeviceInfo): TextureBudget {
  const light = isLightDevice(d);
  const cap = Math.max(1, Math.min(8, d.maxAnisotropy));
  const shadowMap = d.low ? 1024 : light || (d.width < 700 && !d.ultra) ? 2048 : 4096;
  if (!light) return { tile: Math.min(TILE_FILE, d.maxTextureSize), aniso: cap, shadowMap, light };
  return { tile: Math.min(TILE_FILE / 2, d.maxTextureSize), aniso: Math.min(4, cap), shadowMap, light };
}

/** The device facts the browser gives (the card's own come from the renderer). */
export function deviceFacts(): Pick<DeviceInfo, "deviceMemory" | "width"> {
  if (typeof window === "undefined") return { width: 1024 };
  return { deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory, width: window.innerWidth };
}

/** Bytes a texture takes on the card (RGBA, with its mipmaps). */
export function textureBytes(px: number, mipmaps = true): number {
  return Math.round(px * px * 4 * (mipmaps ? 4 / 3 : 1));
}
