// Picks the race viewer's renderer: the 3D scene, or the 2D painter where WebGL can't start
// (an old phone, a blocked GPU). Both draw the same race the same way for the viewer's HUD.
import type { TrackId } from "@/game/config/racing";
import type { CarOnTrack } from "@/game/racing/tracks";
import type { RaceRecord } from "@/game/types";
import { useGame } from "@/store/game-store";
import { RaceCanvas, type CameraMode } from "./race-canvas";
import type { RaceCarView } from "./race-replay";
import { RaceScene3D } from "./race3d/scene";

export interface RaceView {
  mode: CameraMode;
  onFrame: ((cars: CarOnTrack[], views: RaceCarView[]) => void) | null;
  elapsed: () => number;
  start(): void;
  stop(): void;
  configure(mode: CameraMode, podium: RaceRecord | null): void;
  setRace(rec: RaceRecord): void;
}

/** True once WebGL has failed on this device: the 2D painter from then on. */
let noWebgl = false;

export function createRaceView(canvas: HTMLCanvasElement, track: TrackId, rec: RaceRecord | null): RaceView {
  if (!noWebgl)
    try {
      return new RaceScene3D(canvas, track, rec, { low: useGame.getState().state.settings.lowGraphics });
    } catch {
      noWebgl = true;
    }
  return new RaceCanvas(canvas, track, rec);
}
