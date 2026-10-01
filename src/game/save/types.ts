import type { GameState } from "../types";

export interface SavePayload {
  state: GameState;
  savedAt: number;
}

/**
 * Where saves live. The game only talks to this interface, so a backend can
 * be added without touching the engine or the UI.
 */
export interface SaveAdapter {
  readonly name: string;
  load(): Promise<SavePayload | null>;
  save(payload: SavePayload): Promise<void>;
  clear(): Promise<void>;
}
