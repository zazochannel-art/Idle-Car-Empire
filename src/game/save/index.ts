import type { GameState } from "../types";
import { LocalStorageAdapter } from "./local";
import { migrate } from "./serialize";
import { SupabaseAdapter } from "./supabase";
import type { SaveAdapter, SavePayload } from "./types";

export type { SaveAdapter, SavePayload } from "./types";
export { encodeSave, decodeSave, migrate } from "./serialize";

const REMOTE_INTERVAL_MS = 30_000;

/**
 * Local save is always on (instant, works offline). When Supabase env vars
 * are present, saves are mirrored to the cloud at most every 30s, and on load
 * the newer of the two copies wins.
 */
export class SaveManager {
  private local: SaveAdapter = new LocalStorageAdapter();
  private remote: SaveAdapter | null = null;
  private lastRemote = 0;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) this.remote = new SupabaseAdapter(url, key);
  }

  get backend(): string {
    return this.remote ? `${this.local.name} + ${this.remote.name}` : this.local.name;
  }

  async load(now: number): Promise<GameState | null> {
    const [local, remote] = await Promise.all([
      this.local.load(),
      this.remote ? this.remote.load().catch(() => null) : Promise.resolve(null),
    ]);
    const best = pickNewest(local, remote);
    return best ? migrate(best.state, now) : null;
  }

  async save(state: GameState, opts: { force?: boolean } = {}): Promise<void> {
    const payload: SavePayload = { state, savedAt: Date.now() };
    await this.local.save(payload);
    if (this.remote && (opts.force || payload.savedAt - this.lastRemote > REMOTE_INTERVAL_MS)) {
      this.lastRemote = payload.savedAt;
      this.remote.save(payload).catch(() => {
        // Cloud is best-effort; the local copy is authoritative until the next sync.
      });
    }
  }

  async clear(): Promise<void> {
    await Promise.all([this.local.clear(), this.remote?.clear().catch(() => undefined)]);
  }
}

function pickNewest(a: SavePayload | null, b: SavePayload | null): SavePayload | null {
  if (!a) return b;
  if (!b) return a;
  return b.savedAt > a.savedAt ? b : a;
}
