// Hands a file the game made (a picture, a clip) to the phone's share sheet. On Android the
// WebView has neither navigator.share nor downloads, so the game's own plugin does it
// (android/.../SharePlugin.java); iOS and a development browser use navigator.share, and a
// browser without it saves the file instead.
import { registerPlugin } from "@capacitor/core";
import { platform } from "./platform";

interface GameSharePlugin {
  shareFile(o: { data: string; name: string; mime: string; text?: string }): Promise<{ shared: boolean }>;
}

let plugin: GameSharePlugin | null = null;
const native = () => (plugin ??= registerPlugin<GameSharePlugin>("GameShare"));

/** The blob as base64, without the data: prefix. */
export async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** "shared" when the share sheet opened, "saved" when the file was downloaded instead. */
export async function shareFile(blob: Blob, fileName: string, mime: string, text?: string): Promise<"shared" | "saved"> {
  if (platform() === "android") {
    try {
      await native().shareFile({ data: await blobBase64(blob), name: fileName, mime, text });
      return "shared";
    } catch {
      // an older app without the plugin: fall through to the web ways
    }
  }
  const file = new File([blob], fileName, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName, text });
      return "shared";
    } catch {
      // cancelled: save it instead
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
