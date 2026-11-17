// The way from the game's screens to the map's clip recorder (world/engine-clip.ts): the map
// registers it once its engine is running (empire-map.tsx) and takes it away when it goes, so a
// screen can ask for a clip without loading three.js itself.
import type { ClipText } from "./world/engine-clip";

type Recorder = (text: ClipText, onProgress?: (k: number) => void) => Promise<Blob | null>;

let recorder: Recorder | null = null;

export function setClipRecorder(fn: Recorder | null) {
  recorder = fn;
}

/** True when the map is up and this phone can record video. */
export const canRecordClip = () => recorder !== null && typeof MediaRecorder !== "undefined";

/** The clip, or null when it couldn't be made. */
export const recordEmpireClip: Recorder = (text, onProgress) => (recorder ? recorder(text, onProgress) : Promise.resolve(null));
