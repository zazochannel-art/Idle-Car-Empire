// Loads one ground tile at the width the device's texture budget allows (lib/gpu-budget.ts).
// The files are 2048 px; a lighter budget takes them down to 1024 (a quarter of the memory on the card).
import * as THREE from "three";
import { TILE_FILE } from "@/lib/gpu-budget";

/** The tile at `size` px wide, in sRGB, ready for the ground's material. */
export async function loadTile(url: string, size: number, aniso: number): Promise<THREE.Texture> {
  let tex: THREE.Texture;
  if (size >= TILE_FILE) tex = await new THREE.TextureLoader().loadAsync(url);
  else tex = (await shrunk(url, size)) ?? (await shrunkOnCanvas(url, size));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

/**
 * Decoded and scaled by the browser off the main thread (a 2048 px picture drawn onto a canvas
 * on the main thread stalls the first frames, six times over). Null where the browser can't
 * (older Safari): the canvas way below does the same on the main thread.
 */
async function shrunk(url: string, size: number): Promise<THREE.Texture | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${url}: ${r.status}`))));
    const bmp = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: "high" });
    // a canvas keeps the upload the same as ever (flipY and colours as for a picture file)
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    cv.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    return new THREE.CanvasTexture(cv);
  } catch {
    return null;
  }
}

async function shrunkOnCanvas(url: string, size: number): Promise<THREE.Texture> {
  const loaded = await new THREE.TextureLoader().loadAsync(url);
  const img = loaded.image as HTMLImageElement;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, size, size);
  loaded.dispose();
  return new THREE.CanvasTexture(cv);
}
