// Moving a save between devices without a server: the save is compressed
// (deflate) into the #fragment of a link the player sends to themselves.
// Fragments never reach the web server, so the save stays on the devices.
import type { GameState } from "../types";

export const TRANSFER_KEY = "save";
const PREFIX = "z1.";

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (text: string) => {
  const b = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Compressed, URL-safe code for a save. */
export async function encodeTransfer(state: GameState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  return PREFIX + toB64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** The save JSON inside a transfer code (throws when the code is damaged). */
export async function decodeTransfer(code: string): Promise<string> {
  if (!code.startsWith(PREFIX)) throw new Error("not a transfer code");
  const bytes = await pipe(fromB64Url(code.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(bytes);
}

/** A link that opens the game and offers to load this save. */
export async function transferLink(state: GameState, pageUrl: string): Promise<string> {
  const url = new URL(pageUrl);
  url.hash = `${TRANSFER_KEY}=${await encodeTransfer(state)}`;
  return url.toString();
}

/** The transfer code in a page's #fragment, if any. */
export function transferCodeIn(hash: string): string | null {
  const m = hash.replace(/^#/, "").match(new RegExp(`(?:^|&)${TRANSFER_KEY}=([^&]+)`));
  return m ? m[1] : null;
}
