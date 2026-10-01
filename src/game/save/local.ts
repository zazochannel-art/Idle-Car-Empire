import type { SaveAdapter, SavePayload } from "./types";

export const LOCAL_SAVE_KEY = "idle-car-empire:save:v1";

export class LocalStorageAdapter implements SaveAdapter {
  readonly name = "localStorage";

  constructor(private key = LOCAL_SAVE_KEY) {}

  async load(): Promise<SavePayload | null> {
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavePayload;
      return parsed && typeof parsed === "object" && "state" in parsed ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(payload: SavePayload): Promise<void> {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(payload));
    } catch {
      // Storage full or blocked (private mode): the game keeps running in memory.
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
